import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { WorkOrdersNotificationsService } from "./work-orders-notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationService } from "../notifications/notification.service";

describe("WorkOrdersNotificationsService", () => {
  let service: WorkOrdersNotificationsService;
  let prisma: {
    workOrder: { findUnique: jest.Mock };
    employee: { findMany: jest.Mock };
    workOrderNotification: { createMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      workOrder: { findUnique: jest.fn() },
      employee: { findMany: jest.fn() },
      workOrderNotification: { createMany: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationService, useValue: { send: jest.fn() } },
      ],
    }).compile();
    service = module.get(WorkOrdersNotificationsService);
  });

  describe("createNotifications", () => {
    it("should throw NotFoundException when work order does not exist", async () => {
      prisma.workOrder.findUnique.mockResolvedValue(null);
      await expect(service.createNotifications("wo-bad", ["e1"])).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException when an employee id is missing or inactive", async () => {
      prisma.workOrder.findUnique.mockResolvedValue({
        id: "wo1",
        title: "T",
        workOrderNumber: 1,
        type: "INSTALLATION",
      });
      prisma.employee.findMany.mockResolvedValue([]);
      await expect(service.createNotifications("wo1", ["e1", "e2"])).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
