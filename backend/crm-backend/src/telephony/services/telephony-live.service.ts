import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveQueueState, LiveAgentState } from '../types/telephony.types';
import { TelephonyStateManager } from '../realtime/telephony-state.manager';

@Injectable()
export class TelephonyLiveService {
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
    const base = this.stateManager.isAmiConnected()
      ? this.getAgentLiveFromState()
      : await this.getAgentLiveFromDb();
    // Enrich with softphone SIP presence (driven by the 30s heartbeat and
    // stale-registration sweep). This lets managers see "SIP DOWN" even when
    // the AMI/queue side still shows the agent as available.
    return this.attachSipPresence(base);
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

    for (const queue of queues) {
      const activeCalls = await this.prisma.callSession.count({
        where: { queueId: queue.id, startAt: { gte: cutoff }, endAt: null },
      });

      const waitingCallers = await this.prisma.callSession.count({
        where: {
          queueId: queue.id,
          startAt: { gte: cutoff },
          endAt: null,
          assignedUserId: null,
        },
      });

      const oldestWaiting = await this.prisma.callSession.findFirst({
        where: {
          queueId: queue.id,
          startAt: { gte: cutoff },
          endAt: null,
          assignedUserId: null,
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
      where: { isActive: true, isOperator: true },
      select: { crmUserId: true, displayName: true },
    });

    const results: LiveAgentState[] = [];

    for (const ext of extensions) {
      const activeCall = await this.prisma.callSession.findFirst({
        where: {
          assignedUserId: ext.crmUserId,
          endAt: null,
          startAt: { gte: cutoff },
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
