import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { AssetsService } from "./assets.service";
import { PrismaService } from "../prisma/prisma.service";
import { IdGeneratorService } from "../common/id-generator/id-generator.service";

describe("AssetsService", () => {
  let service: AssetsService;
  let prisma: {
    systemListCategory: { findUnique: jest.Mock };
    asset: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock; findUnique: jest.Mock };
  };
  let ids: { next: jest.Mock };

  beforeEach(async () => {
    prisma = {
      systemListCategory: { findUnique: jest.fn() },
      asset: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    ids = { next: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: IdGeneratorService, useValue: ids },
      ],
    }).compile();
    service = module.get(AssetsService);
  });

  describe("createManual", () => {
    it("should create asset when types/status lists are empty (no validation)", async () => {
      prisma.systemListCategory.findUnique.mockResolvedValue(null);
      ids.next.mockResolvedValue(100);
      const created = {
        coreId: 100,
        type: "CAMERA",
        name: "Cam",
        ip: null,
        status: "UNKNOWN",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      prisma.asset.create.mockResolvedValue(created);
      const result = await service.createManual("b1", { type: "CAMERA", name: "Cam" });
      expect(result).toEqual(created);
      expect(prisma.asset.create).toHaveBeenCalled();
    });

    it("should throw BadRequestException when type is not in allowed list", async () => {
      prisma.systemListCategory.findUnique
        .mockResolvedValueOnce({
          items: [{ value: "VALID_TYPE" }],
        })
        .mockResolvedValueOnce({ items: [] });
      await expect(
        service.createManual("b1", { type: "BAD", name: "x" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("internalId", () => {
    it("should return null when coreId is not found", async () => {
      prisma.asset.findUnique.mockResolvedValue(null);
      await expect(service.internalId(999)).resolves.toBeNull();
    });

    it("should return id when asset exists", async () => {
      prisma.asset.findUnique.mockResolvedValue({ id: "uuid-1" });
      await expect(service.internalId(1)).resolves.toBe("uuid-1");
    });
  });

  describe("listByBuilding", () => {
    it("should return paginated result when building has assets", async () => {
      prisma.asset.findMany.mockResolvedValue([]);
      prisma.asset.count.mockResolvedValue(0);
      const res = await service.listByBuilding("b1", 1, 20);
      expect(res.data).toEqual([]);
      expect(res.meta.total).toBe(0);
    });
  });
});
