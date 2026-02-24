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

  async internalId(coreId: number): Promise<string | null> {
    const asset = await this.prisma.asset.findUnique({
      where: { coreId },
      select: { id: true },
    });
    return asset?.id ?? null;
  }
}
