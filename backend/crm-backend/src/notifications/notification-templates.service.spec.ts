import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { NotificationTemplatesService } from "./notification-templates.service";
import { PrismaService } from "../prisma/prisma.service";

describe("NotificationTemplatesService", () => {
  let service: NotificationTemplatesService;
  let prisma: {
    notificationTemplate: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      notificationTemplate: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationTemplatesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(NotificationTemplatesService);
  });

  describe("findByCode", () => {
    it("should return template when code exists", async () => {
      const tpl = { id: "1", code: "welcome", subject: "S", body: "B" };
      prisma.notificationTemplate.findUnique.mockResolvedValue(tpl);
      await expect(service.findByCode("welcome")).resolves.toEqual(tpl);
    });

    it("should throw NotFoundException when code is not found", async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue(null);
      await expect(service.findByCode("nope")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should throw ConflictException when code already exists", async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue({ id: "x" });
      await expect(
        service.create({ code: "dup", subject: "s", body: "b" } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("renderTemplate", () => {
    it("should replace placeholders when variables provided", () => {
      expect(
        service.renderTemplate("Hello {{name}}", { name: "World" }),
      ).toBe("Hello World");
    });
  });
});
