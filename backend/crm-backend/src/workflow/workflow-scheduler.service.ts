import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { WorkflowTriggerEngine } from "./workflow-trigger-engine.service";

@Injectable()
export class WorkflowSchedulerService {
  private readonly logger = new Logger(WorkflowSchedulerService.name);

  constructor(private readonly triggerEngine: WorkflowTriggerEngine) {}

  @Interval(300_000) // every 5 minutes
  async handleInterval() {
    this.logger.debug("Evaluating time-based workflow triggers...");
    try {
      await this.triggerEngine.evaluateTimeBased();
    } catch (err: any) {
      this.logger.error(`Scheduler tick failed: ${err.message}`);
    }
  }
}
