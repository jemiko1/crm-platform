import { Test, TestingModule } from "@nestjs/testing";
import { ClientChatsAnalyticsService } from "./clientchats-analytics.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ClientChatsAnalyticsService", () => {
  let service: ClientChatsAnalyticsService;
  let prisma: {
    clientChatConversation: {
      count: jest.Mock;
      groupBy: jest.Mock;
      findMany: jest.Mock;
    };
    clientChatMessage: { count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      clientChatConversation: {
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      clientChatMessage: { count: jest.fn().mockResolvedValue(0) },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientChatsAnalyticsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ClientChatsAnalyticsService);
  });

  describe("getOverview", () => {
    it("should return overview object with conversation and message totals", async () => {
      const res = await service.getOverview();
      expect(res.totalConversations).toBe(0);
      expect(res.totalMessages).toBe(0);
      expect(res.byStatus).toEqual({});
      expect(res.unassignedCount).toBe(0);
    });
  });
});
