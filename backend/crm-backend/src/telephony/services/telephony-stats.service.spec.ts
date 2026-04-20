import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { TelephonyStatsService } from './telephony-stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CallDisposition, Prisma } from '@prisma/client';

/**
 * Test harness for the P0-G merged stats service.
 *
 * Two generations of behaviour are verified here:
 *
 *  1. The P1-3 SQL-aggregation rewrite (audit/phase1-telephony-stats.md §3).
 *     All KPI math happens in Postgres; JS only post-processes rows. The mock
 *     simulates $queryRaw by inspecting SQL fragments and returning what
 *     Postgres would return for a 1000-row seed.
 *
 *  2. The P0-G stats-correctness overlay (audit/STATS_STANDARDS.md):
 *     - M3: dataQualityPercent surfaces measurement coverage. SLA% still
 *       computed over sessions with a CallMetrics row only, so the ratio stays
 *       meaningful when ingest drops rows.
 *     - M5: agent stats read CallLeg, not CallSession.assignedUserId.
 *       handledCount (primary handler = longest connected leg) and
 *       touchedCount (any engaged leg) are new explicit fields; the legacy
 *       `answered` / `answeredCalls` fields alias handledCount for UI compat.
 *
 * Numeric-equivalence tests compute expected values in-JS using the SAME
 * semantics the merged service implements, so passing here means the service
 * matches its spec, not the pre-P0-G implementation.
 */

type SessionRow = {
  id: string;
  startAt: Date;
  disposition:
    | 'ANSWERED'
    | 'MISSED'
    | 'NOANSWER'
    | 'ABANDONED'
    | 'BUSY'
    | 'FAILED'
    | null;
  assignedUserId: string | null;
  queueId: string | null;
  direction: 'IN' | 'OUT';
  metrics: {
    waitSeconds: number;
    talkSeconds: number;
    holdSeconds: number;
    wrapupSeconds: number;
    transfersCount: number;
    abandonsAfterSeconds: number | null;
    isSlaMet: boolean | null;
  } | null;
  /**
   * Synthesised CallLeg rows for the session. Only answered calls with an
   * `assignedUserId` get an AGENT leg — this mirrors `handleAgentConnect`
   * which only writes a leg when the agent actually connects.
   */
  legs: Array<{
    userId: string;
    extension: string | null;
    type: 'AGENT' | 'TRANSFER' | 'CUSTOMER';
    answerAt: Date | null;
    endAt: Date | null;
    connectedSec: number;
  }>;
};

function percentileCont(sorted: number[], pct: number): number | null {
  if (sorted.length === 0) return null;
  const idx = pct * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function round2(v: number | null): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Math.round(v * 100) / 100;
}

function makeSeed(): SessionRow[] {
  // Deterministic rng so test numbers stay stable.
  let seed = 42;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const agents = ['agent-a', 'agent-b', 'agent-c', 'agent-d', 'agent-e'];
  const extMap: Record<string, string> = {
    'agent-a': '100',
    'agent-b': '101',
    'agent-c': '102',
    'agent-d': '103',
    'agent-e': '104',
  };
  const queues = ['queue-1', 'queue-2', 'queue-3'];
  const out: SessionRow[] = [];

  // 1000 sessions across a 30-day window.
  const baseStart = new Date('2026-02-01T00:00:00.000Z').getTime();
  for (let i = 0; i < 1000; i++) {
    const dayOffset = Math.floor(rng() * 30);
    const hourOffset = Math.floor(rng() * 24);
    const minuteOffset = Math.floor(rng() * 60);
    const startAt = new Date(
      baseStart +
        dayOffset * 86400000 +
        hourOffset * 3600000 +
        minuteOffset * 60000,
    );

    // Disposition distribution: ~60% answered, 20% missed/noanswer, 10%
    // abandoned, 5% busy, 3% failed, 2% null (mimics the legacy data gaps).
    const d = rng();
    let disposition: SessionRow['disposition'];
    if (d < 0.6) disposition = 'ANSWERED';
    else if (d < 0.7) disposition = 'MISSED';
    else if (d < 0.8) disposition = 'NOANSWER';
    else if (d < 0.9) disposition = 'ABANDONED';
    else if (d < 0.95) disposition = 'BUSY';
    else if (d < 0.98) disposition = 'FAILED';
    else disposition = null;

    const assignedUserId =
      rng() < 0.85 ? agents[Math.floor(rng() * agents.length)] : null;
    const queueId = rng() < 0.9 ? queues[Math.floor(rng() * queues.length)] : null;
    const direction: 'IN' | 'OUT' = rng() < 0.8 ? 'IN' : 'OUT';

    // 5% of sessions have no metrics row (mimics ingest failures).
    const hasMetrics = rng() >= 0.05;
    const metrics = hasMetrics
      ? {
          waitSeconds: Math.round(rng() * 60 * 100) / 100,
          talkSeconds: Math.round(rng() * 300 * 100) / 100,
          holdSeconds: Math.round(rng() * 30 * 100) / 100,
          wrapupSeconds: Math.round(rng() * 20 * 100) / 100,
          transfersCount: rng() < 0.1 ? 1 : 0,
          abandonsAfterSeconds:
            disposition === 'ABANDONED'
              ? Math.round(rng() * 20 * 100) / 100
              : null,
          isSlaMet: rng() < 0.9 ? rng() < 0.8 : null,
        }
      : null;

    // M5 — synthesise CallLegs. Only ANSWERED calls with an assignedUserId
    // get an AGENT leg. Missed/abandoned calls have no answered agent leg.
    const legs: SessionRow['legs'] = [];
    if (assignedUserId && disposition === 'ANSWERED') {
      const answerAt = new Date(startAt.getTime() + 10_000);
      const talk = metrics?.talkSeconds ?? 60;
      const hold = metrics?.holdSeconds ?? 0;
      const endAt = new Date(answerAt.getTime() + (talk + hold) * 1000);
      legs.push({
        userId: assignedUserId,
        extension: extMap[assignedUserId] ?? null,
        type: 'AGENT',
        answerAt,
        endAt,
        connectedSec: (endAt.getTime() - answerAt.getTime()) / 1000,
      });
    }

    out.push({
      id: `sess-${i}`,
      startAt,
      disposition,
      assignedUserId,
      queueId,
      direction,
      metrics,
      legs,
    });
  }
  return out;
}

