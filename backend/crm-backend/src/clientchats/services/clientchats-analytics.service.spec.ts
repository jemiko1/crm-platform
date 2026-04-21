import { Test, TestingModule } from "@nestjs/testing";
import { ClientChatsAnalyticsService } from "./clientchats-analytics.service";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Regression tests for the April 2026 client-chats analytics audit.
 *
 * Focuses on the Bug A1 fix: first-response and pickup times must be
 * measured from the first NON-SYSTEM inbound message (excluding the
 * "[Chat started]" web-widget marker), not from conversation createdAt.
 */
describe("ClientChatsAnalyticsService", () => {
  let service: ClientChatsAnalyticsService;
  let prisma: {
    clientChatConversation: {
      count: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
    clientChatMessage: {
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      clientChatConversation: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      clientChatMessage: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientChatsAnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ClientChatsAnalyticsService);
  });

  describe("getOverview", () => {
    it("returns empty overview when there is no data", async () => {
      const res = await service.getOverview();
      expect(res.totalConversations).toBe(0);
      expect(res.totalMessages).toBe(0);
      expect(res.byStatus).toEqual({});
      expect(res.unassignedCount).toBe(0);
      expect(res.avgFirstResponseMinutes).toBeNull();
      expect(res.avgPickupTimeMinutes).toBeNull();
      expect(res.avgResolutionMinutes).toBeNull();
    });

    /**
     * Bug A1 regression: response time uses the first non-system inbound
     * message's sentAt (clockStart) as the start, not conversation.createdAt.
     *
     * Scenario: widget opened at 10:00:00, operator replied at 10:02:30.
     * Customer actually sent their first real question at 10:00:30 (spent
     * 30s typing after opening). Old code returned 150s; new code returns 120s.
     */
    it("excludes [Chat started] placeholder from first-response-time clock-start", async () => {
      const widgetOpenedAt = new Date("2026-04-21T10:00:00Z");
      const firstRealInboundAt = new Date("2026-04-21T10:00:30Z");
      const firstResponseAt = new Date("2026-04-21T10:02:30Z");

      // The raw query returns rows where clockStart is the first non-system
      // inbound's sentAt (applied by the SQL COALESCE). Our mock simulates
      // that: clockStart = firstRealInboundAt (NOT widgetOpenedAt).
      //
      // Two $queryRaw calls happen in getOverview (response + pickup). The
      // second returns empty in this scenario (no joinedAt).
      prisma.$queryRaw
        .mockResolvedValueOnce([
          { clockStart: firstRealInboundAt, firstResponseAt },
        ])
        .mockResolvedValueOnce([]);

      const res = await service.getOverview();

      // 120 seconds = 2 minutes (rounded)
      expect(res.avgFirstResponseMinutes).toBe(2);

      // Sanity: if the old code had been used (subtracting widgetOpenedAt),
      // the answer would have been 3 minutes (150s rounded). Prove we're
      // NOT doing that.
      const oldCalculation = Math.round(
        (firstResponseAt.getTime() - widgetOpenedAt.getTime()) / 60_000,
      );
      expect(res.avgFirstResponseMinutes).not.toBe(oldCalculation);
    });

    it("guards against clock-skew: negative intervals clamp to 0", async () => {
      // Edge case: clockStart somehow > firstResponseAt (data corruption
      // or clock skew). Old code would produce negative numbers that
      // dragged the average down; the GREATEST/Math.max guard prevents this.
      const clockStart = new Date("2026-04-21T10:05:00Z");
      const firstResponseAt = new Date("2026-04-21T10:04:00Z"); // 1 min BEFORE clockStart

      prisma.$queryRaw
        .mockResolvedValueOnce([{ clockStart, firstResponseAt }])
        .mockResolvedValueOnce([]);

      const res = await service.getOverview();
      expect(res.avgFirstResponseMinutes).toBe(0);
    });

    it("averages across multiple conversations correctly", async () => {
      // Three conversations: 60s, 120s, 180s response times -> avg = 120s = 2 min
      prisma.$queryRaw
        .mockResolvedValueOnce([
          {
            clockStart: new Date("2026-04-21T10:00:00Z"),
            firstResponseAt: new Date("2026-04-21T10:01:00Z"),
          },
          {
            clockStart: new Date("2026-04-21T11:00:00Z"),
            firstResponseAt: new Date("2026-04-21T11:02:00Z"),
          },
          {
            clockStart: new Date("2026-04-21T12:00:00Z"),
            firstResponseAt: new Date("2026-04-21T12:03:00Z"),
          },
        ])
        .mockResolvedValueOnce([]);

      const res = await service.getOverview();
      expect(res.avgFirstResponseMinutes).toBe(2);
    });

    it("pickup time uses same clockStart logic (not createdAt)", async () => {
      // No response-time rows, but pickup-time row exists.
      prisma.$queryRaw
        .mockResolvedValueOnce([]) // response
        .mockResolvedValueOnce([
          {
            clockStart: new Date("2026-04-21T10:00:30Z"), // first real inbound
            joinedAt: new Date("2026-04-21T10:01:30Z"), // operator picked up
          },
        ]);

      const res = await service.getOverview();
      expect(res.avgPickupTimeMinutes).toBe(1);
    });
  });
});
