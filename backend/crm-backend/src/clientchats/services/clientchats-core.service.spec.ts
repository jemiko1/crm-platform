import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { ClientChatsCoreService } from "./clientchats-core.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AdapterRegistryService } from "../adapters/adapter-registry.service";
import { ClientChatsMatchingService } from "./clientchats-matching.service";
import { ClientChatsEventService } from "./clientchats-event.service";

describe("ClientChatsCoreService", () => {
  let service: ClientChatsCoreService;
  let prisma: { clientChatConversation: { findUnique: jest.Mock; update: jest.Mock } };
  let events: { emitConversationUpdated: jest.Mock };

  beforeEach(async () => {
    prisma = {
      clientChatConversation: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    events = { emitConversationUpdated: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientChatsCoreService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdapterRegistryService, useValue: {} },
        { provide: ClientChatsMatchingService, useValue: { autoMatch: jest.fn() } },
        { provide: ClientChatsEventService, useValue: events },
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
});
