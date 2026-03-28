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

  describe("cancelWorkOrder", () => {
    let fullPrisma: any;
    let inventoryService: any;
    let activityService: any;
    let triggerEngine: any;
    let cancelService: WorkOrdersService;

    beforeEach(async () => {
      fullPrisma = {
        workOrder: { findUnique: jest.fn(), update: jest.fn() },
        workOrderProductUsage: { findMany: jest.fn() },
        employee: { findFirst: jest.fn() },
        $transaction: jest.fn((fn: any) => fn(fullPrisma)),
        asset: { findUnique: jest.fn() },
        building: { findUnique: jest.fn() },
      };
      inventoryService = {
        releaseReservationTx: jest.fn(),
        revertStockForWorkOrderTx: jest.fn(),
      };
      activityService = {
        logCancellation: jest.fn(),
        logStatusChange: jest.fn(),
        logActivity: jest.fn(),
      };
      triggerEngine = {
        evaluateStatusChange: jest.fn().mockResolvedValue(undefined),
      };
      const module = await Test.createTestingModule({
        providers: [
          WorkOrdersService,
          { provide: PrismaService, useValue: fullPrisma },
          { provide: BuildingsService, useValue: buildings },
          { provide: AssetsService, useValue: assets },
          { provide: InventoryService, useValue: inventoryService },
          { provide: WorkOrderActivityService, useValue: activityService },
          { provide: WorkflowService, useValue: {} },
          { provide: WorkflowTriggerEngine, useValue: triggerEngine },
        ],
      }).compile();
      cancelService = module.get(WorkOrdersService);
    });

    const mockWorkOrder = (status: string, usages: any[] = []) => ({
      id: "wo1",
      workOrderNumber: 1,
      title: "Test WO",
      type: "INSTALLATION",
      status,
      productUsages: usages,
      assignments: [],
    });

    it("should throw BadRequestException for COMPLETED status", async () => {
      fullPrisma.workOrder.findUnique.mockResolvedValue(mockWorkOrder("COMPLETED"));
      await expect(
        cancelService.cancelWorkOrder("wo1", { cancelReason: "test" }, "user1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should allow cancellation for IN_PROGRESS status", async () => {
      const wo = mockWorkOrder("IN_PROGRESS");
      fullPrisma.workOrder.findUnique.mockResolvedValue(wo);
      fullPrisma.workOrder.update.mockResolvedValue({ ...wo, status: "CANCELED" });
      fullPrisma.employee.findFirst.mockResolvedValue({ id: "emp1" });

      await cancelService.cancelWorkOrder("wo1", { cancelReason: "Wrong order" }, "user1");

      expect(fullPrisma.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "CANCELED", cancelReason: "Wrong order" }),
        }),
      );
    });

    it("should release reservations for unapproved usages on cancel", async () => {
      const wo = mockWorkOrder("IN_PROGRESS", [
        { productId: "p1", quantity: 5, isApproved: false },
      ]);
      fullPrisma.workOrder.findUnique.mockResolvedValue(wo);
      fullPrisma.workOrder.update.mockResolvedValue({ ...wo, status: "CANCELED" });
      fullPrisma.employee.findFirst.mockResolvedValue({ id: "emp1" });

      await cancelService.cancelWorkOrder("wo1", { cancelReason: "Wrong" }, "user1");

      expect(inventoryService.releaseReservationTx).toHaveBeenCalledWith(
        fullPrisma,
        [{ productId: "p1", quantity: 5 }],
        "wo1",
      );
    });

    it("should allow cancellation for CREATED status", async () => {
      const wo = mockWorkOrder("CREATED");
      fullPrisma.workOrder.findUnique.mockResolvedValue(wo);
      fullPrisma.workOrder.update.mockResolvedValue({ ...wo, status: "CANCELED" });
      fullPrisma.employee.findFirst.mockResolvedValue({ id: "emp1" });

      await cancelService.cancelWorkOrder("wo1", { cancelReason: "Duplicate" }, "user1");

      expect(activityService.logCancellation).toHaveBeenCalledWith("wo1", "emp1", "Duplicate");
    });
  });

  describe("reassignEmployees", () => {
    let fullPrisma: any;
    let inventoryService: any;
    let activityService: any;
    let reassignService: WorkOrdersService;

    beforeEach(async () => {
      fullPrisma = {
        workOrder: { findUnique: jest.fn() },
        workOrderProductUsage: { deleteMany: jest.fn() },
        workOrderAssignment: { deleteMany: jest.fn(), createMany: jest.fn() },
        workOrderNotification: { deleteMany: jest.fn(), create: jest.fn() },
        employee: { findFirst: jest.fn(), findMany: jest.fn() },
        $transaction: jest.fn((fn: any) => fn(fullPrisma)),
        asset: { findUnique: jest.fn() },
        building: { findUnique: jest.fn() },
      };
      inventoryService = {
        releaseReservationTx: jest.fn(),
      };
      activityService = {
        logActivity: jest.fn(),
      };
      const module = await Test.createTestingModule({
        providers: [
          WorkOrdersService,
          { provide: PrismaService, useValue: fullPrisma },
          { provide: BuildingsService, useValue: { internalId: jest.fn() } },
          { provide: AssetsService, useValue: { internalId: jest.fn() } },
          { provide: InventoryService, useValue: inventoryService },
          { provide: WorkOrderActivityService, useValue: activityService },
          { provide: WorkflowService, useValue: {} },
          { provide: WorkflowTriggerEngine, useValue: { evaluateStatusChange: jest.fn() } },
        ],
      }).compile();
      reassignService = module.get(WorkOrdersService);
    });

    it("should throw BadRequestException for COMPLETED status", async () => {
      fullPrisma.workOrder.findUnique.mockResolvedValue({
        id: "wo1", status: "COMPLETED", productUsages: [], assignments: [],
      });
      await expect(
        reassignService.reassignEmployees(
          "wo1", { employeeIds: ["e2"], reason: "test" }, "user1",
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException for inactive employees", async () => {
      fullPrisma.workOrder.findUnique.mockResolvedValue({
        id: "wo1", status: "IN_PROGRESS", productUsages: [],
        assignments: [{ employee: { id: "e1", firstName: "A", lastName: "B" } }],
      });
      fullPrisma.employee.findMany.mockResolvedValue([]); // No active employees found

      await expect(
        reassignService.reassignEmployees(
          "wo1", { employeeIds: ["e2"], reason: "test" }, "user1",
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it("should release reservations for unapproved usages during reassignment", async () => {
      fullPrisma.workOrder.findUnique.mockResolvedValue({
        id: "wo1", workOrderNumber: 1, title: "T", type: "INSTALLATION",
        status: "IN_PROGRESS",
        productUsages: [{ productId: "p1", quantity: 3, isApproved: false }],
        assignments: [{ employee: { id: "e1", firstName: "Old", lastName: "Emp" } }],
      });
      fullPrisma.employee.findMany.mockResolvedValue([
        { id: "e2", firstName: "New", lastName: "Emp", userId: "u2", status: "ACTIVE" },
      ]);
      fullPrisma.employee.findFirst.mockResolvedValue({ id: "emp-reassigner" });

      await reassignService.reassignEmployees(
        "wo1", { employeeIds: ["e2"], reason: "shift change" }, "user1",
      );

      expect(inventoryService.releaseReservationTx).toHaveBeenCalledWith(
        fullPrisma, [{ productId: "p1", quantity: 3 }], "wo1",
      );
      expect(fullPrisma.workOrderProductUsage.deleteMany).toHaveBeenCalled();
      expect(fullPrisma.workOrderAssignment.deleteMany).toHaveBeenCalled();
      expect(fullPrisma.workOrderAssignment.createMany).toHaveBeenCalled();
    });
  });
});
