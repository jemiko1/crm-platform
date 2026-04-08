import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IdGeneratorService } from "../common/id-generator/id-generator.service";
import { paginate, buildPaginatedResponse } from "../common/dto/pagination.dto";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  private async getValidValues(categoryCode: string): Promise<Set<string>> {
    const category = await this.prisma.systemListCategory.findUnique({
      where: { code: categoryCode },
      include: { items: { where: { isActive: true }, select: { value: true } } },
    });
    return new Set(category?.items.map((i) => i.value) ?? []);
  }

  async createManual(buildingId: string, input: any) {
    const validTypes = await this.getValidValues("ASSET_TYPE");
    if (validTypes.size > 0 && !validTypes.has(input.type)) {
      throw new BadRequestException(`Invalid device type: ${input.type}`);
    }

    const status = input.status ?? "UNKNOWN";
    const validStatuses = await this.getValidValues("DEVICE_STATUS");
    if (validStatuses.size > 0 && !validStatuses.has(status)) {
      throw new BadRequestException(`Invalid device status: ${status}`);
    }

    const coreId = await this.ids.next("asset");

    return this.prisma.asset.create({
      data: {
        coreId,
        buildingId,
        type: input.type,
        name: String(input.name ?? "").trim(),
        ip: input.ip ?? null,
        status,
      },
      select: {
        coreId: true,
        type: true,
        name: true,
        ip: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async listByBuilding(buildingId: string, page = 1, pageSize = 20) {
    const { skip, take } = paginate(page, pageSize);
    const where = { buildingId };
    const select = {
      coreId: true, type: true, name: true, ip: true, status: true, updatedAt: true,
    } as const;

    const [data, total] = await Promise.all([
      this.prisma.asset.findMany({ where, orderBy: [{ type: "asc" }, { coreId: "asc" }], select, skip, take }),
      this.prisma.asset.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  }

  /**
   * Global devices directory for /v1/assets
   * Returns all assets with their associated building info.
   * Supports search by name, type, IP, building name.
   */
  async listDirectory(page = 1, pageSize = 20, search?: string, source?: "core" | "crm") {
    const { skip, take } = paginate(page, pageSize);

    const sourceFilter = source === "core"
      ? { lastSyncedAt: { not: null } }
      : source === "crm"
      ? { lastSyncedAt: null }
      : {};

    const q = search?.trim() ?? "";
    let where: any = { isActive: true, ...sourceFilter };

    if (q) {
      where = {
        isActive: true,
        ...sourceFilter,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { type: { contains: q, mode: "insensitive" } },
          { ip: { contains: q } },
          { building: { name: { contains: q, mode: "insensitive" } } },
          ...(/^\d+$/.test(q) ? [{ coreId: parseInt(q, 10) }] : []),
        ],
      };
    }

    const [rows, total] = await Promise.all([
      this.prisma.asset.findMany({
        where,
        orderBy: [{ coreCreatedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          coreId: true,
          type: true,
          name: true,
          ip: true,
          port: true,
          status: true,
          createdAt: true,
          coreCreatedAt: true,
          lastSyncedAt: true,
          updatedAt: true,
          building: {
            select: { coreId: true, name: true },
          },
        },
        skip,
        take,
      }),
      this.prisma.asset.count({ where }),
    ]);

    const data = rows.map((a) => ({
      id: a.id,
      coreId: a.coreId,
      type: a.type,
      name: a.name,
      ip: a.ip,
      port: a.port,
      status: a.status,
      source: a.lastSyncedAt ? "core" : "manual",
      createdAt: a.coreCreatedAt ?? a.createdAt,
      updatedAt: a.updatedAt,
      building: a.building
        ? { coreId: a.building.coreId, name: a.building.name }
        : null,
    }));

    return buildPaginatedResponse(data, total, page, pageSize);
  }

  async getStatistics(source?: "core" | "crm") {
    const sourceFilter = source === "core"
      ? { lastSyncedAt: { not: null } }
      : source === "crm"
      ? { lastSyncedAt: null }
      : {};

    const assets = await this.prisma.asset.findMany({
      where: { isActive: true, ...sourceFilter },
      select: { createdAt: true, coreCreatedAt: true },
      orderBy: { createdAt: "asc" },
    });

    if (assets.length === 0) {
      return {
        totalDevicesCount: 0,
        currentMonthCount: 0,
        currentMonthPercentageChange: 0,
        averagePercentageChange: 0,
        monthlyBreakdown: {},
      };
    }

    const monthlyBreakdown: Record<number, Record<number, number>> = {};
    assets.forEach((asset) => {
      const date = new Date(asset.coreCreatedAt ?? asset.createdAt);
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
      totalDevicesCount: assets.length,
      currentMonthCount,
      currentMonthPercentageChange: Math.round(currentMonthPercentageChange * 10) / 10,
      averagePercentageChange: Math.round(averagePercentageChange * 10) / 10,
      monthlyBreakdown,
    };
  }

  async internalId(coreId: number): Promise<string | null> {
    const asset = await this.prisma.asset.findUnique({
      where: { coreId },
      select: { id: true },
    });
    return asset?.id ?? null;
  }
}
