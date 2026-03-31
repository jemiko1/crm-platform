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
      case "contact.upsert":
        return this.upsertContact(payload);
      case "building.deactivate":
        return this.deactivate("building", payload);
      case "client.deactivate":
        return this.deactivate("client", payload);
      case "asset.deactivate":
        return this.deactivate("asset", payload);
      case "contact.deactivate":
        return this.deactivateContact(payload);
    }
  }

  // ---------- Building ----------

  private async upsertBuilding(p: Record<string, any>) {
    const coreId = this.requireInt(p, "coreId");
    const name = this.requireString(p, "name");
    const now = new Date();
    const disableCrons = p.disableCrons ?? false;
    // isActive is derived from disableCrons: if crons disabled, building is inactive
    const isActive = p.isActive !== undefined ? p.isActive : !disableCrons;

    const result = await this.prisma.building.upsert({
      where: { coreId },
      create: {
        coreId,
        name,
        address: p.address ?? null,
        phone: p.phone ?? null,
        email: p.email ?? null,
        numberOfApartments:
          p.numberOfApartments != null
            ? parseInt(p.numberOfApartments, 10)
            : null,
        disableCrons,
        isActive,
        branchId: p.branchId != null ? parseInt(p.branchId, 10) : null,
        coreCreatedAt: this.toDateOrNull(p.coreCreatedAt),
        coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
        lastSyncedAt: now,
      },
      update: {
        name,
        ...(p.address !== undefined && { address: p.address }),
        ...(p.phone !== undefined && { phone: p.phone }),
        ...(p.email !== undefined && { email: p.email }),
        ...(p.numberOfApartments !== undefined && {
          numberOfApartments:
            p.numberOfApartments != null
              ? parseInt(p.numberOfApartments, 10)
              : null,
        }),
        ...(p.disableCrons !== undefined && { disableCrons }),
        isActive,
        ...(p.branchId !== undefined && {
          branchId: p.branchId != null ? parseInt(p.branchId, 10) : null,
        }),
        ...(p.coreUpdatedAt !== undefined && {
          coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
        }),
        lastSyncedAt: now,
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
          email: p.email ?? null,
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
          ...(p.email !== undefined && { email: p.email }),
          ...(p.coreUpdatedAt !== undefined && {
            coreUpdatedAt: this.toDateOrNull(p.coreUpdatedAt),
          }),
          lastSyncedAt: now,
          isActive: true,
          deletedAt: null,
        },
      });

      // Sync apartment-level client-building links
      if (Array.isArray(p.apartments)) {
        await this.syncClientApartments(tx, client.id, p.apartments);
      } else if (Array.isArray(p.buildingCoreIds)) {
        // Backward compatibility: simple building links without apartment data
        await this.syncClientBuildings(tx, client.id, p.buildingCoreIds);
      }

      this.logger.log(`Client coreId=${coreId} upserted (id=${client.id})`);
      return client;
    });
  }

  /**
   * Sync apartment-level client-building links.
   * Each apartment entry has: buildingCoreId, apartmentCoreId, apartmentNumber,
   * entranceNumber, floorNumber, paymentId, balance.
   * Uses (clientId, buildingId, apartmentCoreId) as the composite unique key.
   */
  private async syncClientApartments(
    tx: Parameters<Parameters<PrismaService["$transaction"]>[0]>[0],
    clientId: string,
    apartments: Array<Record<string, any>>,
  ) {
    // Resolve building UUIDs from core IDs
    const buildingCoreIds = [
      ...new Set(apartments.map((a) => a.buildingCoreId).filter(Number.isInteger)),
    ];
    const buildings = await tx.building.findMany({
      where: { coreId: { in: buildingCoreIds } },
      select: { id: true, coreId: true },
    });
    const buildingMap = new Map(buildings.map((b) => [b.coreId, b.id]));

    // Get current apartment links for this client
    const currentLinks = await tx.clientBuilding.findMany({
      where: { clientId },
      select: { id: true, buildingId: true, apartmentCoreId: true },
    });

    // Build target set from incoming apartments
    const targetLinks: Array<{
      buildingId: string;
      apartmentCoreId: number;
      apartmentNumber: string | null;
      entranceNumber: string | null;
      floorNumber: string | null;
      paymentId: string | null;
      balance: number | null;
    }> = [];

    for (const apt of apartments) {
      const buildingId = buildingMap.get(apt.buildingCoreId);
      if (!buildingId) {
        this.logger.warn(
          `Building coreId=${apt.buildingCoreId} not found, skipping apartment link`,
        );
        continue;
      }
      targetLinks.push({
        buildingId,
        apartmentCoreId: apt.apartmentCoreId ?? 0,
        apartmentNumber: apt.apartmentNumber ?? null,
        entranceNumber: apt.entranceNumber ?? null,
        floorNumber: apt.floorNumber ?? null,
        paymentId: apt.paymentId ?? null,
        balance: apt.balance != null ? parseFloat(apt.balance) : null,
      });
    }

    // Upsert each apartment link
    let added = 0;
    let updated = 0;
    for (const link of targetLinks) {
      await tx.clientBuilding.upsert({
        where: {
          clientId_buildingId_apartmentCoreId: {
            clientId,
            buildingId: link.buildingId,
            apartmentCoreId: link.apartmentCoreId,
          },
        },
        create: {
          clientId,
          buildingId: link.buildingId,
          apartmentCoreId: link.apartmentCoreId,
          apartmentNumber: link.apartmentNumber,
          entranceNumber: link.entranceNumber,
          floorNumber: link.floorNumber,
          paymentId: link.paymentId,
          balance: link.balance,
        },
        update: {
          apartmentNumber: link.apartmentNumber,
          entranceNumber: link.entranceNumber,
          floorNumber: link.floorNumber,
          paymentId: link.paymentId,
          balance: link.balance,
        },
      });
      const isExisting = currentLinks.some(
        (cl) =>
          cl.buildingId === link.buildingId &&
          cl.apartmentCoreId === link.apartmentCoreId,
      );
      if (isExisting) updated++;
      else added++;
    }

    // Remove links no longer present
    const targetKeys = new Set(
      targetLinks.map(
        (l) => `${l.buildingId}:${l.apartmentCoreId}`,
      ),
    );
    const toRemoveIds = currentLinks
      .filter(
        (cl) =>
          !targetKeys.has(`${cl.buildingId}:${cl.apartmentCoreId ?? 0}`),
      )
      .map((cl) => cl.id);

    if (toRemoveIds.length > 0) {
      await tx.clientBuilding.deleteMany({
        where: { id: { in: toRemoveIds } },
      });
    }

    if (added || updated || toRemoveIds.length) {
      this.logger.log(
        `Client ${clientId} apartments: +${added} ~${updated} -${toRemoveIds.length}`,
      );
    }
  }

  /**
   * Legacy: simple building links without apartment metadata.
   * Kept for backward compatibility with older webhook payloads.
   */
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
      select: { id: true, buildingId: true },
    });
    const currentIds = new Set(currentLinks.map((l) => l.buildingId));

    const toAdd = [...targetIds].filter((id) => !currentIds.has(id));
    const toRemoveIds = currentLinks
      .filter((l) => !targetIds.has(l.buildingId))
      .map((l) => l.id);

    if (toAdd.length > 0) {
      await tx.clientBuilding.createMany({
        data: toAdd.map((buildingId) => ({ clientId, buildingId })),
        skipDuplicates: true,
      });
    }

    if (toRemoveIds.length > 0) {
      await tx.clientBuilding.deleteMany({
        where: { id: { in: toRemoveIds } },
      });
    }

    if (toAdd.length || toRemoveIds.length) {
      this.logger.log(
        `Client ${clientId}: +${toAdd.length} / -${toRemoveIds.length} building links`,
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
        port: p.port != null ? String(p.port) : null,
        productId: p.productId ?? null,
        assignedBuildingCoreId,
        door1: p.door1 ?? null,
        door2: p.door2 ?? null,
        door3: p.door3 ?? null,
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
        ...(p.port !== undefined && {
          port: p.port != null ? String(p.port) : null,
        }),
        ...(p.productId !== undefined && { productId: p.productId }),
        assignedBuildingCoreId,
        ...(p.door1 !== undefined && { door1: p.door1 }),
        ...(p.door2 !== undefined && { door2: p.door2 }),
        ...(p.door3 !== undefined && { door3: p.door3 }),
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

  // ---------- Building Contact ----------

  private async upsertContact(p: Record<string, any>) {
    const coreId = this.requireInt(p, "coreId");
    const buildingCoreId = this.requireInt(p, "buildingCoreId");
    const name = this.requireString(p, "name");

    const building = await this.prisma.building.findUnique({
      where: { coreId: buildingCoreId },
      select: { id: true },
    });
    if (!building) {
      throw new BadRequestException(
        `Building with coreId=${buildingCoreId} not found for contact assignment`,
      );
    }

    // If contact is linked to a client, resolve the client UUID
    let clientId: string | null = null;
    if (p.clientCoreId != null) {
      const client = await this.prisma.client.findUnique({
        where: { coreId: parseInt(p.clientCoreId, 10) },
        select: { id: true },
      });
      clientId = client?.id ?? null;
    }

    const result = await this.prisma.buildingContact.upsert({
      where: { coreId },
      create: {
        coreId,
        buildingId: building.id,
        name,
        type: p.type != null ? String(p.type) : "CONTACTS",
        description: p.description ?? null,
        clientId,
        isActive: true,
      },
      update: {
        buildingId: building.id,
        name,
        ...(p.type !== undefined && { type: String(p.type) }),
        ...(p.description !== undefined && { description: p.description }),
        clientId,
        isActive: true,
      },
    });

    this.logger.log(
      `BuildingContact coreId=${coreId} upserted (id=${result.id})`,
    );
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

    // Only deactivate records that have a coreId (i.e., synced from core)
    // Manual records (coreId = null) can never match here since we search by coreId
    switch (entity) {
      case "building": {
        const record = await this.prisma.building.findUnique({
          where: { coreId },
        });
        if (!record) {
          this.logger.warn(`Building coreId=${coreId} not found, skipping deactivate`);
          return;
        }
        await this.prisma.building.update({ where: { coreId }, data });
        this.logger.log(`Building coreId=${coreId} deactivated`);
        break;
      }
      case "client": {
        const record = await this.prisma.client.findUnique({
          where: { coreId },
        });
        if (!record) {
          this.logger.warn(`Client coreId=${coreId} not found, skipping deactivate`);
          return;
        }
        await this.prisma.client.update({ where: { coreId }, data });
        this.logger.log(`Client coreId=${coreId} deactivated`);
        break;
      }
      case "asset": {
        const record = await this.prisma.asset.findUnique({
          where: { coreId },
        });
        if (!record) {
          this.logger.warn(`Asset coreId=${coreId} not found, skipping deactivate`);
          return;
        }
        await this.prisma.asset.update({ where: { coreId }, data });
        this.logger.log(`Asset coreId=${coreId} deactivated`);
        break;
      }
    }
  }

  private async deactivateContact(p: Record<string, any>) {
    const coreId = this.requireInt(p, "coreId");

    const existing = await this.prisma.buildingContact.findUnique({
      where: { coreId },
    });
    if (!existing) {
      this.logger.warn(`BuildingContact coreId=${coreId} not found, skipping deactivate`);
      return;
    }

    await this.prisma.buildingContact.update({
      where: { coreId },
      data: { isActive: false },
    });

    this.logger.log(`BuildingContact coreId=${coreId} deactivated`);
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
