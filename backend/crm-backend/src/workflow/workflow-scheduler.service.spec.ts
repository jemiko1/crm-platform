import { Test, TestingModule } from "@nestjs/testing";
import { WorkflowSchedulerService } from "./workflow-scheduler.service";
import { WorkflowTriggerEngine } from "./workflow-trigger-engine.service";

describe("WorkflowSchedulerService", () => {
  let service: WorkflowSchedulerService;
  let engine: { evaluateTimeBased: jest.Mock };

  beforeEach(async () => {
    engine = { evaluateTimeBased: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowSchedulerService,
        { provide: WorkflowTriggerEngine, useValue: engine },
      ],
    }).compile();
    service = module.get(WorkflowSchedulerService);
  });

  describe("handleInterval", () => {
    it("should invoke evaluateTimeBased when not already running", async () => {
      await service.handleInterval();
      expect(engine.evaluateTimeBased).toHaveBeenCalled();
    });
  });
});
