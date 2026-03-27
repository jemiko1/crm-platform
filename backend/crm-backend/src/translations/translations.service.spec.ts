import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, ConflictException } from "@nestjs/common";
import { TranslationsService } from "./translations.service";
import { PrismaService } from "../prisma/prisma.service";

describe("TranslationsService", () => {
  let service: TranslationsService;
  let prisma: {
    translation: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      translation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [TranslationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(TranslationsService);
  });

  describe("findOne", () => {
    it("should return translation when id exists", async () => {
      const row = { id: "t1", key: "k", en: "Hi", ka: null, context: null };
      prisma.translation.findUnique.mockResolvedValue(row);
      await expect(service.findOne("t1")).resolves.toEqual(row);
    });

    it("should throw NotFoundException when id is not found", async () => {
      prisma.translation.findUnique.mockResolvedValue(null);
      await expect(service.findOne("missing")).rejects.toThrow(NotFoundException);
    });
  });

  describe("create", () => {
    it("should create when key is new", async () => {
      prisma.translation.findUnique.mockResolvedValue(null);
      const created = { id: "n1", key: "new.key", en: "E", ka: null, context: "app" };
      prisma.translation.create.mockResolvedValue(created);
      const dto = { key: "new.key", en: "E", ka: null, context: "app" };
      await expect(service.create(dto as any)).resolves.toEqual(created);
      expect(prisma.translation.create).toHaveBeenCalledWith({ data: dto });
    });

    it("should throw ConflictException when key already exists", async () => {
      prisma.translation.findUnique.mockResolvedValue({ id: "x" });
      await expect(
        service.create({ key: "dup", en: "a" } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("update", () => {
    it("should throw NotFoundException when id does not exist", async () => {
      prisma.translation.findUnique.mockResolvedValue(null);
      await expect(service.update("bad", { en: "x" } as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should update when translation exists", async () => {
      prisma.translation.findUnique.mockResolvedValue({ id: "t1" });
      prisma.translation.update.mockResolvedValue({ id: "t1", en: "y" });
      await expect(service.update("t1", { en: "y" } as any)).resolves.toEqual({
        id: "t1",
        en: "y",
      });
    });
  });

  describe("delete", () => {
    it("should throw NotFoundException when id does not exist", async () => {
      prisma.translation.findUnique.mockResolvedValue(null);
      await expect(service.delete("bad")).rejects.toThrow(NotFoundException);
    });
  });
});
