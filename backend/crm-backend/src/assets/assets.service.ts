import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IdGeneratorService } from "../common/id-generator/id-generator.service";

const VALID_ASSET_TYPES = new Set([
  "ELEVATOR",
  "ENTRANCE_DOOR",
  "INTERCOM",
  "SMART_GSM_GATE",
  "SMART_DOOR_GSM",
  "BOOM_BARRIER",
  "OTHER",
]);

const VALID_STATUS = new Set(["ONLINE", "OFFLINE", "UNKNOWN"]);

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGeneratorService,
  ) {}

  async createManual(buildingId: string, input: any) {
    if (!VALID_ASSET_TYPES.has(input.type)) {
      throw new BadRequestException(`Invalid asset type: ${input.type}`);
    }
    const status = input.status ?? "UNKNOWN";
    if (!VALID_STATUS.has(status)) {
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

  async listByBuilding(buildingId: string) {
    return this.prisma.asset.findMany({
      where: { buildingId },
      orderBy: [{ type: "asc" }, { coreId: "asc" }],
      select: {
        coreId: true,
        type: true,
        name: true,
        ip: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async internalId(coreId: number): Promise<string | null> {
    const asset = await this.prisma.asset.findUnique({
      where: { coreId },
      select: { id: true },
    });
    return asset?.id ?? null;
  }
}
