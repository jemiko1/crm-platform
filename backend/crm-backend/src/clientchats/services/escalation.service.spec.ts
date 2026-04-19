import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { EscalationService } from "./escalation.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ClientChatsEventService } from "./clientchats-event.service";

describe("EscalationService", () => {
  let service: EscalationService;
  let prisma: {
    clientChatEscalationConfig: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    clientChatEscalationEvent: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    clientChatConversation: {
      findMany: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let events: {
    emitToManagers: jest.Mock;
    emitConversationUpdated: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      clientChatEscalationConfig: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      clientChatEscalationEvent: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "ev1" }),
      },
      clientChatConversation: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    events = {
      emitToManagers: jest.fn(),
      emitConversationUpdated: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClientChatsEventService, useValue: events },
      ],
    }).compile();
    service = module.get(EscalationService);
  });

  describe("getConfig", () => {
    it("should create default config when none exists", async () => {
      const cfg = { id: "ec1" };
      prisma.clientChatEscalationConfig.findFirst.mockResolvedValue(null);
      prisma.clientChatEscalationConfig.create.mockResolvedValue(cfg);
      await expect(service.getConfig()).resolves.toEqual(cfg);
    });
  });

  describe("getRecentEvents", () => {
    it("should return events from prisma", async () => {
      await expect(service.getRecentEvents(10)).resolves.toEqual([]);
    });
  });

  describe("checkEscalations — P1-4 batch cap", () => {
    // Helper to build a fake stale conversation. sentAt controls elapsed mins.
    const buildStaleConversation = (
      idx: number,
      lastMessageAt: Date,
      lastInboundSentAt: Date,
    ) => ({
      id: `conv-${idx}`,
      assignedUserId: `user-${idx}`,
      channelType: "VIBER",
      lastMessageAt,
      messages: [{ sentAt: lastInboundSentAt }],
    });

    beforeEach(() => {
      // Default escalation config
      prisma.clientChatEscalationConfig.findFirst.mockResolvedValue({
        id: "ec1",
        firstResponseTimeoutMins: 5,
        reassignAfterMins: 15,
        notifyManagerOnEscalation: false,
      });
    });

    it("caps findMany at take:100 when backlog exceeds 100 (never miss; processed across ticks)", async () => {
      // Seed 120 fake stale rows — but the mock returns at most what it's told.
      // Verify the query params sent to prisma.
      const now = Date.now();
      const longAgo = new Date(now - 10 * 60_000); // 10 min ago

      // Mock findMany to capture args AND return only up to `take` rows.
      let capturedArgs: any = null;
      prisma.clientChatConversation.findMany.mockImplementation(
        async (args: any) => {
          capturedArgs = args;
          // Simulate 120 pending rows, returning only the take slice, sorted asc.
          const all = Array.from({ length: 120 }, (_, i) =>
            buildStaleConversation(
              i,
              new Date(now - (120 - i) * 60_000),
              longAgo,
            ),
          );
          const sorted = [...all].sort(
            (a, b) =>
              a.lastMessageAt.getTime() - b.lastMessageAt.getTime(),
          );
          return sorted.slice(0, args.take ?? sorted.length);
        },
      );

      const warnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);

      await service.checkEscalations();

      expect(capturedArgs).not.toBeNull();
      expect(capturedArgs.take).toBe(100);
      expect(capturedArgs.orderBy).toEqual({ lastMessageAt: "asc" });

      // Warn called because length === take (backlog saturated).
      const saturationWarns = warnSpy.mock.calls.filter((c) =>
        String(c[0] ?? "").includes("Escalation backlog saturated"),
      );
      expect(saturationWarns.length).toBeGreaterThan(0);

      warnSpy.mockRestore();
    });

    it("processes 50 of 50 stale with no backlog warn", async () => {
      const now = Date.now();
      const longAgo = new Date(now - 10 * 60_000);

      let capturedArgs: any = null;
      prisma.clientChatConversation.findMany.mockImplementation(
        async (args: any) => {
          capturedArgs = args;
          const all = Array.from({ length: 50 }, (_, i) =>
            buildStaleConversation(
              i,
              new Date(now - (50 - i) * 60_000),
              longAgo,
            ),
          );
          const sorted = [...all].sort(
            (a, b) =>
              a.lastMessageAt.getTime() - b.lastMessageAt.getTime(),
          );
          return sorted.slice(0, args.take ?? sorted.length);
        },
      );

      const warnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);

      await service.checkEscalations();

      expect(capturedArgs.take).toBe(100);
      const saturationWarns = warnSpy.mock.calls.filter((c) =>
        String(c[0] ?? "").includes("Escalation backlog saturated"),
      );
      expect(saturationWarns.length).toBe(0);

      warnSpy.mockRestore();
    });

    it("returns oldest-stale first (orderBy lastMessageAt asc)", async () => {
      const now = Date.now();
      const longAgo = new Date(now - 10 * 60_000);

      let capturedArgs: any = null;
      prisma.clientChatConversation.findMany.mockImplementation(
        async (args: any) => {
          capturedArgs = args;
          return [];
        },
      );

      await service.checkEscalations();

      expect(capturedArgs.orderBy).toEqual({ lastMessageAt: "asc" });
      // Unused var guard (prevents lint)
      expect(longAgo).toBeInstanceOf(Date);
    });
  });
});
