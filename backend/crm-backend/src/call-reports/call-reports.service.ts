import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DataScopeService } from '../common/utils/data-scope';
import { CreateCallReportDto } from './dto/create-call-report.dto';
import { UpdateCallReportDto } from './dto/update-call-report.dto';
import { CallReportStatus } from '@prisma/client';

@Injectable()
export class CallReportsService {
  constructor(
    private prisma: PrismaService,
    private dataScope: DataScopeService,
  ) {}

  async create(dto: CreateCallReportDto, userId: string) {
    // Validate call session exists and has no existing report
    const session = await this.prisma.callSession.findUnique({
      where: { id: dto.callSessionId },
      select: { id: true, callReport: { select: { id: true } } },
    });

    if (!session) {
      throw new BadRequestException('Call session not found');
    }
    if (session.callReport) {
      throw new BadRequestException('A report already exists for this call session');
    }

    // Validate labels are valid category codes
    await this.validateLabels(dto.labels);

    // Validate paymentId if provided
    if (dto.paymentId) {
      const cb = await this.prisma.clientBuilding.findFirst({
        where: { paymentId: dto.paymentId },
        select: { id: true },
      });
      if (!cb) {
        throw new BadRequestException(`Invalid paymentId: ${dto.paymentId}`);
      }
    }

    return this.prisma.callReport.create({
      data: {
        callSessionId: dto.callSessionId,
        callerClientId: dto.callerClientId || null,
        paymentId: dto.paymentId || null,
        subjectClientId: dto.subjectClientId || null,
        clientBuildingId: dto.clientBuildingId || null,
        buildingId: dto.buildingId || null,
        notes: dto.notes || null,
        operatorUserId: userId,
        status: dto.status,
        labels: {
          create: dto.labels.map((code) => ({ categoryCode: code })),
        },
      },
      include: {
        labels: true,
        callerClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
        subjectClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
        building: { select: { id: true, name: true, address: true } },
        clientBuilding: { select: { id: true, apartmentNumber: true, entranceNumber: true, floorNumber: true, balance: true } },
        operatorUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async update(id: string, dto: UpdateCallReportDto, userId: string, isSuperAdmin?: boolean) {
    const existing = await this.prisma.callReport.findUnique({
      where: { id },
      select: { id: true, operatorUserId: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException('Call report not found');
    }

    // Completed reports are immutable
    if (existing.status === CallReportStatus.COMPLETED) {
      throw new BadRequestException('Completed reports cannot be edited');
    }

    // Only the creator can update, unless user has .all scope
    if (existing.operatorUserId !== userId && !isSuperAdmin) {
      const scope = await this.dataScope.resolve(userId, 'call_logs');
      if (scope.scope !== 'all') {
        throw new ForbiddenException('You can only edit your own reports');
      }
    }

    // Validate labels if being updated
    if (dto.labels) {
      await this.validateLabels(dto.labels);
    }

    // If completing a draft, ensure at least 1 label exists
    if (dto.status === CallReportStatus.COMPLETED && !dto.labels) {
      const labelCount = await this.prisma.callReportLabel.count({
        where: { callReportId: id },
      });
      if (labelCount === 0) {
        throw new BadRequestException('At least one category label is required to complete a report');
      }
    }

    // Build update data
    const data: any = {};
    if (dto.callerClientId !== undefined) data.callerClientId = dto.callerClientId || null;
    if (dto.paymentId !== undefined) data.paymentId = dto.paymentId || null;
    if (dto.subjectClientId !== undefined) data.subjectClientId = dto.subjectClientId || null;
    if (dto.clientBuildingId !== undefined) data.clientBuildingId = dto.clientBuildingId || null;
    if (dto.buildingId !== undefined) data.buildingId = dto.buildingId || null;
    if (dto.notes !== undefined) data.notes = dto.notes || null;
    if (dto.status !== undefined) data.status = dto.status;

    // If labels are being updated, replace them in a transaction
    if (dto.labels) {
      return this.prisma.$transaction(async (tx) => {
        await tx.callReportLabel.deleteMany({ where: { callReportId: id } });
        return tx.callReport.update({
          where: { id },
          data: {
            ...data,
            labels: {
              create: dto.labels!.map((code) => ({ categoryCode: code })),
            },
          },
          include: {
            labels: true,
            callerClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
            subjectClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
            building: { select: { id: true, name: true, address: true } },
            clientBuilding: { select: { id: true, apartmentNumber: true, entranceNumber: true, floorNumber: true, balance: true } },
            operatorUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
          },
        });
      });
    }

    return this.prisma.callReport.update({
      where: { id },
      data,
      include: {
        labels: true,
        callerClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
        subjectClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
        building: { select: { id: true, name: true, address: true } },
        clientBuilding: { select: { id: true, apartmentNumber: true, entranceNumber: true, floorNumber: true, balance: true } },
        operatorUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  async findOne(id: string, userId: string, isSuperAdmin?: boolean) {
    const report = await this.prisma.callReport.findUnique({
      where: { id },
      include: {
        labels: true,
        callSession: {
          select: {
            id: true, direction: true, callerNumber: true, calleeNumber: true,
            startAt: true, answerAt: true, endAt: true, disposition: true,
          },
        },
        callerClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true, idNumber: true } },
        subjectClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true, idNumber: true } },
        building: { select: { id: true, name: true, address: true } },
        clientBuilding: { select: { id: true, apartmentNumber: true, entranceNumber: true, floorNumber: true, balance: true, paymentId: true } },
        operatorUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (!report) {
      throw new NotFoundException('Call report not found');
    }

    // Enforce data scope: only allow access based on call_logs scope
    const scope = await this.dataScope.resolve(userId, 'call_logs', isSuperAdmin);
    if (scope.scope === 'own' && report.operatorUserId !== userId) {
      throw new ForbiddenException('You can only view your own reports');
    }
    if ((scope.scope === 'department' || scope.scope === 'department_tree') && report.operatorUserId !== userId) {
      const scopeFilter = this.dataScope.buildUserFilter(scope);
      const allowed = await this.prisma.callReport.count({
        where: { id, ...scopeFilter },
      });
      if (allowed === 0) {
        throw new ForbiddenException('You do not have access to this report');
      }
    }

    return report;
  }

  async list(
    userId: string,
    isSuperAdmin: boolean,
    filters: {
      status?: string;
      buildingId?: string;
      operatorId?: string;
      categoryCode?: string;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const scope = await this.dataScope.resolve(userId, 'call_logs', isSuperAdmin);
    const scopeFilter = this.dataScope.buildUserFilter(scope);

    const where: any = { ...scopeFilter };

    if (filters.status && Object.values(CallReportStatus).includes(filters.status as CallReportStatus)) {
      where.status = filters.status;
    }
    if (filters.buildingId) {
      where.buildingId = filters.buildingId;
    }
    if (filters.operatorId) {
      // Only narrow within existing scope — never widen
      if (scope.scope === 'all' || filters.operatorId === userId) {
        where.operatorUserId = filters.operatorId;
      }
      // For department/department_tree scopes, add as AND condition (Prisma merges)
      else if (scope.scope === 'department' || scope.scope === 'department_tree') {
        where.AND = [
          ...(where.AND || []),
          { operatorUserId: filters.operatorId },
        ];
      }
      // For 'own' scope, ignore operatorId filter (already restricted to own)
    }
    if (filters.categoryCode) {
      where.labels = { some: { categoryCode: filters.categoryCode } };
    }
    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) {
        const endDate = new Date(filters.dateTo);
        endDate.setHours(23, 59, 59, 999);
        where.createdAt.lte = endDate;
      }
    }

    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 25, 100);
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.callReport.findMany({
        where,
        include: {
          labels: true,
          callSession: {
            select: { id: true, direction: true, callerNumber: true, calleeNumber: true, startAt: true, disposition: true },
          },
          callerClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
          subjectClient: { select: { id: true, firstName: true, lastName: true, primaryPhone: true } },
          building: { select: { id: true, name: true } },
          clientBuilding: { select: { id: true, apartmentNumber: true } },
          operatorUser: { select: { id: true, email: true, employee: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.callReport.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async myDrafts(userId: string) {
    return this.prisma.callReport.findMany({
      where: { operatorUserId: userId, status: CallReportStatus.DRAFT },
      include: {
        labels: true,
        callSession: {
          select: { id: true, direction: true, callerNumber: true, calleeNumber: true, startAt: true },
        },
        building: { select: { id: true, name: true } },
        clientBuilding: { select: { id: true, apartmentNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async paymentLookup(query: string) {
    if (!query || query.length < 3) {
      return { results: [] };
    }

    const results = await this.prisma.clientBuilding.findMany({
      where: {
        paymentId: { startsWith: query },
        client: { isActive: true },
      },
      select: {
        id: true,
        paymentId: true,
        apartmentNumber: true,
        entranceNumber: true,
        floorNumber: true,
        balance: true,
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            primaryPhone: true,
            idNumber: true,
          },
        },
        building: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
      take: 10,
    });

    return {
      results: results.map((cb) => ({
        paymentId: cb.paymentId,
        client: cb.client,
        apartment: {
          id: cb.id,
          apartmentNumber: cb.apartmentNumber,
          entranceNumber: cb.entranceNumber,
          floorNumber: cb.floorNumber,
          balance: cb.balance,
        },
        building: cb.building,
      })),
    };
  }

  private async validateLabels(labels: string[]) {
    const category = await this.prisma.systemListCategory.findUnique({
      where: { code: 'CALL_REPORT_CATEGORY' },
      select: { id: true },
    });

    if (!category) {
      throw new BadRequestException('Call report category list not configured');
    }

    const validItems = await this.prisma.systemListItem.findMany({
      where: {
        categoryId: category.id,
        value: { in: labels },
        isActive: true,
      },
      select: { value: true },
    });

    const validCodes = new Set(validItems.map((i) => i.value));
    const invalid = labels.filter((l) => !validCodes.has(l));
    if (invalid.length > 0) {
      throw new BadRequestException(`Invalid category codes: ${invalid.join(', ')}`);
    }
  }
}
