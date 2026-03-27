import { Test, TestingModule } from "@nestjs/testing";
import { SmsConfigService } from "./sms-config.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationLogService } from "./notification-log.service";
import { SmsSenderService } from "./sms.service";

describe("SmsConfigService", () => {
  let service: SmsConfigService;
  let prisma: {
    smsConfig: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      smsConfig: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SmsConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationLogService, useValue: { create: jest.fn() } },
        { provide: SmsSenderService, useValue: {} },
      ],
    }).compile();
    service = module.get(SmsConfigService);
  });

  describe("getConfig", () => {
    it("should create config when missing", async () => {
      const created = { id: "s1" };
      prisma.smsConfig.findFirst.mockResolvedValue(null);
      prisma.smsConfig.create.mockResolvedValue(created);
      await expect(service.getConfig()).resolves.toEqual(created);
    });
  });

  describe("getConfigMasked", () => {
    it("should mask apiKey when set", async () => {
      prisma.smsConfig.findFirst.mockResolvedValue(null);
      prisma.smsConfig.create.mockResolvedValue({ id: "s1", apiKey: "secret" });
      const res = await service.getConfigMasked();
      expect(res.apiKey).toBe("••••••••");
    });
  });
});