/**
 * Mock Prisma.$queryRaw that inspects the SQL fragment and returns a
 * precomputed answer for each known query shape.
 */
function makeQueryRawMock(seed: SessionRow[]) {
  function scope(
    from: Date,
    to: Date,
    queueId?: string,
    agentId?: string,
    direction?: string,
  ): SessionRow[] {
    return seed.filter((s) => {
      if (s.startAt.getTime() < from.getTime()) return false;
      if (s.startAt.getTime() > to.getTime()) return false;
      if (queueId && s.queueId !== queueId) return false;
      if (agentId && s.assignedUserId !== agentId) return false;
      if (direction && s.direction !== direction) return false;
      return true;
    });
  }

  return jest.fn((input: Prisma.Sql) => {
    const sql = input.sql;
    const values = input.values ?? [];
    const dateParams = values.filter((v) => v instanceof Date) as Date[];
    const stringParams = values.filter(
      (v) => typeof v === 'string',
    ) as string[];
    const from = dateParams[0];
    const to = dateParams[1];

    // getOverview main aggregate — distinguished by PERCENTILE_CONT + the
    // distinctive "answeredWithMetrics" + M3 "sessionsWithDisposition" alias.
    if (
      sql.includes('PERCENTILE_CONT(0.5)') &&
      sql.includes('answeredWithMetrics')
    ) {
      const queueId = stringParams[0];
      const scoped = scope(from, to, queueId);
      const answeredWithMetrics = scoped.filter(
        (s) => s.disposition === 'ANSWERED' && s.metrics !== null,
      );
      const waitValues = answeredWithMetrics
        .map((s) => s.metrics!.waitSeconds)
        .sort((a, b) => a - b);
      const abandonedWithWait = scoped.filter(
        (s) =>
          s.disposition === 'ABANDONED' &&
          s.metrics !== null &&
          s.metrics.abandonsAfterSeconds !== null,
      );
      const abandonWaitValues = abandonedWithWait.map(
        (s) => s.metrics!.abandonsAfterSeconds as number,
      );
      const slaScoped = scoped.filter(
        (s) => s.metrics !== null && s.metrics.isSlaMet !== null,
      );
      const sessionsWithDisposition = scoped.filter(
        (s) => s.disposition !== null,
      );
      const sessionsWithDispositionAndMetrics = sessionsWithDisposition.filter(
        (s) => s.metrics !== null,
      );
      return Promise.resolve([
        {
          total: BigInt(scoped.length),
          answered: BigInt(
            scoped.filter((s) => s.disposition === 'ANSWERED').length,
          ),
          missed: BigInt(
            scoped.filter(
              (s) =>
                s.disposition === 'MISSED' || s.disposition === 'NOANSWER',
            ).length,
          ),
          abandoned: BigInt(
            scoped.filter((s) => s.disposition === 'ABANDONED').length,
          ),
          answeredWithMetrics: BigInt(answeredWithMetrics.length),
          avgAnswerWait:
            waitValues.length > 0
              ? waitValues.reduce((a, b) => a + b, 0) / waitValues.length
              : null,
          medianAnswerWait: percentileCont(waitValues, 0.5),
          p90AnswerWait: percentileCont(waitValues, 0.9),
          maxAnsweredWait:
            waitValues.length > 0 ? waitValues[waitValues.length - 1] : null,
          abandonWaitCount: BigInt(abandonWaitValues.length),
          abandonWaitSum:
            abandonWaitValues.length > 0
              ? abandonWaitValues.reduce((a, b) => a + b, 0)
              : null,
          talkSum: answeredWithMetrics.reduce(
            (a, s) => a + s.metrics!.talkSeconds,
            0,
          ),
          holdSum: answeredWithMetrics.reduce(
            (a, s) => a + s.metrics!.holdSeconds,
            0,
          ),
          wrapupSum: answeredWithMetrics.reduce(
            (a, s) => a + s.metrics!.wrapupSeconds,
            0,
          ),
          transfersSum: answeredWithMetrics.reduce(
            (a, s) => a + s.metrics!.transfersCount,
            0,
          ),
          slaTotal: BigInt(slaScoped.length),
          slaMetCount: BigInt(
            slaScoped.filter((s) => s.metrics!.isSlaMet === true).length,
          ),
          sessionsWithDisposition: BigInt(sessionsWithDisposition.length),
          sessionsWithDispositionAndMetrics: BigInt(
            sessionsWithDispositionAndMetrics.length,
          ),
        },
      ]);
    }

    // Peak-hour histogram — ORDER BY 1 + GROUP BY 1 with EXTRACT(HOUR).
    if (
      sql.includes('EXTRACT(HOUR FROM') &&
      sql.includes('GROUP BY 1') &&
      sql.includes('ORDER BY 1')
    ) {
      const queueId = stringParams[0];
      const scoped = scope(from, to, queueId);
      const counts = new Map<number, number>();
      for (const s of scoped) {
        const h = s.startAt.getHours();
        counts.set(h, (counts.get(h) ?? 0) + 1);
      }
      return Promise.resolve(
        Array.from(counts.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([hour, count]) => ({ hour, count: BigInt(count) })),
      );
    }

    // getBreakdown (hour/day/weekday) — all three use GROUP BY bucket.
    if (sql.includes('GROUP BY bucket')) {
      let kind: 'hour' | 'day' | 'weekday';
      if (sql.includes('EXTRACT(HOUR FROM')) kind = 'hour';
      else if (sql.includes('EXTRACT(DAY FROM')) kind = 'day';
      else kind = 'weekday';
      return bucketedAggregate(scope, from, to, stringParams, kind);
    }

    // M5 — agent legs aggregate (longest_leg CTE).
    if (sql.includes('longest_leg')) {
      const queueId = stringParams[0];
      const scoped = scope(from, to, queueId);
      // One AGENT leg per answered session in the fixture. handledCount =
      // touchedCount per agent (no transfers in the seed).
      const byUser = new Map<
        string,
        {
          extension: string | null;
          handled: number;
          touched: number;
          connectedSec: number;
        }
      >();
      for (const s of scoped) {
        for (const leg of s.legs) {
          if (leg.answerAt === null) continue;
          if (leg.type !== 'AGENT' && leg.type !== 'TRANSFER') continue;
          const row = byUser.get(leg.userId) ?? {
            extension: leg.extension,
            handled: 0,
            touched: 0,
            connectedSec: 0,
          };
          // single-leg-per-session fixture: that leg is always the longest.
          row.handled += 1;
          row.touched += 1;
          row.connectedSec += leg.connectedSec;
          byUser.set(leg.userId, row);
        }
      }
      return Promise.resolve(
        Array.from(byUser.entries()).map(([userId, r]) => ({
          userId,
          extension: r.extension,
          handledCount: BigInt(r.handled),
          touchedCount: BigInt(r.touched),
          connectedSecSum: r.connectedSec,
        })),
      );
    }

    // M5 — per-agent disposition count (CallLeg-joined).
    if (
      sql.includes('cl."userId"') &&
      sql.includes('cs."disposition"') &&
      sql.includes('cl."answerAt" IS NOT NULL')
    ) {
      const queueId = stringParams[0];
      const scoped = scope(from, to, queueId);
      // Per-agent disposition map derived from sessions the agent has an
      // answered leg on. Because only ANSWERED sessions have answered legs in
      // the seed, every row will be disposition=ANSWERED.
      const map = new Map<
        string,
        Map<CallDisposition | null, number>
      >();
      for (const s of scoped) {
        const usersTouched = new Set<string>();
        for (const leg of s.legs) {
          if (leg.answerAt === null) continue;
          if (leg.type !== 'AGENT' && leg.type !== 'TRANSFER') continue;
          usersTouched.add(leg.userId);
        }
        for (const uid of usersTouched) {
          const inner =
            map.get(uid) ?? new Map<CallDisposition | null, number>();
          const dispKey = s.disposition as CallDisposition | null;
          inner.set(dispKey, (inner.get(dispKey) ?? 0) + 1);
          map.set(uid, inner);
        }
      }
      const rows: Array<{
        userId: string;
        disposition: CallDisposition | null;
        c: bigint;
      }> = [];
      for (const [userId, inner] of map) {
        for (const [disposition, c] of inner) {
          rows.push({ userId, disposition, c: BigInt(c) });
        }
      }
      return Promise.resolve(rows);
    }

    // getQueueStats — GROUP BY queueId + DISTINCT assignedUserId.
    if (
      sql.includes('GROUP BY s."queueId"') &&
      sql.includes('COUNT(DISTINCT s."assignedUserId")')
    ) {
      const scoped = seed.filter(
        (s) =>
          s.startAt.getTime() >= from.getTime() &&
          s.startAt.getTime() <= to.getTime() &&
          s.queueId !== null,
      );
      const map = new Map<
        string,
        {
          total: number;
          answered: number;
          missed: number;
          abandoned: number;
          agents: Set<string>;
          waitSum: number;
          talkSum: number;
          slaMetCount: number;
          slaTotal: number;
        }
      >();
      for (const s of scoped) {
        const qid = s.queueId!;
        const agg =
          map.get(qid) ??
          {
            total: 0,
            answered: 0,
            missed: 0,
            abandoned: 0,
            agents: new Set<string>(),
            waitSum: 0,
            talkSum: 0,
            slaMetCount: 0,
            slaTotal: 0,
          };
        agg.total++;
        if (s.disposition === 'ANSWERED') agg.answered++;
        else if (s.disposition === 'ABANDONED') agg.abandoned++;
        else agg.missed++;
        if (s.assignedUserId) agg.agents.add(s.assignedUserId);
        if (s.metrics) {
          agg.waitSum += s.metrics.waitSeconds;
          agg.talkSum += s.metrics.talkSeconds;
          if (s.metrics.isSlaMet !== null) {
            agg.slaTotal++;
            if (s.metrics.isSlaMet) agg.slaMetCount++;
          }
        }
        map.set(qid, agg);
      }
      return Promise.resolve(
        Array.from(map.entries()).map(([queueId, a]) => ({
          queueId,
          total: BigInt(a.total),
          answered: BigInt(a.answered),
          missed: BigInt(a.missed),
          abandoned: BigInt(a.abandoned),
          agentCount: BigInt(a.agents.size),
          waitSum: a.waitSum,
          talkSum: a.talkSum,
          slaMetCount: BigInt(a.slaMetCount),
          slaTotal: BigInt(a.slaTotal),
        })),
      );
    }

    // getOverviewExtended — CASE WHEN disposition=ANSWERED.
    if (sql.includes("CASE WHEN s.disposition = 'ANSWERED'")) {
      const queueId = stringParams[0];
      const scoped = scope(from, to, queueId);
      const answered = scoped.filter((s) => s.disposition === 'ANSWERED');
      const lost = scoped.filter((s) => s.disposition !== 'ANSWERED');
      const buckets = (arr: SessionRow[]) => {
        let u15 = 0, u30 = 0, u60 = 0, o60 = 0;
        for (const s of arr) {
          const w = s.metrics?.waitSeconds ?? 0;
          if (w < 15) u15++;
          else if (w < 30) u30++;
          else if (w < 60) u60++;
          else o60++;
        }
        return {
          u15: BigInt(u15),
          u30: BigInt(u30),
          u60: BigInt(u60),
          o60: BigInt(o60),
        };
      };
      return Promise.resolve([
        { kind: 'answered', ...buckets(answered) },
        { kind: 'lost', ...buckets(lost) },
      ]);
    }

    throw new Error(`Unmocked query raw: ${sql.slice(0, 200)}`);
  });
}

