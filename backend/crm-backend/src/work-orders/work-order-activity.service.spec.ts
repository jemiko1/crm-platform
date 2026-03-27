import { Test, TestingModule } from "@nestjs/testing";
import { WorkOrderActivityService, ActivityAction, ActivityCategory } from "./work-order-activity.service";
import { PrismaService } from "../prisma/prisma.service";

describe("WorkOrderActivityService", () => {
  let service: WorkOrderActivityService;
  let prisma: {
    employee: { findUnique: jest.Mock };
    workOrderActivityLog: { create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      employee: { findUnique: jest.fn() },
      workOrderActivityLog: { create: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkOrderActivityService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WorkOrderActivityService);
  });

  describe("logActivity", () => {
    it("should create activity log when given valid input", async () => {
      const row = { id: "log1" };
      prisma.workOrderActivityLog.create.mockResolvedValue(row);
      const result = await service.logActivity({
        workOrderId: "wo1",
        action: ActivityAction.CREATED,
        category: ActivityCategory.MAIN,
        title: "Created",
        description: "WO created",
      });
      expect(result).toEqual(row);
      expect(prisma.workOrderActivityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workOrderId: "wo1",
          action: ActivityAction.CREATED,
        }),
      });
    });

    it("should resolve performer name from employee when only performedById is set", async () => {
      prisma.employee.findUnique.mockResolvedValue({
        firstName: "Ann",
        lastName: "Bee",
        employeeId: "EMP-1",
      });
      prisma.workOrderActivityLog.create.mockResolvedValue({ id: "l2" });
      await service.logActivity({
        workOrderId: "wo1",
        action: ActivityAction.VIEWED,
        category: ActivityCategory.DETAIL,
        title: "View",
        description: "Viewed",
        performedById: "e1",
      });
      expect(prisma.workOrderActivityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          performedByName: "Ann Bee (EMP-1)",
        }),
      });
    });
  });
});
