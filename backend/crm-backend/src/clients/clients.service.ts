import { Injectable } from "@nestjs/common";
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
   */
  async listDirectory(page = 1, pageSize = 20) {
    const { skip, take } = paginate(page, pageSize);
    const select = {
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
    } as const;

    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        orderBy: [{ updatedAt: "desc" }, { coreId: "asc" }],
        select,
        skip,
        take,
      }),
      this.prisma.client.count(),
    ]);

    const data = rows.map((c) => ({
      coreId: c.coreId,
      firstName: c.firstName,
      lastName: c.lastName,
      idNumber: c.idNumber,
      paymentId: c.paymentId,
      primaryPhone: c.primaryPhone,
      secondaryPhone: c.secondaryPhone,
      updatedAt: c.updatedAt,
      buildings: c.clientBuildings.map((cb) => ({
        coreId: cb.building.coreId,
        name: cb.building.name,
      })),
    }));

    return buildPaginatedResponse(data, total, page, pageSize);
  }
}
