import { Injectable, Logger } from "@nestjs/common";
import { Interval } from "@nestjs/schedule";
import { WorkflowTriggerEngine } from "./workflow-trigger-engine.service";

@Injectable()
export class WorkflowSchedulerService {
  private readonly logger = new Logger(WorkflowSchedulerService.name);
  private running = false;

  constructor(private readonly triggerEngine: WorkflowTriggerEngine) {}

  @Interval(300_000) // every 5 minutes
  async handleInterval() {
    if (this.running) {
      this.logger.warn("Previous scheduler tick still running — skipping");
      return;
    }

    this.running = true;
    try {
      this.logger.debug("Evaluating time-based workflow triggers...");
      await this.triggerEngine.evaluateTimeBased();
    } catch (err: any) {
      this.logger.error(`Scheduler tick failed: ${err.message}`);
    } finally {
      this.running = false;
    }
  }
}
