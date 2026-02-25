import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyStatsService } from '../services/telephony-stats.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelephonyStatsService', () => {
  let service: TelephonyStatsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
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
      });

      expect(result.current.volume.totalCalls).toBe(0);
      expect(result.current.volume.answered).toBe(0);
      expect(result.current.volume.missed).toBe(0);
      expect(result.current.speed.avgAnswerTimeSec).toBeNull();
      expect(result.current.quality.avgTalkTimeSec).toBeNull();
      expect(result.current.serviceLevel.slaMetPercent).toBeNull();
      expect(result.comparison).toBeUndefined();
    });

    it('should compute correct KPIs from session data', async () => {
      prisma.callSession.findMany.mockResolvedValue([
        {
          disposition: 'ANSWERED',
          startAt: new Date('2026-02-21T10:00:00Z'),
          callMetrics: {
            waitSeconds: 10,
            talkSeconds: 120,
            holdSeconds: 5,
            wrapupSeconds: 15,
            transfersCount: 0,
            abandonsAfterSeconds: null,
            isSlaMet: true,
          },
        },
        {
          disposition: 'ANSWERED',
          startAt: new Date('2026-02-21T11:00:00Z'),
          callMetrics: {
            waitSeconds: 20,
            talkSeconds: 180,
            holdSeconds: 10,
            wrapupSeconds: 20,
            transfersCount: 1,
            abandonsAfterSeconds: null,
            isSlaMet: true,
          },
        },
        {
          disposition: 'ABANDONED',
          startAt: new Date('2026-02-21T12:00:00Z'),
          callMetrics: {
            waitSeconds: 45,
            talkSeconds: 0,
            holdSeconds: 0,
            wrapupSeconds: 0,
            transfersCount: 0,
            abandonsAfterSeconds: 45,
            isSlaMet: false,
          },
        },
      ]);

      const result = await service.getOverview({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      });

      expect(result.current.volume.totalCalls).toBe(3);
      expect(result.current.volume.answered).toBe(2);
      expect(result.current.volume.abandoned).toBe(1);
      expect(result.current.speed.avgAnswerTimeSec).toBe(15); // (10+20)/2
      expect(result.current.quality.avgTalkTimeSec).toBe(150); // (120+180)/2
      expect(result.current.quality.transferRate).toBe(0.5); // 1/2
      expect(result.current.serviceLevel.slaMetPercent).toBeCloseTo(66.67, 1);
    });

    it('should include comparison and delta when compareFrom/To provided', async () => {
      prisma.callSession.findMany.mockResolvedValue([]);

      const result = await service.getOverview({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
        compareFrom: '2026-02-14T00:00:00Z',
        compareTo: '2026-02-14T23:59:59Z',
      });

      expect(result.comparison).toBeDefined();
      expect(result.delta).toBeDefined();
    });
  });

  describe('getAgentStats', () => {
    it('should return empty array with no data', async () => {
      const result = await service.getAgentStats({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      });

      expect(result).toEqual([]);
    });

    it('should group stats by assignedUserId', async () => {
      prisma.callSession.findMany.mockResolvedValue([
        {
          assignedUserId: 'user-1',
          disposition: 'ANSWERED',
          callMetrics: {
            talkSeconds: 60,
            holdSeconds: 5,
            wrapupSeconds: 10,
            waitSeconds: 8,
          },
        },
        {
          assignedUserId: 'user-1',
          disposition: 'MISSED',
          callMetrics: {
            talkSeconds: 0,
            holdSeconds: 0,
            wrapupSeconds: 0,
            waitSeconds: 30,
          },
        },
        {
          assignedUserId: 'user-2',
          disposition: 'ANSWERED',
          callMetrics: {
            talkSeconds: 120,
            holdSeconds: 10,
            wrapupSeconds: 15,
            waitSeconds: 5,
          },
        },
      ]);
      prisma.telephonyExtension.findMany.mockResolvedValue([
        { crmUserId: 'user-1', displayName: 'Agent A' },
        { crmUserId: 'user-2', displayName: 'Agent B' },
      ]);

      const result = await service.getAgentStats({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      });

      expect(result).toHaveLength(2);

      const agent1 = result.find((a) => a.userId === 'user-1')!;
      expect(agent1.totalCalls).toBe(2);
      expect(agent1.answered).toBe(1);
      expect(agent1.missed).toBe(1);
      expect(agent1.answerRate).toBe(0.5);
      expect(agent1.displayName).toBe('Agent A');
    });
  });

  describe('getQueueStats', () => {
    it('should return empty array with no data', async () => {
      const result = await service.getQueueStats({
        from: '2026-02-21T00:00:00Z',
        to: '2026-02-21T23:59:59Z',
      });

      expect(result).toEqual([]);
    });
  });
});
