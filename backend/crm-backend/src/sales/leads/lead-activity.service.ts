import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadActivityType, Prisma } from '@prisma/client';

export interface LogActivityParams {
  leadId: string;
  activityType: LeadActivityType;
  category: 'MAIN' | 'DETAIL' | 'SYSTEM';
  action: string;
  description: string;
  performedById?: string;
  performedByName?: string;
  previousValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changedFields?: string[];
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class LeadActivityService {
  constructor(private readonly prisma: PrismaService) {}

  async logActivity(params: LogActivityParams) {
    return this.prisma.leadActivity.create({
      data: {
        leadId: params.leadId,
        activityType: params.activityType,
        category: params.category,
        action: params.action,
        description: params.description,
        performedById: params.performedById,
        performedByName: params.performedByName,
        previousValues: params.previousValues as Prisma.InputJsonValue,
        newValues: params.newValues as Prisma.InputJsonValue,
        changedFields: params.changedFields as Prisma.InputJsonValue,
        metadata: params.metadata as Prisma.InputJsonValue,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  }

  async getLeadActivities(
    leadId: string,
    options?: {
      category?: 'MAIN' | 'DETAIL' | 'SYSTEM';
      activityType?: LeadActivityType;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.LeadActivityWhereInput = { leadId };

    if (options?.category) {
      where.category = options.category;
    }
    if (options?.activityType) {
      where.activityType = options.activityType;
    }

    return this.prisma.leadActivity.findMany({
      where,
      include: {
        performedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  // Helper to compute changed fields between two objects
  computeChangedFields(
    previousValues: Record<string, any>,
    newValues: Record<string, any>,
  ): string[] {
    const changedFields: string[] = [];
    const allKeys = new Set([
      ...Object.keys(previousValues),
      ...Object.keys(newValues),
    ]);

    for (const key of allKeys) {
      const prev = JSON.stringify(previousValues[key]);
      const next = JSON.stringify(newValues[key]);
      if (prev !== next) {
        changedFields.push(key);
      }
    }

    return changedFields;
  }

  // Helper to create a snapshot of lead for logging
  createLeadSnapshot(lead: any): Record<string, any> {
    return {
      name: lead.name,
      representative: lead.representative,
      primaryPhone: lead.primaryPhone,
      contactPersons: lead.contactPersons,
      associationName: lead.associationName,
      sourceId: lead.sourceId,
      city: lead.city,
      address: lead.address,
      floorsCount: lead.floorsCount,
      entrancesCount: lead.entrancesCount,
      apartmentsPerFloor: lead.apartmentsPerFloor,
      elevatorsCount: lead.elevatorsCount,
      entranceDoorsCount: lead.entranceDoorsCount,
      responsibleEmployeeId: lead.responsibleEmployeeId,
      stageId: lead.stageId,
      status: lead.status,
      isLocked: lead.isLocked,
    };
  }
}
