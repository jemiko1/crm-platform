import { Module } from "@nestjs/common";
import { WorkflowService } from "./workflow.service";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
