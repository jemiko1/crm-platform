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
      updateMany: jest.Mock;
      findUnique: jest.Mock;
    };
    $transaction: jest.Mock;
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
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      // Default: run the callback against the same mocked prisma. Tests
      // that want to simulate a race can override this to return count=0
      // or throw mid-transaction.
      $transaction: jest.fn(async (arg: any) => {
        if (typeof arg === "function") return arg(prisma);
        return arg;
      }),
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

      // Warn called because length === take (backlog saturated). Log
      // message was renamed from "Escalation backlog" to "First-response
      // backlog" in April 2026 to distinguish from the new post-reply scan.
      const saturationWarns = warnSpy.mock.calls.filter((c) =>
        String(c[0] ?? "").includes("First-response backlog saturated"),
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

  // Q1 decision B regression: after the operator has sent their first
  // reply, each subsequent unanswered customer message starts a silence
  // clock. The post-reply scan fires warn/unassign based on the gap
  // between latest customer IN and latest operator OUT.
  describe("scanPostReplySilence (April 2026 audit Q1 decision B)", () => {
    function withConfig(overrides: Partial<Record<string, number | boolean>> = {}) {
      prisma.clientChatEscalationConfig.findFirst.mockResolvedValue({
        id: "cfg-1",
        firstResponseTimeoutMins: 5,
        reassignAfterMins: 10,
        postReplyTimeoutMins: 10,
        postReplyReassignAfterMins: 20,
        notifyManagerOnEscalation: true,
        ...overrides,
      });
    }

    it("fires POST_REPLY_TIMEOUT_WARNING when customer's latest IN is older than threshold and newer than latest OUT", async () => {
      withConfig();
      const now = Date.now();

      // First scan (no-first-reply) returns empty.
      // Second scan (post-reply) returns one candidate.
      prisma.clientChatConversation.findMany
        .mockResolvedValueOnce([]) // scanFirstResponseTimeouts
        .mockResolvedValueOnce([
          {
            id: "conv-post-1",
            assignedUserId: "op-1",
            channelType: "TELEGRAM",
            messages: [
              // Customer messaged 12 min ago (> 10 min threshold).
              { direction: "IN", sentAt: new Date(now - 12 * 60_000) },
              // Operator's last reply was 20 min ago (older than customer).
              { direction: "OUT", sentAt: new Date(now - 20 * 60_000) },
            ],
          },
        ]);

      await service.checkEscalations();

      // Warn event created, not unassign (12 min < 20 min reassign threshold).
      const createCalls = prisma.clientChatEscalationEvent.create.mock.calls;
      const warnCreate = createCalls.find(
        (c: any) => c[0]?.data?.type === "POST_REPLY_TIMEOUT_WARNING",
      );
      expect(warnCreate).toBeDefined();
      expect(warnCreate[0].data.conversationId).toBe("conv-post-1");
      expect(warnCreate[0].data.fromUserId).toBe("op-1");

      // Socket event emitted to managers.
      expect(events.emitToManagers).toHaveBeenCalledWith(
        "escalation:warning",
        expect.objectContaining({
          conversationId: "conv-post-1",
          type: "POST_REPLY_TIMEOUT_WARNING",
        }),
      );
    });

    it("fires POST_REPLY_AUTO_UNASSIGN when customer's latest IN is older than reassign threshold", async () => {
      withConfig();
      const now = Date.now();

      prisma.clientChatConversation.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "conv-post-2",
            assignedUserId: "op-2",
            channelType: "WHATSAPP",
            messages: [
              // 25 min ago (>= 20 min reassign threshold).
              { direction: "IN", sentAt: new Date(now - 25 * 60_000) },
              { direction: "OUT", sentAt: new Date(now - 40 * 60_000) },
            ],
          },
        ]);
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: "conv-post-2",
        assignedUserId: null,
      });

      await service.checkEscalations();

      // Unassign + log POST_REPLY_AUTO_UNASSIGN. The handler uses a
      // stale-guarded updateMany inside a $transaction (race-safe), so we
      // assert on updateMany rather than update.
      expect(prisma.clientChatConversation.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "conv-post-2",
            assignedUserId: "op-2",
          }),
          data: expect.objectContaining({ assignedUserId: null }),
        }),
      );
      const createCalls = prisma.clientChatEscalationEvent.create.mock.calls;
      const unassignCreate = createCalls.find(
        (c: any) => c[0]?.data?.type === "POST_REPLY_AUTO_UNASSIGN",
      );
      expect(unassignCreate).toBeDefined();
    });

    it("does NOT fire when operator's latest OUT is newer than customer's latest IN", async () => {
      withConfig();
      const now = Date.now();

      prisma.clientChatConversation.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "conv-post-3",
            assignedUserId: "op-3",
            channelType: "VIBER",
            messages: [
              // Operator replied 2 min ago — current.
              { direction: "OUT", sentAt: new Date(now - 2 * 60_000) },
              // Customer's message from 15 min ago is already answered.
              { direction: "IN", sentAt: new Date(now - 15 * 60_000) },
            ],
          },
        ]);

      await service.checkEscalations();

      const postReplyEvents = prisma.clientChatEscalationEvent.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.type === "POST_REPLY_TIMEOUT_WARNING" ||
          c[0]?.data?.type === "POST_REPLY_AUTO_UNASSIGN",
      );
      expect(postReplyEvents).toHaveLength(0);
    });

    it("skips scan entirely when postReplyTimeoutMins === 0 (disabled)", async () => {
      withConfig({ postReplyTimeoutMins: 0 });
      const now = Date.now();

      // First scan empty. Second scan SHOULD NOT happen at all.
      prisma.clientChatConversation.findMany.mockResolvedValueOnce([]);

      await service.checkEscalations();

      // Only ONE findMany call (for first-response scan); post-reply scan skipped.
      expect(prisma.clientChatConversation.findMany).toHaveBeenCalledTimes(1);

      // Silence unused-var linter
      expect(now).toBeGreaterThan(0);
    });

    it("dedupes repeated warnings within 5 minutes", async () => {
      withConfig();
      const now = Date.now();

      prisma.clientChatConversation.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "conv-post-4",
            assignedUserId: "op-4",
            channelType: "TELEGRAM",
            messages: [
              { direction: "IN", sentAt: new Date(now - 12 * 60_000) },
              { direction: "OUT", sentAt: new Date(now - 20 * 60_000) },
            ],
          },
        ]);
      // Recent warning exists.
      prisma.clientChatEscalationEvent.findFirst.mockResolvedValue({
        id: "prev-warn",
        type: "POST_REPLY_TIMEOUT_WARNING",
      });

      await service.checkEscalations();

      const warnCreates = prisma.clientChatEscalationEvent.create.mock.calls.filter(
        (c: any) => c[0]?.data?.type === "POST_REPLY_TIMEOUT_WARNING",
      );
      expect(warnCreates).toHaveLength(0);
    });
  });

  describe("updateConfig validation", () => {
    beforeEach(() => {
      prisma.clientChatEscalationConfig.findFirst.mockResolvedValue({
        id: "cfg-1",
        firstResponseTimeoutMins: 5,
        reassignAfterMins: 10,
        postReplyTimeoutMins: 10,
        postReplyReassignAfterMins: 20,
        notifyManagerOnEscalation: true,
      });
      prisma.clientChatEscalationConfig.update.mockResolvedValue({ id: "cfg-1" });
    });

    it("rejects negative threshold", async () => {
      await expect(
        service.updateConfig({ firstResponseTimeoutMins: -1 }),
      ).rejects.toThrow(/non-negative/);
    });

    it("rejects non-integer", async () => {
      await expect(
        service.updateConfig({ postReplyTimeoutMins: 5.5 }),
      ).rejects.toThrow(/non-negative integer/);
    });

    it("rejects > 1440 (24h) to prevent accidental disable", async () => {
      await expect(
        service.updateConfig({ reassignAfterMins: 2000 }),
      ).rejects.toThrow(/<= 1440/);
    });

    it("rejects reassign < warn (nonsensical ordering)", async () => {
      await expect(
        service.updateConfig({
          firstResponseTimeoutMins: 10,
          reassignAfterMins: 5,
        }),
      ).rejects.toThrow(/must be >= firstResponseTimeoutMins/);
    });

    it("rejects postReplyReassign < postReplyWarn", async () => {
      await expect(
        service.updateConfig({
          postReplyTimeoutMins: 15,
          postReplyReassignAfterMins: 10,
        }),
      ).rejects.toThrow(/must be >= postReplyTimeoutMins/);
    });

    it("accepts 0 as disable signal", async () => {
      await expect(
        service.updateConfig({ postReplyTimeoutMins: 0 }),
      ).resolves.toBeDefined();
    });

    it("accepts valid thresholds", async () => {
      await expect(
        service.updateConfig({
          firstResponseTimeoutMins: 5,
          reassignAfterMins: 10,
          postReplyTimeoutMins: 10,
          postReplyReassignAfterMins: 30,
        }),
      ).resolves.toBeDefined();
    });
  });

  // Code-reviewer findings (PR #276, April 2026):
  //   #1 race: operator replies between scan findMany and handler update.
  //     The handler's updateMany is predicated on assignedUserId + lastMessageAt
  //     matching the scan snapshot, so it returns count=0 when the state
  //     moved forward. Verify we bail cleanly (no event created, no
  //     socket emission) in that case.
  //   #3 dedup scoping: if the conversation changes hands between scan
  //     runs, the new operator should NOT be suppressed by the previous
  //     operator's recent event. Dedup query now includes fromUserId.
  describe("concurrency safeguards (code-reviewer PR #276)", () => {
    function setupReassignScenario(opts: {
      firstOrPost: "first" | "post";
      assignedUserId?: string;
    }) {
      const now = Date.now();
      prisma.clientChatEscalationConfig.findFirst.mockResolvedValue({
        id: "cfg-1",
        firstResponseTimeoutMins: 5,
        reassignAfterMins: 10,
        postReplyTimeoutMins: 10,
        postReplyReassignAfterMins: 20,
        notifyManagerOnEscalation: true,
      });

      const convFirst = {
        id: "conv-race-1",
        assignedUserId: opts.assignedUserId ?? "op-A",
        channelType: "TELEGRAM",
        lastMessageAt: new Date(now - 15 * 60_000),
        messages: [{ direction: "IN", sentAt: new Date(now - 15 * 60_000) }],
      };
      const convPost = {
        id: "conv-race-2",
        assignedUserId: opts.assignedUserId ?? "op-B",
        channelType: "WHATSAPP",
        lastMessageAt: new Date(now - 25 * 60_000),
        messages: [
          { direction: "IN", sentAt: new Date(now - 25 * 60_000) },
          { direction: "OUT", sentAt: new Date(now - 40 * 60_000) },
        ],
      };

      if (opts.firstOrPost === "first") {
        prisma.clientChatConversation.findMany
          .mockResolvedValueOnce([convFirst])
          .mockResolvedValueOnce([]);
      } else {
        prisma.clientChatConversation.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([convPost]);
      }
    }

    it("first-response handler bails when operator replied mid-scan (count=0)", async () => {
      setupReassignScenario({ firstOrPost: "first" });
      // Simulate the race: update sees count=0 because lastMessageAt moved.
      prisma.clientChatConversation.updateMany.mockResolvedValue({ count: 0 });

      await service.checkEscalations();

      // Event must NOT be created if update didn't match.
      const unassignCreates = prisma.clientChatEscalationEvent.create.mock.calls.filter(
        (c: any) => c[0]?.data?.type === "AUTO_UNASSIGN",
      );
      expect(unassignCreates).toHaveLength(0);

      // Socket emit must NOT fire.
      const reassignEmits = events.emitToManagers.mock.calls.filter(
        (c: any) => c[0] === "escalation:reassign",
      );
      expect(reassignEmits).toHaveLength(0);
    });

    it("post-reply handler bails when operator replied mid-scan (count=0)", async () => {
      setupReassignScenario({ firstOrPost: "post" });
      prisma.clientChatConversation.updateMany.mockResolvedValue({ count: 0 });

      await service.checkEscalations();

      const unassignCreates = prisma.clientChatEscalationEvent.create.mock.calls.filter(
        (c: any) => c[0]?.data?.type === "POST_REPLY_AUTO_UNASSIGN",
      );
      expect(unassignCreates).toHaveLength(0);
    });

    it("first-response dedup is scoped to current operator (different op => new event)", async () => {
      const now = Date.now();
      prisma.clientChatEscalationConfig.findFirst.mockResolvedValue({
        id: "cfg-1",
        firstResponseTimeoutMins: 5,
        reassignAfterMins: 10,
        postReplyTimeoutMins: 10,
        postReplyReassignAfterMins: 20,
        notifyManagerOnEscalation: true,
      });
      // Scan returns a conversation currently assigned to op-B.
      prisma.clientChatConversation.findMany
        .mockResolvedValueOnce([
          {
            id: "conv-1",
            assignedUserId: "op-B",
            channelType: "TELEGRAM",
            lastMessageAt: new Date(now - 7 * 60_000),
            messages: [{ direction: "IN", sentAt: new Date(now - 7 * 60_000) }],
          },
        ])
        .mockResolvedValueOnce([]);

      // findFirst is called both for dedup and NO record is found with
      // fromUserId: 'op-B' → the handler proceeds.
      prisma.clientChatEscalationEvent.findFirst.mockImplementation(
        async (args: any) => {
          // If the query includes fromUserId === 'op-B' dedup misses;
          // only suppress if fromUserId matches the old operator.
          if (args?.where?.fromUserId === "op-B") return null;
          return { id: "old-warning-op-A" };
        },
      );

      await service.checkEscalations();

      // Warning event should be created for op-B despite op-A's old one.
      const warns = prisma.clientChatEscalationEvent.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.type === "TIMEOUT_WARNING" &&
          c[0]?.data?.fromUserId === "op-B",
      );
      expect(warns).toHaveLength(1);
    });

    it("post-reply dedup is scoped to current operator", async () => {
      const now = Date.now();
      prisma.clientChatEscalationConfig.findFirst.mockResolvedValue({
        id: "cfg-1",
        firstResponseTimeoutMins: 5,
        reassignAfterMins: 10,
        postReplyTimeoutMins: 10,
        postReplyReassignAfterMins: 20,
        notifyManagerOnEscalation: true,
      });
      prisma.clientChatConversation.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            id: "conv-2",
            assignedUserId: "op-D",
            channelType: "VIBER",
            lastMessageAt: new Date(now - 12 * 60_000),
            messages: [
              { direction: "IN", sentAt: new Date(now - 12 * 60_000) },
              { direction: "OUT", sentAt: new Date(now - 20 * 60_000) },
            ],
          },
        ]);
      prisma.clientChatEscalationEvent.findFirst.mockImplementation(
        async (args: any) => {
          if (args?.where?.fromUserId === "op-D") return null;
          return { id: "old-warning-op-C" };
        },
      );

      await service.checkEscalations();

      const postWarns = prisma.clientChatEscalationEvent.create.mock.calls.filter(
        (c: any) =>
          c[0]?.data?.type === "POST_REPLY_TIMEOUT_WARNING" &&
          c[0]?.data?.fromUserId === "op-D",
      );
      expect(postWarns).toHaveLength(1);
    });
  });
});
