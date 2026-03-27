import { Test, TestingModule } from "@nestjs/testing";
import { SmsSenderService } from "./sms.service";
import { PrismaService } from "../prisma/prisma.service";

describe("SmsSenderService", () => {
  let service: SmsSenderService;
  let prisma: { smsConfig: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { smsConfig: { findFirst: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsSenderService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SmsSenderService);
  });

  describe("sendSms", () => {
    it("should return failure when SMS is not configured", async () => {
      prisma.smsConfig.findFirst.mockResolvedValue(null);
      const res = await service.sendSms("+995555000000", "hi");
      expect(res.success).toBe(false);
      expect(res.error).toContain("not configured");
    });
  });
});
