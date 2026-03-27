import { Test, TestingModule } from "@nestjs/testing";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("WhatsAppWebhookService", () => {
  let service: WhatsAppWebhookService;
  let prisma: { clientChatChannelAccount: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { clientChatChannelAccount: { findFirst: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppWebhookService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WhatsAppWebhookService);
  });

  describe("getToken", () => {
    it("should return empty when no account and env unset", async () => {
      prisma.clientChatChannelAccount.findFirst.mockResolvedValue(null);
      const prev = process.env.WA_ACCESS_TOKEN;
      delete process.env.WA_ACCESS_TOKEN;
      await expect(service.getToken()).resolves.toBe("");
      process.env.WA_ACCESS_TOKEN = prev;
    });
  });
});
