import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CallDisposition, Prisma } from '@prisma/client';
import {
  OverviewKpis,
  AgentKpis,
  QueueKpis,
  BreakdownRow,
  BreakdownResponse,
  HoldTimeDistribution,
  AgentBreakdownRow,
} from '../types/telephony.types';
import { QueryStatsDto } from '../dto/query-stats.dto';
import { QueryBreakdownDto } from '../dto/query-breakdown.dto';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((a, b) => a + b, 0) / values.length);
}

function buildHoldDistribution(waitValues: number[]): HoldTimeDistribution {
  const total = waitValues.length;
  let u15 = 0, u30 = 0, u60 = 0, o60 = 0;
  for (const w of waitValues) {
    if (w < 15) u15++;
    else if (w < 30) u30++;
    else if (w < 60) u60++;
    else o60++;
  }
  const pct = (n: number) => total > 0 ? round2((n / total) * 100) : 0;
  return {
    under15: { count: u15, percent: pct(u15) },
    under30: { count: u30, percent: pct(u30) },
    under60: { count: u60, percent: pct(u60) },
    over60: { count: o60, percent: pct(o60) },
  };
}

@Injectable()
export class TelephonyStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(query: QueryStatsDto): Promise<{
    current: OverviewKpis;
    comparison?: OverviewKpis;
    delta?: Record<string, number | null>;
  }> {
    const current = await this.computeOverviewKpis(
      new Date(query.from),
      new Date(query.to),
      query.queueId,
    );

    let comparison: OverviewKpis | undefined;
    let delta: Record<string, number | null> | undefined;

    if (query.compareFrom && query.compareTo) {
      comparison = await this.computeOverviewKpis(
        new Date(query.compareFrom),
        new Date(query.compareTo),
        query.queueId,
      );
      delta = this.computeDelta(current, comparison);
    }

    return { current, comparison, delta };
  }

  async getAgentStats(query: QueryStatsDto): Promise<AgentKpis[]> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const sessions = await this.prisma.callSession.findMany({
      where: {
        startAt: { gte: from, lte: to },
        assignedUserId: { not: null },
        ...(query.queueId ? { queueId: query.queueId } : {}),
      },
      select: {
        assignedUserId: true,
        disposition: true,
        callMetrics: {
          select: {
            talkSeconds: true,
            holdSeconds: true,
            wrapupSeconds: true,
            waitSeconds: true,
          },
        },
      },
    });

    const agentMap = new Map<string, {
      total: number;
      answered: number;
      missed: number;
      talkSum: number;
      holdSum: number;
      wrapupSum: number;
      handleSum: number;
    }>();

    for (const s of sessions) {
      const uid = s.assignedUserId!;
      const stats = agentMap.get(uid) ?? {
        total: 0, answered: 0, missed: 0,
        talkSum: 0, holdSum: 0, wrapupSum: 0, handleSum: 0,
      };

      stats.total++;
      if (s.disposition === CallDisposition.ANSWERED) stats.answered++;
      else stats.missed++;

      if (s.callMetrics) {
        stats.talkSum += s.callMetrics.talkSeconds;
        stats.holdSum += s.callMetrics.holdSeconds;
        stats.wrapupSum += s.callMetrics.wrapupSeconds;
        stats.handleSum +=
          s.callMetrics.talkSeconds +
          s.callMetrics.holdSeconds +
          s.callMetrics.wrapupSeconds;
      }

      agentMap.set(uid, stats);
    }

    // Fetch display names
    const userIds = [...agentMap.keys()];
    const extensions = await this.prisma.telephonyExtension.findMany({
      where: { crmUserId: { in: userIds } },
      select: { crmUserId: true, displayName: true },
    });
    const nameMap = new Map(extensions.map((e) => [e.crmUserId, e.displayName]));

    const result: AgentKpis[] = [];
    for (const [userId, stats] of agentMap) {
      const totalHandled = stats.answered;
      result.push({
        userId,
        displayName: nameMap.get(userId) ?? null,
        totalCalls: stats.total,
        answered: stats.answered,
        missed: stats.missed,
        answerRate: stats.total > 0 ? round2((stats.answered / stats.total) * 100) : null,
        missedRate: stats.total > 0 ? round2((stats.missed / stats.total) * 100) : null,
        avgHandleTimeSec: totalHandled > 0 ? stats.handleSum / totalHandled : null,
        avgTalkTimeSec: totalHandled > 0 ? stats.talkSum / totalHandled : null,
        avgHoldTimeSec: totalHandled > 0 ? stats.holdSum / totalHandled : null,
        afterCallWorkTimeSec: totalHandled > 0 ? stats.wrapupSum / totalHandled : null,
        occupancyProxy: null, // requires shift data; stub for now
      });
    }

    return result.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  async getQueueStats(query: QueryStatsDto): Promise<QueueKpis[]> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const sessions = await this.prisma.callSession.findMany({
      where: {
        startAt: { gte: from, lte: to },
        queueId: { not: null },
      },
      select: {
        queueId: true,
        assignedUserId: true,
        disposition: true,
        callMetrics: {
          select: { waitSeconds: true, talkSeconds: true, isSlaMet: true },
        },
      },
    });

    const queueMap = new Map<string, {
      total: number;
      answered: number;
      missed: number;
      abandoned: number;
      waitSum: number;
      talkSum: number;
      slaMetCount: number;
      slaTotal: number;
      agents: Set<string>;
    }>();

    for (const s of sessions) {
      const qid = s.queueId!;
      const stats = queueMap.get(qid) ?? {
        total: 0, answered: 0, missed: 0, abandoned: 0,
        waitSum: 0, talkSum: 0, slaMetCount: 0, slaTotal: 0,
        agents: new Set<string>(),
      };

      stats.total++;
      if (s.disposition === CallDisposition.ANSWERED) stats.answered++;
      else if (s.disposition === CallDisposition.ABANDONED) stats.abandoned++;
      else stats.missed++;

      if (s.assignedUserId) stats.agents.add(s.assignedUserId);

      if (s.callMetrics) {
        stats.waitSum += s.callMetrics.waitSeconds;
        stats.talkSum += s.callMetrics.talkSeconds;
        if (s.callMetrics.isSlaMet !== null) {
          stats.slaTotal++;
          if (s.callMetrics.isSlaMet) stats.slaMetCount++;
        }
      }

      queueMap.set(qid, stats);
    }

    const queueIds = [...queueMap.keys()];
    const queues = await this.prisma.telephonyQueue.findMany({
      where: { id: { in: queueIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(queues.map((q) => [q.id, q.name]));

    const result: QueueKpis[] = [];
    for (const [queueId, stats] of queueMap) {
      result.push({
        queueId,
        queueName: nameMap.get(queueId) ?? 'Unknown',
        agentCount: stats.agents.size,
        totalCalls: stats.total,
        answered: stats.answered,
        missed: stats.missed,
        abandoned: stats.abandoned,
        avgAnswerTimeSec:
          stats.answered > 0 ? stats.waitSum / stats.answered : null,
        avgTalkTimeSec:
          stats.answered > 0 ? stats.talkSum / stats.answered : null,
        slaMetPercent:
          stats.slaTotal > 0 ? (stats.slaMetCount / stats.slaTotal) * 100 : null,
      });
    }

    return result.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  async getBreakdown(query: QueryBreakdownDto): Promise<BreakdownResponse> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const where: Prisma.CallSessionWhereInput = {
      startAt: { gte: from, lte: to },
      ...(query.queueId ? { queueId: query.queueId } : {}),
      ...(query.agentId ? { assignedUserId: query.agentId } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
    };

    const sessions = await this.prisma.callSession.findMany({
      where,
      select: {
        startAt: true,
        disposition: true,
        callMetrics: {
          select: { waitSeconds: true, talkSeconds: true, holdSeconds: true, isSlaMet: true },
        },
      },
    });

    type BucketAccum = {
      total: number;
      answered: number;
      lost: number;
      lostBefore5: number;
      durationSum: number;
      answeredDurationValues: number[];
      answeredWaitValues: number[];
      lostWaitValues: number[];
      slaMetCount: number;
      slaTotal: number;
    };

    const buckets = new Map<string, BucketAccum>();

    const getKey = (s: { startAt: Date }): { label: string; sortKey: number } => {
      const d = s.startAt;
      switch (query.groupBy) {
        case 'hour': {
          const h = d.getHours();
          return { label: String(h), sortKey: h };
        }
        case 'day': {
          const day = d.getDate();
          return { label: String(day), sortKey: day };
        }
        case 'weekday': {
          const dow = d.getDay();
          const mondayFirst = dow === 0 ? 6 : dow - 1;
          return { label: WEEKDAY_NAMES[dow], sortKey: mondayFirst };
        }
      }
    };

    const keyMeta = new Map<string, number>();

    for (const s of sessions) {
      const { label, sortKey } = getKey(s);
      keyMeta.set(label, sortKey);

      const b = buckets.get(label) ?? {
        total: 0, answered: 0, lost: 0, lostBefore5: 0, durationSum: 0,
        answeredDurationValues: [], answeredWaitValues: [], lostWaitValues: [],
        slaMetCount: 0, slaTotal: 0,
      };

      b.total++;
      const isAnswered = s.disposition === CallDisposition.ANSWERED;
      const talk = s.callMetrics?.talkSeconds ?? 0;
      const hold = s.callMetrics?.holdSeconds ?? 0;
      const wait = s.callMetrics?.waitSeconds ?? 0;
      const duration = talk + hold;

      b.durationSum += duration;

      if (isAnswered) {
        b.answered++;
        b.answeredDurationValues.push(duration);
        b.answeredWaitValues.push(wait);
      } else {
        b.lost++;
        b.lostWaitValues.push(wait);
        if (wait < 5) b.lostBefore5++;
      }

      if (s.callMetrics?.isSlaMet !== null && s.callMetrics?.isSlaMet !== undefined) {
        b.slaTotal++;
        if (s.callMetrics.isSlaMet) b.slaMetCount++;
      }

      buckets.set(label, b);
    }

    const rows: BreakdownRow[] = [];
    for (const [label, b] of buckets) {
      rows.push({
        label,
        sortKey: keyMeta.get(label)!,
        totalCalls: b.total,
        answeredCalls: b.answered,
        lostCalls: b.lost,
        callsLostBefore5Sec: b.lostBefore5,
        totalCallsDurationMin: round2(b.durationSum / 60),
        avgCallDurationSec: avg(b.answeredDurationValues),
        answeredAvgHoldTimeSec: avg(b.answeredWaitValues),
        answeredAvgPosition: b.answered > 0 ? 1.00 : null,
        lostAvgHoldTimeSec: avg(b.lostWaitValues),
        lostAvgPosition: b.lost > 0 ? 1.00 : null,
        slaPercent: b.slaTotal > 0 ? round2((b.slaMetCount / b.slaTotal) * 100) : null,
      });
    }

    rows.sort((a, b) => a.sortKey - b.sortKey);
    return { rows };
  }

  async getOverviewExtended(query: QueryStatsDto): Promise<{
    holdDistribution: { answered: HoldTimeDistribution; lost: HoldTimeDistribution };
  }> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const sessions = await this.prisma.callSession.findMany({
      where: {
        startAt: { gte: from, lte: to },
        ...(query.queueId ? { queueId: query.queueId } : {}),
      },
      select: {
        disposition: true,
        callMetrics: { select: { waitSeconds: true } },
      },
    });

    const answeredWaits: number[] = [];
    const lostWaits: number[] = [];

    for (const s of sessions) {
      const wait = s.callMetrics?.waitSeconds ?? 0;
      if (s.disposition === CallDisposition.ANSWERED) {
        answeredWaits.push(wait);
      } else {
        lostWaits.push(wait);
      }
    }

    return {
      holdDistribution: {
        answered: buildHoldDistribution(answeredWaits),
        lost: buildHoldDistribution(lostWaits),
      },
    };
  }

  async getAgentBreakdown(query: QueryStatsDto): Promise<AgentBreakdownRow[]> {
    const from = new Date(query.from);
    const to = new Date(query.to);

    const sessions = await this.prisma.callSession.findMany({
      where: {
        startAt: { gte: from, lte: to },
        assignedUserId: { not: null },
        ...(query.queueId ? { queueId: query.queueId } : {}),
      },
      select: {
        assignedUserId: true,
        disposition: true,
        callMetrics: {
          select: { waitSeconds: true, talkSeconds: true, holdSeconds: true },
        },
      },
    });

    type AgentAccum = {
      answered: number;
      noAnswer: number;
      busy: number;
      total: number;
      durationSum: number;
      answeredDurations: number[];
      answeredWaits: number[];
      nonAnsweredWaits: number[];
    };

    const agentMap = new Map<string, AgentAccum>();

    for (const s of sessions) {
      const uid = s.assignedUserId!;
      const a = agentMap.get(uid) ?? {
        answered: 0, noAnswer: 0, busy: 0, total: 0, durationSum: 0,
        answeredDurations: [], answeredWaits: [], nonAnsweredWaits: [],
      };

      a.total++;
      const talk = s.callMetrics?.talkSeconds ?? 0;
      const hold = s.callMetrics?.holdSeconds ?? 0;
      const wait = s.callMetrics?.waitSeconds ?? 0;
      const duration = talk + hold;
      a.durationSum += duration;

      if (s.disposition === CallDisposition.ANSWERED) {
        a.answered++;
        a.answeredDurations.push(duration);
        a.answeredWaits.push(wait);
      } else if (
        s.disposition === CallDisposition.BUSY ||
        s.disposition === CallDisposition.FAILED
      ) {
        a.busy++;
        a.nonAnsweredWaits.push(wait);
      } else {
        a.noAnswer++;
        a.nonAnsweredWaits.push(wait);
      }

      agentMap.set(uid, a);
    }

    const userIds = [...agentMap.keys()];
    const extensions = await this.prisma.telephonyExtension.findMany({
      where: { crmUserId: { in: userIds } },
      select: { crmUserId: true, displayName: true, extension: true },
    });
    const extMap = new Map(extensions.map((e) => [e.crmUserId, e]));

    const result: AgentBreakdownRow[] = [];
    for (const [userId, a] of agentMap) {
      const ext = extMap.get(userId);
      result.push({
        userId,
        displayName: ext?.displayName ?? null,
        extension: ext?.extension ?? null,
        answeredCalls: a.answered,
        noAnswerCalls: a.noAnswer,
        busyCalls: a.busy,
        totalCalls: a.total,
        totalCallsDurationMin: round2(a.durationSum / 60),
        avgCallDurationSec: avg(a.answeredDurations),
        answeredAvgRingTimeSec: avg(a.answeredWaits),
        noAnswerAvgRingTimeSec: avg(a.nonAnsweredWaits),
      });
    }

    return result.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  private async computeOverviewKpis(
    from: Date,
    to: Date,
    queueId?: string,
  ): Promise<OverviewKpis> {
    const sessionWhere: Prisma.CallSessionWhereInput = {
      startAt: { gte: from, lte: to },
      ...(queueId ? { queueId } : {}),
    };

    const sessions = await this.prisma.callSession.findMany({
      where: sessionWhere,
      select: {
        disposition: true,
        startAt: true,
        callMetrics: true,
      },
    });

    const total = sessions.length;
    const answered = sessions.filter(
      (s) => s.disposition === CallDisposition.ANSWERED,
    ).length;
    const missed = sessions.filter(
      (s) =>
        s.disposition === CallDisposition.MISSED ||
        s.disposition === CallDisposition.NOANSWER,
    ).length;
    const abandoned = sessions.filter(
      (s) => s.disposition === CallDisposition.ABANDONED,
    ).length;

    // Callbacks
    const [callbacksCreated, callbacksCompleted] = await Promise.all([
      this.prisma.callbackRequest.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.callbackRequest.count({
        where: { createdAt: { gte: from, lte: to }, status: 'DONE' },
      }),
    ]);

    // Speed metrics from CallMetrics
    const metricsWithWait = sessions
      .filter((s) => s.callMetrics && s.disposition === CallDisposition.ANSWERED)
      .map((s) => s.callMetrics!.waitSeconds)
      .sort((a, b) => a - b);

    const abandonWaits = sessions
      .filter((s) => s.callMetrics && s.disposition === CallDisposition.ABANDONED)
      .map((s) => s.callMetrics!.abandonsAfterSeconds)
      .filter((v): v is number => v !== null);

    const avgAnswerTime = metricsWithWait.length > 0
      ? metricsWithWait.reduce((a, b) => a + b, 0) / metricsWithWait.length
      : null;

    const medianAnswerTime = metricsWithWait.length > 0
      ? this.percentile(metricsWithWait, 50)
      : null;

    const p90AnswerTime = metricsWithWait.length > 0
      ? this.percentile(metricsWithWait, 90)
      : null;

    const avgAbandonWait = abandonWaits.length > 0
      ? abandonWaits.reduce((a, b) => a + b, 0) / abandonWaits.length
      : null;

    // Quality metrics
    const answeredMetrics = sessions
      .filter((s) => s.callMetrics && s.disposition === CallDisposition.ANSWERED)
      .map((s) => s.callMetrics!);

    const avgTalkTime = answeredMetrics.length > 0
      ? answeredMetrics.reduce((a, m) => a + m.talkSeconds, 0) / answeredMetrics.length
      : null;
    const avgHoldTime = answeredMetrics.length > 0
      ? answeredMetrics.reduce((a, m) => a + m.holdSeconds, 0) / answeredMetrics.length
      : null;
    const avgWrapupTime = answeredMetrics.length > 0
      ? answeredMetrics.reduce((a, m) => a + m.wrapupSeconds, 0) / answeredMetrics.length
      : null;

    const totalTransfers = answeredMetrics.reduce((a, m) => a + m.transfersCount, 0);
    const transferRate = answered > 0 ? totalTransfers / answered : null;

    // SLA
    const slaMetrics = sessions.filter(
      (s) => s.callMetrics?.isSlaMet !== null && s.callMetrics?.isSlaMet !== undefined,
    );
    const slaMetCount = slaMetrics.filter((s) => s.callMetrics!.isSlaMet).length;
    const slaMetPercent =
      slaMetrics.length > 0 ? (slaMetCount / slaMetrics.length) * 100 : null;

    const longestWait =
      metricsWithWait.length > 0
        ? metricsWithWait[metricsWithWait.length - 1]
        : null;

    // Peak hour distribution
    const peakHourDistribution: Record<number, number> = {};
    for (const s of sessions) {
      const hour = s.startAt.getHours();
      peakHourDistribution[hour] = (peakHourDistribution[hour] ?? 0) + 1;
    }

    return {
      volume: {
        totalCalls: total,
        answered,
        missed,
        abandoned,
        callbacksCreated,
        callbacksCompleted,
      },
      speed: {
        avgAnswerTimeSec: avgAnswerTime ? Math.round(avgAnswerTime * 100) / 100 : null,
        medianAnswerTimeSec: medianAnswerTime ? Math.round(medianAnswerTime * 100) / 100 : null,
        p90AnswerTimeSec: p90AnswerTime ? Math.round(p90AnswerTime * 100) / 100 : null,
        avgAbandonWaitSec: avgAbandonWait ? Math.round(avgAbandonWait * 100) / 100 : null,
      },
      quality: {
        avgTalkTimeSec: avgTalkTime ? Math.round(avgTalkTime * 100) / 100 : null,
        avgHoldTimeSec: avgHoldTime ? Math.round(avgHoldTime * 100) / 100 : null,
        avgWrapupTimeSec: avgWrapupTime ? Math.round(avgWrapupTime * 100) / 100 : null,
        transferRate: transferRate ? Math.round(transferRate * 10000) / 10000 : null,
      },
      serviceLevel: {
        slaMetPercent: slaMetPercent ? Math.round(slaMetPercent * 100) / 100 : null,
        longestWaitSec: longestWait ? Math.round(longestWait * 100) / 100 : null,
        peakHourDistribution,
      },
    };
  }

  private percentile(sorted: number[], pct: number): number {
    const idx = (pct / 100) * (sorted.length - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
  }

  private computeDelta(
    current: OverviewKpis,
    comparison: OverviewKpis,
  ): Record<string, number | null> {
    const pctChange = (cur: number | null, prev: number | null) => {
      if (cur === null || prev === null || prev === 0) return null;
      return Math.round(((cur - prev) / prev) * 10000) / 100;
    };

    return {
      totalCalls: pctChange(current.volume.totalCalls, comparison.volume.totalCalls),
      answered: pctChange(current.volume.answered, comparison.volume.answered),
      missed: pctChange(current.volume.missed, comparison.volume.missed),
      avgAnswerTimeSec: pctChange(
        current.speed.avgAnswerTimeSec,
        comparison.speed.avgAnswerTimeSec,
      ),
      avgTalkTimeSec: pctChange(
        current.quality.avgTalkTimeSec,
        comparison.quality.avgTalkTimeSec,
      ),
      slaMetPercent: pctChange(
        current.serviceLevel.slaMetPercent,
        comparison.serviceLevel.slaMetPercent,
      ),
    };
  }
}