function bucketedAggregate(
  scope: (
    from: Date,
    to: Date,
    queueId?: string,
    agentId?: string,
    direction?: string,
  ) => SessionRow[],
  from: Date,
  to: Date,
  stringParams: string[],
  kind: 'hour' | 'day' | 'weekday',
) {
  const directionVal = stringParams.find((v) => v === 'IN' || v === 'OUT');
  const idVals = stringParams.filter((v) => v !== directionVal);
  const queueId = idVals[0];
  const agentId = idVals[1];
  const scoped = scope(from, to, queueId, agentId, directionVal);
  const getBucket = (s: SessionRow) => {
    switch (kind) {
      case 'hour':
        return s.startAt.getHours();
      case 'day':
        return s.startAt.getDate();
      case 'weekday':
        return s.startAt.getDay();
    }
  };
  const map = new Map<
    number,
    {
      total: number;
      answered: number;
      lost: number;
      lostBefore5: number;
      durationSum: number;
      answeredDurationSum: number;
      answeredWaitSum: number;
      lostWaitSum: number;
      slaMetCount: number;
      slaTotal: number;
    }
  >();
  for (const s of scoped) {
    const b = getBucket(s);
    const agg =
      map.get(b) ??
      {
        total: 0,
        answered: 0,
        lost: 0,
        lostBefore5: 0,
        durationSum: 0,
        answeredDurationSum: 0,
        answeredWaitSum: 0,
        lostWaitSum: 0,
        slaMetCount: 0,
        slaTotal: 0,
      };
    const talk = s.metrics?.talkSeconds ?? 0;
    const hold = s.metrics?.holdSeconds ?? 0;
    const wait = s.metrics?.waitSeconds ?? 0;
    agg.total++;
    agg.durationSum += talk + hold;
    if (s.disposition === 'ANSWERED') {
      agg.answered++;
      agg.answeredDurationSum += talk + hold;
      agg.answeredWaitSum += wait;
    } else {
      agg.lost++;
      agg.lostWaitSum += wait;
      if (wait < 5) agg.lostBefore5++;
    }
    if (s.metrics?.isSlaMet !== null && s.metrics?.isSlaMet !== undefined) {
      agg.slaTotal++;
      if (s.metrics.isSlaMet) agg.slaMetCount++;
    }
    map.set(b, agg);
  }
  return Promise.resolve(
    Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([bucket, a]) => ({
        bucket,
        total: BigInt(a.total),
        answered: BigInt(a.answered),
        lost: BigInt(a.lost),
        lostBefore5: BigInt(a.lostBefore5),
        durationSum: a.durationSum,
        answeredDurationSum: a.answeredDurationSum,
        answeredWaitSum: a.answeredWaitSum,
        lostWaitSum: a.lostWaitSum,
        slaMetCount: BigInt(a.slaMetCount),
        slaTotal: BigInt(a.slaTotal),
      })),
  );
}

