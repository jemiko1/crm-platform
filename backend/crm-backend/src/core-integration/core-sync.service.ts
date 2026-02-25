import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CoreEventType } from "./dto/webhook-event.dto";

@Injectable()
export class CoreSyncService {
  private readonly logger = new Logger(CoreSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async process(eventType: CoreEventType, payload: Record<string, any>) {
    switch (eventType) {
      case "building.upsert":
        return this.upsertBuilding(payload);
      case "client.upsert":
        return this.upsertClient(payload);
      case "asset.upsert":
        return this.upsertAsset(payload);
      case "building.deactivate":
        return this.deactivate("building", payload);
      case "client.deactivate":
        return this.deactivate("client", payload);
      case "asset.deactivate":
        return this.deactivate("asset", payload);
    }
  }

  // ---------- Building ----------

  private async upsertBuilding(p: Record<string, any>) {
    const coreId = this.requireInt(p, "coreId");
    const name = this.requireString(p, "name");
    const now = new Date();

    const result = await this.prisma.building.upsert({
      where: { coreId },
      create: {
        coreId,
        name,
        address: p.address ?? null,
        city: p.city ?? null,
        coreCreatedAt: this.toDateOrNull(p.coreCreatedAt),
        coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
        lastSyncedAt: now,
        isActive: true,
      },
      update: {
        name,
        ...(p.address !== undefined && { address: p.address }),
        ...(p.city !== undefined && { city: p.city }),
        ...(p.coreUpdatedAt !== undefined && {
          coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
        }),
        lastSyncedAt: now,
        isActive: true,
        deletedAt: null,
      },
    });

    this.logger.log(`Building coreId=${coreId} upserted (id=${result.id})`);
    return result;
  }

  // ---------- Client ----------

  private async upsertClient(p: Record<string, any>) {
    const coreId = this.requireInt(p, "coreId");
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const client = await tx.client.upsert({
        where: { coreId },
        create: {
          coreId,
          firstName: p.firstName ?? null,
          lastName: p.lastName ?? null,
          idNumber: p.idNumber ?? null,
          paymentId: p.paymentId ?? null,
          primaryPhone: p.primaryPhone ?? null,
          secondaryPhone: p.secondaryPhone ?? null,
          coreCreatedAt: this.toDateOrNull(p.coreCreatedAt),
          coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
          lastSyncedAt: now,
          isActive: true,
        },
        update: {
          ...(p.firstName !== undefined && { firstName: p.firstName }),
          ...(p.lastName !== undefined && { lastName: p.lastName }),
          ...(p.idNumber !== undefined && { idNumber: p.idNumber }),
          ...(p.paymentId !== undefined && { paymentId: p.paymentId }),
          ...(p.primaryPhone !== undefined && { primaryPhone: p.primaryPhone }),
          ...(p.secondaryPhone !== undefined && {
            secondaryPhone: p.secondaryPhone,
          }),
          ...(p.coreUpdatedAt !== undefined && {
            coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
          }),
          lastSyncedAt: now,
          isActive: true,
          deletedAt: null,
        },
      });

      if (Array.isArray(p.buildingCoreIds)) {
        await this.syncClientBuildings(tx, client.id, p.buildingCoreIds);
      }

      this.logger.log(`Client coreId=${coreId} upserted (id=${client.id})`);
      return client;
    });
  }

  private async syncClientBuildings(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    clientId: string,
    buildingCoreIds: number[],
  ) {
    const buildings = await tx.building.findMany({
      where: { coreId: { in: buildingCoreIds } },
      select: { id: true },
    });
    const targetIds = new Set(buildings.map((b) => b.id));

    const currentLinks = await tx.clientBuilding.findMany({
      where: { clientId },
      select: { buildingId: true },
    });
    const currentIds = new Set(currentLinks.map((l) => l.buildingId));

    const toAdd = [...targetIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !targetIds.has(id));

    if (toAdd.length > 0) {
      await tx.clientBuilding.createMany({
        data: toAdd.map((buildingId) => ({ clientId, buildingId })),
        skipDuplicates: true,
      });
    }

    if (toRemove.length > 0) {
      await tx.clientBuilding.deleteMany({
        where: { clientId, buildingId: { in: toRemove } },
      });
    }

    if (toAdd.length || toRemove.length) {
      this.logger.log(
        `Client ${clientId}: +${toAdd.length} / -${toRemove.length} building links`,
      );
    }
  }

  // ---------- Asset ----------

  private async upsertAsset(p: Record<string, any>) {
    const coreId = this.requireInt(p, "coreId");
    const name = this.requireString(p, "name");
    const type = this.requireString(p, "type");
    const assignedBuildingCoreId = this.requireInt(p, "assignedBuildingCoreId");
    const now = new Date();

    const building = await this.prisma.building.findUnique({
      where: { coreId: assignedBuildingCoreId },
      select: { id: true },
    });
    if (!building) {
      throw new BadRequestException(
        `Building with coreId=${assignedBuildingCoreId} not found for asset assignment`,
      );
    }

    const result = await this.prisma.asset.upsert({
      where: { coreId },
      create: {
        coreId,
        buildingId: building.id,
        name,
        type,
        ip: p.ip ?? null,
        status: p.status ?? "UNKNOWN",
        coreCreatedAt: this.toDateOrNull(p.coreCreatedAt),
        coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
        lastSyncedAt: now,
        isActive: true,
      },
      update: {
        buildingId: building.id,
        name,
        type,
        ...(p.ip !== undefined && { ip: p.ip }),
        ...(p.status !== undefined && { status: p.status }),
        ...(p.coreUpdatedAt !== undefined && {
          coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
        }),
        lastSyncedAt: now,
        isActive: true,
        deletedAt: null,
      },
    });

    this.logger.log(`Asset coreId=${coreId} upserted (id=${result.id})`);
    return result;
  }

  // ---------- Deactivate (soft-delete) ----------

  private async deactivate(
    entity: "building" | "client" | "asset",
    p: Record<string, any>,
  ) {
    const coreId = this.requireInt(p, "coreId");
    const now = new Date();
    const data = { isActive: false, deletedAt: now, lastSyncedAt: now };

    switch (entity) {
      case "building":
        await this.prisma.building.update({ where: { coreId }, data });
        break;
      case "client":
        await this.prisma.client.update({ where: { coreId }, data });
        break;
      case "asset":
        await this.prisma.asset.update({ where: { coreId }, data });
        break;
    }

    this.logger.log(`${entity} coreId=${coreId} deactivated`);
  }

  // ---------- Helpers ----------

  private requireInt(p: Record<string, any>, field: string): number {
    const val = p[field];
    if (val === undefined || val === null || !Number.isInteger(val)) {
      throw new BadRequestException(
        `payload.${field} is required and must be an integer`,
      );
    }
    return val as number;
  }

  private requireString(p: Record<string, any>, field: string): string {
    const val = p[field];
    if (typeof val !== "string" || val.trim().length === 0) {
      throw new BadRequestException(
        `payload.${field} is required and must be a non-empty string`,
      );
    }
    return val.trim();
  }

  private toDateOrNull(val: unknown): Date | null {
    if (val === undefined || val === null) return null;
    const d = new Date(val as string);
    return isNaN(d.getTime()) ? null : d;
  }
}
