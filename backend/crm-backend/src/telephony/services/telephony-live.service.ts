import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LiveQueueState, LiveAgentState } from '../types/telephony.types';

const LIVE_DISCLAIMER =
  'Best-effort from event data; real-time accuracy requires AMI/ARI integration';

@Injectable()
export class TelephonyLiveService {
  constructor(private readonly prisma: PrismaService) {}

  async getQueueLiveState(): Promise<LiveQueueState[]> {
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);

    const queues = await this.prisma.telephonyQueue.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });

    const results: LiveQueueState[] = [];

    for (const queue of queues) {
      const activeCalls = await this.prisma.callSession.count({
        where: {
          queueId: queue.id,
          startAt: { gte: cutoff },
          endAt: null,
        },
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
        ? (Date.now() - oldestWaiting.startAt.getTime()) / 1000
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
        longestCurrentWaitSec: longestCurrentWaitSec
          ? Math.round(longestCurrentWaitSec)
          : null,
        availableAgents: recentAgents.length,
        _disclaimer: LIVE_DISCLAIMER,
      });
    }

    return results;
  }

  async getAgentLiveState(): Promise<LiveAgentState[]> {
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
        currentCallDurationSec = Math.round((Date.now() - ref.getTime()) / 1000);
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
        _disclaimer: LIVE_DISCLAIMER,
      });
    }

    return results;
  }
}
