import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveQueueState, LiveAgentState } from '../types/telephony.types';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';

/** Mirrors AgentPresenceService.STALE_AFTER_MS — softphones heartbeat every
 *  30s and we tolerate one missed heartbeat + slack before treating the
 *  registration as dead. Inlined to avoid a runtime dep on the service. */
const SIP_HEARTBEAT_FRESH_MS = 90_000;

/** Code of the RoleGroup that the live-monitoring "Agents" panel surfaces.
 *  See seed-permissions.ts — supervisors live under CALL_CENTER_MANAGER. */
const CALL_CENTER_ROLE_GROUP = 'CALL_CENTER';

/** Asterisk queue name (== TelephonyQueue.name) for the main inbound queue.
 *  Operators are listed only if their Position has a PositionQueueRule for
 *  this queue. */
const MAIN_INBOUND_QUEUE_NAME = '30';

@Injectable()
export class TelephonyLiveService {
  private readonly logger = new Logger(TelephonyLiveService.name);
  private hasWarnedEmptyFilter = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateManager: TelephonyStateManager,
  ) {}

  async getQueueLiveState(): Promise<LiveQueueState[]> {
    if (this.stateManager.isAmiConnected()) {
      return this.getQueueLiveFromState();
    }
    return this.getQueueLiveFromDb();
  }

  async getAgentLiveState(): Promise<LiveAgentState[]> {
    const qualifyingUserIds = await this.getQualifyingAgentUserIds();
    const base = this.stateManager.isAmiConnected()
      ? this.getAgentLiveFromState()
      : await this.getAgentLiveFromDb();
    const filtered = base.filter((a) => qualifyingUserIds.has(a.userId));
    // Surface a misconfiguration before managers stare at an empty grid in
    // silence. Most likely cause: queue "30" was renamed in the FreePBX GUI
    // (asterisk-sync upserts new name, no PositionQueueRule points at the
    // new name), or the CALL_CENTER role group was renamed. The warning is
    // throttled so it doesn't spam every 10s poll.
    if (
      filtered.length === 0 &&
      base.length > 0 &&
      !this.hasWarnedEmptyFilter
    ) {
      this.logger.warn(
        `Live agents filter returned 0 of ${base.length} candidates — ` +
          `check that queue "${MAIN_INBOUND_QUEUE_NAME}" exists and that ` +
          `RoleGroup "${CALL_CENTER_ROLE_GROUP}" has PositionQueueRule rows pointing at it.`,
      );
      this.hasWarnedEmptyFilter = true;
    } else if (filtered.length > 0) {
      this.hasWarnedEmptyFilter = false;
    }
    const enriched = await this.attachSipPresence(filtered);
    return enriched.map((a) => this.applySipPresenceToCurrentState(a));
  }

  /**
   * The set of user IDs that should appear in the live Agents panel:
   * linked extensions whose user has an Employee → Position with
   * RoleGroup CALL_CENTER and a PositionQueueRule for the main queue.
   * Supervisors (CALL_CENTER_MANAGER), IT, admins are excluded by design
   * — they can still view the page (permission unchanged), they just don't
   * appear in the grid.
   */
  private async getQualifyingAgentUserIds(): Promise<Set<string>> {
    const extensions = await this.prisma.telephonyExtension.findMany({
      where: {
        isActive: true,
        crmUserId: { not: null },
        user: {
          employee: {
            position: {
              roleGroup: { code: CALL_CENTER_ROLE_GROUP },
              queueRules: {
                some: { queue: { name: MAIN_INBOUND_QUEUE_NAME } },
              },
            },
          },
        },
      },
      select: { crmUserId: true },
    });
    return new Set(
      extensions
        .map((e) => e.crmUserId)
        .filter((id): id is string => id !== null),
    );
  }

  private async attachSipPresence(
    agents: LiveAgentState[],
  ): Promise<LiveAgentState[]> {
    if (agents.length === 0) return agents;
    const presence = await this.prisma.telephonyExtension.findMany({
      where: {
        crmUserId: { in: agents.map((a) => a.userId) },
      },
      select: {
        crmUserId: true,
        sipRegistered: true,
        sipLastSeenAt: true,
      },
    });
    const byUser = new Map(presence.map((p) => [p.crmUserId, p]));
    return agents.map((a) => {
      const p = byUser.get(a.userId);
      return {
        ...a,
        sipRegistered: p?.sipRegistered ?? false,
        sipLastSeenAt: p?.sipLastSeenAt ? p.sipLastSeenAt.toISOString() : null,
      };
    });
  }

  /**
   * The SIP heartbeat is the source of truth for online/offline. The
   * in-memory call-event map only flips on call activity (AgentConnect,
   * Hangup, etc.) — it never sees pure SIP register/unregister. Without
   * this override, a freshly-registered softphone shows "Offline" until the
   * operator's first call, and a previously-active operator who unregisters
   * (e.g. via softphone user-switch) keeps showing "Idle" until a stale
   * sweep catches up to them.
   */
  private applySipPresenceToCurrentState(
    a: LiveAgentState,
  ): LiveAgentState {
    const lastSeenMs = a.sipLastSeenAt ? Date.parse(a.sipLastSeenAt) : null;
    const heartbeatFresh =
      a.sipRegistered === true &&
      lastSeenMs !== null &&
      Date.now() - lastSeenMs < SIP_HEARTBEAT_FRESH_MS;

    if (!heartbeatFresh) {
      return { ...a, currentState: 'OFFLINE' };
    }
    if (a.currentState === 'OFFLINE') {
      return { ...a, currentState: 'IDLE' };
    }
    return a;
  }

  private getQueueLiveFromState(): LiveQueueState[] {
    const snapshots = this.stateManager.getQueueSnapshots();
    return snapshots.map((qs) => ({
      queueId: qs.queueId,
      queueName: qs.queueName,
      activeCalls: qs.activeCalls,
      waitingCallers: qs.waitingCallers,
      longestCurrentWaitSec: qs.longestWaitSec,
      availableAgents: qs.availableAgents,
      _disclaimer: null as any,
    }));
  }

  private getAgentLiveFromState(): LiveAgentState[] {
    const agents = this.stateManager.getAgentStates();
    const now = Date.now();

    return agents.map((a) => {
      let currentState: 'ON_CALL' | 'IDLE' | 'OFFLINE';
      if (a.presence === 'ON_CALL' || a.presence === 'RINGING') {
        currentState = 'ON_CALL';
      } else if (
        a.presence === 'IDLE' ||
        a.presence === 'WRAPUP' ||
        a.presence === 'PAUSED'
      ) {
        currentState = 'IDLE';
      } else {
        currentState = 'OFFLINE';
      }

      const currentCallDurationSec = a.callStartedAt
        ? Math.round((now - a.callStartedAt.getTime()) / 1000)
        : null;

      return {
        userId: a.userId,
        displayName: a.displayName,
        currentState,
        currentCallDurationSec,
        callsHandledToday: a.callsHandledToday,
        _disclaimer: null as any,
        presence: a.presence,
        pausedReason: a.pausedReason,
      };
    });
  }

  private async getQueueLiveFromDb(): Promise<LiveQueueState[]> {
    const disclaimer =
      'Best-effort from event data; AMI not connected for real-time accuracy';
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);

    const queues = await this.prisma.telephonyQueue.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const results: LiveQueueState[] = [];

    // B7 — exclude internal ext-to-ext calls from all live queue counts.
    // Mirror of the stats-service filter (code-review High #1); without
    // this, the manager live dashboard would still see internal transfers
    // inflating activeCalls / waitingCallers on queues they happened to
    // traverse.
    for (const queue of queues) {
      const activeCalls = await this.prisma.callSession.count({
        where: { queueId: queue.id, startAt: { gte: cutoff }, endAt: null, isInternal: false },
      });

      const waitingCallers = await this.prisma.callSession.count({
        where: {
          queueId: queue.id,
          startAt: { gte: cutoff },
          endAt: null,
          assignedUserId: null,
          isInternal: false,
        },
      });

      const oldestWaiting = await this.prisma.callSession.findFirst({
        where: {
          queueId: queue.id,
          startAt: { gte: cutoff },
          endAt: null,
          assignedUserId: null,
          isInternal: false,
        },
        orderBy: { startAt: 'asc' },
        select: { startAt: true },
      });

      const longestCurrentWaitSec = oldestWaiting
        ? Math.round((Date.now() - oldestWaiting.startAt.getTime()) / 1000)
        : null;

      const recentAgents = await this.prisma.callSession.findMany({
        where: {
          queueId: queue.id,
          startAt: { gte: cutoff },
          assignedUserId: { not: null },
          endAt: { not: null },
          isInternal: false,
        },
        select: { assignedUserId: true },
        distinct: ['assignedUserId'],
      });

      results.push({
        queueId: queue.id,
        queueName: queue.name,
        activeCalls,
        waitingCallers,
        longestCurrentWaitSec,
        availableAgents: recentAgents.length,
        _disclaimer: disclaimer,
      });
    }

    return results;
  }

  private async getAgentLiveFromDb(): Promise<LiveAgentState[]> {
    const disclaimer =
      'Best-effort from event data; AMI not connected for real-time accuracy';
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const extensions = await this.prisma.telephonyExtension.findMany({
      // Pool rows (crmUserId=null) have no agent — skip from live roster.
      where: { isActive: true, isOperator: true, crmUserId: { not: null } },
      select: { crmUserId: true, displayName: true },
    });

    const results: LiveAgentState[] = [];

    // B7 — exclude internal ext-to-ext from agent-level live counts too.
    for (const ext of extensions) {
      if (!ext.crmUserId) continue;
      const activeCall = await this.prisma.callSession.findFirst({
        where: {
          assignedUserId: ext.crmUserId,
          endAt: null,
          startAt: { gte: cutoff },
          isInternal: false,
        },
        orderBy: { startAt: 'desc' },
        select: { startAt: true, answerAt: true },
      });

      const lastCall = activeCall
        ? null
        : await this.prisma.callSession.findFirst({
            where: {
              assignedUserId: ext.crmUserId,
              startAt: { gte: cutoff },
              endAt: { not: null },
              isInternal: false,
            },
            orderBy: { endAt: 'desc' },
            select: { endAt: true },
          });

      let currentState: 'ON_CALL' | 'IDLE' | 'OFFLINE';
      let currentCallDurationSec: number | null = null;

      if (activeCall) {
        currentState = 'ON_CALL';
        const ref = activeCall.answerAt ?? activeCall.startAt;
        currentCallDurationSec = Math.round(
          (Date.now() - ref.getTime()) / 1000,
        );
      } else if (lastCall) {
        currentState = 'IDLE';
      } else {
        currentState = 'OFFLINE';
      }

      const callsHandledToday = await this.prisma.callSession.count({
        where: {
          assignedUserId: ext.crmUserId,
          startAt: { gte: todayStart },
          disposition: 'ANSWERED',
          isInternal: false,
        },
      });

      results.push({
        userId: ext.crmUserId,
        displayName: ext.displayName,
        currentState,
        currentCallDurationSec,
        callsHandledToday,
        _disclaimer: disclaimer,
      });
    }

    return results;
  }
}
