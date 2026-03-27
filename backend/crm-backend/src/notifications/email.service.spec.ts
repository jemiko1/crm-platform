import { Test, TestingModule } from "@nestjs/testing";
import { EmailSenderService } from "./email.service";
import { PrismaService } from "../prisma/prisma.service";

describe("EmailSenderService", () => {
  let service: EmailSenderService;
  let prisma: { emailConfig: { findFirst: jest.Mock } };

  beforeEach(async () => {
    prisma = { emailConfig: { findFirst: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailSenderService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(EmailSenderService);
  });

  describe("sendEmail", () => {
    it("should return failure when email is not configured", async () => {
      prisma.emailConfig.findFirst.mockResolvedValue(null);
      const res = await service.sendEmail("a@b.c", "S", "<p>x</p>");
      expect(res.success).toBe(false);
      expect(res.error).toContain("not configured");
    });
  });
});
