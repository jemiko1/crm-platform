import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryCallsDto } from '../dto/query-calls.dto';
import { CallerLookupResult } from '../types/telephony.types';
import { PhoneResolverService } from '../../common/phone-resolver/phone-resolver.service';
import { IntelligenceService } from '../../client-intelligence/services/intelligence.service';

@Injectable()
export class TelephonyCallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly phoneResolver: PhoneResolverService,
    private readonly intelligenceService: IntelligenceService,
  ) {}

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
    const normalized = this.phoneResolver.localDigits(phone);

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

    // Incidents for matched client
    let openIncidents: CallerLookupResult['openIncidents'] = [];
    let recentIncidents: CallerLookupResult['recentIncidents'] = [];
    if (client) {
      const incidentSelect = {
        id: true,
        incidentNumber: true,
        status: true,
        priority: true,
        incidentType: true,
        description: true,
        createdAt: true,
        building: { select: { name: true } },
      } as const;

      const [openRaw, closedRaw] = await Promise.all([
        this.prisma.incident.findMany({
          where: {
            clientId: client.id,
            status: { in: ['CREATED', 'IN_PROGRESS'] },
          },
          select: incidentSelect,
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        this.prisma.incident.findMany({
          where: {
            clientId: client.id,
            status: { in: ['COMPLETED', 'WORK_ORDER_INITIATED'] },
          },
          select: incidentSelect,
          orderBy: { createdAt: 'desc' },
          take: 5,
        }),
      ]);

      openIncidents = openRaw.map((i) => ({
        id: i.id,
        incidentNumber: i.incidentNumber,
        status: i.status,
        priority: i.priority,
        incidentType: i.incidentType,
        description: i.description,
        buildingName: i.building.name,
        createdAt: i.createdAt,
      }));

      recentIncidents = closedRaw.map((i) => ({
        id: i.id,
        incidentNumber: i.incidentNumber,
        status: i.status,
        priority: i.priority,
        incidentType: i.incidentType,
        description: i.description,
        buildingName: i.building.name,
        createdAt: i.createdAt,
      }));
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

    let intelligence: CallerLookupResult['intelligence'];
    if (client) {
      try {
        const profile = await this.intelligenceService.getProfile(client.coreId, 180);
        intelligence = {
          labels: profile.labels,
          summary: profile.summary,
        };
      } catch {
        // non-critical, skip if intelligence fails
      }
    }

    return {
      client: client
        ? {
            id: client.id,
            coreId: client.coreId,
            name: [client.firstName, client.lastName].filter(Boolean).join(' '),
            firstName: client.firstName,
            lastName: client.lastName,
            idNumber: client.idNumber,
            paymentId: client.paymentId,
            primaryPhone: client.primaryPhone,
            secondaryPhone: client.secondaryPhone,
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
      openIncidents,
      recentIncidents,
      intelligence,
      recentCalls: recentCallSessions.map((s) => ({
        id: s.id,
        direction: s.direction,
        startAt: s.startAt,
        disposition: s.disposition,
        durationSec: s.callMetrics?.talkSeconds ?? null,
      })),
    };
  }

  async getExtensionHistory(extension: string) {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const sessions = await this.prisma.callSession.findMany({
      where: {
        assignedExtension: extension,
        startAt: { gte: threeDaysAgo },
      },
      select: {
        id: true,
        direction: true,
        callerNumber: true,
        calleeNumber: true,
        startAt: true,
        answerAt: true,
        endAt: true,
        disposition: true,
        callMetrics: { select: { talkSeconds: true } },
      },
      orderBy: { startAt: 'desc' },
      take: 100,
    });

    return sessions.map((s) => ({
      id: s.id,
      direction: s.direction,
      callerNumber: s.callerNumber,
      calleeNumber: s.calleeNumber,
      startAt: s.startAt,
      answerAt: s.answerAt,
      endAt: s.endAt,
      disposition: s.disposition,
      durationSec: s.callMetrics?.talkSeconds ?? null,
    }));
  }

}
