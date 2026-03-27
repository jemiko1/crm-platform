import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { LeadsService } from "./leads.service";
import { PrismaService } from "../../prisma/prisma.service";
import { LeadActivityService } from "./lead-activity.service";

describe("LeadsService", () => {
  let service: LeadsService;
  let prisma: {
    leadStage: { findFirst: jest.Mock };
    employee: { findUnique: jest.Mock };
    lead: { create: jest.Mock };
  };
  let activity: { logActivity: jest.Mock };

  beforeEach(async () => {
    prisma = {
      leadStage: { findFirst: jest.fn() },
      employee: { findUnique: jest.fn() },
      lead: { create: jest.fn() },
    };
    activity = { logActivity: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LeadActivityService, useValue: activity },
      ],
    }).compile();
    service = module.get(LeadsService);
  });

  describe("create", () => {
    it("should throw BadRequestException when no active lead stages exist", async () => {
      prisma.leadStage.findFirst.mockResolvedValue(null);
      await expect(
        service.create({ name: "L" } as any, "e1"),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw NotFoundException when responsible employee is missing", async () => {
      prisma.leadStage.findFirst.mockResolvedValue({ id: "stage1" });
      prisma.employee.findUnique.mockResolvedValue(null);
      await expect(
        service.create(
          { name: "L", responsibleEmployeeId: "missing" } as any,
          "",
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
