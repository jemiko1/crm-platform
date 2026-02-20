import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WorkflowService } from "../workflow/workflow.service";
import { WorkflowTriggerService } from "../workflow/workflow-trigger.service";
import { CreateTriggerDto } from "../workflow/dto/create-trigger.dto";
import { UpdateTriggerDto } from "../workflow/dto/update-trigger.dto";
import { CreateTriggerActionDto } from "../workflow/dto/create-trigger-action.dto";
import { UpdateTriggerActionDto } from "../workflow/dto/update-trigger-action.dto";

@ApiTags("Workflow Configuration")
@Controller("v1/workflow")
@UseGuards(JwtAuthGuard)
export class WorkflowController {
  constructor(
    private readonly workflowService: WorkflowService,
    private readonly triggerService: WorkflowTriggerService,
  ) {}

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

  // ===== WORKFLOW TRIGGERS =====

  @Get("triggers")
  @ApiOperation({ summary: "List all triggers (optional ?workOrderType= filter)" })
  getTriggers(@Query("workOrderType") workOrderType?: string) {
    return this.triggerService.findAll(workOrderType);
  }

  @Get("triggers/overview")
  @ApiOperation({ summary: "Get triggers overview grouped by type" })
  getTriggersOverview(@Query("workOrderType") workOrderType?: string) {
    return this.triggerService.getOverview(workOrderType);
  }

  @Get("triggers/:id")
  @ApiOperation({ summary: "Get a single trigger with actions" })
  getTrigger(@Param("id") id: string) {
    return this.triggerService.findById(id);
  }

  @Post("triggers")
  @ApiOperation({ summary: "Create a workflow trigger" })
  createTrigger(@Body() dto: CreateTriggerDto) {
    return this.triggerService.create(dto);
  }

  @Patch("triggers/:id")
  @ApiOperation({ summary: "Update a workflow trigger" })
  updateTrigger(@Param("id") id: string, @Body() dto: UpdateTriggerDto) {
    return this.triggerService.update(id, dto);
  }

  @Delete("triggers/:id")
  @ApiOperation({ summary: "Delete a workflow trigger" })
  deleteTrigger(@Param("id") id: string) {
    return this.triggerService.delete(id);
  }

  // ===== TRIGGER ACTIONS =====

  @Post("triggers/:triggerId/actions")
  @ApiOperation({ summary: "Add an action to a trigger" })
  createTriggerAction(@Param("triggerId") triggerId: string, @Body() dto: CreateTriggerActionDto) {
    return this.triggerService.createAction(triggerId, dto);
  }

  @Patch("triggers/actions/:actionId")
  @ApiOperation({ summary: "Update a trigger action" })
  updateTriggerAction(@Param("actionId") actionId: string, @Body() dto: UpdateTriggerActionDto) {
    return this.triggerService.updateAction(actionId, dto);
  }

  @Delete("triggers/actions/:actionId")
  @ApiOperation({ summary: "Delete a trigger action" })
  deleteTriggerAction(@Param("actionId") actionId: string) {
    return this.triggerService.deleteAction(actionId);
  }
}
