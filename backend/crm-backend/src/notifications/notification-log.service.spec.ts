import { Test, TestingModule } from "@nestjs/testing";
import { NotificationType } from "@prisma/client";
import { NotificationLogService } from "./notification-log.service";
import { PrismaService } from "../prisma/prisma.service";

describe("NotificationLogService", () => {
  let service: NotificationLogService;
  let prisma: {
    notificationLog: { create: jest.Mock; findMany: jest.Mock; count: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      notificationLog: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [NotificationLogService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(NotificationLogService);
  });

  describe("create", () => {
    it("should persist log row when given valid input", async () => {
      const row = { id: "l1" };
      prisma.notificationLog.create.mockResolvedValue(row);
      const res = await service.create({
        type: NotificationType.EMAIL,
        body: "text",
        status: "SENT",
      });
      expect(res).toEqual(row);
    });
  });

  describe("findAll", () => {
    it("should return items and total when logs exist", async () => {
      prisma.notificationLog.findMany.mockResolvedValue([]);
      prisma.notificationLog.count.mockResolvedValue(0);
      const res = await service.findAll({ page: 1, limit: 10 });
      expect(res.items).toEqual([]);
      expect(res.total).toBe(0);
    });
  });
});
