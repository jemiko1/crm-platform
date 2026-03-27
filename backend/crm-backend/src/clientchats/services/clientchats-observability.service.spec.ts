import { Test, TestingModule } from "@nestjs/testing";
import { ClientChatsObservabilityService } from "./clientchats-observability.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AdapterRegistryService } from "../adapters/adapter-registry.service";
import { ClientChatChannelType } from "@prisma/client";

describe("ClientChatsObservabilityService", () => {
  let service: ClientChatsObservabilityService;
  let prisma: {
    clientChatChannelAccount: { findMany: jest.Mock };
    clientChatConversation: { groupBy: jest.Mock };
    clientChatWebhookFailure: { findMany: jest.Mock };
  };
  let registry: { listChannelTypes: jest.Mock };

  beforeEach(async () => {
    prisma = {
      clientChatChannelAccount: { findMany: jest.fn().mockResolvedValue([]) },
      clientChatConversation: { groupBy: jest.fn().mockResolvedValue([]) },
      clientChatWebhookFailure: { findMany: jest.fn().mockResolvedValue([]) },
    };
    registry = {
      listChannelTypes: jest.fn().mockReturnValue([ClientChatChannelType.VIBER]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClientChatsObservabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: AdapterRegistryService, useValue: registry },
      ],
    }).compile();
    service = module.get(ClientChatsObservabilityService);
  });

  describe("getStatus", () => {
    it("should return adapters and counts", async () => {
      const res = await service.getStatus();
      expect(res.registeredAdapters).toContain(ClientChatChannelType.VIBER);
      expect(res.activeAccounts).toEqual([]);
    });
  });
});
