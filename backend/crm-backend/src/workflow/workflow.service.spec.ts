import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { WorkflowService } from "./workflow.service";
import { PrismaService } from "../prisma/prisma.service";

describe("WorkflowService", () => {
  let service: WorkflowService;
  let prisma: {
    workflowStep: { findMany: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = { workflowStep: { findMany: jest.fn(), findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(WorkflowService);
  });

  describe("findStepById", () => {
    it("should throw NotFoundException when step id is not found", async () => {
      prisma.workflowStep.findUnique.mockResolvedValue(null);
      await expect(service.findStepById("bad")).rejects.toThrow(NotFoundException);
    });
  });

  describe("findAllSteps", () => {
    it("should return steps from prisma", async () => {
      prisma.workflowStep.findMany.mockResolvedValue([]);
      await expect(service.findAllSteps()).resolves.toEqual([]);
    });
  });
});
