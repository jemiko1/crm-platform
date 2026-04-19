import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
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

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// Upper bound on date-range width in days. A single month query is the norm;
// quarterly comparisons (2 × ~90 days) are the realistic ceiling. "Last year"
// queries thrash the DB and are almost always a user error. Configurable via
// env for ops flexibility. See audit/phase1-telephony-stats.md check #3.
const DEFAULT_MAX_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function round2(v: number | null): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Math.round(v * 100) / 100;
}

function safeNumber(v: number | bigint | null | undefined): number {
  if (v === null || v === undefined) return 0;
  return typeof v === 'bigint' ? Number(v) : v;
}

function safeNullableNumber(
  v: number | bigint | null | undefined,
): number | null {
  if (v === null || v === undefined) return null;
  return typeof v === 'bigint' ? Number(v) : v;
}

function buildHoldDistribution(bucketCounts: {
  u15: number;
  u30: number;
  u60: number;
  o60: number;
}): HoldTimeDistribution {
  const total =
    bucketCounts.u15 + bucketCounts.u30 + bucketCounts.u60 + bucketCounts.o60;
  const pct = (n: number) =>
    total > 0 ? Math.round((n / total) * 10000) / 100 : 0;
  return {
    under15: { count: bucketCounts.u15, percent: pct(bucketCounts.u15) },
    under30: { count: bucketCounts.u30, percent: pct(bucketCounts.u30) },
    under60: { count: bucketCounts.u60, percent: pct(bucketCounts.u60) },
    over60: { count: bucketCounts.o60, percent: pct(bucketCounts.o60) },
  };
}

