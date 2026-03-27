import { Test, TestingModule } from "@nestjs/testing";
import { LeadActivityType } from "@prisma/client";
import { LeadActivityService } from "./lead-activity.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("LeadActivityService", () => {
  let service: LeadActivityService;
  let prisma: {
    leadActivity: { create: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = { leadActivity: { create: jest.fn(), findMany: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadActivityService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(LeadActivityService);
  });

  describe("logActivity", () => {
    it("should create activity when given valid input", async () => {
      const row = { id: "a1" };
      prisma.leadActivity.create.mockResolvedValue(row);
      const res = await service.logActivity({
        leadId: "l1",
        activityType: LeadActivityType.NOTE_ADDED,
        category: "MAIN",
        action: "note",
        description: "d",
      });
      expect(res).toEqual(row);
    });
  });

  describe("getLeadActivities", () => {
    it("should return activities for lead", async () => {
      prisma.leadActivity.findMany.mockResolvedValue([]);
      await expect(service.getLeadActivities("l1")).resolves.toEqual([]);
    });
  });
});
