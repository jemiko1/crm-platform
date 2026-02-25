import { Module } from "@nestjs/common";
import { WorkflowService } from "./workflow.service";
import { WorkflowTriggerService } from "./workflow-trigger.service";
import { WorkflowTriggerEngine } from "./workflow-trigger-engine.service";
import { WorkflowSchedulerService } from "./workflow-scheduler.service";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [PrismaModule, NotificationsModule],
  providers: [WorkflowService, WorkflowTriggerService, WorkflowTriggerEngine, WorkflowSchedulerService],
  exports: [WorkflowService, WorkflowTriggerService, WorkflowTriggerEngine],
})
export class WorkflowModule {}
