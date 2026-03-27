import { Test, TestingModule } from "@nestjs/testing";
import { TelegramPollingService } from "./telegram-polling.service";
import { ClientChatsCoreService } from "./clientchats-core.service";
import { TelegramAdapter } from "../adapters/telegram.adapter";
import { TelegramWebhookService } from "./telegram-webhook.service";

describe("TelegramPollingService", () => {
  let service: TelegramPollingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramPollingService,
        { provide: ClientChatsCoreService, useValue: {} },
        { provide: TelegramAdapter, useValue: {} },
        {
          provide: TelegramWebhookService,
          useValue: {
            getToken: jest.fn().mockResolvedValue(""),
            getWebhookInfo: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(TelegramPollingService);
  });

  describe("onModuleDestroy", () => {
    it("should clear interval without throwing", () => {
      expect(() => service.onModuleDestroy()).not.toThrow();
    });
  });
});
