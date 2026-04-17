import { Test, TestingModule } from '@nestjs/testing';
import { MissedCallsService } from './missed-calls.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('MissedCallsService', () => {
  let service: MissedCallsService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      missedCall: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      callbackRequest: {
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      callSession: {
        findUnique: jest.fn(),
      },
      client: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MissedCallsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MissedCallsService);
  });

  describe('findAll', () => {
    it('should return empty paginated result', async () => {
      const res = await service.findAll({});
      expect(res.data).toEqual([]);
      expect(res.meta.total).toBe(0);
      expect(res.meta.totalPages).toBe(0);
    });

    it('should default to actionable statuses when no status filter', async () => {
      await service.findAll({});
      const whereArg = prisma.missedCall.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toEqual({ in: ['NEW', 'CLAIMED', 'ATTEMPTED'] });
    });

    it('should filter by specific status', async () => {
      await service.findAll({ status: 'HANDLED' });
      const whereArg = prisma.missedCall.findMany.mock.calls[0][0].where;
      expect(whereArg.status).toBe('HANDLED');
    });

    it('should filter by queue', async () => {
      await service.findAll({ queueId: 'q1' });
      const whereArg = prisma.missedCall.findMany.mock.calls[0][0].where;
      expect(whereArg.queueId).toBe('q1');
    });
  });

  describe('claim', () => {
    it('should throw NotFoundException for non-existent missed call', async () => {
      prisma.missedCall.findUnique.mockResolvedValue(null);
      await expect(service.claim('mc-1', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when atomic claim fails (already claimed)', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({
        id: 'mc-1',
        claimedByUserId: 'user-2',
        status: 'CLAIMED',
      });
      prisma.missedCall.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.claim('mc-1', 'user-1')).rejects.toThrow(ConflictException);
    });

    it('should allow claiming an unclaimed missed call via atomic update', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({
        id: 'mc-1',
        claimedByUserId: null,
        status: 'NEW',
      });
      prisma.missedCall.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.claim('mc-1', 'user-1');
      expect(result.status).toBe('CLAIMED');
      expect(prisma.missedCall.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'mc-1' }),
          data: expect.objectContaining({
            claimedByUserId: 'user-1',
            status: 'CLAIMED',
          }),
        }),
      );
    });

    it('should allow re-claiming by the same user', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({
        id: 'mc-1',
        claimedByUserId: 'user-1',
        status: 'CLAIMED',
      });
      prisma.missedCall.updateMany.mockResolvedValue({ count: 1 });
      await expect(service.claim('mc-1', 'user-1')).resolves.not.toThrow();
    });
  });

  describe('markAttempting', () => {
    it('should claim + transition status without incrementing counter', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({
        id: 'mc-1',
        notes: null,
        claimedByUserId: null,
        callbackRequest: { attemptsCount: 0 },
      });

      const result = await service.markAttempting('mc-1', 'user-1', 'Started call');
      expect(result.status).toBe('ATTEMPTING');
      expect(result.attempts).toBe(0);
      // Upsert creates with attemptsCount=0, never increments
      expect(prisma.callbackRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ attemptsCount: 0 }),
          update: expect.not.objectContaining({ attemptsCount: expect.anything() }),
        }),
      );
    });

    it('should respect existing claim from another user', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({
        id: 'mc-1',
        notes: null,
        claimedByUserId: 'other-user',
        callbackRequest: { attemptsCount: 1 },
      });

      await service.markAttempting('mc-1', 'user-1');
      // Should NOT set claimedByUserId when someone else has the claim
      const updateCalls = prisma.missedCall.update.mock.calls.map(
        (c: any) => c[0].data,
      );
      expect(
        updateCalls.some(
          (d: any) => d.claimedByUserId !== undefined,
        ),
      ).toBe(false);
    });

    it('should preserve existing attempt count', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({
        id: 'mc-1',
        notes: null,
        claimedByUserId: null,
        callbackRequest: { attemptsCount: 2 },
      });

      const result = await service.markAttempting('mc-1', 'user-1');
      expect(result.attempts).toBe(2);
    });
  });

  describe('recordOutboundAttempt', () => {
    function makeSession(overrides: Partial<any> = {}) {
      return {
        id: 'sess-1',
        direction: 'OUT',
        calleeNumber: '555-1234',
        disposition: 'NOANSWER',
        assignedUserId: 'operator-1',
        endAt: new Date('2026-01-01T10:00:00Z'),
        callMetrics: { ringSeconds: 15 },
        ...overrides,
      };
    }

    beforeEach(() => {
      prisma.callSession.findUnique = jest.fn();
      prisma.missedCall.findMany = jest.fn().mockResolvedValue([]);
    });

    it('skips inbound calls', async () => {
      prisma.callSession.findUnique.mockResolvedValue(
        makeSession({ direction: 'IN' }),
      );
      await service.recordOutboundAttempt('sess-1');
      expect(prisma.missedCall.findMany).not.toHaveBeenCalled();
    });

    it('skips when ring time is below threshold', async () => {
      prisma.callSession.findUnique.mockResolvedValue(
        makeSession({ callMetrics: { ringSeconds: 3 } }),
      );
      await service.recordOutboundAttempt('sess-1');
      expect(prisma.missedCall.findMany).not.toHaveBeenCalled();
    });

    it('skips ANSWERED outbound (handled by autoResolveByPhone)', async () => {
      prisma.callSession.findUnique.mockResolvedValue(
        makeSession({ disposition: 'ANSWERED' }),
      );
      await service.recordOutboundAttempt('sess-1');
      expect(prisma.missedCall.findMany).not.toHaveBeenCalled();
    });

    it('skips FAILED outbound (network/congestion, not operator action)', async () => {
      prisma.callSession.findUnique.mockResolvedValue(
        makeSession({ disposition: 'FAILED' }),
      );
      await service.recordOutboundAttempt('sess-1');
      expect(prisma.missedCall.findMany).not.toHaveBeenCalled();
    });

    it('increments attemptsCount on matching MissedCall when ring ≥ threshold', async () => {
      prisma.callSession.findUnique.mockResolvedValue(makeSession());
      prisma.missedCall.findMany.mockResolvedValue([
        {
          id: 'mc-1',
          callerNumber: '555-1234',
          claimedByUserId: null,
          callbackRequest: { attemptsCount: 0 },
        },
      ]);

      await service.recordOutboundAttempt('sess-1');

      expect(prisma.callbackRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { missedCallId: 'mc-1' },
          update: expect.objectContaining({
            attemptsCount: { increment: 1 },
          }),
        }),
      );
    });

    it('flips CallbackRequest to FAILED after MAX_ATTEMPTS', async () => {
      prisma.callSession.findUnique.mockResolvedValue(makeSession());
      prisma.missedCall.findMany.mockResolvedValue([
        {
          id: 'mc-1',
          callerNumber: '555-1234',
          claimedByUserId: 'operator-1',
          callbackRequest: { attemptsCount: 2 }, // this will be the 3rd
        },
      ]);

      await service.recordOutboundAttempt('sess-1');

      const upsertCall = prisma.callbackRequest.upsert.mock.calls[0][0];
      expect(upsertCall.update.status).toBe('FAILED');
    });

    it('auto-claims for the operator when missed call is unclaimed', async () => {
      prisma.callSession.findUnique.mockResolvedValue(makeSession());
      prisma.missedCall.findMany.mockResolvedValue([
        {
          id: 'mc-1',
          callerNumber: '555-1234',
          claimedByUserId: null,
          callbackRequest: { attemptsCount: 0 },
        },
      ]);

      await service.recordOutboundAttempt('sess-1');

      const updateCalls = prisma.missedCall.update.mock.calls.map(
        (c: any) => c[0].data,
      );
      expect(
        updateCalls.some((d: any) => d.claimedByUserId === 'operator-1'),
      ).toBe(true);
    });
  });

  describe('resolve', () => {
    it('should mark missed call as handled', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({ id: 'mc-1', notes: null });

      const result = await service.resolve('mc-1', 'Called back successfully');
      expect(result.status).toBe('RESOLVED');
      expect(prisma.missedCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'HANDLED' }),
        }),
      );
    });
  });

  describe('ignore', () => {
    it('should mark missed call as ignored with reason', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({ id: 'mc-1', notes: null });

      const result = await service.ignore('mc-1', 'Wrong number');
      expect(result.status).toBe('IGNORED');
      expect(prisma.missedCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'IGNORED', notes: 'Wrong number' }),
        }),
      );
    });
  });

  describe('autoResolveByPhone', () => {
    it('should resolve pending missed calls for a phone number', async () => {
      prisma.missedCall.findMany.mockResolvedValue([
        { id: 'mc-1' },
        { id: 'mc-2' },
      ]);

      const count = await service.autoResolveByPhone('555-1234', 'session-99');
      expect(count).toBe(2);
      expect(prisma.missedCall.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['mc-1', 'mc-2'] } },
          data: expect.objectContaining({
            status: 'HANDLED',
            resolvedByCallSessionId: 'session-99',
          }),
        }),
      );
    });

    it('should return 0 when no pending missed calls', async () => {
      prisma.missedCall.findMany.mockResolvedValue([]);
      const count = await service.autoResolveByPhone('555-9999', 'session-1');
      expect(count).toBe(0);
    });
  });
});
