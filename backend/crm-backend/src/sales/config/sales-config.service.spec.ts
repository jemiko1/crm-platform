import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { SalesConfigService } from "./sales-config.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("SalesConfigService", () => {
  let service: SalesConfigService;
  let prisma: {
    salesPipelineConfig: { findMany: jest.Mock; findUnique: jest.Mock };
    salesPipelineConfigPosition: { deleteMany: jest.Mock; createMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      salesPipelineConfig: { findMany: jest.fn(), findUnique: jest.fn() },
      salesPipelineConfigPosition: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [SalesConfigService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SalesConfigService);
  });

  describe("getConfig", () => {
    it("should throw NotFoundException when key does not exist", async () => {
      prisma.salesPipelineConfig.findUnique.mockResolvedValue(null);
      await expect(service.getConfig("missing")).rejects.toThrow(NotFoundException);
    });

    it("should return config when key exists", async () => {
      const cfg = { id: "c1", key: "approval" };
      prisma.salesPipelineConfig.findUnique.mockResolvedValue(cfg);
      await expect(service.getConfig("approval")).resolves.toEqual(cfg);
    });
  });
});