/** In-JS overview computation matching the P0-G service semantics. */
function overviewExpected(seed: SessionRow[]) {
  const total = seed.length;
  const answered = seed.filter((s) => s.disposition === 'ANSWERED').length;
  const missed = seed.filter(
    (s) => s.disposition === 'MISSED' || s.disposition === 'NOANSWER',
  ).length;
  const abandoned = seed.filter((s) => s.disposition === 'ABANDONED').length;

  const metricsWait = seed
    .filter((s) => s.metrics && s.disposition === 'ANSWERED')
    .map((s) => s.metrics!.waitSeconds)
    .sort((a, b) => a - b);

  const abandonWaits = seed
    .filter(
      (s) =>
        s.metrics &&
        s.disposition === 'ABANDONED' &&
        s.metrics.abandonsAfterSeconds !== null,
    )
    .map((s) => s.metrics!.abandonsAfterSeconds as number);

  const answeredMetrics = seed
    .filter((s) => s.metrics && s.disposition === 'ANSWERED')
    .map((s) => s.metrics!);

  const sla = seed.filter(
    (s) => s.metrics && s.metrics.isSlaMet !== null,
  );
  const slaMet = sla.filter((s) => s.metrics!.isSlaMet === true).length;

  const withDisposition = seed.filter((s) => s.disposition !== null);
  const withDispositionAndMetrics = withDisposition.filter((s) => s.metrics);
  const dataQuality =
    withDisposition.length > 0
      ? (withDispositionAndMetrics.length / withDisposition.length) * 100
      : null;

  return {
    total,
    answered,
    missed,
    abandoned,
    avgAnswer:
      metricsWait.length > 0
        ? metricsWait.reduce((a, b) => a + b, 0) / metricsWait.length
        : null,
    medianAnswer: percentileCont(metricsWait, 0.5),
    p90Answer: percentileCont(metricsWait, 0.9),
    longestWait:
      metricsWait.length > 0 ? metricsWait[metricsWait.length - 1] : null,
    avgAbandonWait:
      abandonWaits.length > 0
        ? abandonWaits.reduce((a, b) => a + b, 0) / abandonWaits.length
        : null,
    avgTalk:
      answeredMetrics.length > 0
        ? answeredMetrics.reduce((a, m) => a + m.talkSeconds, 0) /
          answeredMetrics.length
        : null,
    avgHold:
      answeredMetrics.length > 0
        ? answeredMetrics.reduce((a, m) => a + m.holdSeconds, 0) /
          answeredMetrics.length
        : null,
    avgWrapup:
      answeredMetrics.length > 0
        ? answeredMetrics.reduce((a, m) => a + m.wrapupSeconds, 0) /
          answeredMetrics.length
        : null,
    transferRate:
      answered > 0
        ? answeredMetrics.reduce((a, m) => a + m.transfersCount, 0) /
          answered
        : null,
    slaMetPercent: sla.length > 0 ? (slaMet / sla.length) * 100 : null,
    dataQualityPercent: dataQuality,
  };
}

