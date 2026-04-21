import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientChatStatus } from '@prisma/client';
import { ClientChatsEventService } from './clientchats-event.service';

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: ClientChatsEventService,
  ) {}

  async getConfig() {
    let config = await this.prisma.clientChatEscalationConfig.findFirst();
    if (!config) {
      config = await this.prisma.clientChatEscalationConfig.create({
        data: {},
      });
    }
    return config;
  }

  async updateConfig(data: {
    firstResponseTimeoutMins?: number;
    reassignAfterMins?: number;
    postReplyTimeoutMins?: number;
    postReplyReassignAfterMins?: number;
    notifyManagerOnEscalation?: boolean;
  }) {
    // Validate input. Non-negative integers only; 0 disables that side of
    // the check. Cap at 24h (1440 min) to avoid absurd config that would
    // effectively disable escalation silently.
    const intFields = [
      'firstResponseTimeoutMins',
      'reassignAfterMins',
      'postReplyTimeoutMins',
      'postReplyReassignAfterMins',
    ] as const;
    for (const field of intFields) {
      const value = data[field];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < 0 || value > 1440) {
        throw new Error(
          `${field} must be a non-negative integer <= 1440 (24h). Got ${value}. Use 0 to disable.`,
        );
      }
    }

    // Sanity: reassign thresholds must be >= their warn counterparts
    // (otherwise unassign fires before warning, which is nonsensical).
    // Only enforced when BOTH sides are being updated, to keep partial
    // updates flexible.
    if (
      data.firstResponseTimeoutMins !== undefined &&
      data.reassignAfterMins !== undefined &&
      data.reassignAfterMins > 0 &&
      data.reassignAfterMins < data.firstResponseTimeoutMins
    ) {
      throw new Error(
        `reassignAfterMins (${data.reassignAfterMins}) must be >= firstResponseTimeoutMins (${data.firstResponseTimeoutMins}).`,
      );
    }
    if (
      data.postReplyTimeoutMins !== undefined &&
      data.postReplyReassignAfterMins !== undefined &&
      data.postReplyReassignAfterMins > 0 &&
      data.postReplyReassignAfterMins < data.postReplyTimeoutMins
    ) {
      throw new Error(
        `postReplyReassignAfterMins (${data.postReplyReassignAfterMins}) must be >= postReplyTimeoutMins (${data.postReplyTimeoutMins}).`,
      );
    }

    const config = await this.getConfig();
    return this.prisma.clientChatEscalationConfig.update({
      where: { id: config.id },
      data,
    });
  }

  async getRecentEvents(limit = 50) {
    return this.prisma.clientChatEscalationEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        conversation: {
          select: {
            id: true,
            channelType: true,
            externalConversationId: true,
            assignedUserId: true,
          },
        },
      },
    });
  }

  @Cron('*/1 * * * *')
  async checkEscalations() {
    if (this.processing) return;
    this.processing = true;

    try {
      await this.runEscalationCheck();
    } finally {
      this.processing = false;
    }
  }

  private static readonly ESCALATION_BATCH_SIZE = 100;

  private async runEscalationCheck() {
    const config = await this.prisma.clientChatEscalationConfig.findFirst();
    if (!config) return;

    // Two independent SLA scans. Either can be disabled by setting its
    // "warn" threshold to 0 (defensive — means "never fire"). The scans
    // share a batch cap so one cron tick can never explode.
    await this.scanFirstResponseTimeouts(config);
    await this.scanPostReplySilence(config);
  }

  /**
   * Original "no first reply" SLA scan. Finds LIVE conversations that are
   * assigned to an operator but have no firstResponseAt yet, and where the
   * most recent inbound message is older than the warning threshold.
   */
  private async scanFirstResponseTimeouts(config: {
    firstResponseTimeoutMins: number;
    reassignAfterMins: number;
    notifyManagerOnEscalation: boolean;
  }) {
    if (config.firstResponseTimeoutMins <= 0) return;

    const now = new Date();
    const warningThreshold = new Date(
      now.getTime() - config.firstResponseTimeoutMins * 60_000,
    );

    // P1-4: Cap batch size so one cron tick can never pull thousands of
    // stale conversations into memory. Oldest-stale first ensures no
    // conversation is starved — processed across ticks until the backlog
    // drains. See audit/phase1-chats.md check #2a, finding #24.
    const staleConversations = await this.prisma.clientChatConversation.findMany(
      {
        where: {
          status: ClientChatStatus.LIVE,
          assignedUserId: { not: null },
          firstResponseAt: null,
          lastMessageAt: { lt: warningThreshold },
        },
        orderBy: { lastMessageAt: 'asc' },
        take: EscalationService.ESCALATION_BATCH_SIZE,
        include: {
          messages: {
            where: { direction: 'IN' },
            orderBy: { sentAt: 'desc' },
            take: 1,
          },
        },
      },
    );

    if (staleConversations.length === EscalationService.ESCALATION_BATCH_SIZE) {
      this.logger.warn(
        `First-response backlog saturated: processed ${EscalationService.ESCALATION_BATCH_SIZE} stale conversations in one tick — remaining entries will be handled on subsequent ticks.`,
      );
    }

    for (const conv of staleConversations) {
      try {
        const lastInbound = conv.messages[0];
        if (!lastInbound) continue;

        const elapsedMs = now.getTime() - new Date(lastInbound.sentAt).getTime();
        const elapsedMins = elapsedMs / 60_000;

        // Pass lastMessageAt snapshot so handlers can stale-guard the
        // update (bail if the operator has replied since the scan).
        const withSnapshot = { ...conv, scanLastMessageAt: conv.lastMessageAt };

        if (
          config.reassignAfterMins > 0 &&
          elapsedMins >= config.reassignAfterMins
        ) {
          await this.handleReassign(withSnapshot, config);
        } else if (elapsedMins >= config.firstResponseTimeoutMins) {
          await this.handleWarning(conv, config);
        }
      } catch (err: any) {
        this.logger.error(
          `First-response escalation check failed for conversation ${conv.id}: ${err.message}`,
        );
      }
    }
  }

  /**
   * April 2026 audit Q1 decision B: after the operator sends their first
   * reply, each subsequent inbound customer message starts a new silence
   * clock. If the operator's latest OUT message is older than the customer's
   * latest IN message by more than the threshold, escalate.
   *
   * Semantic difference from first-response:
   *  - First-response fires only when firstResponseAt IS NULL.
   *  - Post-reply fires only when firstResponseAt IS NOT NULL AND the
   *    latest customer IN message is newer than the latest operator OUT
   *    message by at least `postReplyTimeoutMins`.
   *
   * Dedupe events use distinct types (POST_REPLY_TIMEOUT_WARNING /
   * POST_REPLY_AUTO_UNASSIGN) so the two scans don't cross-suppress.
   */
  private async scanPostReplySilence(config: {
    postReplyTimeoutMins: number;
    postReplyReassignAfterMins: number;
    notifyManagerOnEscalation: boolean;
  }) {
    if (config.postReplyTimeoutMins <= 0) return;

    const now = new Date();
    const warningThreshold = new Date(
      now.getTime() - config.postReplyTimeoutMins * 60_000,
    );

    // Find candidates: LIVE + assigned + firstResponseAt set + recent
    // inbound activity. lastMessageAt is bumped by BOTH in and out, so
    // filter on a conservative "lastMessageAt is recent-ish" to reduce
    // candidates, then inspect the latest IN vs latest OUT in code.
    //
    // The SQL filter can't express "latest IN > latest OUT + threshold"
    // in a single findMany, so we pull candidates and filter in JS. Batch
    // cap still applies.
    const candidates = await this.prisma.clientChatConversation.findMany({
      where: {
        status: ClientChatStatus.LIVE,
        assignedUserId: { not: null },
        firstResponseAt: { not: null },
        // Only consider conversations with activity in the last 24h —
        // older than that, the customer has probably given up and we
        // don't want to fire stale warnings.
        lastMessageAt: {
          gt: new Date(now.getTime() - 24 * 60 * 60_000),
          lt: warningThreshold,
        },
      },
      orderBy: { lastMessageAt: 'asc' },
      take: EscalationService.ESCALATION_BATCH_SIZE,
      include: {
        messages: {
          // Grab the two latest messages in each direction to compare.
          orderBy: { sentAt: 'desc' },
          take: 10,
          select: { direction: true, sentAt: true },
        },
      },
    });

    if (candidates.length === EscalationService.ESCALATION_BATCH_SIZE) {
      this.logger.warn(
        `Post-reply backlog saturated: processed ${EscalationService.ESCALATION_BATCH_SIZE} candidates in one tick — remaining entries will be handled on subsequent ticks.`,
      );
    }

    for (const conv of candidates) {
      try {
        const latestIn = conv.messages.find((m) => m.direction === 'IN');
        const latestOut = conv.messages.find((m) => m.direction === 'OUT');

        // Skip if no inbound, or if operator's latest reply is newer than
        // the customer's latest message (operator is current).
        if (!latestIn) continue;
        if (latestOut && latestOut.sentAt >= latestIn.sentAt) continue;

        const elapsedMs = now.getTime() - new Date(latestIn.sentAt).getTime();
        const elapsedMins = elapsedMs / 60_000;

        // Pass lastMessageAt snapshot so the handler can stale-guard the
        // conditional update (bail if operator replied since the scan).
        const withSnapshot = { ...conv, scanLastMessageAt: conv.lastMessageAt };

        if (
          config.postReplyReassignAfterMins > 0 &&
          elapsedMins >= config.postReplyReassignAfterMins
        ) {
          await this.handlePostReplyReassign(withSnapshot, config);
        } else if (elapsedMins >= config.postReplyTimeoutMins) {
          await this.handlePostReplyWarning(conv, config);
        }
      } catch (err: any) {
        this.logger.error(
          `Post-reply escalation check failed for conversation ${conv.id}: ${err.message}`,
        );
      }
    }
  }

  private async handleWarning(
    conv: { id: string; assignedUserId: string | null },
    config: { notifyManagerOnEscalation: boolean },
  ) {
    // Dedup scoped to current operator: if the conversation changes hands
    // (operator A unassigned -> operator B picks up -> B goes silent), the
    // new operator gets their own warning instead of being suppressed by
    // A's recent event.
    const existing = await this.prisma.clientChatEscalationEvent.findFirst({
      where: {
        conversationId: conv.id,
        type: 'TIMEOUT_WARNING',
        fromUserId: conv.assignedUserId,
        createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
      },
    });
    if (existing) return;

    const event = await this.prisma.clientChatEscalationEvent.create({
      data: {
        conversationId: conv.id,
        type: 'TIMEOUT_WARNING',
        fromUserId: conv.assignedUserId,
        metadata: { reason: 'First response timeout' },
      },
    });

    this.logger.warn(
      `SLA warning: conversation ${conv.id} (assigned to ${conv.assignedUserId})`,
    );

    if (config.notifyManagerOnEscalation) {
      this.events.emitToManagers('escalation:warning', {
        conversationId: conv.id,
        assignedUserId: conv.assignedUserId,
        type: 'TIMEOUT_WARNING',
        event,
      });
    }
  }

  private async handleReassign(
    conv: {
      id: string;
      assignedUserId: string | null;
      channelType: string;
      scanLastMessageAt?: Date | null;
    },
    config: { notifyManagerOnEscalation: boolean },
  ) {
    // Renamed from AUTO_REASSIGN to AUTO_UNASSIGN (April 2026 audit). The
    // old event name implied the system picked a new operator, but it only
    // unassigns — conversation returns to the queue for manual pickup.
    // For backward compat with historical log readers, we also check the
    // legacy type in the dedupe query below.
    //
    // Dedup is scoped to the current operator — if assignment has changed
    // since the last event, the new operator gets their own unassign event.
    const existing = await this.prisma.clientChatEscalationEvent.findFirst({
      where: {
        conversationId: conv.id,
        type: { in: ['AUTO_UNASSIGN', 'AUTO_REASSIGN'] },
        fromUserId: conv.assignedUserId,
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
    });
    if (existing) return;

    const previousUserId = conv.assignedUserId;
    if (!previousUserId) return;

    // Stale-guarded conditional update + event creation in a single
    // transaction:
    //  - updateMany WHERE assignedUserId=previousUserId AND lastMessageAt
    //    matches the snapshot from the scan — if either changed (operator
    //    reassigned or a new message arrived), count will be 0 and we bail.
    //  - Event is only persisted if the update actually happened, so a
    //    mid-tx crash can't leave the conversation unassigned without an
    //    audit row.
    // This closes the reply-during-scan race (see code review #1 + #5).
    const txResult = await this.prisma.$transaction(async (tx) => {
      const updateWhere: {
        id: string;
        assignedUserId: string;
        lastMessageAt?: Date | null;
      } = {
        id: conv.id,
        assignedUserId: previousUserId,
      };
      if (conv.scanLastMessageAt !== undefined) {
        updateWhere.lastMessageAt = conv.scanLastMessageAt;
      }
      const upd = await tx.clientChatConversation.updateMany({
        where: updateWhere,
        data: { assignedUserId: null, lastOperatorActivityAt: null },
      });
      if (upd.count === 0) return { unassigned: false };

      await tx.clientChatEscalationEvent.create({
        data: {
          conversationId: conv.id,
          type: 'AUTO_UNASSIGN',
          fromUserId: previousUserId,
          toUserId: null,
          metadata: { reason: 'Unassigned after timeout — returned to queue' },
        },
      });
      return { unassigned: true };
    });

    if (!txResult.unassigned) {
      this.logger.debug(
        `Skipped unassign on ${conv.id}: conversation state changed since scan (operator replied or was reassigned)`,
      );
      return;
    }

    this.logger.warn(
      `Unassigned conversation ${conv.id} from ${previousUserId} after timeout — returned to queue`,
    );

    const updated = await this.prisma.clientChatConversation.findUnique({
      where: { id: conv.id },
    });
    if (updated) {
      this.events.emitConversationUpdated(
        updated as any,
        previousUserId,
      );
    }

    if (config.notifyManagerOnEscalation) {
      // Socket event name stays 'escalation:reassign' for now — the frontend
      // listeners are wired to it (manager-dashboard.tsx:450). We renamed
      // only the persisted event TYPE. Frontend rename is a follow-up.
      this.events.emitToManagers('escalation:reassign', {
        conversationId: conv.id,
        fromUserId: previousUserId,
        toUserId: null,
        type: 'AUTO_UNASSIGN',
      });

      await this.prisma.clientChatEscalationEvent.create({
        data: {
          conversationId: conv.id,
          type: 'MANAGER_NOTIFIED',
          metadata: {
            reason: 'Operator timeout — conversation returned to queue',
            fromUserId: previousUserId,
          },
        },
      });
    }
  }

  // ── Post-reply silence handlers (Q1 decision B, April 2026 audit) ───────

  private async handlePostReplyWarning(
    conv: { id: string; assignedUserId: string | null },
    config: { notifyManagerOnEscalation: boolean },
  ) {
    // Dedupe: don't re-warn the same operator on the same conversation
    // within 5 minutes. Scoped to fromUserId so that if the conversation
    // changes hands, the new operator gets their own warning. Uses a
    // distinct event type from the first-response warning so both scans
    // can fire independently on the same conversation's lifecycle.
    const existing = await this.prisma.clientChatEscalationEvent.findFirst({
      where: {
        conversationId: conv.id,
        type: 'POST_REPLY_TIMEOUT_WARNING',
        fromUserId: conv.assignedUserId,
        createdAt: { gt: new Date(Date.now() - 5 * 60_000) },
      },
    });
    if (existing) return;

    const event = await this.prisma.clientChatEscalationEvent.create({
      data: {
        conversationId: conv.id,
        type: 'POST_REPLY_TIMEOUT_WARNING',
        fromUserId: conv.assignedUserId,
        metadata: { reason: 'Operator silent after customer reply' },
      },
    });

    this.logger.warn(
      `Post-reply SLA warning: conversation ${conv.id} (assigned to ${conv.assignedUserId})`,
    );

    if (config.notifyManagerOnEscalation) {
      this.events.emitToManagers('escalation:warning', {
        conversationId: conv.id,
        assignedUserId: conv.assignedUserId,
        type: 'POST_REPLY_TIMEOUT_WARNING',
        event,
      });
    }
  }

  private async handlePostReplyReassign(
    conv: {
      id: string;
      assignedUserId: string | null;
      channelType: string;
      scanLastMessageAt?: Date | null;
    },
    config: { notifyManagerOnEscalation: boolean },
  ) {
    // Dedup scoped to current operator (see handleReassign for rationale).
    const existing = await this.prisma.clientChatEscalationEvent.findFirst({
      where: {
        conversationId: conv.id,
        type: 'POST_REPLY_AUTO_UNASSIGN',
        fromUserId: conv.assignedUserId,
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
    });
    if (existing) return;

    const previousUserId = conv.assignedUserId;
    if (!previousUserId) return;

    // Stale-guarded conditional update + event creation in a transaction.
    // Closes the reply-during-scan race: if the operator sent a reply
    // between our findMany and now, `lastMessageAt` has moved forward and
    // the updateMany predicate won't match — we bail without unassigning.
    const txResult = await this.prisma.$transaction(async (tx) => {
      const updateWhere: {
        id: string;
        assignedUserId: string;
        lastMessageAt?: Date | null;
      } = {
        id: conv.id,
        assignedUserId: previousUserId,
      };
      if (conv.scanLastMessageAt !== undefined) {
        updateWhere.lastMessageAt = conv.scanLastMessageAt;
      }
      const upd = await tx.clientChatConversation.updateMany({
        where: updateWhere,
        data: { assignedUserId: null, lastOperatorActivityAt: null },
      });
      if (upd.count === 0) return { unassigned: false };

      await tx.clientChatEscalationEvent.create({
        data: {
          conversationId: conv.id,
          type: 'POST_REPLY_AUTO_UNASSIGN',
          fromUserId: previousUserId,
          toUserId: null,
          metadata: {
            reason: 'Unassigned after post-reply silence — returned to queue',
          },
        },
      });
      return { unassigned: true };
    });

    if (!txResult.unassigned) {
      this.logger.debug(
        `Skipped post-reply unassign on ${conv.id}: conversation state changed since scan`,
      );
      return;
    }

    this.logger.warn(
      `Unassigned conversation ${conv.id} from ${previousUserId} after post-reply silence — returned to queue`,
    );

    const updated = await this.prisma.clientChatConversation.findUnique({
      where: { id: conv.id },
    });
    if (updated) {
      this.events.emitConversationUpdated(updated as any, previousUserId);
    }

    if (config.notifyManagerOnEscalation) {
      this.events.emitToManagers('escalation:reassign', {
        conversationId: conv.id,
        fromUserId: previousUserId,
        toUserId: null,
        type: 'POST_REPLY_AUTO_UNASSIGN',
      });

      await this.prisma.clientChatEscalationEvent.create({
        data: {
          conversationId: conv.id,
          type: 'MANAGER_NOTIFIED',
          metadata: {
            reason:
              'Post-reply silence — conversation returned to queue',
            fromUserId: previousUserId,
          },
        },
      });
    }
  }
}
