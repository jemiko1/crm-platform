import { Test, TestingModule } from "@nestjs/testing";
import { EmailConfigService } from "./email-config.service";
import { PrismaService } from "../prisma/prisma.service";

describe("EmailConfigService", () => {
  let service: EmailConfigService;
  let prisma: {
    emailConfig: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      emailConfig: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailConfigService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(EmailConfigService);
  });

  describe("getConfig", () => {
    it("should create default config when none exists", async () => {
      const created = { id: "ec1", isActive: false };
      prisma.emailConfig.findFirst.mockResolvedValue(null);
      prisma.emailConfig.create.mockResolvedValue(created);
      await expect(service.getConfig()).resolves.toEqual(created);
      expect(prisma.emailConfig.create).toHaveBeenCalledWith({ data: {} });
    });

    it("should return existing config when present", async () => {
      const existing = { id: "ec1" };
      prisma.emailConfig.findFirst.mockResolvedValue(existing);
      await expect(service.getConfig()).resolves.toEqual(existing);
      expect(prisma.emailConfig.create).not.toHaveBeenCalled();
    });
  });
});
