import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateIncidentDto } from "./dto/create-incident.dto";
import { UpdateIncidentStatusDto } from "./dto/update-incident-status.dto";

function formatIncidentNumber(year: number, seq: number) {
  // INC-2026-000001
  return `INC-${year}-${String(seq).padStart(6, "0")}`;
}

@Injectable()
export class IncidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: {
    q?: string;
    status?: string;
    priority?: string;
    buildingCoreId?: number;
    clientCoreId?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(params.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize ?? 50)));
    const skip = (page - 1) * pageSize;

    const q = (params.q ?? "").trim();
    const where: any = {};

    if (params.buildingCoreId) {
      where.building = { coreId: params.buildingCoreId };
    }
    if (params.clientCoreId) {
      where.client = { coreId: params.clientCoreId };
    }
    if (params.status) where.status = params.status;
    if (params.priority) where.priority = params.priority;

    if (q) {
      where.OR = [
        { incidentNumber: { contains: q, mode: "insensitive" } },
        { incidentType: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { building: { name: { contains: q, mode: "insensitive" } } },
        { client: { firstName: { contains: q, mode: "insensitive" } } },
        { client: { lastName: { contains: q, mode: "insensitive" } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          building: true,
          client: true,
          reportedBy: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeId: true,
                },
              },
            },
          },
          incidentAssets: { include: { asset: true } },
        },
      }),
    ]);

    return {
      items: rows.map((i) => ({
        id: i.id,
        incidentNumber: i.incidentNumber,
        clientId: i.client?.coreId ?? null,
        clientName: i.client
          ? `${i.client.firstName ?? ""} ${i.client.lastName ?? ""}`.trim() || `Client #${i.client.coreId}`
          : "Unknown Client",
        buildingId: i.building.coreId,
        buildingName: i.building.name,
        productsAffected: i.incidentAssets.map((ia) => ia.asset.name),
        status: i.status,
        priority: i.priority,
        incidentType: i.incidentType,
        contactMethod: i.contactMethod,
        description: i.description,
        reportedBy: i.reportedBy?.employee
          ? `${i.reportedBy.employee.firstName ?? ""} ${i.reportedBy.employee.lastName ?? ""}`.trim() || i.reportedBy.email
          : i.reportedBy?.email ?? "—",
        reportedByEmployeeId: i.reportedBy?.employee?.id ?? null,
        createdAt: i.createdAt.toISOString(),
        updatedAt: i.updatedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    };
  }

  async getById(id: string) {
    const inc = await this.prisma.incident.findUnique({
      where: { id },
      include: {
        building: true,
        client: true,
        reportedBy: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeId: true,
              },
            },
          },
        },
        incidentAssets: { include: { asset: true } },
      },
    });

    if (!inc) throw new NotFoundException("Incident not found");

    return {
      id: inc.id,
      incidentNumber: inc.incidentNumber,
      status: inc.status,
      priority: inc.priority,
      contactMethod: inc.contactMethod,
      incidentType: inc.incidentType,
      description: inc.description,
      reportedBy: inc.reportedBy?.employee
        ? `${inc.reportedBy.employee.firstName ?? ""} ${inc.reportedBy.employee.lastName ?? ""}`.trim() || inc.reportedBy.email
        : inc.reportedBy?.email ?? "—",
      reportedByEmployeeId: inc.reportedBy?.employee?.id ?? null,
      createdAt: inc.createdAt.toISOString(),
      updatedAt: inc.updatedAt.toISOString(),
      building: {
        coreId: inc.building.coreId,
        name: inc.building.name,
        city: inc.building.city,
        address: inc.building.address,
      },
      client: inc.client ? {
        coreId: inc.client.coreId,
        firstName: inc.client.firstName,
        lastName: inc.client.lastName,
      } : null,
      assets: inc.incidentAssets.map((ia) => ({
        coreId: ia.asset.coreId,
        name: ia.asset.name,
        type: ia.asset.type,
      })),
    };
  }

  async create(dto: CreateIncidentDto, actorUserId?: string) {
    // Resolve building & client by coreId
    const building = await this.prisma.building.findUnique({
      where: { coreId: dto.buildingId },
    });
    if (!building) throw new NotFoundException(`Building coreId=${dto.buildingId} not found`);

    // Client is optional (for unknown client incidents)
    let client: { id: string; coreId: number; clientBuildings: any[] } | null = null;
    if (dto.clientId !== undefined && dto.clientId !== null) {
      const foundClient = await this.prisma.client.findUnique({
        where: { coreId: dto.clientId },
        include: {
          clientBuildings: {
            where: { buildingId: building.id },
          },
        },
      });
      if (!foundClient) throw new NotFoundException(`Client coreId=${dto.clientId} not found`);

      // Ensure client belongs to building (strict CRM rule - many-to-many check)
      if (foundClient.clientBuildings.length === 0) {
        throw new BadRequestException("Client is not assigned to this building");
      }

      client = foundClient;
    }

    // Validate assets
    const assetCoreIds = Array.isArray(dto.assetIds) ? dto.assetIds : [];
    const assets =
      assetCoreIds.length === 0
        ? []
        : await this.prisma.asset.findMany({
            where: {
              coreId: { in: assetCoreIds },
              buildingId: building.id,
            },
          });

    if (assetCoreIds.length > 0 && assets.length !== assetCoreIds.length) {
      throw new BadRequestException("One or more assets are invalid or not in this building");
    }

    // Generate incident number using ExternalIdCounter (transaction-safe)
    const now = new Date();
    const year = now.getFullYear();

    const created = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.externalIdCounter.upsert({
        where: { entity: "incident" },
        create: { entity: "incident", nextId: 2 }, // first created will use 1
        update: { nextId: { increment: 1 } },
        select: { nextId: true },
      });

      const seq = counter.nextId - 1;
      const incidentNumber = formatIncidentNumber(year, seq);

      const incident = await tx.incident.create({
        data: {
          incidentNumber,
          buildingId: building.id,
          clientId: client?.id ?? null,
          contactMethod: dto.contactMethod as any,
          incidentType: dto.incidentType,
          priority: dto.priority as any,
          description: dto.description,
          reportedById: actorUserId ?? null,
          incidentAssets: {
            create: assets.map((a) => ({
              assetId: a.id,
            })),
          },
        },
        include: {
          building: true,
          client: true,
          reportedBy: {
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeId: true,
                },
              },
            },
          },
          incidentAssets: { include: { asset: true } },
        },
      });

      return incident;
    });

    // Format reportedBy - prefer employee name, fallback to email
    const reportedBy = created.reportedBy
      ? created.reportedBy.employee
        ? `${created.reportedBy.employee.firstName ?? ""} ${created.reportedBy.employee.lastName ?? ""}`.trim() || created.reportedBy.email
        : created.reportedBy.email
      : "—";

    return {
      id: created.id,
      incidentNumber: created.incidentNumber,
      status: created.status,
      priority: created.priority,
      buildingId: created.building.coreId,
      clientId: created.client?.coreId ?? null,
      productsAffected: created.incidentAssets.map((ia) => ia.asset.name),
      reportedBy,
      reportedByEmployeeId: created.reportedBy?.employee?.id ?? null,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async updateStatus(id: string, dto: UpdateIncidentStatusDto) {
    const current = await this.prisma.incident.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Incident not found");

    // Strict pipeline rules
    const allowed: Record<string, string[]> = {
      CREATED: ["IN_PROGRESS"],
      IN_PROGRESS: ["COMPLETED", "WORK_ORDER_INITIATED"],
      COMPLETED: [],
      WORK_ORDER_INITIATED: [],
    };

    const next = dto.status;
    if (!allowed[current.status]?.includes(next)) {
      throw new BadRequestException(`Invalid status transition ${current.status} → ${next}`);
    }

    const updated = await this.prisma.incident.update({
      where: { id },
      data: { status: next as any },
      select: { id: true, incidentNumber: true, status: true, updatedAt: true },
    });

    return {
      id: updated.id,
      incidentNumber: updated.incidentNumber,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async listForClientCoreId(clientCoreId: number) {
    return this.list({ clientCoreId, page: 1, pageSize: 100 });
  }

  async listForBuildingCoreId(buildingCoreId: number) {
    return this.list({ buildingCoreId, page: 1, pageSize: 100 });
  }
}
