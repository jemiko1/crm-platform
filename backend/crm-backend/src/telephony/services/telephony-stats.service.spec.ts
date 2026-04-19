import { Test, TestingModule } from '@nestjs/testing';
import { UnprocessableEntityException } from '@nestjs/common';
import { TelephonyStatsService } from './telephony-stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Test harness.
 *
 * These tests simulate the rewritten $queryRaw path by mocking PrismaService
 * and returning what Postgres would return for a well-defined seed set. The
 * numeric-equivalence tests compute the expected KPI values from the same
 * seed using the legacy in-JS formulas, then assert the service produces
 * identical numbers from the mock. This way we verify the service logic
 * (post-SQL post-processing and shape) without needing a live Postgres.
 *
 * Cases covered per audit/phase1-telephony-stats.md §3:
 *  - Numeric equivalence on 1000-row seed across a month, for all 5 methods
 *  - 91-day range throws 422
 *  - Per-agent stats with no calls returns empty (not undefined)
 *  - Invalid date input throws 422
 */

type Session = {
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

function makeSeed(): Session[] {
  // Deterministic rng so test numbers stay stable.
  let seed = 42;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const agents = ['agent-a', 'agent-b', 'agent-c', 'agent-d', 'agent-e'];
  const queues = ['queue-1', 'queue-2', 'queue-3'];
  const out: Session[] = [];

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
    let disposition: Session['disposition'];
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

    out.push({
      id: `sess-${i}`,
      startAt,
      disposition,
      assignedUserId,
      queueId,
      direction,
      metrics,
    });
  }
  return out;
}

/**
 * Mock Prisma.$queryRaw that inspects the SQL fragment and returns a
 * precomputed answer for each known query shape. Fragments are matched by
 * distinctive substrings of their SQL (so the service is free to reformat
 * whitespace without breaking tests).
 */