@Injectable()
export class TelephonyStatsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async getOverview(query: QueryStatsDto): Promise<{
    current: OverviewKpis;
    comparison?: OverviewKpis;
    delta?: Record<string, number | null>;
  }> {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    this.assertRangeWithinLimit(from, to);

    const current = await this.computeOverviewKpis(from, to, query.queueId);

    let comparison: OverviewKpis | undefined;
    let delta: Record<string, number | null> | undefined;

    if (query.compareFrom && query.compareTo) {
      const compareFrom = this.parseDate(query.compareFrom, 'compareFrom');
      const compareTo = this.parseDate(query.compareTo, 'compareTo');
      this.assertRangeWithinLimit(compareFrom, compareTo);

      comparison = await this.computeOverviewKpis(
        compareFrom,
        compareTo,
        query.queueId,
      );
      delta = this.computeDelta(current, comparison);
    }

    return { current, comparison, delta };
  }

  async getAgentStats(query: QueryStatsDto): Promise<AgentKpis[]> {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    this.assertRangeWithinLimit(from, to);

    const queueFilter = query.queueId
      ? Prisma.sql`AND s."queueId" = ${query.queueId}`
      : Prisma.empty;

    // One aggregated scan grouped by agent. LEFT JOIN CallMetrics so sessions
    // without a metrics row still contribute to counts (matches the legacy
    // JS behaviour exactly: `if (s.callMetrics) { ... talk/hold/wrap sums }`).
    const rows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        total: bigint;
        answered: bigint;
        missed: bigint;
        talkSum: number | null;
        holdSum: number | null;
        wrapupSum: number | null;
      }>
    >(Prisma.sql`
      SELECT
        s."assignedUserId" AS "userId",
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE s.disposition = 'ANSWERED')::bigint AS answered,
        COUNT(*) FILTER (WHERE s.disposition IS DISTINCT FROM 'ANSWERED')::bigint AS missed,
        SUM(m."talkSeconds") AS "talkSum",
        SUM(m."holdSeconds") AS "holdSum",
        SUM(m."wrapupSeconds") AS "wrapupSum"
      FROM "CallSession" s
      LEFT JOIN "CallMetrics" m ON m."callSessionId" = s.id
      WHERE s."startAt" >= ${from}
        AND s."startAt" <= ${to}
        AND s."assignedUserId" IS NOT NULL
        ${queueFilter}
      GROUP BY s."assignedUserId"
    `);

    if (rows.length === 0) return [];

    const userIds = rows.map((r) => r.userId);
    const extensions = await this.prisma.telephonyExtension.findMany({
      where: { crmUserId: { in: userIds } },
      select: { crmUserId: true, displayName: true },
    });
    const nameMap = new Map(
      extensions.map((e) => [e.crmUserId as string, e.displayName]),
    );

    const result: AgentKpis[] = rows.map((r) => {
      const total = safeNumber(r.total);
      const answered = safeNumber(r.answered);
      const missed = safeNumber(r.missed);
      const talkSum = safeNumber(r.talkSum);
      const holdSum = safeNumber(r.holdSum);
      const wrapupSum = safeNumber(r.wrapupSum);
      const handleSum = talkSum + holdSum + wrapupSum;
      return {
        userId: r.userId,
        displayName: nameMap.get(r.userId) ?? null,
        totalCalls: total,
        answered,
        missed,
        answerRate:
          total > 0 ? Math.round((answered / total) * 10000) / 100 : null,
        missedRate:
          total > 0 ? Math.round((missed / total) * 10000) / 100 : null,
        avgHandleTimeSec: answered > 0 ? handleSum / answered : null,
        avgTalkTimeSec: answered > 0 ? talkSum / answered : null,
        avgHoldTimeSec: answered > 0 ? holdSum / answered : null,
        afterCallWorkTimeSec: answered > 0 ? wrapupSum / answered : null,
        occupancyProxy: null,
      };
    });

    return result.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  async getQueueStats(query: QueryStatsDto): Promise<QueueKpis[]> {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    this.assertRangeWithinLimit(from, to);

    // Aggregated scan grouped by queue. COUNT(DISTINCT assignedUserId) gives
    // the agent-count KPI (matches legacy `new Set(assignedUserIds).size`).
    const rows = await this.prisma.$queryRaw<
      Array<{
        queueId: string;
        total: bigint;
        answered: bigint;
        missed: bigint;
        abandoned: bigint;
        agentCount: bigint;
        waitSum: number | null;
        talkSum: number | null;
        slaMetCount: bigint;
        slaTotal: bigint;
      }>
    >(Prisma.sql`
      SELECT
        s."queueId" AS "queueId",
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE s.disposition = 'ANSWERED')::bigint AS answered,
        COUNT(*) FILTER (
          WHERE s.disposition IS DISTINCT FROM 'ANSWERED'
            AND s.disposition IS DISTINCT FROM 'ABANDONED'
        )::bigint AS missed,
        COUNT(*) FILTER (WHERE s.disposition = 'ABANDONED')::bigint AS abandoned,
        COUNT(DISTINCT s."assignedUserId")::bigint AS "agentCount",
        SUM(m."waitSeconds") AS "waitSum",
        SUM(m."talkSeconds") AS "talkSum",
        COUNT(*) FILTER (WHERE m."isSlaMet" = true)::bigint AS "slaMetCount",
        COUNT(*) FILTER (WHERE m."isSlaMet" IS NOT NULL)::bigint AS "slaTotal"
      FROM "CallSession" s
      LEFT JOIN "CallMetrics" m ON m."callSessionId" = s.id
      WHERE s."startAt" >= ${from}
        AND s."startAt" <= ${to}
        AND s."queueId" IS NOT NULL
      GROUP BY s."queueId"
    `);

    if (rows.length === 0) return [];

    const queueIds = rows.map((r) => r.queueId);
    const queues = await this.prisma.telephonyQueue.findMany({
      where: { id: { in: queueIds } },
      select: { id: true, name: true },
    });
    const nameMap = new Map(queues.map((q) => [q.id, q.name]));

    const result: QueueKpis[] = rows.map((r) => {
      const total = safeNumber(r.total);
      const answered = safeNumber(r.answered);
      const waitSum = safeNumber(r.waitSum);
      const talkSum = safeNumber(r.talkSum);
      const slaTotal = safeNumber(r.slaTotal);
      const slaMetCount = safeNumber(r.slaMetCount);
      return {
        queueId: r.queueId,
        queueName: nameMap.get(r.queueId) ?? 'Unknown',
        agentCount: safeNumber(r.agentCount),
        totalCalls: total,
        answered,
        missed: safeNumber(r.missed),
        abandoned: safeNumber(r.abandoned),
        avgAnswerTimeSec: answered > 0 ? waitSum / answered : null,
        avgTalkTimeSec: answered > 0 ? talkSum / answered : null,
        slaMetPercent: slaTotal > 0 ? (slaMetCount / slaTotal) * 100 : null,
      };
    });

    return result.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  async getBreakdown(query: QueryBreakdownDto): Promise<BreakdownResponse> {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    this.assertRangeWithinLimit(from, to);

    // Emit the SQL expression that carves up startAt into the desired bucket
    // key. We only ever use three hand-picked values for groupBy (validated
    // upstream by the DTO's @IsIn decorator), so no untrusted string ever
    // lands in raw SQL.
    let bucketExpr: Prisma.Sql;
    switch (query.groupBy) {
      case 'hour':
        bucketExpr = Prisma.sql`EXTRACT(HOUR FROM s."startAt")::int`;
        break;
      case 'day':
        bucketExpr = Prisma.sql`EXTRACT(DAY FROM s."startAt")::int`;
        break;
      case 'weekday':
        bucketExpr = Prisma.sql`EXTRACT(DOW FROM s."startAt")::int`;
        break;
    }

    const queueFilter = query.queueId
      ? Prisma.sql`AND s."queueId" = ${query.queueId}`
      : Prisma.empty;
    const agentFilter = query.agentId
      ? Prisma.sql`AND s."assignedUserId" = ${query.agentId}`
      : Prisma.empty;
    const directionFilter = query.direction
      ? Prisma.sql`AND s.direction = ${query.direction}::"CallDirection"`
      : Prisma.empty;

    // One scan per call, projected into the bucket. All sums (duration, wait,
    // sla) are computed in SQL; JS only sorts the bucket rows and formats
    // output.
    const rows = await this.prisma.$queryRaw<
      Array<{
        bucket: number;
        total: bigint;
        answered: bigint;
        lost: bigint;
        lostBefore5: bigint;
        durationSum: number | null;
        answeredDurationSum: number | null;
        answeredWaitSum: number | null;
        lostWaitSum: number | null;
        slaMetCount: bigint;
        slaTotal: bigint;
      }>
    >(Prisma.sql`
      WITH base AS (
        SELECT
          ${bucketExpr} AS bucket,
          s.disposition,
          COALESCE(m."talkSeconds", 0) AS talk,
          COALESCE(m."holdSeconds", 0) AS hold,
          COALESCE(m."waitSeconds", 0) AS wait,
          m."isSlaMet"
        FROM "CallSession" s
        LEFT JOIN "CallMetrics" m ON m."callSessionId" = s.id
        WHERE s."startAt" >= ${from}
          AND s."startAt" <= ${to}
          ${queueFilter}
          ${agentFilter}
          ${directionFilter}
      )
      SELECT
        bucket,
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE disposition = 'ANSWERED')::bigint AS answered,
        COUNT(*) FILTER (WHERE disposition IS DISTINCT FROM 'ANSWERED')::bigint AS lost,
        COUNT(*) FILTER (
          WHERE disposition IS DISTINCT FROM 'ANSWERED' AND wait < 5
        )::bigint AS "lostBefore5",
        SUM(talk + hold) AS "durationSum",
        SUM(talk + hold) FILTER (WHERE disposition = 'ANSWERED') AS "answeredDurationSum",
        SUM(wait) FILTER (WHERE disposition = 'ANSWERED') AS "answeredWaitSum",
        SUM(wait) FILTER (WHERE disposition IS DISTINCT FROM 'ANSWERED') AS "lostWaitSum",
        COUNT(*) FILTER (WHERE "isSlaMet" = true)::bigint AS "slaMetCount",
        COUNT(*) FILTER (WHERE "isSlaMet" IS NOT NULL)::bigint AS "slaTotal"
      FROM base
      GROUP BY bucket
      ORDER BY bucket
    `);

    const breakdownRows: BreakdownRow[] = rows.map((r) => {
      const bucket = Number(r.bucket);
      const total = safeNumber(r.total);
      const answered = safeNumber(r.answered);
      const lost = safeNumber(r.lost);
      const lostBefore5 = safeNumber(r.lostBefore5);
      const durationSum = safeNumber(r.durationSum);
      const answeredDurationSum = safeNumber(r.answeredDurationSum);
      const answeredWaitSum = safeNumber(r.answeredWaitSum);
      const lostWaitSum = safeNumber(r.lostWaitSum);
      const slaTotal = safeNumber(r.slaTotal);
      const slaMet = safeNumber(r.slaMetCount);

      const { label, sortKey } = this.bucketToLabel(query.groupBy, bucket);

      return {
        label,
        sortKey,
        totalCalls: total,
        answeredCalls: answered,
        lostCalls: lost,
        callsLostBefore5Sec: lostBefore5,
        totalCallsDurationMin: Math.round((durationSum / 60) * 100) / 100,
        avgCallDurationSec:
          answered > 0 ? round2(answeredDurationSum / answered) : null,
        answeredAvgHoldTimeSec:
          answered > 0 ? round2(answeredWaitSum / answered) : null,
        answeredAvgPosition: answered > 0 ? 1.0 : null,
        lostAvgHoldTimeSec: lost > 0 ? round2(lostWaitSum / lost) : null,
        lostAvgPosition: lost > 0 ? 1.0 : null,
        slaPercent: slaTotal > 0 ? round2((slaMet / slaTotal) * 100) : null,
      };
    });

    breakdownRows.sort((a, b) => a.sortKey - b.sortKey);
    return { rows: breakdownRows };
  }

  async getOverviewExtended(query: QueryStatsDto): Promise<{
    holdDistribution: { answered: HoldTimeDistribution; lost: HoldTimeDistribution };
  }> {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    this.assertRangeWithinLimit(from, to);

    const queueFilter = query.queueId
      ? Prisma.sql`AND s."queueId" = ${query.queueId}`
      : Prisma.empty;

    // Single scan that splits the wait-time histogram by answered/lost. Hold
    // here follows the legacy naming but is really waitSeconds (what the
    // caller waited before being answered or giving up). Using COALESCE so
    // sessions without CallMetrics land in the under-15s bucket, preserving
    // legacy behaviour of `s.callMetrics?.waitSeconds ?? 0`.
    const rows = await this.prisma.$queryRaw<
      Array<{
        kind: 'answered' | 'lost';
        u15: bigint;
        u30: bigint;
        u60: bigint;
        o60: bigint;
      }>
    >(Prisma.sql`
      WITH base AS (
        SELECT
          CASE WHEN s.disposition = 'ANSWERED' THEN 'answered' ELSE 'lost' END AS kind,
          COALESCE(m."waitSeconds", 0) AS wait
        FROM "CallSession" s
        LEFT JOIN "CallMetrics" m ON m."callSessionId" = s.id
        WHERE s."startAt" >= ${from}
          AND s."startAt" <= ${to}
          ${queueFilter}
      )
      SELECT
        kind,
        COUNT(*) FILTER (WHERE wait < 15)::bigint AS u15,
        COUNT(*) FILTER (WHERE wait >= 15 AND wait < 30)::bigint AS u30,
        COUNT(*) FILTER (WHERE wait >= 30 AND wait < 60)::bigint AS u60,
        COUNT(*) FILTER (WHERE wait >= 60)::bigint AS o60
      FROM base
      GROUP BY kind
    `);

    const emptyBuckets = { u15: 0, u30: 0, u60: 0, o60: 0 };
    const answeredBuckets = { ...emptyBuckets };
    const lostBuckets = { ...emptyBuckets };

    for (const r of rows) {
      const target = r.kind === 'answered' ? answeredBuckets : lostBuckets;
      target.u15 = safeNumber(r.u15);
      target.u30 = safeNumber(r.u30);
      target.u60 = safeNumber(r.u60);
      target.o60 = safeNumber(r.o60);
    }

    return {
      holdDistribution: {
        answered: buildHoldDistribution(answeredBuckets),
        lost: buildHoldDistribution(lostBuckets),
      },
    };
  }

  async getAgentBreakdown(query: QueryStatsDto): Promise<AgentBreakdownRow[]> {
    const from = this.parseDate(query.from, 'from');
    const to = this.parseDate(query.to, 'to');
    this.assertRangeWithinLimit(from, to);

    const queueFilter = query.queueId
      ? Prisma.sql`AND s."queueId" = ${query.queueId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<
      Array<{
        userId: string;
        answered: bigint;
        noAnswer: bigint;
        busy: bigint;
        total: bigint;
        durationSum: number | null;
        answeredDurationSum: number | null;
        answeredWaitSum: number | null;
        nonAnsweredWaitSum: number | null;
      }>
    >(Prisma.sql`
      WITH base AS (
        SELECT
          s."assignedUserId" AS "userId",
          s.disposition,
          COALESCE(m."talkSeconds", 0) AS talk,
          COALESCE(m."holdSeconds", 0) AS hold,
          COALESCE(m."waitSeconds", 0) AS wait
        FROM "CallSession" s
        LEFT JOIN "CallMetrics" m ON m."callSessionId" = s.id
        WHERE s."startAt" >= ${from}
          AND s."startAt" <= ${to}
          AND s."assignedUserId" IS NOT NULL
          ${queueFilter}
      )
      SELECT
        "userId",
        COUNT(*) FILTER (WHERE disposition = 'ANSWERED')::bigint AS answered,
        COUNT(*) FILTER (
          WHERE disposition IS NOT NULL
            AND disposition NOT IN ('ANSWERED', 'BUSY', 'FAILED')
        )::bigint AS "noAnswer",
        COUNT(*) FILTER (WHERE disposition IN ('BUSY', 'FAILED'))::bigint AS busy,
        COUNT(*)::bigint AS total,
        SUM(talk + hold) AS "durationSum",
        SUM(talk + hold) FILTER (WHERE disposition = 'ANSWERED') AS "answeredDurationSum",
        SUM(wait) FILTER (WHERE disposition = 'ANSWERED') AS "answeredWaitSum",
        SUM(wait) FILTER (WHERE disposition IS DISTINCT FROM 'ANSWERED') AS "nonAnsweredWaitSum"
      FROM base
      GROUP BY "userId"
    `);

    // The original JS implementation counted sessions with disposition=NULL
    // under the noAnswer catch-all (via the trailing `else` branch). Preserve
    // that semantic by folding NULL disposition into noAnswer here.
    const nullDispRows = await this.prisma.$queryRaw<
      Array<{ userId: string; nullCount: bigint }>
    >(Prisma.sql`
      SELECT
        s."assignedUserId" AS "userId",
        COUNT(*)::bigint AS "nullCount"
      FROM "CallSession" s
      WHERE s."startAt" >= ${from}
        AND s."startAt" <= ${to}
        AND s."assignedUserId" IS NOT NULL
        AND s.disposition IS NULL
        ${queueFilter}
      GROUP BY s."assignedUserId"
    `);
    const nullDispMap = new Map(
      nullDispRows.map((r) => [r.userId, safeNumber(r.nullCount)]),
    );

    if (rows.length === 0 && nullDispMap.size === 0) return [];

    const userIds = Array.from(
      new Set([...rows.map((r) => r.userId), ...nullDispMap.keys()]),
    );
    const extensions = await this.prisma.telephonyExtension.findMany({
      where: { crmUserId: { in: userIds } },
      select: { crmUserId: true, displayName: true, extension: true },
    });
    const extMap = new Map(
      extensions.map((e) => [e.crmUserId as string, e]),
    );

    // Merge any agent that only has null-disposition sessions (not present in
    // the main aggregate) into the result set.
    const rowMap = new Map(rows.map((r) => [r.userId, r]));
    for (const uid of nullDispMap.keys()) {
      if (!rowMap.has(uid)) {
        rowMap.set(uid, {
          userId: uid,
          answered: 0n,
          noAnswer: 0n,
          busy: 0n,
          total: 0n,
          durationSum: null,
          answeredDurationSum: null,
          answeredWaitSum: null,
          nonAnsweredWaitSum: null,
        });
      }
    }

    const result: AgentBreakdownRow[] = [];
    for (const [userId, r] of rowMap) {
      const nullCount = nullDispMap.get(userId) ?? 0;
      const answered = safeNumber(r.answered);
      const noAnswerFromDisp = safeNumber(r.noAnswer);
      const noAnswer = noAnswerFromDisp + nullCount;
      const busy = safeNumber(r.busy);
      const total = safeNumber(r.total) + nullCount;
      const durationSum = safeNumber(r.durationSum);
      const answeredDurationSum = safeNumber(r.answeredDurationSum);
      const answeredWaitSum = safeNumber(r.answeredWaitSum);
      const nonAnsweredWaitSum = safeNumber(r.nonAnsweredWaitSum);
      const nonAnsweredCount = noAnswer + busy;

      const ext = extMap.get(userId);
      result.push({
        userId,
        displayName: ext?.displayName ?? null,
        extension: ext?.extension ?? null,
        answeredCalls: answered,
        noAnswerCalls: noAnswer,
        busyCalls: busy,
        totalCalls: total,
        totalCallsDurationMin: Math.round((durationSum / 60) * 100) / 100,
        avgCallDurationSec:
          answered > 0 ? round2(answeredDurationSum / answered) : null,
        answeredAvgRingTimeSec:
          answered > 0 ? round2(answeredWaitSum / answered) : null,
        noAnswerAvgRingTimeSec:
          nonAnsweredCount > 0
            ? round2(nonAnsweredWaitSum / nonAnsweredCount)
            : null,
      });
    }

    return result.sort((a, b) => b.totalCalls - a.totalCalls);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async computeOverviewKpis(
    from: Date,
    to: Date,
    queueId?: string,
  ): Promise<OverviewKpis> {
    const queueFilter = queueId
      ? Prisma.sql`AND s."queueId" = ${queueId}`
      : Prisma.empty;

    // One-shot aggregate over the full session+metrics join. Filtered COUNTs
    // give volume breakdown; filtered AVGs and percentile_cont give speed +
    // quality numbers. MAX() over ANSWERED waitSeconds gives longestWait.
    // Matches the legacy JS formulas: averages over ANSWERED sessions that
    // have a CallMetrics row.
    const [agg] = await this.prisma.$queryRaw<
      Array<{
        total: bigint;
        answered: bigint;
        missed: bigint;
        abandoned: bigint;
        answeredWithMetrics: bigint;
        avgAnswerWait: number | null;
        medianAnswerWait: number | null;
        p90AnswerWait: number | null;
        maxAnsweredWait: number | null;
        abandonWaitCount: bigint;
        abandonWaitSum: number | null;
        talkSum: number | null;
        holdSum: number | null;
        wrapupSum: number | null;
        transfersSum: number | null;
        slaTotal: bigint;
        slaMetCount: bigint;
      }>
    >(Prisma.sql`
      SELECT
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE s.disposition = 'ANSWERED')::bigint AS answered,
        COUNT(*) FILTER (
          WHERE s.disposition IN ('MISSED', 'NOANSWER')
        )::bigint AS missed,
        COUNT(*) FILTER (WHERE s.disposition = 'ABANDONED')::bigint AS abandoned,
        COUNT(*) FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        )::bigint AS "answeredWithMetrics",
        AVG(m."waitSeconds") FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        ) AS "avgAnswerWait",
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY m."waitSeconds") FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        ) AS "medianAnswerWait",
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY m."waitSeconds") FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        ) AS "p90AnswerWait",
        MAX(m."waitSeconds") FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        ) AS "maxAnsweredWait",
        COUNT(*) FILTER (
          WHERE s.disposition = 'ABANDONED'
            AND m."abandonsAfterSeconds" IS NOT NULL
        )::bigint AS "abandonWaitCount",
        SUM(m."abandonsAfterSeconds") FILTER (
          WHERE s.disposition = 'ABANDONED'
            AND m."abandonsAfterSeconds" IS NOT NULL
        ) AS "abandonWaitSum",
        SUM(m."talkSeconds") FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        ) AS "talkSum",
        SUM(m."holdSeconds") FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        ) AS "holdSum",
        SUM(m."wrapupSeconds") FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        ) AS "wrapupSum",
        SUM(m."transfersCount") FILTER (
          WHERE s.disposition = 'ANSWERED' AND m.id IS NOT NULL
        ) AS "transfersSum",
        COUNT(*) FILTER (WHERE m."isSlaMet" IS NOT NULL)::bigint AS "slaTotal",
        COUNT(*) FILTER (WHERE m."isSlaMet" = true)::bigint AS "slaMetCount"
      FROM "CallSession" s
      LEFT JOIN "CallMetrics" m ON m."callSessionId" = s.id
      WHERE s."startAt" >= ${from}
        AND s."startAt" <= ${to}
        ${queueFilter}
    `);

    // Peak hour histogram via EXTRACT(HOUR). The legacy code used JS
    // Date.getHours() which pulls from the process local TZ — replicated here
    // by relying on Postgres' session TZ. The M6 fix to move this to
    // Asia/Tbilisi lives in a separate P0-G branch (see STATS_STANDARDS.md).
    const peakRows = await this.prisma.$queryRaw<
      Array<{ hour: number; count: bigint }>
    >(Prisma.sql`
      SELECT
        EXTRACT(HOUR FROM s."startAt")::int AS hour,
        COUNT(*)::bigint AS count
      FROM "CallSession" s
      WHERE s."startAt" >= ${from}
        AND s."startAt" <= ${to}
        ${queueFilter}
      GROUP BY 1
      ORDER BY 1
    `);

    const peakHourDistribution: Record<number, number> = {};
    for (const row of peakRows) {
      peakHourDistribution[Number(row.hour)] = safeNumber(row.count);
    }

    // Callbacks are a separate table, independent of CallSession filters.
    const [callbacksCreated, callbacksCompleted] = await Promise.all([
      this.prisma.callbackRequest.count({
        where: { createdAt: { gte: from, lte: to } },
      }),
      this.prisma.callbackRequest.count({
        where: { createdAt: { gte: from, lte: to }, status: 'DONE' },
      }),
    ]);

    const total = safeNumber(agg?.total);
    const answered = safeNumber(agg?.answered);
    const missed = safeNumber(agg?.missed);
    const abandoned = safeNumber(agg?.abandoned);
    const answeredWithMetrics = safeNumber(agg?.answeredWithMetrics);

    const avgAnswer = safeNullableNumber(agg?.avgAnswerWait);
    const medianAnswer = safeNullableNumber(agg?.medianAnswerWait);
    const p90Answer = safeNullableNumber(agg?.p90AnswerWait);
    const longestWait = safeNullableNumber(agg?.maxAnsweredWait);

    const abandonWaitCount = safeNumber(agg?.abandonWaitCount);
    const abandonWaitSum = safeNumber(agg?.abandonWaitSum);
    const avgAbandonWait =
      abandonWaitCount > 0 ? abandonWaitSum / abandonWaitCount : null;

    const talkSum = safeNumber(agg?.talkSum);
    const holdSum = safeNumber(agg?.holdSum);
    const wrapupSum = safeNumber(agg?.wrapupSum);
    const transfersSum = safeNumber(agg?.transfersSum);

    const avgTalk =
      answeredWithMetrics > 0 ? talkSum / answeredWithMetrics : null;
    const avgHold =
      answeredWithMetrics > 0 ? holdSum / answeredWithMetrics : null;
    const avgWrapup =
      answeredWithMetrics > 0 ? wrapupSum / answeredWithMetrics : null;
    const transferRate = answered > 0 ? transfersSum / answered : null;

    const slaTotal = safeNumber(agg?.slaTotal);
    const slaMetCount = safeNumber(agg?.slaMetCount);
    const slaMetPercent =
      slaTotal > 0 ? (slaMetCount / slaTotal) * 100 : null;

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
        avgAnswerTimeSec: avgAnswer !== null ? round2(avgAnswer) : null,
        medianAnswerTimeSec: medianAnswer !== null ? round2(medianAnswer) : null,
        p90AnswerTimeSec: p90Answer !== null ? round2(p90Answer) : null,
        avgAbandonWaitSec: avgAbandonWait !== null ? round2(avgAbandonWait) : null,
      },
      quality: {
        avgTalkTimeSec: avgTalk !== null ? round2(avgTalk) : null,
        avgHoldTimeSec: avgHold !== null ? round2(avgHold) : null,
        avgWrapupTimeSec: avgWrapup !== null ? round2(avgWrapup) : null,
        transferRate:
          transferRate !== null
            ? Math.round(transferRate * 10000) / 10000
            : null,
      },
      serviceLevel: {
        slaMetPercent: slaMetPercent !== null ? round2(slaMetPercent) : null,
        longestWaitSec: longestWait !== null ? round2(longestWait) : null,
        peakHourDistribution,
      },
    };
  }

  private bucketToLabel(
    groupBy: 'hour' | 'day' | 'weekday',
    bucket: number,
  ): { label: string; sortKey: number } {
    switch (groupBy) {
      case 'hour':
        return { label: String(bucket), sortKey: bucket };
      case 'day':
        return { label: String(bucket), sortKey: bucket };
      case 'weekday': {
        const mondayFirst = bucket === 0 ? 6 : bucket - 1;
        return { label: WEEKDAY_NAMES[bucket], sortKey: mondayFirst };
      }
    }
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

  private parseDate(input: string, field: string): Date {
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) {
      throw new UnprocessableEntityException(
        `Invalid date for ${field}: ${input}`,
      );
    }
    return d;
  }

  private assertRangeWithinLimit(from: Date, to: Date): void {
    const limit = this.resolveMaxDays();
    const spanMs = to.getTime() - from.getTime();
    if (spanMs < 0) {
      throw new UnprocessableEntityException(
        'Date range invalid: "to" must be on or after "from"',
      );
    }
    const spanDays = spanMs / MS_PER_DAY;
    if (spanDays > limit) {
      throw new UnprocessableEntityException(
        `Date range too wide: ${Math.ceil(spanDays)} days exceeds the maximum of ${limit} days. ` +
          `Narrow the range or set TELEPHONY_STATS_MAX_DAYS if you really need more.`,
      );
    }
  }

  private resolveMaxDays(): number {
    const raw = process.env.TELEPHONY_STATS_MAX_DAYS;
    if (!raw) return DEFAULT_MAX_DAYS;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_DAYS;
    return parsed;
  }
}
