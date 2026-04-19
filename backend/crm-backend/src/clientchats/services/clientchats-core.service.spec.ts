import { Test, TestingModule } from "@nestjs/testing";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { ClientChatsCoreService } from "./clientchats-core.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AdapterRegistryService } from "../adapters/adapter-registry.service";
import { ClientChatsMatchingService } from "./clientchats-matching.service";
import { ClientChatsEventService } from "./clientchats-event.service";
import { AssignmentService } from "./assignment.service";

describe("ClientChatsCoreService", () => {
  let service: ClientChatsCoreService;
  let prisma: { clientChatConversation: { findUnique: jest.Mock; update: jest.Mock } };
  let events: { emitConversationUpdated: jest.Mock };
  let assignment: { isInTodayQueue: jest.Mock };

  beforeEach(async () => {
    prisma = {
      clientChatConversation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
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
});
