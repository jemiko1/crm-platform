import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { WorkflowTriggerService } from "./workflow-trigger.service";
import { PrismaService } from "../prisma/prisma.service";

describe("WorkflowTriggerService", () => {
  let service: WorkflowTriggerService;
  let prisma: {
    workflowTrigger: { findMany: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      workflowTrigger: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowTriggerService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WorkflowTriggerService);
  });

  describe("findById", () => {
    it("should throw NotFoundException when trigger is not found", async () => {
      prisma.workflowTrigger.findUnique.mockResolvedValue(null);
      await expect(service.findById("t-bad")).rejects.toThrow(NotFoundException);
    });
  });

  describe("findAll", () => {
    it("should return list from prisma", async () => {
      prisma.workflowTrigger.findMany.mockResolvedValue([]);
      await expect(service.findAll()).resolves.toEqual([]);
    });
  });
});
