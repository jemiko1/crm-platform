import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryCallsDto } from '../dto/query-calls.dto';
import { CallerLookupResult } from '../types/telephony.types';

@Injectable()
export class TelephonyCallsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryCallsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CallSessionWhereInput = {
      startAt: {
        gte: new Date(query.from),
        lte: new Date(query.to),
      },
    };

    if (query.queueId) where.queueId = query.queueId;
    if (query.userId) where.assignedUserId = query.userId;
    if (query.disposition) where.disposition = query.disposition;

    if (query.search) {
      where.OR = [
        { callerNumber: { contains: query.search } },
        { calleeNumber: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.callSession.findMany({
        where,
        include: {
          callMetrics: true,
          queue: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, email: true } },
          recordings: { select: { id: true, durationSeconds: true } },
          qualityReview: { select: { id: true, status: true, score: true } },
        },
        orderBy: { startAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.callSession.count({ where }),
    ]);

    return { data, total, page, pageSize };
  }

  async lookupPhone(phone: string): Promise<CallerLookupResult> {
    const normalized = this.normalizePhone(phone);

    // Search clients by primary/secondary phone
    const client = await this.prisma.client.findFirst({
      where: {
        isActive: true,
        OR: [
          { primaryPhone: { contains: normalized } },
          { secondaryPhone: { contains: normalized } },
        ],
      },
      include: {
        clientBuildings: {
          include: {
            building: { select: { id: true, name: true, coreId: true } },
          },
        },
      },
    });

    // Search leads by primary phone
    const lead = await this.prisma.lead.findFirst({
      where: {
        primaryPhone: { contains: normalized },
        status: 'ACTIVE',
      },
      include: {
        stage: { select: { name: true } },
        responsibleEmployee: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // Open work orders for matched client's buildings
    let openWorkOrders: CallerLookupResult['openWorkOrders'] = [];
    if (client) {
      const buildingIds = client.clientBuildings.map((cb) => cb.building.id);
      if (buildingIds.length > 0) {
        const workOrders = await this.prisma.workOrder.findMany({
          where: {
            buildingId: { in: buildingIds },
            status: { in: ['CREATED', 'LINKED_TO_GROUP', 'IN_PROGRESS'] },
          },
          select: {
            id: true,
            workOrderNumber: true,
            title: true,
            status: true,
            type: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
        openWorkOrders = workOrders;
      }
    }

    // Recent calls from this number
    const recentCallSessions = await this.prisma.callSession.findMany({
      where: { callerNumber: { contains: normalized } },
      select: {
        id: true,
        direction: true,
        startAt: true,
        disposition: true,
        callMetrics: { select: { talkSeconds: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 5,
    });

    return {
      client: client
        ? {
            id: client.id,
            name: [client.firstName, client.lastName].filter(Boolean).join(' '),
            idNumber: client.idNumber,
            paymentId: client.paymentId,
            buildings: client.clientBuildings.map((cb) => cb.building),
          }
        : undefined,
      lead: lead
        ? {
            id: lead.id,
            leadNumber: lead.leadNumber,
            stageName: lead.stage.name,
            responsibleEmployee: lead.responsibleEmployee
              ? `${lead.responsibleEmployee.firstName} ${lead.responsibleEmployee.lastName}`
              : null,
          }
        : undefined,
      openWorkOrders,
      recentCalls: recentCallSessions.map((s) => ({
        id: s.id,
        direction: s.direction,
        startAt: s.startAt,
        disposition: s.disposition,
        durationSec: s.callMetrics?.talkSeconds ?? null,
      })),
    };
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s\-()+]/g, '').slice(-9);
  }
}
