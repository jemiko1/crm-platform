import { Test, TestingModule } from "@nestjs/testing";
import { FacebookWebhookService } from "./facebook-webhook.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("FacebookWebhookService", () => {
  let service: FacebookWebhookService;
  let prisma: { clientChatChannelAccount: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { clientChatChannelAccount: { findFirst: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [FacebookWebhookService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(FacebookWebhookService);
  });

  describe("getToken", () => {
    it("should return empty string when no active account and env unset", async () => {
      prisma.clientChatChannelAccount.findFirst.mockResolvedValue(null);
      const prev = process.env.FB_PAGE_ACCESS_TOKEN;
      delete process.env.FB_PAGE_ACCESS_TOKEN;
      await expect(service.getToken()).resolves.toBe("");
      process.env.FB_PAGE_ACCESS_TOKEN = prev;
    });
  });
});
