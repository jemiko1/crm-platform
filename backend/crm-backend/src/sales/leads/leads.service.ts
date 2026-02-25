import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadActivityService } from './lead-activity.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { ChangeStageDto } from './dto/change-stage.dto';
import { ApprovalActionDto, ApprovalAction, SubmitForApprovalDto } from './dto/approval-action.dto';
import { AddLeadServiceDto, UpdateLeadServiceDto } from './dto/lead-service.dto';
import { CreateLeadNoteDto, UpdateLeadNoteDto } from './dto/lead-note.dto';
import { CreateLeadReminderDto, UpdateLeadReminderDto } from './dto/lead-reminder.dto';
import { CreateLeadAppointmentDto, UpdateLeadAppointmentDto, CompleteAppointmentDto } from './dto/lead-appointment.dto';
import { LeadActivityType, LeadStatus, Prisma, ReminderStatus, AppointmentStatus } from '@prisma/client';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityService: LeadActivityService,
  ) {}

  // ==================== LEAD CRUD ====================

  async create(dto: CreateLeadDto, employeeId: string) {
    // Get the first stage (POTENTIAL)
    const firstStage = await this.prisma.leadStage.findFirst({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    if (!firstStage) {
      throw new BadRequestException('No active lead stages configured');
    }

    // Validate employee ID
    if (!employeeId && !dto.responsibleEmployeeId) {
      throw new BadRequestException('Either logged in user must be an employee or responsibleEmployeeId must be provided');
    }

    const responsibleEmployeeId = dto.responsibleEmployeeId || employeeId;

    // Verify responsible employee exists
    if (responsibleEmployeeId) {
      const responsibleEmployee = await this.prisma.employee.findUnique({
        where: { id: responsibleEmployeeId },
      });
      if (!responsibleEmployee) {
        throw new NotFoundException('Responsible employee not found');
      }
    }

    // Use the responsible employee as creator if current user is not an employee
    const creatorId = employeeId || responsibleEmployeeId;

    // Create the lead
    const lead = await this.prisma.lead.create({
      data: {
        stageId: firstStage.id,
        name: dto.name,
        representative: dto.representative,
        primaryPhone: dto.primaryPhone,
        contactPersons: dto.contactPersons ? JSON.parse(JSON.stringify(dto.contactPersons)) : undefined,
        associationName: dto.associationName,
        sourceId: dto.sourceId,
        city: dto.city,
        address: dto.address,
        floorsCount: dto.floorsCount || 0,
        entrancesCount: dto.entrancesCount || 0,
        apartmentsPerFloor: dto.apartmentsPerFloor || 0,
        elevatorsCount: dto.elevatorsCount || 0,
        entranceDoorsCount: dto.entranceDoorsCount || 0,
        responsibleEmployeeId: responsibleEmployeeId!,
        createdById: creatorId!,
      },
      include: {
        stage: true,
        source: true,
        responsibleEmployee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        },
      },
    });

    // Add initial services if provided
    if (dto.serviceIds && dto.serviceIds.length > 0) {
      for (const serviceId of dto.serviceIds) {
        await this.addService(lead.id, { serviceId }, employeeId);
      }
    }

    // Log activity
    await this.activityService.logActivity({
      leadId: lead.id,
      activityType: LeadActivityType.LEAD_CREATED,
      category: 'MAIN',
      action: 'Lead Created',
      description: `Lead #${lead.leadNumber} created for ${lead.name}`,
      performedById: employeeId,
      newValues: this.activityService.createLeadSnapshot(lead),
    });

    return lead;
  }

  async findAll(query: QueryLeadsDto, employeeId: string, canViewAll: boolean) {
    const where: Prisma.LeadWhereInput = {};

    // Permission-based filtering
    if (!canViewAll) {
      where.responsibleEmployeeId = employeeId;
    }

    // Search
    if (query.q) {
      where.OR = [
        { name: { contains: query.q, mode: 'insensitive' } },
        { address: { contains: query.q, mode: 'insensitive' } },
        { city: { contains: query.q, mode: 'insensitive' } },
        { primaryPhone: { contains: query.q } },
        { leadNumber: { equals: parseInt(query.q) || -1 } },
      ];
    }

    // Filters
    if (query.status) where.status = query.status;
    if (query.stageId) where.stageId = query.stageId;
    if (query.responsibleEmployeeId) where.responsibleEmployeeId = query.responsibleEmployeeId;
    if (query.sourceId) where.sourceId = query.sourceId;
    if (query.city) where.city = { contains: query.city, mode: 'insensitive' };

    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        include: {
          stage: true,
          source: true,
          responsibleEmployee: {
            select: { id: true, firstName: true, lastName: true, employeeId: true },
          },
          _count: {
            select: { services: true, notes: true, reminders: true, appointments: true },
          },
        },
        orderBy: { [query.sortBy || 'createdAt']: query.sortOrder || 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        stage: true,
        source: true,
        responsibleEmployee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true, email: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        },
        services: {
          include: {
            service: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        notes: {
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        },
        reminders: {
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { remindAt: 'asc' },
        },
        appointments: {
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { startTime: 'asc' },
        },
        stageHistory: {
          include: {
            fromStage: true,
            toStage: true,
            changedBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) {
      throw new NotFoundException('Lead not found');
    }

    return lead;
  }

  async update(id: string, dto: UpdateLeadDto, employeeId: string) {
    const lead = await this.findOne(id);

    // Check if lead is locked
    if (lead.isLocked) {
      throw new ForbiddenException('Lead is locked and cannot be edited');
    }

    const previousValues = this.activityService.createLeadSnapshot(lead);

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        name: dto.name,
        representative: dto.representative,
        primaryPhone: dto.primaryPhone,
        contactPersons: dto.contactPersons ? JSON.parse(JSON.stringify(dto.contactPersons)) : undefined,
        associationName: dto.associationName,
        sourceId: dto.sourceId,
        city: dto.city,
        address: dto.address,
        floorsCount: dto.floorsCount,
        entrancesCount: dto.entrancesCount,
        apartmentsPerFloor: dto.apartmentsPerFloor,
        elevatorsCount: dto.elevatorsCount,
        entranceDoorsCount: dto.entranceDoorsCount,
        responsibleEmployeeId: dto.responsibleEmployeeId,
      },
      include: {
        stage: true,
        source: true,
        responsibleEmployee: {
          select: { id: true, firstName: true, lastName: true, employeeId: true },
        },
      },
    });

    const newValues = this.activityService.createLeadSnapshot(updated);
    const changedFields = this.activityService.computeChangedFields(previousValues, newValues);

    if (changedFields.length > 0) {
      await this.activityService.logActivity({
        leadId: id,
        activityType: LeadActivityType.LEAD_UPDATED,
        category: 'DETAIL',
        action: 'Lead Updated',
        description: `Updated fields: ${changedFields.join(', ')}`,
        performedById: employeeId,
        previousValues,
        newValues,
        changedFields,
      });
    }

    return updated;
  }

  async delete(id: string, employeeId: string) {
    const lead = await this.findOne(id);

    // Soft delete by setting status to LOST
    await this.prisma.lead.update({
      where: { id },
      data: {
        status: LeadStatus.LOST,
        lostAt: new Date(),
        lostReason: 'Deleted by user',
      },
    });

    await this.activityService.logActivity({
      leadId: id,
      activityType: LeadActivityType.LEAD_CANCELLED,
      category: 'MAIN',
      action: 'Lead Deleted',
      description: `Lead #${lead.leadNumber} was deleted`,
      performedById: employeeId,
    });

    return { success: true };
  }

  // ==================== STAGE MANAGEMENT ====================

  async changeStage(id: string, dto: ChangeStageDto, employeeId: string) {
    const lead = await this.findOne(id);

    if (lead.isLocked) {
      throw new ForbiddenException('Lead is locked and stage cannot be changed');
    }

    const newStage = await this.prisma.leadStage.findUnique({
      where: { id: dto.stageId },
    });

    if (!newStage) {
      throw new NotFoundException('Stage not found');
    }

    const previousStage = lead.stage;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id },
        data: { stageId: dto.stageId },
        include: { stage: true },
      });

      await tx.leadStageHistory.create({
        data: {
          leadId: id,
          fromStageId: previousStage.id,
          toStageId: newStage.id,
          reason: dto.reason,
          changedById: employeeId,
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: id,
          activityType: LeadActivityType.STAGE_CHANGED,
          category: 'MAIN',
          action: 'Stage Changed',
          description: `Stage changed from "${previousStage.name}" to "${newStage.name}"${dto.reason ? ` - Reason: ${dto.reason}` : ''}`,
          performedById: employeeId,
          previousValues: { stageId: previousStage.id, stageName: previousStage.name },
          newValues: { stageId: newStage.id, stageName: newStage.name },
          metadata: { reason: dto.reason },
        },
      });

      return result;
    });

    return updated;
  }

  // ==================== APPROVAL WORKFLOW ====================

  async submitForApproval(id: string, dto: SubmitForApprovalDto, employeeId: string) {
    const lead = await this.findOne(id);

    if (lead.isLocked) {
      throw new BadRequestException('Lead is already submitted for approval');
    }

    // Get the approval stage
    const approvalStage = await this.prisma.leadStage.findFirst({
      where: { code: 'APPROVAL', isActive: true },
    });

    if (!approvalStage) {
      throw new BadRequestException('Approval stage not configured');
    }

    // Check if current stage allows submission (should be before approval)
    if (lead.stage.sortOrder >= approvalStage.sortOrder) {
      throw new BadRequestException('Lead is already at or past approval stage');
    }

    // Check if responsible employee is Head of Sales (skip approval)
    const headOfSalesConfig = await this.prisma.salesPipelineConfig.findUnique({
      where: { key: 'HEAD_OF_SALES_POSITION' },
      include: {
        assignedPositions: true,
      },
    });

    const responsibleEmployee = lead.responsibleEmployeeId 
      ? await this.prisma.employee.findUnique({
          where: { id: lead.responsibleEmployeeId },
          include: { position: true },
        })
      : null;

    const isHeadOfSales = headOfSalesConfig?.assignedPositions.some(
      (ap) => ap.positionId === responsibleEmployee?.positionId
    );

    if (isHeadOfSales) {
      const wonStage = await this.prisma.leadStage.findFirst({
        where: { code: 'WON', isActive: true },
      });

      if (wonStage) {
        await this.prisma.$transaction(async (tx) => {
          await tx.lead.update({
            where: { id },
            data: {
              stageId: wonStage.id,
              status: LeadStatus.WON,
              wonAt: new Date(),
              approvedAt: new Date(),
              approvedBy: employeeId,
            },
          });

          await tx.leadActivity.create({
            data: {
              leadId: id,
              activityType: LeadActivityType.LEAD_APPROVED,
              category: 'MAIN',
              action: 'Lead Auto-Approved',
              description: 'Lead automatically approved (Head of Sales is responsible)',
              performedById: employeeId,
            },
          });
        });

        return this.findOne(id);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id },
        data: {
          isLocked: true,
          lockedAt: new Date(),
          lockedBy: employeeId,
          stageId: approvalStage.id,
          submittedForApprovalAt: new Date(),
          submittedForApprovalBy: employeeId,
        },
        include: { stage: true },
      });

      await tx.leadStageHistory.create({
        data: {
          leadId: id,
          fromStageId: lead.stageId,
          toStageId: approvalStage.id,
          reason: dto.notes || 'Submitted for approval',
          changedById: employeeId,
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: id,
          activityType: LeadActivityType.LEAD_LOCKED,
          category: 'MAIN',
          action: 'Submitted for Approval',
          description: `Lead locked and submitted for approval${dto.notes ? ` - Notes: ${dto.notes}` : ''}`,
          performedById: employeeId,
          metadata: { notes: dto.notes } as any,
        },
      });

      return result;
    });

    return updated;
  }

  async processApproval(id: string, dto: ApprovalActionDto, employeeId: string) {
    const lead = await this.findOne(id);

    if (!lead.isLocked) {
      throw new BadRequestException('Lead must be submitted for approval first');
    }

    switch (dto.action) {
      case ApprovalAction.APPROVE:
        return this.approveLead(lead, employeeId, dto.notes);

      case ApprovalAction.UNLOCK:
        return this.unlockLead(lead, employeeId, dto.notes);

      case ApprovalAction.CANCEL:
        return this.cancelLead(lead, employeeId, dto.notes, dto.lostReason);

      default:
        throw new BadRequestException('Invalid approval action');
    }
  }

  private async approveLead(lead: any, employeeId: string, notes?: string) {
    const wonStage = await this.prisma.leadStage.findFirst({
      where: { code: 'WON', isActive: true },
    });

    if (!wonStage) {
      throw new BadRequestException('Won stage not configured');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id: lead.id },
        data: {
          stageId: wonStage.id,
          status: LeadStatus.WON,
          wonAt: new Date(),
          approvedAt: new Date(),
          approvedBy: employeeId,
          approvalNotes: notes,
        },
        include: { stage: true },
      });

      await tx.leadStageHistory.create({
        data: {
          leadId: lead.id,
          fromStageId: lead.stageId,
          toStageId: wonStage.id,
          reason: notes || 'Approved',
          changedById: employeeId,
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          activityType: LeadActivityType.LEAD_APPROVED,
          category: 'MAIN',
          action: 'Lead Approved',
          description: `Lead approved and marked as Won${notes ? ` - Notes: ${notes}` : ''}`,
          performedById: employeeId,
          metadata: { notes } as any,
        },
      });

      return result;
    });

    return updated;
  }

  private async unlockLead(lead: any, employeeId: string, notes?: string) {
    const previousStage = await this.prisma.leadStage.findFirst({
      where: { code: 'NEGOTIATION', isActive: true },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id: lead.id },
        data: {
          isLocked: false,
          lockedAt: null,
          lockedBy: null,
          stageId: previousStage?.id || lead.stageId,
          approvalNotes: notes,
        },
        include: { stage: true },
      });

      if (previousStage) {
        await tx.leadStageHistory.create({
          data: {
            leadId: lead.id,
            fromStageId: lead.stageId,
            toStageId: previousStage.id,
            reason: notes || 'Returned for corrections',
            changedById: employeeId,
          },
        });
      }

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          activityType: LeadActivityType.LEAD_UNLOCKED,
          category: 'MAIN',
          action: 'Lead Unlocked',
          description: `Lead unlocked and returned for corrections${notes ? ` - Notes: ${notes}` : ''}`,
          performedById: employeeId,
          metadata: { notes } as any,
        },
      });

      return result;
    });

    return updated;
  }

  private async cancelLead(lead: any, employeeId: string, notes?: string, lostReason?: string) {
    const lostStage = await this.prisma.leadStage.findFirst({
      where: { code: 'LOST', isActive: true },
    });

    if (!lostStage) {
      throw new BadRequestException('Lost stage not configured');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.lead.update({
        where: { id: lead.id },
        data: {
          stageId: lostStage.id,
          status: LeadStatus.LOST,
          isLocked: false,
          lostAt: new Date(),
          lostReason: lostReason || notes,
          approvalNotes: notes,
        },
        include: { stage: true },
      });

      await tx.leadStageHistory.create({
        data: {
          leadId: lead.id,
          fromStageId: lead.stageId,
          toStageId: lostStage.id,
          reason: lostReason || notes || 'Cancelled',
          changedById: employeeId,
        },
      });

      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          activityType: LeadActivityType.LEAD_CANCELLED,
          category: 'MAIN',
          action: 'Lead Cancelled',
          description: `Lead cancelled and marked as Lost${lostReason ? ` - Reason: ${lostReason}` : ''}`,
          performedById: employeeId,
          metadata: { notes, lostReason } as any,
        },
      });

      return result;
    });

    return updated;
  }

  // ==================== LEAD SERVICES ====================

  async addService(leadId: string, dto: AddLeadServiceDto, employeeId: string) {
    const lead = await this.findOne(leadId);

    if (lead.isLocked) {
      throw new ForbiddenException('Lead is locked');
    }

    const service = await this.prisma.salesService.findUnique({
      where: { id: dto.serviceId },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    const leadService = await this.prisma.leadService.create({
      data: {
        leadId,
        serviceId: dto.serviceId,
        quantity: dto.quantity || 1,
        monthlyPrice: dto.monthlyPrice ?? service.monthlyPrice,
        oneTimePrice: dto.oneTimePrice ?? service.oneTimePrice,
        customParams: dto.customParams as Prisma.InputJsonValue,
        notes: dto.notes,
      },
      include: { service: true },
    });

    // Update lead totals
    await this.updateLeadPricingTotals(leadId);

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.SERVICE_ADDED,
      category: 'DETAIL',
      action: 'Service Added',
      description: `Added service: ${service.name} (Qty: ${dto.quantity || 1})`,
      performedById: employeeId,
      newValues: { serviceId: dto.serviceId, serviceName: service.name, quantity: dto.quantity },
    });

    return leadService;
  }

  async updateService(leadId: string, serviceId: string, dto: UpdateLeadServiceDto, employeeId: string) {
    const lead = await this.findOne(leadId);

    if (lead.isLocked) {
      throw new ForbiddenException('Lead is locked');
    }

    const leadService = await this.prisma.leadService.findUnique({
      where: { leadId_serviceId: { leadId, serviceId } },
      include: { service: true },
    });

    if (!leadService) {
      throw new NotFoundException('Service not found on this lead');
    }

    const updated = await this.prisma.leadService.update({
      where: { leadId_serviceId: { leadId, serviceId } },
      data: {
        quantity: dto.quantity,
        monthlyPrice: dto.monthlyPrice,
        oneTimePrice: dto.oneTimePrice,
        customParams: dto.customParams as Prisma.InputJsonValue,
        notes: dto.notes,
      },
      include: { service: true },
    });

    await this.updateLeadPricingTotals(leadId);

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.SERVICE_UPDATED,
      category: 'DETAIL',
      action: 'Service Updated',
      description: `Updated service: ${leadService.service.name}`,
      performedById: employeeId,
    });

    return updated;
  }

  async removeService(leadId: string, serviceId: string, employeeId: string) {
    const lead = await this.findOne(leadId);

    if (lead.isLocked) {
      throw new ForbiddenException('Lead is locked');
    }

    const leadService = await this.prisma.leadService.findUnique({
      where: { leadId_serviceId: { leadId, serviceId } },
      include: { service: true },
    });

    if (!leadService) {
      throw new NotFoundException('Service not found on this lead');
    }

    await this.prisma.leadService.delete({
      where: { leadId_serviceId: { leadId, serviceId } },
    });

    await this.updateLeadPricingTotals(leadId);

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.SERVICE_REMOVED,
      category: 'DETAIL',
      action: 'Service Removed',
      description: `Removed service: ${leadService.service.name}`,
      performedById: employeeId,
    });

    return { success: true };
  }

  private async updateLeadPricingTotals(leadId: string) {
    const services = await this.prisma.leadService.findMany({
      where: { leadId },
    });

    let totalMonthly = 0;
    let totalOneTime = 0;

    for (const s of services) {
      const monthly = Number(s.monthlyPrice) || 0;
      const oneTime = Number(s.oneTimePrice) || 0;
      totalMonthly += monthly * s.quantity;
      totalOneTime += oneTime * s.quantity;
    }

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        totalMonthlyPrice: totalMonthly,
        totalOneTimePrice: totalOneTime,
      },
    });
  }

  // ==================== NOTES ====================

  async addNote(leadId: string, dto: CreateLeadNoteDto, employeeId: string) {
    await this.findOne(leadId);

    const note = await this.prisma.leadNote.create({
      data: {
        leadId,
        content: dto.content,
        isPinned: dto.isPinned || false,
        createdById: employeeId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.NOTE_ADDED,
      category: 'DETAIL',
      action: 'Note Added',
      description: `Added note: "${dto.content.substring(0, 100)}${dto.content.length > 100 ? '...' : ''}"`,
      performedById: employeeId,
    });

    return note;
  }

  async updateNote(leadId: string, noteId: string, dto: UpdateLeadNoteDto, employeeId: string) {
    const note = await this.prisma.leadNote.findFirst({
      where: { id: noteId, leadId },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    const updated = await this.prisma.leadNote.update({
      where: { id: noteId },
      data: {
        content: dto.content,
        isPinned: dto.isPinned,
      },
    });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.NOTE_UPDATED,
      category: 'DETAIL',
      action: 'Note Updated',
      description: 'Note was updated',
      performedById: employeeId,
    });

    return updated;
  }

  async deleteNote(leadId: string, noteId: string, employeeId: string) {
    const note = await this.prisma.leadNote.findFirst({
      where: { id: noteId, leadId },
    });

    if (!note) {
      throw new NotFoundException('Note not found');
    }

    await this.prisma.leadNote.delete({ where: { id: noteId } });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.NOTE_DELETED,
      category: 'DETAIL',
      action: 'Note Deleted',
      description: 'Note was deleted',
      performedById: employeeId,
    });

    return { success: true };
  }

  // ==================== REMINDERS ====================

  async addReminder(leadId: string, dto: CreateLeadReminderDto, employeeId: string) {
    await this.findOne(leadId);

    const reminder = await this.prisma.leadReminder.create({
      data: {
        leadId,
        title: dto.title,
        description: dto.description,
        remindAt: new Date(dto.remindAt),
        createdById: employeeId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.REMINDER_CREATED,
      category: 'DETAIL',
      action: 'Reminder Created',
      description: `Created reminder: "${dto.title}" for ${new Date(dto.remindAt).toLocaleString()}`,
      performedById: employeeId,
    });

    return reminder;
  }

  async completeReminder(leadId: string, reminderId: string, employeeId: string) {
    const reminder = await this.prisma.leadReminder.findFirst({
      where: { id: reminderId, leadId },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    const updated = await this.prisma.leadReminder.update({
      where: { id: reminderId },
      data: {
        status: ReminderStatus.COMPLETED,
        completedAt: new Date(),
        completedBy: employeeId,
      },
    });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.REMINDER_COMPLETED,
      category: 'DETAIL',
      action: 'Reminder Completed',
      description: `Completed reminder: "${reminder.title}"`,
      performedById: employeeId,
    });

    return updated;
  }

  async deleteReminder(leadId: string, reminderId: string, employeeId: string) {
    const reminder = await this.prisma.leadReminder.findFirst({
      where: { id: reminderId, leadId },
    });

    if (!reminder) {
      throw new NotFoundException('Reminder not found');
    }

    await this.prisma.leadReminder.delete({ where: { id: reminderId } });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.REMINDER_DELETED,
      category: 'DETAIL',
      action: 'Reminder Deleted',
      description: `Deleted reminder: "${reminder.title}"`,
      performedById: employeeId,
    });

    return { success: true };
  }

  // ==================== APPOINTMENTS ====================

  async addAppointment(leadId: string, dto: CreateLeadAppointmentDto, employeeId: string) {
    await this.findOne(leadId);

    const appointment = await this.prisma.leadAppointment.create({
      data: {
        leadId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : null,
        createdById: employeeId,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.APPOINTMENT_SCHEDULED,
      category: 'DETAIL',
      action: 'Appointment Scheduled',
      description: `Scheduled appointment: "${dto.title}" at ${new Date(dto.startTime).toLocaleString()}`,
      performedById: employeeId,
    });

    return appointment;
  }

  async completeAppointment(leadId: string, appointmentId: string, dto: CompleteAppointmentDto, employeeId: string) {
    const appointment = await this.prisma.leadAppointment.findFirst({
      where: { id: appointmentId, leadId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const updated = await this.prisma.leadAppointment.update({
      where: { id: appointmentId },
      data: {
        status: AppointmentStatus.COMPLETED,
        completedAt: new Date(),
        outcome: dto.outcome,
      },
    });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.APPOINTMENT_COMPLETED,
      category: 'DETAIL',
      action: 'Appointment Completed',
      description: `Completed appointment: "${appointment.title}"${dto.outcome ? ` - Outcome: ${dto.outcome}` : ''}`,
      performedById: employeeId,
      metadata: { outcome: dto.outcome },
    });

    return updated;
  }

  async cancelAppointment(leadId: string, appointmentId: string, employeeId: string) {
    const appointment = await this.prisma.leadAppointment.findFirst({
      where: { id: appointmentId, leadId },
    });

    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const updated = await this.prisma.leadAppointment.update({
      where: { id: appointmentId },
      data: { status: AppointmentStatus.CANCELLED },
    });

    await this.activityService.logActivity({
      leadId,
      activityType: LeadActivityType.APPOINTMENT_CANCELLED,
      category: 'DETAIL',
      action: 'Appointment Cancelled',
      description: `Cancelled appointment: "${appointment.title}"`,
      performedById: employeeId,
    });

    return updated;
  }

  // ==================== ACTIVITY LOG ====================

  async getActivityLog(leadId: string, category?: 'MAIN' | 'DETAIL' | 'SYSTEM') {
    await this.findOne(leadId);
    return this.activityService.getLeadActivities(leadId, { category });
  }

  // ==================== STATISTICS ====================

  async getStatistics(employeeId?: string) {
    const where: Prisma.LeadWhereInput = employeeId
      ? { responsibleEmployeeId: employeeId }
      : {};

    const [total, active, won, lost, byStage] = await Promise.all([
      this.prisma.lead.count({ where }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.ACTIVE } }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.WON } }),
      this.prisma.lead.count({ where: { ...where, status: LeadStatus.LOST } }),
      this.prisma.lead.groupBy({
        by: ['stageId'],
        where: { ...where, status: LeadStatus.ACTIVE },
        _count: { id: true },
      }),
    ]);

    const stages = await this.prisma.leadStage.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });

    const stageStats = stages.map((stage) => {
      const found = byStage.find((s) => s.stageId === stage.id);
      return {
        stageId: stage.id,
        stageName: stage.name,
        stageNameKa: stage.nameKa,
        stageCode: stage.code,
        color: stage.color,
        count: found?._count.id || 0,
      };
    });

    return {
      total,
      active,
      won,
      lost,
      conversionRate: total > 0 ? ((won / total) * 100).toFixed(1) : '0',
      byStage: stageStats,
    };
  }
}
