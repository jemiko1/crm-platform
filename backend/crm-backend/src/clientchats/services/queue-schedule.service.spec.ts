import { Test, TestingModule } from "@nestjs/testing";
import { QueueScheduleService } from "./queue-schedule.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("QueueScheduleService", () => {
  let service: QueueScheduleService;
  let prisma: {
    clientChatQueueSchedule: { findMany: jest.Mock; deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      clientChatQueueSchedule: { findMany: jest.fn(), deleteMany: jest.fn() },
      $transaction: jest.fn(async (cb: any) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [QueueScheduleService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(QueueScheduleService);
  });

  describe("getWeeklySchedule", () => {
    it("should return empty buckets when no schedules", async () => {
      prisma.clientChatQueueSchedule.findMany.mockResolvedValue([]);
      const res = await service.getWeeklySchedule();
      expect(res[1]).toEqual([]);
      expect(res[7]).toEqual([]);
    });
  });
});
