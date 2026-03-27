import { Test, TestingModule } from "@nestjs/testing";
import { TelegramWebhookService } from "./telegram-webhook.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("TelegramWebhookService", () => {
  let service: TelegramWebhookService;
  let prisma: { clientChatChannelAccount: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { clientChatChannelAccount: { findFirst: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TelegramWebhookService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TelegramWebhookService);
  });

  describe("getToken", () => {
    it("should return empty string when no account metadata token", async () => {
      prisma.clientChatChannelAccount.findFirst.mockResolvedValue(null);
      const prev = process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_BOT_TOKEN;
      const tok = await service.getToken();
      expect(tok).toBe("");
      process.env.TELEGRAM_BOT_TOKEN = prev;
    });
  });
});