describe('TelephonyStatsService', () => {
  let service: TelephonyStatsService;
  let prisma: {
    $queryRaw: jest.Mock;
    callSession: { findMany: jest.Mock };
    callbackRequest: { count: jest.Mock };
    telephonyExtension: { findMany: jest.Mock };
    telephonyQueue: { findMany: jest.Mock };
  };

  async function makeService(seed: SessionRow[]) {
    prisma = {
      $queryRaw: makeQueryRawMock(seed),
      callSession: { findMany: jest.fn() },
      callbackRequest: {
        count: jest.fn().mockResolvedValue(0),
      },
      telephonyExtension: {
        findMany: jest.fn().mockResolvedValue([
          { crmUserId: 'agent-a', displayName: 'Agent A', extension: '100' },
          { crmUserId: 'agent-b', displayName: 'Agent B', extension: '101' },
          { crmUserId: 'agent-c', displayName: 'Agent C', extension: '102' },
          { crmUserId: 'agent-d', displayName: 'Agent D', extension: '103' },
          { crmUserId: 'agent-e', displayName: 'Agent E', extension: '104' },
        ]),
      },
      telephonyQueue: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'queue-1', name: 'Queue 1' },
          { id: 'queue-2', name: 'Queue 2' },
          { id: 'queue-3', name: 'Queue 3' },
        ]),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(TelephonyStatsService);
  }

  describe('safety guards', () => {
    beforeEach(async () => {
      await makeService([]);
    });

    it('throws 422 when date range exceeds 90 days', async () => {
      const from = new Date('2026-01-01T00:00:00Z').toISOString();
      const to = new Date('2026-04-15T00:00:00Z').toISOString(); // ~104 days
      await expect(
        service.getOverview({ from, to } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 when "to" is before "from"', async () => {
      const from = new Date('2026-02-15T00:00:00Z').toISOString();
      const to = new Date('2026-02-01T00:00:00Z').toISOString();
      await expect(
        service.getOverview({ from, to } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws 422 on invalid date input', async () => {
      await expect(
        service.getOverview({
          from: 'not-a-date',
          to: '2026-02-01T00:00:00Z',
        } as any),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('respects TELEPHONY_STATS_MAX_DAYS override', async () => {
      const original = process.env.TELEPHONY_STATS_MAX_DAYS;
      process.env.TELEPHONY_STATS_MAX_DAYS = '7';
      try {
        const from = new Date('2026-02-01T00:00:00Z').toISOString();
        const to = new Date('2026-02-15T00:00:00Z').toISOString(); // 14 days
        await expect(
          service.getOverview({ from, to } as any),
        ).rejects.toThrow(UnprocessableEntityException);
      } finally {
        if (original === undefined)
          delete process.env.TELEPHONY_STATS_MAX_DAYS;
        else process.env.TELEPHONY_STATS_MAX_DAYS = original;
      }
    });
  });

  describe('empty datasets', () => {
    beforeEach(async () => {
      await makeService([]);
    });

    const from = new Date('2026-02-01T00:00:00Z').toISOString();
    const to = new Date('2026-02-28T00:00:00Z').toISOString();

    it('getAgentStats returns [] when no sessions', async () => {
      const res = await service.getAgentStats({ from, to } as any);
      expect(res).toEqual([]);
    });

    it('getQueueStats returns [] when no sessions', async () => {
      const res = await service.getQueueStats({ from, to } as any);
      expect(res).toEqual([]);
    });

    it('getAgentBreakdown returns [] when no sessions', async () => {
      const res = await service.getAgentBreakdown({ from, to } as any);
      expect(res).toEqual([]);
    });

    it('getBreakdown returns rows:[] when no sessions', async () => {
      const res = await service.getBreakdown({
        from,
        to,
        groupBy: 'hour',
      } as any);
      expect(res.rows).toEqual([]);
    });

    it('getOverview returns zeros when no sessions', async () => {
      const res = await service.getOverview({ from, to } as any);
      expect(res.current.volume.totalCalls).toBe(0);
      expect(res.current.volume.answered).toBe(0);
      expect(res.current.volume.missed).toBe(0);
      expect(res.current.serviceLevel.slaMetPercent).toBeNull();
      expect(res.current.speed.avgAnswerTimeSec).toBeNull();
      // M3 — null when there is no disposition data to measure against.
      expect(res.current.dataQualityPercent).toBeNull();
    });

    it('getOverviewExtended returns all-zero histograms when no sessions', async () => {
      const res = await service.getOverviewExtended({ from, to } as any);
      expect(res.holdDistribution.answered.under15.count).toBe(0);
      expect(res.holdDistribution.lost.under60.count).toBe(0);
    });
  });

  describe('numerical equivalence on seeded dataset', () => {
    let seed: SessionRow[];
    const from = new Date('2026-02-01T00:00:00Z').toISOString();
    const to = new Date('2026-03-02T23:59:59Z').toISOString();

    beforeEach(async () => {
      seed = makeSeed();
      await makeService(seed);
    });

    it('getOverview returns numbers matching the in-JS computation', async () => {
      const { current } = await service.getOverview({ from, to } as any);
      const expected = overviewExpected(seed);

      expect(current.volume.totalCalls).toBe(expected.total);
      expect(current.volume.answered).toBe(expected.answered);
      expect(current.volume.missed).toBe(expected.missed);
      expect(current.volume.abandoned).toBe(expected.abandoned);
      expect(current.speed.avgAnswerTimeSec).toBeCloseTo(
        round2(expected.avgAnswer)!,
        2,
      );
      expect(current.speed.medianAnswerTimeSec).toBeCloseTo(
        round2(expected.medianAnswer)!,
        2,
      );
      expect(current.speed.p90AnswerTimeSec).toBeCloseTo(
        round2(expected.p90Answer)!,
        2,
      );
      expect(current.serviceLevel.longestWaitSec).toBeCloseTo(
        round2(expected.longestWait)!,
        2,
      );
      expect(current.quality.avgTalkTimeSec).toBeCloseTo(
        round2(expected.avgTalk)!,
        2,
      );
      expect(current.quality.avgHoldTimeSec).toBeCloseTo(
        round2(expected.avgHold)!,
        2,
      );
      expect(current.quality.avgWrapupTimeSec).toBeCloseTo(
        round2(expected.avgWrapup)!,
        2,
      );
      expect(current.serviceLevel.slaMetPercent).toBeCloseTo(
        round2(expected.slaMetPercent)!,
        2,
      );
      // M3 — every session in the seed has a 95% chance of a CallMetrics row.
      expect(current.dataQualityPercent).not.toBeNull();
      expect(current.dataQualityPercent!).toBeCloseTo(
        round2(expected.dataQualityPercent)!,
        2,
      );
    });

    it('getAgentStats reflects CallLeg-driven handled/touched per M5', async () => {
      const res = await service.getAgentStats({ from, to } as any);

      // Expected rollup: for each agent, count the ANSWERED sessions they
      // owned (fixture only creates an AGENT leg on answered sessions). Since
      // the seed has no transfers, handled == touched for every agent.
      const expected = new Map<string, { handled: number }>();
      for (const s of seed) {
        if (!s.assignedUserId || s.disposition !== 'ANSWERED') continue;
        const row = expected.get(s.assignedUserId) ?? { handled: 0 };
        row.handled++;
        expected.set(s.assignedUserId, row);
      }

      for (const row of res) {
        const exp = expected.get(row.userId)!;
        expect(row.handledCount).toBe(exp.handled);
        expect(row.touchedCount).toBe(exp.handled);
        // Legacy UI-compat aliases.
        expect(row.answered).toBe(exp.handled);
        expect(row.totalCalls).toBe(exp.handled);
      }
      expect(res.length).toBe(expected.size);
    });

    it('getQueueStats totals match per-queue in-JS rollup', async () => {
      const res = await service.getQueueStats({ from, to } as any);

      const expected = new Map<
        string,
        {
          total: number;
          answered: number;
          missed: number;
          abandoned: number;
          agents: Set<string>;
        }
      >();
      for (const s of seed) {
        if (!s.queueId) continue;
        const row =
          expected.get(s.queueId) ??
          {
            total: 0,
            answered: 0,
            missed: 0,
            abandoned: 0,
            agents: new Set<string>(),
          };
        row.total++;
        if (s.disposition === 'ANSWERED') row.answered++;
        else if (s.disposition === 'ABANDONED') row.abandoned++;
        else row.missed++;
        if (s.assignedUserId) row.agents.add(s.assignedUserId);
        expected.set(s.queueId, row);
      }

      for (const row of res) {
        const exp = expected.get(row.queueId)!;
        expect(row.totalCalls).toBe(exp.total);
        expect(row.answered).toBe(exp.answered);
        expect(row.abandoned).toBe(exp.abandoned);
        expect(row.agentCount).toBe(exp.agents.size);
      }
      expect(res.length).toBe(expected.size);
    });

    it('getBreakdown by hour totals match in-JS hour bucketing', async () => {
      const res = await service.getBreakdown({
        from,
        to,
        groupBy: 'hour',
      } as any);

      const expected = new Map<number, { total: number; answered: number }>();
      for (const s of seed) {
        const h = s.startAt.getHours();
        const row = expected.get(h) ?? { total: 0, answered: 0 };
        row.total++;
        if (s.disposition === 'ANSWERED') row.answered++;
        expected.set(h, row);
      }

      for (const row of res.rows) {
        const exp = expected.get(Number(row.label))!;
        expect(row.totalCalls).toBe(exp.total);
        expect(row.answeredCalls).toBe(exp.answered);
      }
    });

    it('getBreakdown by weekday totals match in-JS weekday bucketing', async () => {
      const res = await service.getBreakdown({
        from,
        to,
        groupBy: 'weekday',
      } as any);

      const expected = new Map<number, number>();
      for (const s of seed) {
        const dow = s.startAt.getDay();
        expected.set(dow, (expected.get(dow) ?? 0) + 1);
      }

      const weekdayNameToDow: Record<string, number> = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6,
      };

      for (const row of res.rows) {
        const dow = weekdayNameToDow[row.label];
        expect(row.totalCalls).toBe(expected.get(dow) ?? 0);
      }
    });

    it('getOverviewExtended hold distribution matches in-JS histogram', async () => {
      const res = await service.getOverviewExtended({ from, to } as any);

      const bucket = (arr: SessionRow[]) => {
        let u15 = 0, u30 = 0, u60 = 0, o60 = 0;
        for (const s of arr) {
          const w = s.metrics?.waitSeconds ?? 0;
          if (w < 15) u15++;
          else if (w < 30) u30++;
          else if (w < 60) u60++;
          else o60++;
        }
        return { u15, u30, u60, o60 };
      };

      const answeredExpected = bucket(
        seed.filter((s) => s.disposition === 'ANSWERED'),
      );
      const lostExpected = bucket(
        seed.filter((s) => s.disposition !== 'ANSWERED'),
      );

      expect(res.holdDistribution.answered.under15.count).toBe(
        answeredExpected.u15,
      );
      expect(res.holdDistribution.answered.under30.count).toBe(
        answeredExpected.u30,
      );
      expect(res.holdDistribution.answered.under60.count).toBe(
        answeredExpected.u60,
      );
      expect(res.holdDistribution.answered.over60.count).toBe(
        answeredExpected.o60,
      );

      expect(res.holdDistribution.lost.under15.count).toBe(lostExpected.u15);
      expect(res.holdDistribution.lost.under30.count).toBe(lostExpected.u30);
      expect(res.holdDistribution.lost.under60.count).toBe(lostExpected.u60);
      expect(res.holdDistribution.lost.over60.count).toBe(lostExpected.o60);
    });

    it('getAgentBreakdown aliases answeredCalls to handledCount per M5', async () => {
      const res = await service.getAgentBreakdown({ from, to } as any);

      const expected = new Map<string, { handled: number }>();
      for (const s of seed) {
        if (!s.assignedUserId || s.disposition !== 'ANSWERED') continue;
        const row = expected.get(s.assignedUserId) ?? { handled: 0 };
        row.handled++;
        expected.set(s.assignedUserId, row);
      }

      for (const row of res) {
        const exp = expected.get(row.userId)!;
        expect(row.handledCount).toBe(exp.handled);
        expect(row.touchedCount).toBe(exp.handled);
        expect(row.answeredCalls).toBe(exp.handled);
        expect(row.totalCalls).toBe(exp.handled);
      }
      expect(res.length).toBe(expected.size);
    });
  });

  // ── P0-G overlay tests: M3 + M5 semantics ────────────────────────────────

  describe('M3 — data quality surface', () => {
    const from = '2026-04-01T00:00:00Z';
    const to = '2026-04-30T23:59:59Z';

    it('dataQualityPercent drops below 100% when some sessions lack CallMetrics; slaMetPercent stays honest on measured sessions', async () => {
      // 10 ANSWERED sessions with disposition. 9 measured (8 SLA met, 1 not),
      // 1 answered-but-missing-metrics. Expected:
      //   slaMetPercent = 8 / 9 = 88.89
      //   dataQualityPercent = 9 / 10 = 90
      const now = new Date('2026-04-19T12:00:00Z');
      const mkSession = (
        disposition: SessionRow['disposition'],
        isSlaMet: boolean | null,
        hasMetrics: boolean,
      ): SessionRow => ({
        id: `s-${Math.random()}`,
        startAt: now,
        disposition,
        assignedUserId: null,
        queueId: null,
        direction: 'IN',
        metrics: hasMetrics
          ? {
              waitSeconds: 12,
              talkSeconds: 180,
              holdSeconds: 0,
              wrapupSeconds: 0,
              transfersCount: 0,
              abandonsAfterSeconds: null,
              isSlaMet,
            }
          : null,
        legs: [],
      });

      const sessions: SessionRow[] = [
        ...Array(8).fill(null).map(() => mkSession('ANSWERED', true, true)),
        mkSession('ANSWERED', false, true),
        mkSession('ANSWERED', null, false),
      ];

      await makeService(sessions);

      const res = await service.getOverview({ from, to } as any);
      expect(res.current.volume.totalCalls).toBe(10);
      expect(res.current.volume.answered).toBe(10);
      expect(res.current.serviceLevel.slaMetPercent).toBeCloseTo(88.89, 1);
      expect(res.current.dataQualityPercent).toBe(90);
    });

    it('SLA% reflects measured-only math on a 100-row M3 fixture', async () => {
      // Proof-of-shape fixture. Ratios:
      //   85 answered + metrics (80 meet SLA, 5 don't) + 10 transferred-answered
      //     + metrics all meeting SLA + 5 missing-metrics answered.
      //   slaMetPercent = 90 / 95 ≈ 94.74
      //   dataQualityPercent = 95 / 100 = 95
      const now = new Date('2026-04-19T12:00:00Z');
      const mk = (slaMet: boolean | null, withMetrics: boolean): SessionRow => ({
        id: `s-${Math.random()}`,
        startAt: now,
        disposition: 'ANSWERED',
        assignedUserId: null,
        queueId: null,
        direction: 'IN',
        metrics: withMetrics
          ? {
              waitSeconds: slaMet ? 10 : 35,
              talkSeconds: 180,
              holdSeconds: 0,
              wrapupSeconds: 0,
              transfersCount: 0,
              abandonsAfterSeconds: null,
              isSlaMet: slaMet,
            }
          : null,
        legs: [],
      });
      const sessions: SessionRow[] = [
        ...Array(80).fill(null).map(() => mk(true, true)),
        ...Array(5).fill(null).map(() => mk(false, true)),
        ...Array(10).fill(null).map(() => mk(true, true)),
        ...Array(5).fill(null).map(() => mk(null, false)),
      ];
      await makeService(sessions);

      const res = await service.getOverview({ from, to } as any);
      expect(res.current.volume.totalCalls).toBe(100);
      expect(res.current.dataQualityPercent).toBe(95);
      expect(res.current.serviceLevel.slaMetPercent).toBeCloseTo(94.74, 1);
    });
  });

  describe('M5 — CallLeg attribution', () => {
    const from = '2026-04-01T00:00:00Z';
    const to = '2026-04-30T23:59:59Z';

    beforeEach(async () => {
      await makeService([]);
    });

    it('transferred call: handled credits only the longer-connected agent; touched credits both', async () => {
      prisma.$queryRaw.mockImplementation((sqlObj: Prisma.Sql) => {
        const sql = sqlObj.sql;
        if (sql.includes('longest_leg')) {
          return Promise.resolve([
            {
              userId: 'user-a',
              extension: '201',
              handledCount: BigInt(0),
              touchedCount: BigInt(1),
              connectedSecSum: 0,
            },
            {
              userId: 'user-b',
              extension: '202',
              handledCount: BigInt(1),
              touchedCount: BigInt(1),
              connectedSecSum: 600,
            },
          ]);
        }
        if (
          sql.includes('cl."userId"') &&
          sql.includes('cs."disposition"') &&
          sql.includes('cl."answerAt" IS NOT NULL')
        ) {
          return Promise.resolve([
            { userId: 'user-a', disposition: CallDisposition.ANSWERED, c: BigInt(1) },
            { userId: 'user-b', disposition: CallDisposition.ANSWERED, c: BigInt(1) },
          ]);
        }
        return Promise.resolve([]);
      });
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { crmUserId: 'user-a', displayName: 'Alice' },
        { crmUserId: 'user-b', displayName: 'Bob' },
      ]);

      const res = await service.getAgentStats({ from, to } as any);
      const alice = res.find((r) => r.userId === 'user-a')!;
      const bob = res.find((r) => r.userId === 'user-b')!;

      expect(alice.handledCount).toBe(0);
      expect(alice.touchedCount).toBe(1);
      expect(bob.handledCount).toBe(1);
      expect(bob.touchedCount).toBe(1);
      // UI compat aliases.
      expect(alice.answered).toBe(0);
      expect(bob.answered).toBe(1);
      expect(alice.totalCalls).toBe(1);
      expect(bob.totalCalls).toBe(1);
    });
  });
});
