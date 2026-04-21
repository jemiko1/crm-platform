import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { OperatorBreakService } from "./operator-break.service";
import { PrismaService } from "../../prisma/prisma.service";
import { TelephonyStateManager } from "../realtime/telephony-state.manager";

/**
 * Tests for OperatorBreakService.
 *
 * Covers the start/end happy path plus the business-rule validations
 * (no double-start, no start on active call, no extension, idempotent
 * end) and the cron auto-close behavior (company-hours end + hard cap +
 * race-safe conditional update).
 */
describe("OperatorBreakService", () => {
  let service: OperatorBreakService;
  let prisma: {
    telephonyExtension: { findUnique: jest.Mock };
    operatorBreakSession: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let state: { getAgentState: jest.Mock };

  const oldEnv = process.env.COMPANY_WORK_END_HOUR;

  beforeEach(async () => {
    delete process.env.COMPANY_WORK_END_HOUR;
    prisma = {
      telephonyExtension: {
        findUnique: jest.fn().mockResolvedValue({
          extension: "200",
          isActive: true,
        }),
      },
      operatorBreakSession: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({
          id: "bk-1",
          startedAt: new Date("2026-04-21T14:00:00Z"),
          extension: "200",
        }),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    state = {
      getAgentState: jest.fn().mockReturnValue({ presence: "IDLE" }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperatorBreakService,
        { provide: PrismaService, useValue: prisma },
        { provide: TelephonyStateManager, useValue: state },
      ],
    }).compile();
    service = module.get(OperatorBreakService);
  });

  afterEach(() => {
    if (oldEnv !== undefined) {
      process.env.COMPANY_WORK_END_HOUR = oldEnv;
    } else {
      delete process.env.COMPANY_WORK_END_HOUR;
    }
  });

  describe("start", () => {
    it("creates a new break session when user has an active extension and is idle", async () => {
      const result = await service.start("user-1");
      expect(prisma.operatorBreakSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { userId: "user-1", extension: "200" },
        }),
      );
      expect(result.id).toBe("bk-1");
    });

    it("throws BadRequestException when user has no telephony extension", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
      await expect(service.start("user-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when user's extension is inactive", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue({
        extension: "200",
        isActive: false,
      });
      await expect(service.start("user-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when user is ON_CALL", async () => {
      state.getAgentState.mockReturnValue({ presence: "ON_CALL" });
      await expect(service.start("user-1")).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.operatorBreakSession.create).not.toHaveBeenCalled();
    });

    it("throws BadRequestException when user is RINGING", async () => {
      state.getAgentState.mockReturnValue({ presence: "RINGING" });
      await expect(service.start("user-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws ConflictException when user already has an active break", async () => {
      prisma.operatorBreakSession.findFirst.mockResolvedValue({
        id: "bk-existing",
        userId: "user-1",
        endedAt: null,
        startedAt: new Date(),
      });
      await expect(service.start("user-1")).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.operatorBreakSession.create).not.toHaveBeenCalled();
    });

    // Callback contract — the TelephonyGateway wires onBreakStarted to
    // emit `operator:break:started` to manager dashboards. If this
    // callback stops firing, manager live-view silently stops updating.
    it("fires onBreakStarted with sessionId + userId + extension + startedAt", async () => {
      const callback = jest.fn();
      service.onBreakStarted = callback;
      await service.start("user-1");
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "bk-1",
          userId: "user-1",
          extension: "200",
          startedAt: expect.any(Date),
        }),
      );
    });

    it("does NOT fire onBreakStarted when start() throws (extension missing)", async () => {
      prisma.telephonyExtension.findUnique.mockResolvedValue(null);
      const callback = jest.fn();
      service.onBreakStarted = callback;
      await expect(service.start("user-1")).rejects.toThrow();
      expect(callback).not.toHaveBeenCalled();
    });

    it("swallows errors from onBreakStarted — bad callback must not abort start", async () => {
      service.onBreakStarted = () => {
        throw new Error("manager dashboard is on fire");
      };
      // start() must still return normally; the session is persisted.
      const result = await service.start("user-1");
      expect(result.id).toBe("bk-1");
      expect(prisma.operatorBreakSession.create).toHaveBeenCalled();
    });

    // TOCTOU race: the findFirst sees no active session (the other
    // caller hasn't committed yet), then the create hits the partial
    // unique index and Prisma throws P2002. Service translates to the
    // same ConflictException the pre-check would have thrown.
    it("translates P2002 (partial unique race) into ConflictException", async () => {
      prisma.operatorBreakSession.findFirst.mockResolvedValue(null);
      const p2002 = Object.assign(new Error("unique violation"), {
        code: "P2002",
        clientVersion: "7.6.0",
      });
      // Simulate PrismaClientKnownRequestError — instanceof check uses
      // constructor name in practice but we also need the `code` prop.
      Object.setPrototypeOf(
        p2002,
        require("@prisma/client").Prisma.PrismaClientKnownRequestError.prototype,
      );
      prisma.operatorBreakSession.create.mockRejectedValue(p2002);

      await expect(service.start("user-1")).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("endForUser", () => {
    it("sets endedAt + durationSec on the user's active session (via stale-guarded updateMany)", async () => {
      const startedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      prisma.operatorBreakSession.findFirst.mockResolvedValue({
        id: "bk-1",
        startedAt,
        endedAt: null,
      });
      // endForUser now uses updateMany with `endedAt: null` predicate
      // (race-safe against the auto-close cron).
      prisma.operatorBreakSession.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.endForUser("user-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("bk-1");
      expect(result!.durationSec).toBeGreaterThanOrEqual(299);
      expect(result!.durationSec).toBeLessThanOrEqual(301);
      expect(prisma.operatorBreakSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "bk-1", endedAt: null },
          data: expect.objectContaining({
            durationSec: expect.any(Number),
            endedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("returns null (no error) when user has no active session (idempotent)", async () => {
      prisma.operatorBreakSession.findFirst.mockResolvedValue(null);
      const result = await service.endForUser("user-1");
      expect(result).toBeNull();
      expect(prisma.operatorBreakSession.update).not.toHaveBeenCalled();
    });

    // Callback: operator-initiated end fires onBreakEnded with
    // isAutoEnded=false. Auto-close cron is tested separately under
    // the autoCloseStaleBreaks describe block.
    it("fires onBreakEnded with isAutoEnded=false on operator-initiated end", async () => {
      const startedAt = new Date(Date.now() - 5 * 60 * 1000);
      prisma.operatorBreakSession.findFirst.mockResolvedValue({
        id: "bk-1",
        startedAt,
        endedAt: null,
        extension: "200",
      });
      prisma.operatorBreakSession.updateMany.mockResolvedValue({ count: 1 });

      const callback = jest.fn();
      service.onBreakEnded = callback;
      await service.endForUser("user-1");

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: "bk-1",
          userId: "user-1",
          extension: "200",
          isAutoEnded: false,
          autoEndReason: null,
          durationSec: expect.any(Number),
        }),
      );
    });

    it("does NOT fire onBreakEnded when no active session exists", async () => {
      prisma.operatorBreakSession.findFirst.mockResolvedValue(null);
      const callback = jest.fn();
      service.onBreakEnded = callback;
      await service.endForUser("user-1");
      expect(callback).not.toHaveBeenCalled();
    });

    it("does NOT fire onBreakEnded when race-guarded update misses (count=0)", async () => {
      prisma.operatorBreakSession.findFirst.mockResolvedValue({
        id: "bk-raced",
        startedAt: new Date(),
        endedAt: null,
        extension: "200",
      });
      prisma.operatorBreakSession.updateMany.mockResolvedValue({ count: 0 });
      const callback = jest.fn();
      service.onBreakEnded = callback;
      await service.endForUser("user-1");
      expect(callback).not.toHaveBeenCalled();
    });

    // Race: cron auto-closes the session between findFirst and updateMany.
    // The stale-guarded updateMany matches 0 rows and we return null
    // instead of overwriting the auto-close metadata.
    it("returns null when session was closed by cron mid-flight (race guard)", async () => {
      const startedAt = new Date(Date.now() - 5 * 60 * 1000);
      prisma.operatorBreakSession.findFirst.mockResolvedValue({
        id: "bk-raced",
        startedAt,
        endedAt: null,
      });
      // updateMany returns count:0 → cron already closed it
      prisma.operatorBreakSession.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.endForUser("user-1");
      expect(result).toBeNull();
    });
  });

  describe("autoCloseStaleBreaks (cron)", () => {
    /**
     * Helper to run the cron with a controlled "now" and a set of
     * candidate sessions. Verifies which ones get auto-closed.
     */
    async function runAutoCloseWith(
      candidates: Array<{
        id: string;
        userId: string;
        startedAt: Date;
        extension?: string;
      }>,
    ): Promise<void> {
      // Default extension so the fire payload is realistic — the service
      // reads `candidate.extension` and forwards it on `operator:break:ended`.
      const enriched = candidates.map((c) => ({ extension: "200", ...c }));
      prisma.operatorBreakSession.findMany.mockResolvedValue(enriched);
      await service.autoCloseStaleBreaks();
    }

    it("is a no-op when no active sessions exist", async () => {
      await runAutoCloseWith([]);
      expect(prisma.operatorBreakSession.updateMany).not.toHaveBeenCalled();
    });

    it("closes sessions started before today's company end hour (19:00 default)", async () => {
      // Mock clock to today at 20:00 local (past 19:00).
      const now = new Date();
      now.setHours(20, 0, 0, 0);
      jest.useFakeTimers();
      jest.setSystemTime(now);
      try {
        const sessionStart = new Date(now);
        sessionStart.setHours(17, 30, 0, 0); // Started at 17:30, now is 20:00
        await runAutoCloseWith([
          { id: "bk-forgot", userId: "user-1", startedAt: sessionStart },
        ]);
        expect(prisma.operatorBreakSession.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "bk-forgot", endedAt: null },
            data: expect.objectContaining({
              isAutoEnded: true,
              autoEndReason: "company_hours_end",
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("closes sessions older than 12h via hard cap when current time is BEFORE end-of-work", async () => {
      // Pin clock to 14:00 local — BEFORE the default 19:00 end hour, so
      // the company_hours_end branch does NOT fire. Session started 13h
      // ago means both branches could theoretically fire, but only the
      // hard-cap should when now < todayEndOfWork.
      const now = new Date();
      now.setHours(14, 0, 0, 0);
      jest.useFakeTimers();
      jest.setSystemTime(now);
      try {
        const startedAt = new Date(now.getTime() - 13 * 60 * 60 * 1000);
        await runAutoCloseWith([
          { id: "bk-ghost", userId: "user-2", startedAt },
        ]);
        expect(prisma.operatorBreakSession.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: "bk-ghost", endedAt: null },
            data: expect.objectContaining({
              isAutoEnded: true,
              autoEndReason: "max_duration_exceeded",
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("does NOT close sessions that are within limits (young + before end-of-work)", async () => {
      // Mock clock to today at 14:00 (before 19:00 end-of-work).
      const now = new Date();
      now.setHours(14, 0, 0, 0);
      jest.useFakeTimers();
      jest.setSystemTime(now);
      try {
        const sessionStart = new Date(now);
        sessionStart.setHours(13, 50, 0, 0); // 10 min ago
        await runAutoCloseWith([
          { id: "bk-fresh", userId: "user-3", startedAt: sessionStart },
        ]);
        expect(prisma.operatorBreakSession.updateMany).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("fires onBreakEnded for each auto-closed session with isAutoEnded=true", async () => {
      // Low-severity gap the reviewer flagged: the cron's `fireBreakEnded`
      // call inside the for-loop was covered only by static inspection. If
      // a future refactor accidentally drops it, manager dashboards would
      // silently miss auto-close events. This pins the emit contract.
      const callback = jest.fn();
      service.onBreakEnded = callback;

      const now = new Date();
      now.setHours(20, 0, 0, 0);
      jest.useFakeTimers();
      jest.setSystemTime(now);
      try {
        const sessionStart = new Date(now);
        sessionStart.setHours(17, 30, 0, 0);
        await runAutoCloseWith([
          {
            id: "bk-cron-a",
            userId: "user-a",
            startedAt: sessionStart,
            extension: "205",
          },
          {
            id: "bk-cron-b",
            userId: "user-b",
            startedAt: sessionStart,
            extension: "206",
          },
        ]);
        expect(callback).toHaveBeenCalledTimes(2);
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: "bk-cron-a",
            userId: "user-a",
            extension: "205",
            isAutoEnded: true,
            autoEndReason: "company_hours_end",
          }),
        );
        expect(callback).toHaveBeenCalledWith(
          expect.objectContaining({
            sessionId: "bk-cron-b",
            userId: "user-b",
            extension: "206",
            isAutoEnded: true,
            autoEndReason: "company_hours_end",
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it("race-safe: updateMany returning count=0 (someone ended it meanwhile) is silently skipped", async () => {
      prisma.operatorBreakSession.updateMany.mockResolvedValue({ count: 0 });
      const callback = jest.fn();
      service.onBreakEnded = callback;

      const startedAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
      // Should not throw; just logs a debug and moves on.
      await runAutoCloseWith([
        { id: "bk-raced", userId: "user-4", startedAt },
      ]);
      // updateMany was called, but did nothing — that's the race guard.
      expect(prisma.operatorBreakSession.updateMany).toHaveBeenCalled();
      // Critical: a race-lost close must NOT emit a phantom
      // operator:break:ended, or managers would see a duplicate with the
      // manual end (endForUser already fired its own).
      expect(callback).not.toHaveBeenCalled();
    });

    // Overlap guard — if a previous tick is still running (slow DB,
    // very long candidate list), the next tick skips rather than
    // stacking load. Mirrors escalation + quality-pipeline pattern.
    it("overlap-guarded: second concurrent tick is skipped", async () => {
      // Simulate a slow findMany by making it hang on the first call.
      let resolveFirstCall: () => void = () => undefined;
      prisma.operatorBreakSession.findMany.mockImplementationOnce(() => {
        return new Promise((resolve) => {
          resolveFirstCall = () => resolve([]);
        });
      });

      // Fire two cron calls in parallel. The second should bail on the
      // autoCloseRunning flag without even calling findMany a second
      // time.
      const tickA = service.autoCloseStaleBreaks();
      const tickB = service.autoCloseStaleBreaks();

      // Let the second tick run its guard check before we release A.
      await new Promise((r) => setImmediate(r));

      expect(prisma.operatorBreakSession.findMany).toHaveBeenCalledTimes(1);

      resolveFirstCall();
      await Promise.all([tickA, tickB]);

      // After both ticks, still only one findMany call (second was skipped).
      expect(prisma.operatorBreakSession.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe("COMPANY_WORK_END_HOUR env", () => {
    it("honors override (e.g. 22 for late-night shifts)", async () => {
      process.env.COMPANY_WORK_END_HOUR = "22";
      // Re-create service via a fresh module to pick up the env.
      const m = await Test.createTestingModule({
        providers: [
          OperatorBreakService,
          { provide: PrismaService, useValue: prisma },
          { provide: TelephonyStateManager, useValue: state },
        ],
      }).compile();
      const s = m.get(OperatorBreakService);
      // At 21:00, a session started at 20:00 should NOT be auto-closed
      // (still before the 22:00 end hour).
      const now = new Date();
      now.setHours(21, 0, 0, 0);
      jest.useFakeTimers();
      jest.setSystemTime(now);
      try {
        const sessionStart = new Date(now);
        sessionStart.setHours(20, 0, 0, 0);
        prisma.operatorBreakSession.findMany.mockResolvedValue([
          { id: "bk-late", userId: "u", startedAt: sessionStart },
        ]);
        await s.autoCloseStaleBreaks();
        expect(prisma.operatorBreakSession.updateMany).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it("falls back to 19 on invalid env (non-numeric, out-of-range)", async () => {
      process.env.COMPANY_WORK_END_HOUR = "not-a-number";
      const m = await Test.createTestingModule({
        providers: [
          OperatorBreakService,
          { provide: PrismaService, useValue: prisma },
          { provide: TelephonyStateManager, useValue: state },
        ],
      }).compile();
      const s = m.get(OperatorBreakService);
      // If fallback to 19 works, a session at 17:30 on a 20:00 clock
      // gets auto-closed.
      const now = new Date();
      now.setHours(20, 0, 0, 0);
      jest.useFakeTimers();
      jest.setSystemTime(now);
      try {
        const sessionStart = new Date(now);
        sessionStart.setHours(17, 30, 0, 0);
        prisma.operatorBreakSession.findMany.mockResolvedValue([
          { id: "bk-invalid-env", userId: "u", startedAt: sessionStart },
        ]);
        await s.autoCloseStaleBreaks();
        expect(prisma.operatorBreakSession.updateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              autoEndReason: "company_hours_end",
            }),
          }),
        );
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
