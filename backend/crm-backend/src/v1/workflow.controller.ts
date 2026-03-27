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
import { ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { WorkflowService } from "../workflow/workflow.service";
import { WorkflowTriggerService } from "../workflow/workflow-trigger.service";
import { CreateTriggerDto } from "../workflow/dto/create-trigger.dto";
import { UpdateTriggerDto } from "../workflow/dto/update-trigger.dto";
import { CreateTriggerActionDto } from "../workflow/dto/create-trigger-action.dto";
import { UpdateTriggerActionDto } from "../workflow/dto/update-trigger-action.dto";
import { Doc } from "../common/openapi/doc-endpoint.decorator";

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
  @Doc({ summary: "Get all workflow steps", ok: "List of workflow steps" })
  findAllSteps() {
    return this.workflowService.findAllSteps();
  }

  @Get("steps/:id")
  @Doc({
    summary: "Get workflow step by ID",
    ok: "Workflow step details",
    notFound: true,
    params: [{ name: "id", description: "Workflow step ID" }],
  })
  findStepById(@Param("id") id: string) {
    return this.workflowService.findStepById(id);
  }

  @Patch("steps/:id")
  @Doc({
    summary: "Update workflow step",
    ok: "Updated workflow step",
    notFound: true,
    params: [{ name: "id", description: "Workflow step ID" }],
  })
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
  @Doc({
    summary: "Assign position to workflow step",
    ok: "Assignment created",
    params: [{ name: "stepId", description: "Workflow step ID" }],
  })
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
  @Doc({
    summary: "Remove position from workflow step",
    ok: "Position removed from step",
    params: [
      { name: "stepId", description: "Workflow step ID" },
      { name: "positionId", description: "Position ID" },
    ],
  })
  removePosition(
    @Param("stepId") stepId: string,
    @Param("positionId") positionId: string,
  ) {
    return this.workflowService.removePositionFromStep(stepId, positionId);
  }

  @Patch("steps/:stepId/positions")
  @Doc({
    summary: "Set all positions for a workflow step",
    ok: "Step positions updated",
    params: [{ name: "stepId", description: "Workflow step ID" }],
  })
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
  @Doc({
    summary: "Get all positions for workflow assignment",
    ok: "Positions available for workflow assignment",
  })
  getAllPositions() {
    return this.workflowService.getAllPositions();
  }

  @Get("steps/:stepKey/employees")
  @Doc({
    summary: "Get employees assigned to a workflow step",
    ok: "Employees for the step",
    params: [{ name: "stepKey", description: "Workflow step key" }],
  })
  getEmployeesForStep(@Param("stepKey") stepKey: string) {
    return this.workflowService.getEmployeesForStep(stepKey);
  }

  // ===== WORKFLOW TRIGGERS =====

  @Get("triggers")
  @Doc({
    summary: "List all triggers (optional ?workOrderType= filter)",
    ok: "Workflow triggers",
    queries: [{ name: "workOrderType", description: "Filter by work order type" }],
  })
  getTriggers(@Query("workOrderType") workOrderType?: string) {
    return this.triggerService.findAll(workOrderType);
  }

  @Get("triggers/overview")
  @Doc({
    summary: "Get triggers overview grouped by type",
    ok: "Triggers overview",
    queries: [{ name: "workOrderType", description: "Filter by work order type" }],
  })
  getTriggersOverview(@Query("workOrderType") workOrderType?: string) {
    return this.triggerService.getOverview(workOrderType);
  }

  @Get("triggers/:id")
  @Doc({
    summary: "Get a single trigger with actions",
    ok: "Trigger with actions",
    notFound: true,
    params: [{ name: "id", description: "Trigger ID" }],
  })
  getTrigger(@Param("id") id: string) {
    return this.triggerService.findById(id);
  }

  @Post("triggers")
  @Doc({
    summary: "Create a workflow trigger",
    ok: "Created trigger",
    status: 201,
    bodyType: CreateTriggerDto,
  })
  createTrigger(@Body() dto: CreateTriggerDto) {
    return this.triggerService.create(dto);
  }

  @Patch("triggers/:id")
  @Doc({
    summary: "Update a workflow trigger",
    ok: "Updated trigger",
    notFound: true,
    bodyType: UpdateTriggerDto,
    params: [{ name: "id", description: "Trigger ID" }],
  })
  updateTrigger(@Param("id") id: string, @Body() dto: UpdateTriggerDto) {
    return this.triggerService.update(id, dto);
  }

  @Delete("triggers/:id")
  @Doc({
    summary: "Delete a workflow trigger",
    ok: "Trigger deleted",
    notFound: true,
    params: [{ name: "id", description: "Trigger ID" }],
  })
  deleteTrigger(@Param("id") id: string) {
    return this.triggerService.delete(id);
  }

  // ===== TRIGGER ACTIONS =====

  @Post("triggers/:triggerId/actions")
  @Doc({
    summary: "Add an action to a trigger",
    ok: "Trigger action created",
    bodyType: CreateTriggerActionDto,
    params: [{ name: "triggerId", description: "Trigger ID" }],
  })
  createTriggerAction(@Param("triggerId") triggerId: string, @Body() dto: CreateTriggerActionDto) {
    return this.triggerService.createAction(triggerId, dto);
  }

  @Patch("triggers/actions/:actionId")
  @Doc({
    summary: "Update a trigger action",
    ok: "Trigger action updated",
    notFound: true,
    bodyType: UpdateTriggerActionDto,
    params: [{ name: "actionId", description: "Trigger action ID" }],
  })
  updateTriggerAction(@Param("actionId") actionId: string, @Body() dto: UpdateTriggerActionDto) {
    return this.triggerService.updateAction(actionId, dto);
  }

  @Delete("triggers/actions/:actionId")
  @Doc({
    summary: "Delete a trigger action",
    ok: "Trigger action deleted",
    notFound: true,
    params: [{ name: "actionId", description: "Trigger action ID" }],
  })
  deleteTriggerAction(@Param("actionId") actionId: string) {
    return this.triggerService.deleteAction(actionId);
  }
}
