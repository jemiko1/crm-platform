import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyIngestionService } from '../services/telephony-ingestion.service';
import { TelephonyCallbackService } from '../services/telephony-callback.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelephonyIngestionService', () => {
  let service: TelephonyIngestionService;
  let prisma: Record<string, any>;
  let callbackService: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      callEvent: {
        findUnique: jest.fn(),
        create: jest.fn().mockResolvedValue({ id: 'evt-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findFirst: jest.fn(),
      },
      callSession: {
        findUnique: jest.fn(),
        upsert: jest.fn().mockResolvedValue({ id: 'sess-1', linkedId: 'link-1' }),
        update: jest.fn().mockResolvedValue({ id: 'sess-1' }),
      },
      callLeg: {
        create: jest.fn().mockResolvedValue({ id: 'leg-1' }),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      callMetrics: {
        upsert: jest.fn().mockResolvedValue({ id: 'met-1' }),
      },
      telephonyExtension: {
        findUnique: jest.fn(),
      },
      telephonyQueue: {
        findUnique: jest.fn(),
      },
      recording: {
        create: jest.fn().mockResolvedValue({ id: 'rec-1' }),
      },
      qualityReview: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'qr-1' }),
      },
    };

    callbackService = {
      handleNonAnsweredCall: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyIngestionService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelephonyCallbackService, useValue: callbackService },
      ],
    }).compile();

    service = module.get(TelephonyIngestionService);
  });

  describe('ingestBatch', () => {
    it('should skip duplicate events based on idempotencyKey', async () => {
      prisma.callEvent.findUnique.mockResolvedValue({ id: 'existing' });

      const result = await service.ingestBatch([
        {
          eventType: 'call_start',
          timestamp: '2026-02-21T10:00:00Z',
          idempotencyKey: 'dup-key',
          payload: { linkedId: 'link-1', callerIdNum: '555123' },
          linkedId: 'link-1',
        },
      ]);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(prisma.callEvent.create).not.toHaveBeenCalled();
    });

    it('should process new events and create CallEvent rows', async () => {
      prisma.callEvent.findUnique.mockResolvedValue(null);
      prisma.callSession.findUnique
        .mockResolvedValueOnce(null) // first lookup by linkedId
        .mockResolvedValueOnce({ id: 'sess-1', linkedId: 'link-1' }); // after upsert for backfill

      const result = await service.ingestBatch([
        {
          eventType: 'call_start',
          timestamp: '2026-02-21T10:00:00Z',
          idempotencyKey: 'new-key-1',
          payload: { linkedId: 'link-1', callerIdNum: '555123', context: 'inbound' },
          linkedId: 'link-1',
        },
      ]);

      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(prisma.callEvent.create).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in individual events without failing the batch', async () => {
      prisma.callEvent.findUnique.mockResolvedValue(null);
      prisma.callEvent.create.mockRejectedValueOnce(new Error('DB error'));

      const result = await service.ingestBatch([
        {
          eventType: 'call_start',
          timestamp: '2026-02-21T10:00:00Z',
          idempotencyKey: 'err-key',
          payload: { linkedId: 'link-1' },
          linkedId: 'link-1',
        },
      ]);

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].idempotencyKey).toBe('err-key');
    });
  });

  describe('call_end event', () => {
    it('should trigger callback service for non-answered calls', async () => {
      prisma.callEvent.findUnique.mockResolvedValue(null);
      const mockSession = {
        id: 'sess-1',
        linkedId: 'link-1',
        startAt: new Date('2026-02-21T10:00:00Z'),
        endAt: null,
        callLegs: [],
      };
      prisma.callSession.findUnique
        .mockResolvedValueOnce(mockSession) // linkedId lookup
        .mockResolvedValueOnce({ ...mockSession, endAt: new Date(), callLegs: [], queue: null }); // computeMetrics

      prisma.callSession.update.mockResolvedValue({
        ...mockSession,
        endAt: new Date('2026-02-21T10:00:45Z'),
        disposition: 'ABANDONED',
      });

      await service.ingestBatch([
        {
          eventType: 'call_end',
          timestamp: '2026-02-21T10:00:45Z',
          idempotencyKey: 'end-key',
          payload: { linkedId: 'link-1', cause: '487', causeTxt: 'ORIGINATOR_CANCEL' },
          linkedId: 'link-1',
        },
      ]);

      expect(callbackService.handleNonAnsweredCall).toHaveBeenCalledWith('sess-1');
    });
  });

  describe('recording_ready event', () => {
    it('should create Recording and QualityReview for answered calls > 30s', async () => {
      prisma.callEvent.findUnique.mockResolvedValue(null);
      const mockSession = { id: 'sess-1', linkedId: 'link-1', disposition: 'ANSWERED' };
      prisma.callSession.findUnique.mockResolvedValue(mockSession);
      prisma.callSession.update.mockResolvedValue(mockSession);

      await service.ingestBatch([
        {
          eventType: 'recording_ready',
          timestamp: '2026-02-21T10:06:00Z',
          idempotencyKey: 'rec-key',
          payload: {
            linkedId: 'link-1',
            recordingFile: '/path/to/recording.wav',
            recordingDuration: 120,
          },
          linkedId: 'link-1',
        },
      ]);

      expect(prisma.recording.create).toHaveBeenCalled();
      expect(prisma.qualityReview.create).toHaveBeenCalled();
    });
  });
});
