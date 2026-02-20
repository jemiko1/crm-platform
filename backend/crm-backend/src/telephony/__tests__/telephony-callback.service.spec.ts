import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyCallbackService } from '../services/telephony-callback.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelephonyCallbackService', () => {
  let service: TelephonyCallbackService;
  let prisma: Record<string, any>;

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyCallbackService,
        { provide: PrismaService, useValue: prisma },
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
        queue: { isAfterHoursQueue: false },
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
      expect(prisma.callbackRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should classify as OUT_OF_HOURS when queue has isAfterHoursQueue=true', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        disposition: 'MISSED',
        callerNumber: '555456',
        queueId: 'q-nowork',
        assignedUserId: null,
        queue: { isAfterHoursQueue: true },
      });

      await service.handleNonAnsweredCall('sess-1');

      expect(prisma.missedCall.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            callSessionId: 'sess-1',
            reason: 'OUT_OF_HOURS',
          }),
        }),
      );
      expect(prisma.callbackRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            status: 'PENDING',
          }),
        }),
      );
    });

    it('should classify as NO_ANSWER for regular queue missed calls', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        disposition: 'NOANSWER',
        callerNumber: '555789',
        queueId: 'q-1',
        assignedUserId: 'user-1',
        queue: { isAfterHoursQueue: false },
      });

      await service.handleNonAnsweredCall('sess-1');

      expect(prisma.missedCall.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            reason: 'NO_ANSWER',
          }),
        }),
      );
      // NO_ANSWER does not auto-create callback
      expect(prisma.callbackRequest.upsert).not.toHaveBeenCalled();
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

    it('should handle null queue gracefully (classify as NO_ANSWER)', async () => {
      prisma.callSession.findUnique.mockResolvedValue({
        id: 'sess-1',
        disposition: 'MISSED',
        callerNumber: '555000',
        queueId: null,
        assignedUserId: null,
        queue: null,
      });

      await service.handleNonAnsweredCall('sess-1');

      expect(prisma.missedCall.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            reason: 'NO_ANSWER',
          }),
        }),
      );
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

    it('should mark callback as ATTEMPTING for non-final outcomes', async () => {
      prisma.callbackRequest.findUnique.mockResolvedValue({
        id: 'cb-1',
        missedCallId: 'mc-1',
      });
      prisma.callbackRequest.update.mockResolvedValue({ id: 'cb-1', status: 'ATTEMPTING' });

      await service.handleCallback('cb-1', 'no_answer');

      expect(prisma.callbackRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ATTEMPTING' }),
        }),
      );
      expect(prisma.missedCall.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for unknown callback', async () => {
      prisma.callbackRequest.findUnique.mockResolvedValue(null);

      await expect(service.handleCallback('unknown', 'completed')).rejects.toThrow(
        'Callback not found',
      );
    });
  });
});
