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
    notifyManagerOnEscalation?: boolean;
  }) {
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

    const now = new Date();
    const warningThreshold = new Date(
      now.getTime() - config.firstResponseTimeoutMins * 60_000,
    );
    const _reassignThreshold = new Date(
      now.getTime() - config.reassignAfterMins * 60_000,
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
        `Escalation backlog saturated: processed ${EscalationService.ESCALATION_BATCH_SIZE} stale conversations in one tick — remaining entries will be handled on subsequent ticks.`,
      );
    }

    for (const conv of staleConversations) {
      try {
        const lastInbound = conv.messages[0];
        if (!lastInbound) continue;

        const elapsedMs = now.getTime() - new Date(lastInbound.sentAt).getTime();
        const elapsedMins = elapsedMs / 60_000;

        if (elapsedMins >= config.reassignAfterMins) {
          await this.handleReassign(conv, config);
        } else if (elapsedMins >= config.firstResponseTimeoutMins) {
          await this.handleWarning(conv, config);
        }
      } catch (err: any) {
        this.logger.error(
          `Escalation check failed for conversation ${conv.id}: ${err.message}`,
        );
      }
    }
  }

  private async handleWarning(
    conv: { id: string; assignedUserId: string | null },
    config: { notifyManagerOnEscalation: boolean },
  ) {
    const existing = await this.prisma.clientChatEscalationEvent.findFirst({
      where: {
        conversationId: conv.id,
        type: 'TIMEOUT_WARNING',
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
    },
    config: { notifyManagerOnEscalation: boolean },
  ) {
    // Renamed from AUTO_REASSIGN to AUTO_UNASSIGN (April 2026 audit). The
    // old event name implied the system picked a new operator, but it only
    // unassigns — conversation returns to the queue for manual pickup.
    // For backward compat with historical log readers, we also check the
    // legacy type in the dedupe query below.
    const existing = await this.prisma.clientChatEscalationEvent.findFirst({
      where: {
        conversationId: conv.id,
        type: { in: ['AUTO_UNASSIGN', 'AUTO_REASSIGN'] },
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
    });
    if (existing) return;

    const previousUserId = conv.assignedUserId;
    if (!previousUserId) return;

    await this.prisma.clientChatConversation.update({
      where: { id: conv.id },
      data: {
        assignedUserId: null,
        lastOperatorActivityAt: null,
      },
    });

    await this.prisma.clientChatEscalationEvent.create({
      data: {
        conversationId: conv.id,
        type: 'AUTO_UNASSIGN',
        fromUserId: previousUserId,
        toUserId: null,
        metadata: { reason: 'Unassigned after timeout — returned to queue' },
      },
    });

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
}
