import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IdGeneratorService } from "../common/id-generator/id-generator.service";

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  async getStatistics() {
    // Get all buildings with their creation dates
    const buildings = await this.prisma.building.findMany({
      select: {
        createdAt: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    if (buildings.length === 0) {
      return {
        totalBuildingsCount: 0,
        currentMonthCount: 0,
        currentMonthPercentageChange: 0,
        averagePercentageChange: 0,
        monthlyBreakdown: {},
      };
    }

    // Group buildings by year and month
    const monthlyBreakdown: Record<number, Record<number, number>> = {};

    buildings.forEach((building) => {
      const date = new Date(building.createdAt);
      const year = date.getFullYear();
      const month = date.getMonth() + 1; // 1-12

      if (!monthlyBreakdown[year]) {
        monthlyBreakdown[year] = {};
      }
      if (!monthlyBreakdown[year][month]) {
        monthlyBreakdown[year][month] = 0;
      }
      monthlyBreakdown[year][month]++;
    });

    // Get current month data
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentMonthCount = monthlyBreakdown[currentYear]?.[currentMonth] ?? 0;

    // Get last month data
    let lastMonth = currentMonth - 1;
    let lastMonthYear = currentYear;
    if (lastMonth === 0) {
      lastMonth = 12;
      lastMonthYear = currentYear - 1;
    }
    const lastMonthCount = monthlyBreakdown[lastMonthYear]?.[lastMonth] ?? 0;

    // Calculate percentage change compared to last month
    let currentMonthPercentageChange = 0;
    if (lastMonthCount > 0) {
      currentMonthPercentageChange = ((currentMonthCount - lastMonthCount) / lastMonthCount) * 100;
    } else if (currentMonthCount > 0) {
      currentMonthPercentageChange = 100; // If there were no buildings last month, it's 100% increase
    }

    // Calculate average buildings per month
    const allMonthCounts: number[] = [];
    Object.values(monthlyBreakdown).forEach((yearData) => {
      Object.values(yearData).forEach((count) => {
        allMonthCounts.push(count);
      });
    });

    const average = allMonthCounts.length > 0
      ? allMonthCounts.reduce((sum, count) => sum + count, 0) / allMonthCounts.length
      : 0;

    // Calculate percentage change compared to average
    let averagePercentageChange = 0;
    if (average > 0) {
      averagePercentageChange = ((currentMonthCount - average) / average) * 100;
    } else if (currentMonthCount > 0) {
      averagePercentageChange = 100;
    }

    return {
      totalBuildingsCount: buildings.length,
      currentMonthCount,
      currentMonthPercentageChange: Math.round(currentMonthPercentageChange * 10) / 10, // Round to 1 decimal
      averagePercentageChange: Math.round(averagePercentageChange * 10) / 10,
      monthlyBreakdown,
    };
  }
  async update(coreId: number, data: { name?: string; city?: string; address?: string }) {
    // Find building by coreId
    const building = await this.prisma.building.findFirst({
      where: { coreId },
    });
  
    if (!building) {
      throw new NotFoundException(`Building with coreId ${coreId} not found`);
    }
  
    // Update building
    return this.prisma.building.update({
      where: { id: building.id },
      data: {
        name: data.name,
        city: data.city,
        address: data.address,
        updatedAt: new Date(),
      },
    });
  }

  async createManual(input: { name: string; city?: string; address?: string }) {
    const coreId = await this.ids.next("building");

    return this.prisma.building.create({
      data: {
        coreId,
        name: input.name,
        city: input.city ?? null,
        address: input.address ?? null,
      },
      select: {
        coreId: true,
        name: true,
        city: true,
        address: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async list() {
    // Fetch buildings with counts (optimized - no asset loading)
    const buildings = await this.prisma.building.findMany({
      orderBy: { coreId: "asc" },
      include: {
        _count: { select: { clientBuildings: true, assets: true, workOrders: true } },
      },
    });

    // Fetch asset counts by type per building in single query
    const assetCounts = await this.prisma.asset.groupBy({
      by: ['buildingId', 'type'],
      _count: { type: true },
    });

    // Map counts to buildings for O(1) lookup
    const countsByBuilding = new Map<string, Record<string, number>>();
    for (const ac of assetCounts) {
      if (!countsByBuilding.has(ac.buildingId)) {
        countsByBuilding.set(ac.buildingId, {});
      }
      countsByBuilding.get(ac.buildingId)![ac.type] = ac._count.type;
    }

    // Combine data
    return buildings.map((b) => ({
      coreId: b.coreId,
      name: b.name,
      city: b.city,
      address: b.address,
      clientCount: b._count.clientBuildings,
      workOrderCount: b._count.workOrders,
      products: countsByBuilding.get(b.id) ?? {},
      updatedAt: b.updatedAt,
    }));
  }

  async getByCoreId(coreId: number) {
    const b = await this.prisma.building.findUnique({
      where: { coreId },
      include: {
        _count: { select: { clientBuildings: true, assets: true, workOrders: true } },
      },
    });

    if (!b) throw new NotFoundException(`Building ${coreId} not found`);
    return b;
  }

  async internalId(coreId: number): Promise<string> {
    const b = await this.prisma.building.findUnique({
      where: { coreId },
      select: { id: true },
    });
    if (!b) throw new NotFoundException(`Building ${coreId} not found`);
    return b.id;
  }
}
