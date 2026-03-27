import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { SystemListsService } from "./system-lists.service";
import { PrismaService } from "../prisma/prisma.service";

describe("SystemListsService", () => {
  let service: SystemListsService;
  let prisma: {
    systemListCategory: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    systemListItem: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      systemListCategory: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      systemListItem: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SystemListsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SystemListsService);
  });

  describe("findCategoryById", () => {
    it("should return category when id exists", async () => {
      const cat = { id: "c1", code: "X", items: [] };
      prisma.systemListCategory.findUnique.mockResolvedValue(cat);
      await expect(service.findCategoryById("c1")).resolves.toEqual(cat);
    });

    it("should throw NotFoundException when id is not found", async () => {
      prisma.systemListCategory.findUnique.mockResolvedValue(null);
      await expect(service.findCategoryById("bad")).rejects.toThrow(NotFoundException);
    });
  });

  describe("deleteCategory", () => {
    it("should throw BadRequestException when category has items", async () => {
      prisma.systemListCategory.findUnique.mockResolvedValue({
        id: "c1",
        items: [{ id: "i1" }],
      });
      await expect(service.deleteCategory("c1")).rejects.toThrow(BadRequestException);
    });
  });
});
