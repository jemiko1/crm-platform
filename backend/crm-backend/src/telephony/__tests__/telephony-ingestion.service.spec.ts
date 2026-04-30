import { Test, TestingModule } from '@nestjs/testing';
import { TelephonyIngestionService } from '../services/telephony-ingestion.service';
import { TelephonyCallbackService } from '../services/telephony-callback.service';
import { MissedCallsService } from '../services/missed-calls.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('TelephonyIngestionService', () => {
  let service: TelephonyIngestionService;
  let prisma: Record<string, any>;
  let callbackService: Record<string, any>;
  let missedCallsService: Record<string, any>;

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
        update: jest.fn().mockResolvedValue({ id: 'rec-1' }),
        // Default: no existing recording (session gets its first recording)
        findFirst: jest.fn().mockResolvedValue(null),
      },
      qualityReview: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'qr-1' }),
      },
      // B13 — ingestion handlers now wrap multi-step writes in $transaction.
      $transaction: jest.fn().mockImplementation(async (fnOrArr: any) => {
        if (typeof fnOrArr === 'function') return fnOrArr(prisma);
        if (Array.isArray(fnOrArr)) return Promise.all(fnOrArr);
        return undefined;
      }),
    };

    callbackService = {
      handleNonAnsweredCall: jest.fn().mockResolvedValue(undefined),
    };

    missedCallsService = {
      autoResolveByPhone: jest.fn().mockResolvedValue(0),
      recordOutboundAttempt: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyIngestionService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelephonyCallbackService, useValue: callbackService },
        { provide: MissedCallsService, useValue: missedCallsService },
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
    it('should trigger callback service for non-answered inbound calls', async () => {
      prisma.callEvent.findUnique.mockResolvedValue(null);
      const mockSession = {
        id: 'sess-1',
        linkedId: 'link-1',
        direction: 'IN',
        startAt: new Date('2026-02-21T10:00:00Z'),
        endAt: null,
        answerAt: null,
        finalizedAt: null,
        disposition: null,
        hangupCause: null,
        callLegs: [],
        callerNumber: null,
        calleeNumber: null,
      };
      // After P0-G, handleCallEnd does:
      //   1. findUnique(select: { answerAt, endAt, direction, finalizedAt, disposition, hangupCause })
      //   2. findUnique for computeMetrics (include callLegs, queue)
      //   3. findUnique read-back for side-effects
      prisma.callSession.findUnique
        .mockResolvedValueOnce(mockSession) // processEvent linkedId lookup
        .mockResolvedValueOnce(mockSession) // handleCallEnd snapshot
        .mockResolvedValueOnce({ ...mockSession, endAt: new Date(), callLegs: [], queue: null }) // computeMetrics
        .mockResolvedValueOnce({
          ...mockSession,
          endAt: new Date('2026-02-21T10:00:45Z'),
          disposition: 'ABANDONED',
        }); // read-back for side-effects

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

    it('should call recordOutboundAttempt for non-answered outbound calls', async () => {
      prisma.callEvent.findUnique.mockResolvedValue(null);
      const mockSession = {
        id: 'sess-out-1',
        linkedId: 'link-out-1',
        direction: 'OUT',
        startAt: new Date('2026-02-21T10:00:00Z'),
        endAt: null,
        answerAt: null,
        finalizedAt: null,
        disposition: null,
        hangupCause: null,
        callLegs: [],
        callerNumber: null,
        calleeNumber: null,
      };
      prisma.callSession.findUnique
        .mockResolvedValueOnce(mockSession) // processEvent linkedId lookup
        .mockResolvedValueOnce(mockSession) // handleCallEnd snapshot
        .mockResolvedValueOnce({ ...mockSession, endAt: new Date(), callLegs: [], queue: null }) // computeMetrics
        .mockResolvedValueOnce({
          ...mockSession,
          endAt: new Date('2026-02-21T10:00:15Z'),
          disposition: 'NOANSWER',
        }); // read-back for side-effects

      prisma.callSession.update.mockResolvedValue({
        ...mockSession,
        endAt: new Date('2026-02-21T10:00:15Z'),
        disposition: 'NOANSWER',
      });

      await service.ingestBatch([
        {
          eventType: 'call_end',
          timestamp: '2026-02-21T10:00:15Z',
          idempotencyKey: 'end-out-key',
          payload: { linkedId: 'link-out-1', cause: '19', causeTxt: 'NO_ANSWER' },
          linkedId: 'link-out-1',
        },
      ]);

      // Outbound non-answered → recordOutboundAttempt path, NOT handleNonAnsweredCall
      expect(callbackService.handleNonAnsweredCall).not.toHaveBeenCalled();
      expect(missedCallsService.recordOutboundAttempt).toHaveBeenCalledWith('sess-out-1');
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

    it('should skip zero-duration recording_ready (unanswered channel leg)', async () => {
      /**
       * Regression guard for the April 2026 empty-recording bug:
       * Asterisk fires MixMonitorStop for each channel that rang but did not
       * answer, producing 44-byte WAV files. The ingestion service must skip
       * these so the valid queue-level recording (fired later) wins.
       */
      prisma.callEvent.findUnique.mockResolvedValue(null);
      const mockSession = { id: 'sess-1', linkedId: 'link-1', disposition: 'ANSWERED' };
      prisma.callSession.findUnique.mockResolvedValue(mockSession);

      await service.ingestBatch([
        {
          eventType: 'recording_ready',
          timestamp: '2026-02-21T10:06:00Z',
          idempotencyKey: 'rec-zero',
          payload: {
            linkedId: 'link-1',
            recordingFile: '/var/spool/asterisk/monitor/2026/04/29/external-502-file.wav',
            recordingDuration: 0,  // ← the bug trigger
          },
          linkedId: 'link-1',
        },
      ]);

      expect(prisma.recording.create).not.toHaveBeenCalled();
      expect(prisma.recording.update).not.toHaveBeenCalled();
      // Session must NOT be marked AVAILABLE when no recording was stored
      expect(prisma.callSession.update).not.toHaveBeenCalled();
    });

    it('should upgrade existing recording when a longer one arrives', async () => {
      /**
       * When the per-channel recording fires first (short duration) followed by
       * the queue recording (full duration), the second event should replace the
       * first so operators see the real conversation, not a stub.
       */
      prisma.callEvent.findUnique.mockResolvedValue(null);
      const mockSession = { id: 'sess-1', linkedId: 'link-1', disposition: 'ANSWERED' };
      prisma.callSession.findUnique.mockResolvedValue(mockSession);
      prisma.callSession.update.mockResolvedValue(mockSession);

      // Simulate an existing short recording already in the DB
      prisma.recording.findFirst.mockResolvedValue({
        id: 'rec-short',
        durationSeconds: 3,
        filePath: '/var/spool/asterisk/monitor/2026/04/29/external-502-file.wav',
      });

      await service.ingestBatch([
        {
          eventType: 'recording_ready',
          timestamp: '2026-02-21T10:06:30Z',
          idempotencyKey: 'rec-full',
          payload: {
            linkedId: 'link-1',
            recordingFile: '/var/spool/asterisk/monitor/2026/04/29/q-30-file.wav',
            recordingDuration: 120,
          },
          linkedId: 'link-1',
        },
      ]);

      // Should update the existing row, not create a new one
      expect(prisma.recording.create).not.toHaveBeenCalled();
      expect(prisma.recording.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'rec-short' },
          data: expect.objectContaining({
            filePath: '/var/spool/asterisk/monitor/2026/04/29/q-30-file.wav',
            durationSeconds: 120,
          }),
        }),
      );
    });
  });
});
