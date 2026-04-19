import { Test, TestingModule } from "@nestjs/testing";
import { QueueScheduleService } from "./queue-schedule.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ClientChatsEventService } from "./clientchats-event.service";

describe("QueueScheduleService", () => {
  let service: QueueScheduleService;
  let prisma: any;
  let events: {
    emitQueueUpdated: jest.Mock;
    refreshQueueMembership: jest.Mock;
  };

  beforeEach(async () => {
    // Self-referencing tx mock so $transaction(cb) calls cb(prisma).
    prisma = {
      clientChatQueueSchedule: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn((args: any) => Promise.resolve({ id: "s1", ...args.data })),
      },
      clientChatQueueOverride: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ id: "o1" }),
        delete: jest.fn().mockResolvedValue({ id: "o1" }),
      },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };

    events = {
      emitQueueUpdated: jest.fn(),
      refreshQueueMembership: jest.fn().mockResolvedValue({ joined: [], left: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueScheduleService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClientChatsEventService, useValue: events },
      ],
    }).compile();
    service = module.get(QueueScheduleService);
  });

  describe("getWeeklySchedule", () => {
    it("should return empty buckets when no schedules", async () => {
      prisma.clientChatQueueSchedule.findMany.mockResolvedValue([]);
      const res = await service.getWeeklySchedule();
      expect(res[1]).toEqual([]);
      expect(res[7]).toEqual([]);
    });
  });

  describe("setDaySchedule — queue:updated fan-out", () => {
    it("emits queue:updated exactly once and refreshes membership after DB write", async () => {
      await service.setDaySchedule(3, ["u1", "u2"]);

      expect(prisma.clientChatQueueSchedule.deleteMany).toHaveBeenCalledWith({
        where: { dayOfWeek: 3 },
      });
      expect(prisma.clientChatQueueSchedule.create).toHaveBeenCalledTimes(2);

      expect(events.emitQueueUpdated).toHaveBeenCalledTimes(1);
      expect(events.emitQueueUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "setDaySchedule", dayOfWeek: 3 }),
      );
      expect(events.refreshQueueMembership).toHaveBeenCalledTimes(1);
    });

    it("still emits queue:updated when the userIds list is empty", async () => {
      await service.setDaySchedule(5, []);

      expect(prisma.clientChatQueueSchedule.deleteMany).toHaveBeenCalled();
      expect(prisma.clientChatQueueSchedule.create).not.toHaveBeenCalled();
      expect(events.emitQueueUpdated).toHaveBeenCalledTimes(1);
      expect(events.refreshQueueMembership).toHaveBeenCalledTimes(1);
    });

    it("does not swallow DB errors — emit is skipped on transaction failure", async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error("db down"));
      await expect(service.setDaySchedule(1, ["u1"])).rejects.toThrow("db down");
      expect(events.emitQueueUpdated).not.toHaveBeenCalled();
      expect(events.refreshQueueMembership).not.toHaveBeenCalled();
    });

    it("HTTP path still succeeds if the event fan-out throws", async () => {
      events.emitQueueUpdated.mockImplementation(() => {
        throw new Error("socket boom");
      });
      // Should NOT propagate — the DB write already succeeded.
      await expect(
        service.setDaySchedule(2, ["u1"]),
      ).resolves.toBeDefined();
      // refreshQueueMembership still attempted despite emit failure.
      expect(events.refreshQueueMembership).toHaveBeenCalledTimes(1);
    });
  });

  describe("setDailyOverride — queue:updated fan-out", () => {
    it("emits queue:updated exactly once and refreshes membership after DB upsert", async () => {
      const date = new Date("2026-04-20T00:00:00Z");
      await service.setDailyOverride(date, ["u1"], "manager1");

      expect(prisma.clientChatQueueOverride.upsert).toHaveBeenCalledTimes(1);
      expect(events.emitQueueUpdated).toHaveBeenCalledTimes(1);
      expect(events.emitQueueUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "setDailyOverride",
          date: "2026-04-20",
        }),
      );
      expect(events.refreshQueueMembership).toHaveBeenCalledTimes(1);
    });

    it("skips emit when the upsert throws", async () => {
      prisma.clientChatQueueOverride.upsert.mockRejectedValueOnce(new Error("dup"));
      await expect(
        service.setDailyOverride(new Date("2026-04-20"), [], "m1"),
      ).rejects.toThrow("dup");
      expect(events.emitQueueUpdated).not.toHaveBeenCalled();
    });
  });

  describe("removeDailyOverride — queue:updated fan-out", () => {
    it("emits queue:updated exactly once and refreshes membership after delete", async () => {
      await service.removeDailyOverride(new Date("2026-04-20T00:00:00Z"));

      expect(prisma.clientChatQueueOverride.delete).toHaveBeenCalledTimes(1);
      expect(events.emitQueueUpdated).toHaveBeenCalledTimes(1);
      expect(events.emitQueueUpdated).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: "removeDailyOverride",
          date: "2026-04-20",
        }),
      );
      expect(events.refreshQueueMembership).toHaveBeenCalledTimes(1);
    });

    it("does NOT emit when the override did not exist (delete swallowed)", async () => {
      prisma.clientChatQueueOverride.delete.mockRejectedValueOnce({
        code: "P2025",
      });
      const res = await service.removeDailyOverride(new Date("2026-04-20"));
      expect(res).toBeNull();
      expect(events.emitQueueUpdated).not.toHaveBeenCalled();
      expect(events.refreshQueueMembership).not.toHaveBeenCalled();
    });
  });
});
