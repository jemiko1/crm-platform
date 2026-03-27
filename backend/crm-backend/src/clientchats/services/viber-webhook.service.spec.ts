import { Test, TestingModule } from "@nestjs/testing";
import { ViberWebhookService } from "./viber-webhook.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("ViberWebhookService", () => {
  let service: ViberWebhookService;
  let prisma: { clientChatChannelAccount: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { clientChatChannelAccount: { findFirst: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ViberWebhookService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ViberWebhookService);
  });

  describe("getToken", () => {
    it("should return env token when account missing", async () => {
      prisma.clientChatChannelAccount.findFirst.mockResolvedValue(null);
      const prev = process.env.VIBER_BOT_TOKEN;
      process.env.VIBER_BOT_TOKEN = "test-token";
      await expect(service.getToken()).resolves.toBe("test-token");
      process.env.VIBER_BOT_TOKEN = prev;
    });
  });
});
