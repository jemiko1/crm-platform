import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { IdGeneratorService } from "../common/id-generator/id-generator.service";
import { paginate, buildPaginatedResponse } from "../common/dto/pagination.dto";

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  async createManual(buildingIds: string[], input: any) {
    const coreId = await this.ids.next("client");

    return this.prisma.client.create({
      data: {
        coreId,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        idNumber: input.idNumber ?? null,
        paymentId: input.paymentId ?? null,
        primaryPhone: input.primaryPhone ?? null,
        secondaryPhone: input.secondaryPhone ?? null,
        clientBuildings: {
          create: buildingIds.map((buildingId) => ({
            buildingId,
          })),
        },
      },
      select: {
        coreId: true,
        firstName: true,
        lastName: true,
        idNumber: true,
        paymentId: true,
        primaryPhone: true,
        secondaryPhone: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findByCoreId(coreId: number) {
    const client = await this.prisma.client.findFirst({
      where: { coreId },
      select: {
        coreId: true,
        firstName: true,
        lastName: true,
        idNumber: true,
        paymentId: true,
        primaryPhone: true,
        secondaryPhone: true,
        updatedAt: true,
        clientBuildings: {
          select: {
            building: { select: { coreId: true, name: true } },
            paymentId: true,
            balance: true,
            apartmentNumber: true,
            entranceNumber: true,
            floorNumber: true,
          },
        },
      },
    });

    if (!client) return null;

    return {
      coreId: client.coreId,
      firstName: client.firstName,
      lastName: client.lastName,
      idNumber: client.idNumber,
      paymentId: client.paymentId,
      primaryPhone: client.primaryPhone,
      secondaryPhone: client.secondaryPhone,
      updatedAt: client.updatedAt,
      buildings: client.clientBuildings.map((cb) => ({
        coreId: cb.building.coreId,
        name: cb.building.name,
        paymentId: cb.paymentId,
        balance: cb.balance,
        apartmentNumber: cb.apartmentNumber,
        entranceNumber: cb.entranceNumber,
        floorNumber: cb.floorNumber,
      })),
    };
  }

  async update(coreId: number, dto: { firstName?: string; lastName?: string; idNumber?: string; paymentId?: string; primaryPhone?: string; secondaryPhone?: string }) {
    const client = await this.prisma.client.findFirst({ where: { coreId } });
    if (!client) return null;

    const updated = await this.prisma.client.update({
      where: { id: client.id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName || null }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName || null }),
        ...(dto.idNumber !== undefined && { idNumber: dto.idNumber || null }),
        ...(dto.paymentId !== undefined && { paymentId: dto.paymentId || null }),
        ...(dto.primaryPhone !== undefined && { primaryPhone: dto.primaryPhone || null }),
        ...(dto.secondaryPhone !== undefined && { secondaryPhone: dto.secondaryPhone || null }),
      },
      select: {
        coreId: true,
        firstName: true,
        lastName: true,
        idNumber: true,
        paymentId: true,
        primaryPhone: true,
        secondaryPhone: true,
        updatedAt: true,
        clientBuildings: {
          select: {
            building: { select: { coreId: true, name: true } },
          },
        },
      },
    });

    return {
      coreId: updated.coreId,
      firstName: updated.firstName,
      lastName: updated.lastName,
      idNumber: updated.idNumber,
      paymentId: updated.paymentId,
      primaryPhone: updated.primaryPhone,
      secondaryPhone: updated.secondaryPhone,
      updatedAt: updated.updatedAt,
      buildings: updated.clientBuildings.map((cb) => ({
        coreId: cb.building.coreId,
        name: cb.building.name,
      })),
    };
  }

  async listByBuilding(buildingId: string, page = 1, pageSize = 20) {
    const { skip, take } = paginate(page, pageSize);
    const where = { clientBuildings: { some: { buildingId } } };
    const select = {
      coreId: true, firstName: true, lastName: true, idNumber: true,
      paymentId: true, primaryPhone: true, secondaryPhone: true, updatedAt: true,
    } as const;

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({ where, orderBy: { coreId: "asc" }, select, skip, take }),
      this.prisma.client.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  }

  /**
   * Global clients directory for /v1/clients
   * Returns clients with their associated buildings (many-to-many).
   * Supports optional search by name, phone, or ID number.
   */
  async listDirectory(page = 1, pageSize = 20, search?: string) {
    const { skip, take } = paginate(page, pageSize);

    const q = search?.trim() ?? "";
    let where: Prisma.ClientWhereInput = { isActive: true };

    if (q) {
      const parts = q.split(/\s+/).filter(Boolean);

      const singleTermConditions = [
        { firstName: { contains: q, mode: 'insensitive' as const } },
        { lastName: { contains: q, mode: 'insensitive' as const } },
        { primaryPhone: { contains: q } },
        { secondaryPhone: { contains: q } },
        { idNumber: { contains: q, mode: 'insensitive' as const } },
        { paymentId: { contains: q, mode: 'insensitive' as const } },
        ...(/^\d+$/.test(q) ? [{ coreId: parseInt(q, 10) }] : []),
      ];

      // Multi-word search: "John Smith" → each word must match firstName or lastName
      const multiWordCondition = parts.length > 1
        ? [{
            AND: parts.map((part) => ({
              OR: [
                { firstName: { contains: part, mode: 'insensitive' as const } },
                { lastName: { contains: part, mode: 'insensitive' as const } },
              ],
            })),
          }]
        : [];

      where = {
        isActive: true,
        OR: [...singleTermConditions, ...multiWordCondition],
      };
    }

    const select = {
      id: true,
      coreId: true,
      firstName: true,
      lastName: true,
      idNumber: true,
      paymentId: true,
      primaryPhone: true,
      secondaryPhone: true,
      createdAt: true,
      coreCreatedAt: true,
      updatedAt: true,
      clientBuildings: {
        select: {
          building: { select: { coreId: true, name: true } },
          balance: true,
        },
      },
    } as const;

    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: [{ coreCreatedAt: "desc" }, { createdAt: "desc" }],
        select,
        skip,
        take,
      }),
      this.prisma.client.count({ where }),
    ]);

    const data = rows.map((c) => ({
      id: c.id,
      coreId: c.coreId,
      firstName: c.firstName,
      lastName: c.lastName,
      idNumber: c.idNumber,
      paymentId: c.paymentId,
      primaryPhone: c.primaryPhone,
      secondaryPhone: c.secondaryPhone,
      createdAt: c.coreCreatedAt ?? c.createdAt,
      updatedAt: c.updatedAt,
      buildings: c.clientBuildings.map((cb) => ({
        coreId: cb.building.coreId,
        name: cb.building.name,
      })),
      consolidatedBalance: c.clientBuildings.reduce((sum, cb) => sum + (cb.balance ?? 0), 0),
    }));

    return buildPaginatedResponse(data, total, page, pageSize);
  }

  async getStatistics() {
    const clients = await this.prisma.client.findMany({
      where: { isActive: true },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (clients.length === 0) {
      return {
        totalClientsCount: 0,
        currentMonthCount: 0,
        currentMonthPercentageChange: 0,
        averagePercentageChange: 0,
        monthlyBreakdown: {},
      };
    }

    const monthlyBreakdown: Record<number, Record<number, number>> = {};
    clients.forEach((client) => {
      const date = new Date(client.createdAt);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      if (!monthlyBreakdown[year]) monthlyBreakdown[year] = {};
      if (!monthlyBreakdown[year][month]) monthlyBreakdown[year][month] = 0;
      monthlyBreakdown[year][month]++;
    });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentMonthCount = monthlyBreakdown[currentYear]?.[currentMonth] ?? 0;

    let lastMonth = currentMonth - 1;
    let lastMonthYear = currentYear;
    if (lastMonth === 0) { lastMonth = 12; lastMonthYear = currentYear - 1; }
    const lastMonthCount = monthlyBreakdown[lastMonthYear]?.[lastMonth] ?? 0;

    let currentMonthPercentageChange = 0;
    if (lastMonthCount > 0) {
      currentMonthPercentageChange = ((currentMonthCount - lastMonthCount) / lastMonthCount) * 100;
    } else if (currentMonthCount > 0) {
      currentMonthPercentageChange = 100;
    }

    const allMonthCounts: number[] = [];
    Object.values(monthlyBreakdown).forEach((yearData) => {
      Object.values(yearData).forEach((count) => allMonthCounts.push(count));
    });

    const average = allMonthCounts.length > 0
      ? allMonthCounts.reduce((sum, count) => sum + count, 0) / allMonthCounts.length
      : 0;

    let averagePercentageChange = 0;
    if (average > 0) {
      averagePercentageChange = ((currentMonthCount - average) / average) * 100;
    } else if (currentMonthCount > 0) {
      averagePercentageChange = 100;
    }

    return {
      totalClientsCount: clients.length,
      currentMonthCount,
      currentMonthPercentageChange: Math.round(currentMonthPercentageChange * 10) / 10,
      averagePercentageChange: Math.round(averagePercentageChange * 10) / 10,
      monthlyBreakdown,
    };
  }
}
