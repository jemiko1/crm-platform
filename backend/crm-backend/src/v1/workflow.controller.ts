import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WorkflowService } from "../workflow/workflow.service";

@ApiTags("Workflow Configuration")
@Controller("v1/workflow")
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  // ===== WORKFLOW STEPS =====

  @Get("steps")
  @ApiOperation({ summary: "Get all workflow steps" })
  findAllSteps() {
    return this.workflowService.findAllSteps();
  }

  @Get("steps/:id")
  @ApiOperation({ summary: "Get workflow step by ID" })
  findStepById(@Param("id") id: string) {
    return this.workflowService.findStepById(id);
  }

  @Patch("steps/:id")
  @ApiOperation({ summary: "Update workflow step" })
  updateStep(
    @Param("id") id: string,
    @Body()
    body: {
      stepName?: string;
      description?: string;
      stepOrder?: number;
      workOrderTypes?: string[] | null;
      isActive?: boolean;
    },
  ) {
    return this.workflowService.updateStep(id, body);
  }

  // ===== POSITION ASSIGNMENTS =====

  @Post("steps/:stepId/positions")
  @ApiOperation({ summary: "Assign position to workflow step" })
  assignPosition(
    @Param("stepId") stepId: string,
    @Body()
    body: {
      positionId: string;
      isPrimaryAssignee?: boolean;
      notificationType?: "TASK" | "NOTIFICATION" | "BOTH";
    },
  ) {
    return this.workflowService.assignPositionToStep(stepId, body.positionId, {
      isPrimaryAssignee: body.isPrimaryAssignee,
      notificationType: body.notificationType,
    });
  }

  @Delete("steps/:stepId/positions/:positionId")
  @ApiOperation({ summary: "Remove position from workflow step" })
  removePosition(
    @Param("stepId") stepId: string,
    @Param("positionId") positionId: string,
  ) {
    return this.workflowService.removePositionFromStep(stepId, positionId);
  }

  @Patch("steps/:stepId/positions")
  @ApiOperation({ summary: "Set all positions for a workflow step" })
  setPositions(
    @Param("stepId") stepId: string,
    @Body()
    body: {
      positionIds: string[];
      isPrimaryAssignee?: boolean;
      notificationType?: "TASK" | "NOTIFICATION" | "BOTH";
    },
  ) {
    return this.workflowService.setStepPositions(stepId, body.positionIds, {
      isPrimaryAssignee: body.isPrimaryAssignee,
      notificationType: body.notificationType,
    });
  }

  // ===== UTILITY =====

  @Get("positions")
  @ApiOperation({ summary: "Get all positions for workflow assignment" })
  getAllPositions() {
    return this.workflowService.getAllPositions();
  }

  @Get("steps/:stepKey/employees")
  @ApiOperation({ summary: "Get employees assigned to a workflow step" })
  getEmployeesForStep(@Param("stepKey") stepKey: string) {
    return this.workflowService.getEmployeesForStep(stepKey);
  }
}
