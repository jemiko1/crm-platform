import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowTriggerType, WorkflowActionType, NotificationType, WorkOrderType } from "@prisma/client";
import { WorkflowTriggerService } from "./workflow-trigger.service";
import { NotificationService } from "../notifications/notification.service";
import { NotificationTemplatesService } from "../notifications/notification-templates.service";

type TriggerWithActions = Awaited<ReturnType<WorkflowTriggerService["getTriggersForEvent"]>>[number];

@Injectable()
export class WorkflowTriggerEngine {
  private readonly logger = new Logger(WorkflowTriggerEngine.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly triggerService: WorkflowTriggerService,
    private readonly notificationService: NotificationService,
    private readonly templateService: NotificationTemplatesService,
  ) {}

  // ─── Status Change Evaluation ──────────────────────────

  async evaluateStatusChange(
    workOrder: { id: string; type: string; title: string; workOrderNumber: number; buildingId?: string },
    fromStatus: string | null,
    toStatus: string,
  ) {
    try {
      const triggers = await this.triggerService.getTriggersForEvent(
        WorkflowTriggerType.STATUS_CHANGE,
        workOrder.type,
      );

      for (const trigger of triggers) {
        const cond = trigger.condition as any;
        const matchFrom = !cond.fromStatus || cond.fromStatus === fromStatus;
        const matchTo = !cond.toStatus || cond.toStatus === toStatus;

        if (matchFrom && matchTo) {
          await this.executeTriggerActions(trigger, workOrder);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Status change trigger evaluation failed: ${err.message}`);
    }
  }

  // ─── Field Change Evaluation ───────────────────────────

  async evaluateFieldChange(
    workOrder: { id: string; type: string; title: string; workOrderNumber: number },
    changedFields: string[],
  ) {
    try {
      const triggers = await this.triggerService.getTriggersForEvent(
        WorkflowTriggerType.FIELD_CHANGE,
        workOrder.type,
      );

      for (const trigger of triggers) {
        const cond = trigger.condition as any;
        if (changedFields.includes(cond.field)) {
          await this.executeTriggerActions(trigger, workOrder);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Field change trigger evaluation failed: ${err.message}`);
    }
  }

  // ─── Time-based Evaluation (called by scheduler) ───────

  async evaluateTimeBased() {
    await this.evaluateInactivityTriggers();
    await this.evaluateDeadlineTriggers();
  }

  private async evaluateInactivityTriggers() {
    try {
      const triggers = await this.triggerService.getTriggersForEvent(WorkflowTriggerType.INACTIVITY);

      for (const trigger of triggers) {
        const cond = trigger.condition as any;
        const minutes = cond.minutes || 120;
        const inStatus = cond.inStatus;
        if (!inStatus) continue;

        const cutoff = new Date(Date.now() - minutes * 60 * 1000);

        const stuckOrders = await this.prisma.workOrder.findMany({
          where: {
            status: inStatus,
            updatedAt: { lt: cutoff },
            ...(trigger.workOrderType ? { type: trigger.workOrderType as WorkOrderType } : {}),
          },
          select: { id: true, type: true, title: true, workOrderNumber: true },
          take: 200,
        });

        if (stuckOrders.length === 0) continue;

        const firedLogs = await this.prisma.workflowTriggerLog.findMany({
          where: {
            triggerId: trigger.id,
            workOrderId: { in: stuckOrders.map((wo) => wo.id) },
          },
          select: { workOrderId: true },
        });
        const firedSet = new Set(firedLogs.map((l) => l.workOrderId));

        for (const wo of stuckOrders) {
          if (firedSet.has(wo.id)) continue;

          await this.prisma.workflowTriggerLog.create({
            data: { triggerId: trigger.id, workOrderId: wo.id },
          });
          await this.executeTriggerActions(trigger, wo);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Inactivity trigger evaluation failed: ${err.message}`);
    }
  }

  private async evaluateDeadlineTriggers() {
    try {
      const triggers = await this.triggerService.getTriggersForEvent(WorkflowTriggerType.DEADLINE_PROXIMITY);

      for (const trigger of triggers) {
        const cond = trigger.condition as any;
        const minutesBefore = cond.minutesBefore || 180;
        const windowStart = new Date();
        const windowEnd = new Date(Date.now() + minutesBefore * 60 * 1000);

        const approachingOrders = await this.prisma.workOrder.findMany({
          where: {
            deadline: { gte: windowStart, lte: windowEnd },
            status: { notIn: ["COMPLETED", "CANCELED"] },
            ...(trigger.workOrderType ? { type: trigger.workOrderType as WorkOrderType } : {}),
          },
          select: { id: true, type: true, title: true, workOrderNumber: true },
          take: 200,
        });

        if (approachingOrders.length === 0) continue;

        const firedLogs = await this.prisma.workflowTriggerLog.findMany({
          where: {
            triggerId: trigger.id,
            workOrderId: { in: approachingOrders.map((wo) => wo.id) },
          },
          select: { workOrderId: true },
        });
        const firedSet = new Set(firedLogs.map((l) => l.workOrderId));

        for (const wo of approachingOrders) {
          if (firedSet.has(wo.id)) continue;

          await this.prisma.workflowTriggerLog.create({
            data: { triggerId: trigger.id, workOrderId: wo.id },
          });
          await this.executeTriggerActions(trigger, wo);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Deadline trigger evaluation failed: ${err.message}`);
    }
  }

  // ─── Action Executor ───────────────────────────────────

  private async executeTriggerActions(
    trigger: TriggerWithActions,
    workOrder: { id: string; type: string; title: string; workOrderNumber: number },
  ) {
    for (const action of trigger.actions) {
      try {
        const employeeIds = await this.resolveTargetEmployees(action, workOrder.id);
        if (employeeIds.length === 0) continue;

        let subject = action.customSubject || "";
        let body = action.customBody || "";

        if (action.templateCode) {
          try {
            const tpl = await this.templateService.findByCode(action.templateCode);
            const vars = this.buildVariables(workOrder);
            subject = tpl.subject ? this.templateService.renderTemplate(tpl.subject, vars) : "";
            body = this.templateService.renderTemplate(tpl.body, vars);
          } catch {
            this.logger.warn(`Template ${action.templateCode} not found, using custom message`);
          }
        }

        if (!body) {
          body = `[${trigger.name}] Work Order #${workOrder.workOrderNumber}: ${workOrder.title}`;
        }

        const vars = this.buildVariables(workOrder);
        subject = this.templateService.renderTemplate(subject, vars);
        body = this.templateService.renderTemplate(body, vars);

        if (action.actionType === WorkflowActionType.EMAIL) {
          await this.notificationService.send({
            employeeIds,
            type: NotificationType.EMAIL,
            subject,
            body,
          });
        } else if (action.actionType === WorkflowActionType.SMS) {
          await this.notificationService.send({
            employeeIds,
            type: NotificationType.SMS,
            body,
          });
        } else {
          // SYSTEM_NOTIFICATION -- create in-app WorkOrderNotification records
          await this.prisma.workOrderNotification.createMany({
            data: employeeIds.map((empId) => ({ workOrderId: workOrder.id, employeeId: empId })),
            skipDuplicates: true,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Action execution failed for trigger "${trigger.name}": ${err.message}`);
      }
    }
  }

  private async resolveTargetEmployees(
    action: { targetType: string; targetPositionIds: any },
    workOrderId: string,
  ): Promise<string[]> {
    if (action.targetType === "ASSIGNED_EMPLOYEES") {
      const assignments = await this.prisma.workOrderAssignment.findMany({
        where: { workOrderId },
        select: { employeeId: true },
      });
      return assignments.map((a) => a.employeeId);
    }

    if (action.targetType === "POSITION" && action.targetPositionIds) {
      const posIds = action.targetPositionIds as string[];
      const employees = await this.prisma.employee.findMany({
        where: { positionId: { in: posIds }, status: "ACTIVE" },
        select: { id: true },
      });
      return employees.map((e) => e.id);
    }

    if (action.targetType === "RESPONSIBLE") {
      const stepPositions = await this.prisma.workflowStepPosition.findMany({
        select: { positionId: true },
      });
      const posIds = [...new Set(stepPositions.map((sp) => sp.positionId))];
      const employees = await this.prisma.employee.findMany({
        where: { positionId: { in: posIds }, status: "ACTIVE" },
        select: { id: true },
      });
      return employees.map((e) => e.id);
    }

    return [];
  }

  private buildVariables(workOrder: { workOrderNumber: number; title: string; type: string }) {
    return {
      workOrderNumber: String(workOrder.workOrderNumber),
      title: workOrder.title,
      type: workOrder.type,
    };
  }
}