function makeQueryRawMock(seed: Session[]) {
  function scope(
    from: Date,
    to: Date,
    queueId?: string,
    agentId?: string,
    direction?: string,
  ): Session[] {
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
    // distinctive "answeredWithMetrics" column alias.
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

    // getAgentStats aggregate — GROUP BY assignedUserId + wrapupSum.
    if (
      sql.includes('GROUP BY s."assignedUserId"') &&
      sql.includes('"talkSum"') &&
      sql.includes('"wrapupSum"')
    ) {
      const queueId = stringParams[0];
      const scoped = scope(from, to, queueId).filter(
        (s) => s.assignedUserId !== null,
      );
      const map = new Map<
        string,
        {
          total: number;
          answered: number;
          missed: number;
          talkSum: number;
          holdSum: number;
          wrapupSum: number;
        }
      >();
      for (const s of scoped) {
        const uid = s.assignedUserId!;
        const agg =
          map.get(uid) ??
          {
            total: 0,
            answered: 0,
            missed: 0,
            talkSum: 0,
            holdSum: 0,
            wrapupSum: 0,
          };
        agg.total++;
        if (s.disposition === 'ANSWERED') agg.answered++;
        else agg.missed++;
        if (s.metrics) {
          agg.talkSum += s.metrics.talkSeconds;
          agg.holdSum += s.metrics.holdSeconds;
          agg.wrapupSum += s.metrics.wrapupSeconds;
        }
        map.set(uid, agg);
      }
      return Promise.resolve(
        Array.from(map.entries()).map(([userId, a]) => ({
          userId,
          total: BigInt(a.total),
          answered: BigInt(a.answered),
          missed: BigInt(a.missed),
          talkSum: a.talkSum,
          holdSum: a.holdSum,
          wrapupSum: a.wrapupSum,
        })),
      );
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
      const buckets = (arr: Session[]) => {
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

    // getAgentBreakdown — GROUP BY "userId" with "nonAnsweredWaitSum".
    if (
      sql.includes('GROUP BY "userId"') &&
      sql.includes('"noAnswer"') &&
      sql.includes('"nonAnsweredWaitSum"')
    ) {
      const queueId = stringParams[0];
      const scoped = scope(from, to, queueId).filter(
        (s) => s.assignedUserId !== null && s.disposition !== null,
      );
      const map = new Map<
        string,
        {
          total: number;
          answered: number;
          noAnswer: number;
          busy: number;
          durationSum: number;
          answeredDurationSum: number;
          answeredWaitSum: number;
          nonAnsweredWaitSum: number;
        }
      >();
      for (const s of scoped) {
        const uid = s.assignedUserId!;
        const agg =
          map.get(uid) ??
          {
            total: 0,
            answered: 0,
            noAnswer: 0,
            busy: 0,
            durationSum: 0,
            answeredDurationSum: 0,
            answeredWaitSum: 0,
            nonAnsweredWaitSum: 0,
          };
        agg.total++;
        const talk = s.metrics?.talkSeconds ?? 0;
        const hold = s.metrics?.holdSeconds ?? 0;
        const wait = s.metrics?.waitSeconds ?? 0;
        const duration = talk + hold;
        agg.durationSum += duration;
        if (s.disposition === 'ANSWERED') {
          agg.answered++;
          agg.answeredDurationSum += duration;
          agg.answeredWaitSum += wait;
        } else if (s.disposition === 'BUSY' || s.disposition === 'FAILED') {
          agg.busy++;
          agg.nonAnsweredWaitSum += wait;
        } else {
          agg.noAnswer++;
          agg.nonAnsweredWaitSum += wait;
        }
        map.set(uid, agg);
      }
      return Promise.resolve(
        Array.from(map.entries()).map(([userId, a]) => ({
          userId,
          answered: BigInt(a.answered),
          noAnswer: BigInt(a.noAnswer),
          busy: BigInt(a.busy),
          total: BigInt(a.total),
          durationSum: a.durationSum,
          answeredDurationSum: a.answeredDurationSum,
          answeredWaitSum: a.answeredWaitSum,
          nonAnsweredWaitSum: a.nonAnsweredWaitSum,
        })),
      );
    }

    // getAgentBreakdown null-disposition counts.
    if (sql.includes('s.disposition IS NULL') && sql.includes('"nullCount"')) {
      const queueId = stringParams[0];
      const scoped = scope(from, to, queueId).filter(
        (s) => s.assignedUserId !== null && s.disposition === null,
      );
      const map = new Map<string, number>();
      for (const s of scoped) {
        map.set(s.assignedUserId!, (map.get(s.assignedUserId!) ?? 0) + 1);
      }
      return Promise.resolve(
        Array.from(map.entries()).map(([userId, c]) => ({
          userId,
          nullCount: BigInt(c),
        })),
      );
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
  ) => Session[],
  from: Date,
  to: Date,
  stringParams: string[],
  kind: 'hour' | 'day' | 'weekday',
) {
  // getBreakdown passes params in declaration order: queueId?, agentId?,
  // direction?. Direction is always 'IN' or 'OUT'; pull it out first.
  const directionVal = stringParams.find((v) => v === 'IN' || v === 'OUT');
  const idVals = stringParams.filter((v) => v !== directionVal);
  const queueId = idVals[0];
  const agentId = idVals[1];
  const scoped = scope(from, to, queueId, agentId, directionVal);
  const getBucket = (s: Session) => {
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

/** Legacy in-JS overview computation. Used as the ground truth. */
function legacyOverview(seed: Session[]) {
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

  async function makeService(seed: Session[]) {
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
    });

    it('getOverviewExtended returns all-zero histograms when no sessions', async () => {
      const res = await service.getOverviewExtended({ from, to } as any);
      expect(res.holdDistribution.answered.under15.count).toBe(0);
      expect(res.holdDistribution.lost.under60.count).toBe(0);
    });
  });

  describe('numerical equivalence on seeded dataset', () => {
    let seed: Session[];
    const from = new Date('2026-02-01T00:00:00Z').toISOString();
    const to = new Date('2026-03-02T23:59:59Z').toISOString();

    beforeEach(async () => {
      seed = makeSeed();
      await makeService(seed);
    });

    it('getOverview returns numbers matching the legacy in-JS computation', async () => {
      const { current } = await service.getOverview({ from, to } as any);
      const legacy = legacyOverview(seed);

      expect(current.volume.totalCalls).toBe(legacy.total);
      expect(current.volume.answered).toBe(legacy.answered);
      expect(current.volume.missed).toBe(legacy.missed);
      expect(current.volume.abandoned).toBe(legacy.abandoned);
      expect(current.speed.avgAnswerTimeSec).toBeCloseTo(
        round2(legacy.avgAnswer)!,
        2,
      );
      expect(current.speed.medianAnswerTimeSec).toBeCloseTo(
        round2(legacy.medianAnswer)!,
        2,
      );
      expect(current.speed.p90AnswerTimeSec).toBeCloseTo(
        round2(legacy.p90Answer)!,
        2,
      );
      expect(current.serviceLevel.longestWaitSec).toBeCloseTo(
        round2(legacy.longestWait)!,
        2,
      );
      expect(current.quality.avgTalkTimeSec).toBeCloseTo(
        round2(legacy.avgTalk)!,
        2,
      );
      expect(current.quality.avgHoldTimeSec).toBeCloseTo(
        round2(legacy.avgHold)!,
        2,
      );
      expect(current.quality.avgWrapupTimeSec).toBeCloseTo(
        round2(legacy.avgWrapup)!,
        2,
      );
      expect(current.serviceLevel.slaMetPercent).toBeCloseTo(
        round2(legacy.slaMetPercent)!,
        2,
      );
    });

    it('getAgentStats totals match per-agent in-JS rollup', async () => {
      const res = await service.getAgentStats({ from, to } as any);

      const expected = new Map<
        string,
        { total: number; answered: number; missed: number }
      >();
      for (const s of seed) {
        if (!s.assignedUserId) continue;
        const row =
          expected.get(s.assignedUserId) ??
          { total: 0, answered: 0, missed: 0 };
        row.total++;
        if (s.disposition === 'ANSWERED') row.answered++;
        else row.missed++;
        expected.set(s.assignedUserId, row);
      }

      for (const row of res) {
        const exp = expected.get(row.userId)!;
        expect(row.totalCalls).toBe(exp.total);
        expect(row.answered).toBe(exp.answered);
        expect(row.missed).toBe(exp.missed);
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

      const bucket = (arr: Session[]) => {
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

    it('getAgentBreakdown totals match per-agent in-JS rollup', async () => {
      const res = await service.getAgentBreakdown({ from, to } as any);

      const expected = new Map<
        string,
        { total: number; answered: number; noAnswer: number; busy: number }
      >();
      for (const s of seed) {
        if (!s.assignedUserId) continue;
        const row =
          expected.get(s.assignedUserId) ??
          { total: 0, answered: 0, noAnswer: 0, busy: 0 };
        row.total++;
        if (s.disposition === 'ANSWERED') row.answered++;
        else if (s.disposition === 'BUSY' || s.disposition === 'FAILED') {
          row.busy++;
        } else {
          row.noAnswer++;
        }
        expected.set(s.assignedUserId, row);
      }

      for (const row of res) {
        const exp = expected.get(row.userId)!;
        expect(row.totalCalls).toBe(exp.total);
        expect(row.answeredCalls).toBe(exp.answered);
        expect(row.busyCalls).toBe(exp.busy);
        expect(row.noAnswerCalls).toBe(exp.noAnswer);
      }
      expect(res.length).toBe(expected.size);
    });
  });
});
