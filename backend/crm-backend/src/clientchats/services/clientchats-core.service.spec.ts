import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ClientChatsCoreService } from "./clientchats-core.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AdapterRegistryService } from "../adapters/adapter-registry.service";
import { ClientChatsMatchingService } from "./clientchats-matching.service";
import { ClientChatsEventService } from "./clientchats-event.service";
import { AssignmentService } from "./assignment.service";

// Minimal Prisma.PrismaClientKnownRequestError shim for tests. The real class
// takes a complex constructor signature; we just need `code` to drive the
// retry branches in upsertConversation.
class FakePrismaError extends Error {
  code: string;
  meta?: Record<string, unknown>;
  constructor(code: string, message = code, meta?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.meta = meta;
  }
}

describe("ClientChatsCoreService", () => {
  let service: ClientChatsCoreService;
  let prisma: {
    clientChatConversation: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let events: { emitConversationUpdated: jest.Mock };
  let assignment: { isInTodayQueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      clientChatConversation: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      // Default: run the callback immediately against the same prisma mock
      // so tests can control the underlying mocks. Individual tests override
      // this to simulate serialization / uniqueness failures and retries.
      $transaction: jest.fn(async (arg: any) => {
        if (typeof arg === "function") return arg(prisma);
        return arg;
      }),
    };
    events = { emitConversationUpdated: jest.fn() };
    assignment = { isInTodayQueue: jest.fn().mockResolvedValue(false) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientChatsCoreService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdapterRegistryService, useValue: {} },
        { provide: ClientChatsMatchingService, useValue: { autoMatch: jest.fn() } },
        { provide: ClientChatsEventService, useValue: events },
        { provide: AssignmentService, useValue: assignment },
      ],
    }).compile();
    service = module.get(ClientChatsCoreService);
  });

  describe("assignConversation", () => {
    it("should throw NotFoundException when conversation id is invalid", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue(null);
      await expect(service.assignConversation("bad", "u1")).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should update assignment when conversation exists", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: "c1",
        assignedUserId: null,
      });
      prisma.clientChatConversation.update.mockResolvedValue({
        id: "c1",
        assignedUserId: "u1",
      });
      const res = await service.assignConversation("c1", "u1");
      expect(res.assignedUserId).toBe("u1");
      expect(events.emitConversationUpdated).toHaveBeenCalled();
    });
  });

  describe("assertCanAccessConversation", () => {
    // Matrix of {viewer scope, conversation state} → expected outcome.
    // Keeps all the rules of operator access captured in one place so the
    // guard can't drift without a corresponding test failure.

    it("throws Forbidden when operator A reads operator B's assigned conversation", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        assignedUserId: "operator-B",
        status: "LIVE",
      });
      await expect(
        service.assertCanAccessConversation("c1", "operator-A", false),
      ).rejects.toThrow(ForbiddenException);
      expect(assignment.isInTodayQueue).toHaveBeenCalledWith("operator-A");
    });

    it("allows queue-member operator to read an unassigned LIVE conversation", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        assignedUserId: null,
        status: "LIVE",
      });
      assignment.isInTodayQueue.mockResolvedValue(true);
      await expect(
        service.assertCanAccessConversation("c1", "operator-A", false),
      ).resolves.toBeUndefined();
    });

    it("throws Forbidden when non-queue operator tries unassigned LIVE conversation", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        assignedUserId: null,
        status: "LIVE",
      });
      assignment.isInTodayQueue.mockResolvedValue(false);
      await expect(
        service.assertCanAccessConversation("c1", "operator-A", false),
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows operator to read their own assigned conversation", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        assignedUserId: "operator-A",
        status: "LIVE",
      });
      await expect(
        service.assertCanAccessConversation("c1", "operator-A", false),
      ).resolves.toBeUndefined();
      // Short-circuit: no need to check queue membership when operator owns it.
      expect(assignment.isInTodayQueue).not.toHaveBeenCalled();
    });

    it("allows manager to read any conversation without DB lookup on queue", async () => {
      // Manager bypass is load-bearing for admin/oversight UIs; verify the
      // guard returns immediately without touching Prisma or queue service.
      await expect(
        service.assertCanAccessConversation("any-id", "manager-U", true),
      ).resolves.toBeUndefined();
      expect(prisma.clientChatConversation.findUnique).not.toHaveBeenCalled();
      expect(assignment.isInTodayQueue).not.toHaveBeenCalled();
    });

    it("allows superadmin (isManager=true) to read any conversation", async () => {
      // Callers pass isSuperAdmin || has-manage-perm as isManager=true.
      await expect(
        service.assertCanAccessConversation("any-id", "superadmin", true),
      ).resolves.toBeUndefined();
      expect(prisma.clientChatConversation.findUnique).not.toHaveBeenCalled();
    });

    it("throws NotFoundException (not Forbidden) for non-existent id", async () => {
      // Kept separate from Forbidden so an attacker can't use the response to
      // enumerate conversation IDs — if we merged them, Forbidden would leak
      // "this UUID belongs to someone" vs "this UUID doesn't exist at all."
      prisma.clientChatConversation.findUnique.mockResolvedValue(null);
      await expect(
        service.assertCanAccessConversation("ghost", "operator-A", false),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws Forbidden when queue operator tries to read CLOSED unassigned conversation", async () => {
      // Queue membership only unlocks LIVE + unassigned; closed chats belong
      // to their original operator (or no one) and must not leak broadly.
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        assignedUserId: null,
        status: "CLOSED",
      });
      assignment.isInTodayQueue.mockResolvedValue(true);
      await expect(
        service.assertCanAccessConversation("c1", "operator-A", false),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe("upsertConversation (P1-5 closed-conversation archival race)", () => {
    // These tests protect the transactional guarantee added in fix/audit/P1-5.
    // The old implementation did findUnique + update + create with no isolation
    // and could lose a customer message when two inbound webhooks for the same
    // CLOSED conversation ran concurrently (one would P2002 on the unique
    // externalConversationId during CREATE). The fix wraps the flow in a
    // Serializable $transaction and retries P2002/P2034 up to 3 times.

    it("creates new conversation inside a Serializable transaction when none exists", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue(null);
      prisma.clientChatConversation.create.mockResolvedValue({ id: "new-1" });

      const res = await service.upsertConversation(
        "VIBER" as any,
        "acc-1",
        "ext-1",
        "p-1",
      );

      expect(res).toEqual({ conversation: { id: "new-1" }, isNew: true });
      // Verify the transaction wrapper was used with Serializable isolation.
      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: "Serializable" }),
      );
      // No update event for a fresh conversation (it's new, isNew=true path).
      expect(events.emitConversationUpdated).not.toHaveBeenCalled();
    });

    it("updates lastMessageAt for a LIVE existing conversation and emits after commit", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: "c-live",
        status: "LIVE",
        participantId: "p-existing",
      });
      prisma.clientChatConversation.update.mockResolvedValue({
        id: "c-live",
        status: "LIVE",
        lastMessageAt: new Date(),
      });

      const res = await service.upsertConversation(
        "VIBER" as any,
        "acc-1",
        "ext-1",
        "p-1",
      );

      expect(res.isNew).toBe(false);
      expect(res.conversation.id).toBe("c-live");
      // emitConversationUpdated fires AFTER the transaction callback resolves —
      // never from inside the tx, so subscribers don't see rolled-back state.
      expect(events.emitConversationUpdated).toHaveBeenCalledTimes(1);
      expect(prisma.clientChatConversation.create).not.toHaveBeenCalled();
    });

    it("archives CLOSED conversation and creates fresh thread in one transaction", async () => {
      prisma.clientChatConversation.findUnique.mockResolvedValue({
        id: "c-closed",
        status: "CLOSED",
        clientId: "client-42",
      });
      prisma.clientChatConversation.update.mockResolvedValue({
        id: "c-closed",
        externalConversationId: "ext-1__archived_123_c-closed",
      });
      prisma.clientChatConversation.create.mockResolvedValue({
        id: "c-new",
        previousConversationId: "c-closed",
      });

      const res = await service.upsertConversation(
        "VIBER" as any,
        "acc-1",
        "ext-1",
        "p-1",
      );

      expect(res.isNew).toBe(true);
      expect(res.conversation.id).toBe("c-new");
      // Archive UPDATE + CREATE both ran under the same $transaction call.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.clientChatConversation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalConversationId: expect.stringMatching(
              /^ext-1__archived_\d+_c-closed$/,
            ),
          }),
        }),
      );
      // Created thread inherits the original externalConversationId and clientId.
      expect(prisma.clientChatConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            externalConversationId: "ext-1",
            clientId: "client-42",
            previousConversationId: "c-closed",
          }),
        }),
      );
      // No UPDATE event for new threads (isNew=true path doesn't emit).
      expect(events.emitConversationUpdated).not.toHaveBeenCalled();
    });

    it("retries on P2002 from the first attempt (concurrent archival race)", async () => {
      // Simulate: first $transaction call throws P2002 (a racing caller
      // already created the thread), second attempt succeeds.
      let attempt = 0;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        attempt += 1;
        if (attempt === 1) {
          throw new FakePrismaError("P2002", "Unique constraint failed", {
            target: ["externalConversationId"],
          });
        }
        // Second attempt: simulate the racing caller's thread is now visible.
        prisma.clientChatConversation.findUnique.mockResolvedValue({
          id: "c-live",
          status: "LIVE",
          participantId: "p-1",
        });
        prisma.clientChatConversation.update.mockResolvedValue({
          id: "c-live",
          status: "LIVE",
        });
        return fn(prisma);
      });

      const res = await service.upsertConversation(
        "VIBER" as any,
        "acc-1",
        "ext-1",
        "p-1",
      );

      expect(attempt).toBe(2);
      expect(res.conversation.id).toBe("c-live");
      expect(res.isNew).toBe(false);
    });

    it("retries on P2034 serialization failure and succeeds on retry", async () => {
      let attempt = 0;
      prisma.$transaction.mockImplementation(async (fn: any) => {
        attempt += 1;
        if (attempt === 1) {
          throw new FakePrismaError("P2034", "Serialization failure");
        }
        prisma.clientChatConversation.findUnique.mockResolvedValue(null);
        prisma.clientChatConversation.create.mockResolvedValue({
          id: "c-new",
        });
        return fn(prisma);
      });

      const res = await service.upsertConversation(
        "VIBER" as any,
        "acc-1",
        "ext-1",
        "p-1",
      );

      expect(attempt).toBe(2);
      expect(res.conversation.id).toBe("c-new");
      expect(res.isNew).toBe(true);
    });

    it("rethrows the last error when all 3 retries exhaust", async () => {
      const err = new FakePrismaError("P2002", "Unique constraint failed");
      prisma.$transaction.mockRejectedValue(err);

      await expect(
        service.upsertConversation("VIBER" as any, "acc-1", "ext-1", "p-1"),
      ).rejects.toBe(err);

      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    });

    it("does NOT retry on unrelated errors (propagates immediately)", async () => {
      const err = new FakePrismaError("P2025", "Record not found");
      prisma.$transaction.mockRejectedValue(err);

      await expect(
        service.upsertConversation("VIBER" as any, "acc-1", "ext-1", "p-1"),
      ).rejects.toBe(err);

      // Single call — no retry for non-concurrency errors.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
