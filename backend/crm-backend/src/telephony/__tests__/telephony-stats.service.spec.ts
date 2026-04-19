import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyStatsService } from '../services/telephony-stats.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

/**
 * Legacy spec, retained for the shape-check cases the team relied on before
 * P1-3 moved aggregation into SQL. The numeric equivalence + safety guard
 * tests live in services/telephony-stats.service.spec.ts.
 *
 * These tests stub `$queryRaw` to return canned result rows rather than
 * inspecting raw SQL. Enough to confirm wiring, callback counts, and the
 * shape of the comparison object.
 */
describe('TelephonyStatsService (legacy shape checks)', () => {
  let service: TelephonyStatsService;
  let prisma: Record<string, any>;

  // Canned answers per query shape — keyed by distinctive SQL substrings.
  function makeQueryRawStub(
    byShape: Record<string, (input: Prisma.Sql) => Promise<unknown[]>>,
  ) {
    return jest.fn((input: Prisma.Sql) => {
      const sql = input.sql;
      for (const key of Object.keys(byShape)) {
        if (sql.includes(key)) return byShape[key](input);
      }
      return Promise.resolve([]);
    });
  }

  beforeEach(async () => {
    prisma = {
      $queryRaw: makeQueryRawStub({}),
      callSession: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      callbackRequest: {
        count: jest.fn().mockResolvedValue(0),
      },
      telephonyExtension: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      telephonyQueue: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyStatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TelephonyStatsService);
  });

  describe('getOverview', () => {
    it('should return zero-value KPIs when no data exists', async () => {
      const result = await service.getOverview({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      } as any);

      expect(result.current.volume.totalCalls).toBe(0);
      expect(result.current.volume.answered).toBe(0);
      expect(result.current.volume.missed).toBe(0);
      expect(result.current.speed.avgAnswerTimeSec).toBeNull();
      expect(result.current.quality.avgTalkTimeSec).toBeNull();
      expect(result.current.serviceLevel.slaMetPercent).toBeNull();
      expect(result.comparison).toBeUndefined();
    });

    it('should compute correct KPIs from aggregate shape', async () => {
      // Simulate Postgres returning pre-aggregated rows (what the rewritten
      // service asks for via $queryRaw).
      prisma.$queryRaw = makeQueryRawStub({
        answeredWithMetrics: () =>
          Promise.resolve([
            {
              total: 3n,
              answered: 2n,
              missed: 0n,
              abandoned: 1n,
              answeredWithMetrics: 2n,
              avgAnswerWait: 15,
              medianAnswerWait: 15,
              p90AnswerWait: 19,
              maxAnsweredWait: 20,
              abandonWaitCount: 1n,
              abandonWaitSum: 45,
              talkSum: 300,
              holdSum: 15,
              wrapupSum: 35,
              transfersSum: 1,
              slaTotal: 3n,
              slaMetCount: 2n,
            },
          ]),
        'GROUP BY 1': () => Promise.resolve([]),
      });

      const result = await service.getOverview({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      } as any);

      expect(result.current.volume.totalCalls).toBe(3);
      expect(result.current.volume.answered).toBe(2);
      expect(result.current.volume.abandoned).toBe(1);
      expect(result.current.speed.avgAnswerTimeSec).toBe(15);
      expect(result.current.quality.avgTalkTimeSec).toBe(150); // 300/2
      expect(result.current.quality.transferRate).toBe(0.5); // 1/2
      expect(result.current.serviceLevel.slaMetPercent).toBeCloseTo(66.67, 1);
    });

    it('should include comparison and delta when compareFrom/To provided', async () => {
      const result = await service.getOverview({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
        compareFrom: '2026-02-14T00:00:00Z',
        compareTo: '2026-02-14T23:59:59Z',
      } as any);

      expect(result.comparison).toBeDefined();
      expect(result.delta).toBeDefined();
    });
  });

  describe('getAgentStats', () => {
    it('should return empty array with no data', async () => {
      const result = await service.getAgentStats({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      } as any);

      expect(result).toEqual([]);
    });

    it('should map aggregate rows into AgentKpis shape', async () => {
      prisma.$queryRaw = makeQueryRawStub({
        'GROUP BY s."assignedUserId"': () =>
          Promise.resolve([
            {
              userId: 'user-1',
              total: 2n,
              answered: 1n,
              missed: 1n,
              talkSum: 60,
              holdSum: 5,
              wrapupSum: 10,
            },
            {
              userId: 'user-2',
              total: 1n,
              answered: 1n,
              missed: 0n,
              talkSum: 120,
              holdSum: 10,
              wrapupSum: 15,
            },
          ]),
      });
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { crmUserId: 'user-1', displayName: 'Agent A' },
        { crmUserId: 'user-2', displayName: 'Agent B' },
      ]);

      const result = await service.getAgentStats({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      } as any);

      expect(result).toHaveLength(2);

      const agent1 = result.find((a) => a.userId === 'user-1')!;
      expect(agent1.totalCalls).toBe(2);
      expect(agent1.answered).toBe(1);
      expect(agent1.missed).toBe(1);
      expect(agent1.answerRate).toBe(50);
      expect(agent1.displayName).toBe('Agent A');
    });
  });

  describe('getQueueStats', () => {
    it('should return empty array with no data', async () => {
      const result = await service.getQueueStats({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      } as any);

      expect(result).toEqual([]);
    });
  });
});
