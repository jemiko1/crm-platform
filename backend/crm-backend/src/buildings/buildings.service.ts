import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IdGeneratorService } from "../common/id-generator/id-generator.service";

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}
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
