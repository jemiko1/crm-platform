import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyCallbackService } from '../services/telephony-callback.service';
import { TelephonyWorktimeService } from '../services/telephony-worktime.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelephonyCallbackService', () => {
  let service: TelephonyCallbackService;
  let prisma: Record<string, any>;
  let worktimeService: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      callSession: {
        findUnique: jest.fn(),
      },
      missedCall: {
        upsert: jest.fn().mockResolvedValue({ id: 'mc-1', callSessionId: 'sess-1' }),
        update: jest.fn(),
      },
      callbackRequest: {
        upsert: jest.fn().mockResolvedValue({ id: 'cb-1' }),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
      },
    };

    worktimeService = {
      nextWorktimeStart: jest.fn().mockResolvedValue(new Date('2026-02-22T09:00:00Z')),
      isWithinWorktime: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyCallbackService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelephonyWorktimeService, useValue: worktimeService },
      ],
    }).compile();

    service = module.get(TelephonyCallbackService);
  });

  describe('handleNonAnsweredCall', () => {
    it('should create MissedCall + CallbackRequest for abandoned calls', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        disposition: 'ABANDONED',
        callerNumber: '555123',
        queueId: 'q-1',
        assignedUserId: null,
        queue: null,
      });

      await service.handleNonAnsweredCall('sess-1');

      expect(prisma.missedCall.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            callSessionId: 'sess-1',
            reason: 'ABANDONED',
          }),
        }),
      );
      expect(prisma.callbackRequest.upsert).toHaveBeenCalled();
    });

    it('should schedule callback for out-of-hours calls', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        disposition: 'MISSED',
        callerNumber: '555456',
        queueId: 'q-1',
        assignedUserId: null,
        queue: {
          worktimeConfig: {
            timezone: 'Asia/Tbilisi',
            windows: [{ day: 1, start: '09:00', end: '18:00' }],
          },
        },
      });

      await service.handleNonAnsweredCall('sess-1');

      expect(prisma.callbackRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: 'SCHEDULED',
            scheduledAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should not create callback/missed for answered calls', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        disposition: 'ANSWERED',
        callerNumber: '555789',
        queueId: null,
        assignedUserId: 'user-1',
        queue: null,
      });

      await service.handleNonAnsweredCall('sess-1');

      expect(prisma.missedCall.upsert).not.toHaveBeenCalled();
    });
  });

  describe('handleCallback', () => {
    it('should mark callback as DONE when outcome is completed', async () => {
      prisma.callbackRequest.findUnique.mockResolvedValue({
        id: 'cb-1',
        missedCallId: 'mc-1',
      });
      prisma.callbackRequest.update.mockResolvedValue({ id: 'cb-1', status: 'DONE' });
      prisma.missedCall.update.mockResolvedValue({ id: 'mc-1', status: 'HANDLED' });

      await service.handleCallback('cb-1', 'completed');

      expect(prisma.callbackRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'DONE' }),
        }),
      );
      expect(prisma.missedCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'HANDLED' }),
        }),
      );
    });

    it('should throw NotFoundException for unknown callback', async () => {
      prisma.callbackRequest.findUnique.mockResolvedValue(null);

      await expect(service.handleCallback('unknown', 'completed')).rejects.toThrow(
        'Callback not found',
      );
    });
  });
});
