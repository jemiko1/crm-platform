import { Test, TestingModule } from "@nestjs/testing";
import { TelephonyIngestionService } from "./telephony-ingestion.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TelephonyCallbackService } from "./telephony-callback.service";
import { MissedCallsService } from "./missed-calls.service";
import { CallDisposition, CallDirection } from "@prisma/client";

/**
 * Regression tests for the P0-G M7 decision
 * (audit/STATS_STANDARDS.md — field-level merge on replayed call_end):
 *
 *  - First call_end stamps terminal fields (disposition, endAt, hangupCause)
 *    plus finalizedAt.
 *  - Subsequent call_end replays (e.g. CDR after AMI, or a second AMI event
 *    after a retry) must NOT overwrite terminal fields. Asterisk's own CDR
 *    contract treats them as immutable post-hangup; our model now mirrors
 *    that.
 *  - Non-terminal fields (recording, CallMetrics nulls, per-leg disconnect
 *    times) remain mergeable — later events may patch a null into a value
 *    but never flip an already-committed value.
 */

type PrismaMock = {
  callEvent: { findUnique: jest.Mock; create: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  callSession: {
    findUnique: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
  };
  callLeg: {
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  callMetrics: { upsert: jest.Mock };
  telephonyExtension: { findUnique: jest.Mock };
  telephonyQueue: { findUnique: jest.Mock };
  recording: { create: jest.Mock };
  qualityReview: { findUnique: jest.Mock; create: jest.Mock };
};

function mkPrismaMock(): PrismaMock {
  return {
    callEvent: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    callSession: {
      findUnique: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
    },
    callLeg: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    callMetrics: { upsert: jest.fn().mockResolvedValue({}) },
    telephonyExtension: { findUnique: jest.fn().mockResolvedValue(null) },
    telephonyQueue: { findUnique: jest.fn().mockResolvedValue(null) },
    recording: { create: jest.fn().mockResolvedValue({}) },
    qualityReview: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
  };
}

describe("TelephonyIngestionService", () => {
  let service: TelephonyIngestionService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = mkPrismaMock();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelephonyIngestionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TelephonyCallbackService,
          useValue: { handleNonAnsweredCall: jest.fn() },
        },
        {
          provide: MissedCallsService,
          useValue: {
            autoResolveByPhone: jest.fn().mockResolvedValue(0),
            recordOutboundAttempt: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();
    service = module.get(TelephonyIngestionService);
  });

  describe("ingestBatch", () => {
    it("returns zeros for empty batch", async () => {
      const res = await service.ingestBatch([]);
      expect(res.processed).toBe(0);
      expect(res.skipped).toBe(0);
      expect(res.errors).toEqual([]);
    });
  });

  describe("M7 — call_end replay behavior", () => {
    it("first call_end stamps terminal fields and finalizedAt", async () => {
      // Session exists, not finalized yet.
      prisma.callSession.findUnique
        // outer lookup in processEvent
        .mockResolvedValueOnce({ id: "session-1" })
        // inside handleCallEnd: snapshot read
        .mockResolvedValueOnce({
          answerAt: new Date("2026-04-19T12:00:10Z"),
          endAt: null,
          direction: CallDirection.IN,
          finalizedAt: null,
          disposition: null,
          hangupCause: null,
        })
        // read-back after update for side effects
        .mockResolvedValueOnce({
          id: "session-1",
          disposition: CallDisposition.ANSWERED,
          direction: CallDirection.IN,
          callerNumber: "5551234",
          calleeNumber: null,
        });

      await service.ingestBatch([
        {
          eventType: "call_end",
          timestamp: "2026-04-19T12:05:30Z",
          idempotencyKey: "end-1",
          payload: { causeTxt: "ANSWERED", linkedId: "link-1" },
          linkedId: "link-1",
        } as any,
      ]);

      // Terminal fields AND finalizedAt get stamped on first call_end.
      expect(prisma.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: expect.objectContaining({
            endAt: new Date("2026-04-19T12:05:30Z"),
            disposition: CallDisposition.ANSWERED,
            finalizedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("replayed call_end does NOT overwrite disposition when already finalized (CDR arrives after AMI with 'FAILED')", async () => {
      // Session already finalized as ANSWERED via a first call_end.
      prisma.callSession.findUnique
        .mockResolvedValueOnce({ id: "session-1" })
        .mockResolvedValueOnce({
          answerAt: new Date("2026-04-19T12:00:10Z"),
          endAt: new Date("2026-04-19T12:05:30Z"),
          direction: CallDirection.IN,
          finalizedAt: new Date("2026-04-19T12:05:31Z"),
          disposition: CallDisposition.ANSWERED,
          hangupCause: "ANSWERED",
        });

      await service.ingestBatch([
        {
          eventType: "call_end",
          timestamp: "2026-04-19T12:10:00Z",
          idempotencyKey: "end-replay-1",
          payload: { causeTxt: "FAILURE", linkedId: "link-1" },
          linkedId: "link-1",
        } as any,
      ]);

      // No CallSession update for terminal fields on the replay. updateData
      // should be empty → no .update call at all for terminal fields.
      const updateCalls = prisma.callSession.update.mock.calls;
      for (const [arg] of updateCalls) {
        expect(arg?.data).not.toHaveProperty("disposition");
        expect(arg?.data).not.toHaveProperty("endAt");
        expect(arg?.data).not.toHaveProperty("hangupCause");
        expect(arg?.data).not.toHaveProperty("finalizedAt");
      }
    });

    it("call_answer does not overwrite a previously-set answerAt (first-write-wins)", async () => {
      prisma.callSession.findUnique
        // outer lookup in processEvent
        .mockResolvedValueOnce({ id: "session-1" })
        // inside handleCallAnswer
        .mockResolvedValueOnce({
          answerAt: new Date("2026-04-19T12:00:15Z"),
        });

      await service.ingestBatch([
        {
          eventType: "call_answer",
          timestamp: "2026-04-19T12:00:18Z",
          idempotencyKey: "answer-replay-1",
          payload: { linkedId: "link-1" },
          linkedId: "link-1",
        } as any,
      ]);

      // callSession.update should NOT have been called with a new answerAt.
      expect(prisma.callSession.update).not.toHaveBeenCalled();
    });

    it("call_answer on a session with null answerAt commits the timestamp", async () => {
      prisma.callSession.findUnique
        .mockResolvedValueOnce({ id: "session-1" })
        .mockResolvedValueOnce({ answerAt: null });

      await service.ingestBatch([
        {
          eventType: "call_answer",
          timestamp: "2026-04-19T12:00:15Z",
          idempotencyKey: "answer-1",
          payload: { linkedId: "link-1" },
          linkedId: "link-1",
        } as any,
      ]);

      expect(prisma.callSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "session-1" },
          data: { answerAt: new Date("2026-04-19T12:00:15Z") },
        }),
      );
    });
  });
});
