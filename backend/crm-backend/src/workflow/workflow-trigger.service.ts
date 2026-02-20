import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { WorkflowTriggerType } from "@prisma/client";
import { CreateTriggerDto } from "./dto/create-trigger.dto";
import { UpdateTriggerDto } from "./dto/update-trigger.dto";
import { CreateTriggerActionDto } from "./dto/create-trigger-action.dto";
import { UpdateTriggerActionDto } from "./dto/update-trigger-action.dto";

const INCLUDE_ACTIONS = { actions: { orderBy: { sortOrder: "asc" as const } } };

@Injectable()
export class WorkflowTriggerService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Trigger CRUD ──────────────────────────────────────

  async findAll(workOrderType?: string) {
    const where: any = {};
    if (workOrderType) {
      where.OR = [{ workOrderType }, { workOrderType: null }];
    }
    return this.prisma.workflowTrigger.findMany({
      where,
      include: INCLUDE_ACTIONS,
      orderBy: { createdAt: "asc" },
    });
  }

  async findById(id: string) {
    const trigger = await this.prisma.workflowTrigger.findUnique({
      where: { id },
      include: INCLUDE_ACTIONS,
    });
    if (!trigger) throw new NotFoundException("Trigger not found");
    return trigger;
  }

  async create(dto: CreateTriggerDto) {
    return this.prisma.workflowTrigger.create({
      data: {
        name: dto.name,
        workOrderType: dto.workOrderType ?? null,
        triggerType: dto.triggerType,
        condition: dto.condition,
        isActive: dto.isActive ?? true,
      },
      include: INCLUDE_ACTIONS,
    });
  }

  async update(id: string, dto: UpdateTriggerDto) {
    await this.findById(id);
    return this.prisma.workflowTrigger.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.workOrderType !== undefined && { workOrderType: dto.workOrderType ?? null }),
        ...(dto.triggerType !== undefined && { triggerType: dto.triggerType }),
        ...(dto.condition !== undefined && { condition: dto.condition }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: INCLUDE_ACTIONS,
    });
  }

  async delete(id: string) {
    await this.findById(id);
    return this.prisma.workflowTrigger.delete({ where: { id } });
  }

  // ─── Action CRUD ───────────────────────────────────────

  async createAction(triggerId: string, dto: CreateTriggerActionDto) {
    await this.findById(triggerId);
    return this.prisma.workflowTriggerAction.create({
      data: {
        triggerId,
        actionType: dto.actionType,
        targetType: dto.targetType,
        targetPositionIds: dto.targetPositionIds ?? undefined,
        templateCode: dto.templateCode,
        customSubject: dto.customSubject,
        customBody: dto.customBody,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateAction(actionId: string, dto: UpdateTriggerActionDto) {
    const action = await this.prisma.workflowTriggerAction.findUnique({ where: { id: actionId } });
    if (!action) throw new NotFoundException("Trigger action not found");
    return this.prisma.workflowTriggerAction.update({
      where: { id: actionId },
      data: dto as any,
    });
  }

  async deleteAction(actionId: string) {
    const action = await this.prisma.workflowTriggerAction.findUnique({ where: { id: actionId } });
    if (!action) throw new NotFoundException("Trigger action not found");
    return this.prisma.workflowTriggerAction.delete({ where: { id: actionId } });
  }

  // ─── Query helpers ─────────────────────────────────────

  async getTriggersForEvent(triggerType: WorkflowTriggerType, workOrderType?: string) {
    return this.prisma.workflowTrigger.findMany({
      where: {
        triggerType,
        isActive: true,
        OR: [{ workOrderType: workOrderType ?? undefined }, { workOrderType: null }],
      },
      include: { actions: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
    });
  }

  /** Overview: all triggers organized for a specific work order type */
  async getOverview(workOrderType?: string) {
    const triggers = await this.findAll(workOrderType || undefined);

    const statusChangeTriggers = triggers.filter((t) => t.triggerType === "STATUS_CHANGE");
    const fieldChangeTriggers = triggers.filter((t) => t.triggerType === "FIELD_CHANGE");
    const inactivityTriggers = triggers.filter((t) => t.triggerType === "INACTIVITY");
    const deadlineTriggers = triggers.filter((t) => t.triggerType === "DEADLINE_PROXIMITY");

    return { statusChangeTriggers, fieldChangeTriggers, inactivityTriggers, deadlineTriggers };
  }
}
