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

  describe('recordAttempt', () => {
    it('should increment attempt count', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({
        id: 'mc-1',
        notes: null,
        callbackRequest: { attemptsCount: 0 },
      });

      const result = await service.recordAttempt('mc-1', 'user-1', 'No answer');
      expect(result.status).toBe('ATTEMPTED');
      expect(result.attempts).toBe(1);
      expect(prisma.callbackRequest.upsert).toHaveBeenCalled();
    });

    it('should mark as MAX_ATTEMPTS_REACHED after 3 attempts', async () => {
      prisma.missedCall.findUnique.mockResolvedValue({
        id: 'mc-1',
        notes: null,
        callbackRequest: { attemptsCount: 2 },
      });

      const result = await service.recordAttempt('mc-1', 'user-1');
      expect(result.status).toBe('MAX_ATTEMPTS_REACHED');
      expect(result.attempts).toBe(3);
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
