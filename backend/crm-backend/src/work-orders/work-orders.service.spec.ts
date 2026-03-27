import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException, BadRequestException } from "@nestjs/common";
import { WorkOrdersService } from "./work-orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { BuildingsService } from "../buildings/buildings.service";
import { AssetsService } from "../assets/assets.service";
import { InventoryService } from "../inventory/inventory.service";
import { WorkOrderActivityService } from "./work-order-activity.service";
import { WorkflowService } from "../workflow/workflow.service";
import { WorkflowTriggerEngine } from "../workflow/workflow-trigger-engine.service";
import { WorkOrderType } from "@prisma/client";

describe("WorkOrdersService", () => {
  let service: WorkOrdersService;
  let prisma: { asset: { findUnique: jest.Mock }; building: { findUnique: jest.Mock } };
  let buildings: { internalId: jest.Mock };
  let assets: { internalId: jest.Mock };

  beforeEach(async () => {
    prisma = {
      asset: { findUnique: jest.fn() },
      building: { findUnique: jest.fn() },
    };
    buildings = { internalId: jest.fn() };
    assets = { internalId: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: BuildingsService, useValue: buildings },
        { provide: AssetsService, useValue: assets },
        { provide: InventoryService, useValue: {} },
        { provide: WorkOrderActivityService, useValue: { logActivity: jest.fn() } },
        { provide: WorkflowService, useValue: {} },
        { provide: WorkflowTriggerEngine, useValue: { evaluateStatusChange: jest.fn() } },
      ],
    }).compile();
    service = module.get(WorkOrdersService);
  });

  const baseDto = () => ({
    buildingId: 1,
    assetIds: [10],
    type: WorkOrderType.INSTALLATION,
  });

  describe("create", () => {
    it("should throw NotFoundException when building coreId does not resolve", async () => {
      buildings.internalId.mockResolvedValue(null);
      await expect(service.create(baseDto() as any)).rejects.toThrow(NotFoundException);
    });

    it("should throw NotFoundException when asset coreId does not resolve", async () => {
      buildings.internalId.mockResolvedValue("bid");
      prisma.building.findUnique.mockResolvedValue({ id: "bid", name: "B", coreId: 1 });
      assets.internalId.mockResolvedValue(null);
      await expect(service.create(baseDto() as any)).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException when asset belongs to another building", async () => {
      buildings.internalId.mockResolvedValue("bid");
      prisma.building.findUnique.mockResolvedValue({ id: "bid", name: "B", coreId: 1 });
      assets.internalId.mockResolvedValue("aid");
      prisma.asset.findUnique.mockResolvedValue({ id: "aid", buildingId: "other" });
      await expect(service.create(baseDto() as any)).rejects.toThrow(BadRequestException);
    });
  });
});
