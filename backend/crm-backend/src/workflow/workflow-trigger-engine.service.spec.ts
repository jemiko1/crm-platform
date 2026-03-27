import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowTriggerEngine } from "./workflow-trigger-engine.service";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowTriggerService } from "./workflow-trigger.service";
import { NotificationService } from "../notifications/notification.service";
import { NotificationTemplatesService } from "../notifications/notification-templates.service";
import { WorkflowTriggerType } from "@prisma/client";

describe("WorkflowTriggerEngine", () => {
  let engine: WorkflowTriggerEngine;
  let triggerService: { getTriggersForEvent: jest.Mock };
  let notificationService: { send: jest.Mock };
  let templateService: { findByCode: jest.Mock; renderTemplate: jest.Mock };
  let prisma: Record<string, unknown>;

  beforeEach(async () => {
    triggerService = { getTriggersForEvent: jest.fn().mockResolvedValue([]) };
    notificationService = { send: jest.fn() };
    templateService = { findByCode: jest.fn(), renderTemplate: jest.fn((s: string) => s) };
    prisma = {};
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowTriggerEngine,
        { provide: PrismaService, useValue: prisma },
        { provide: WorkflowTriggerService, useValue: triggerService },
        { provide: NotificationService, useValue: notificationService },
        { provide: NotificationTemplatesService, useValue: templateService },
      ],
    }).compile();
    engine = module.get(WorkflowTriggerEngine);
  });

  describe("evaluateStatusChange", () => {
    it("should complete when no triggers match", async () => {
      await expect(
        engine.evaluateStatusChange(
          {
            id: "wo1",
            type: "INSTALLATION",
            title: "T",
            workOrderNumber: 1,
          },
          null,
          "IN_PROGRESS",
        ),
      ).resolves.toBeUndefined();
      expect(triggerService.getTriggersForEvent).toHaveBeenCalledWith(
        WorkflowTriggerType.STATUS_CHANGE,
        "INSTALLATION",
      );
    });
  });
});
