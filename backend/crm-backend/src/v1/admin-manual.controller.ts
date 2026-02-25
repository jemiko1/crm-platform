import { Body, Controller, Param, ParseIntPipe, Post, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FeatureFlagGuard } from "../common/guards/feature-flag.guard";
import { AdminOnlyGuard } from "../common/guards/admin-only.guard";
import { BuildingsService } from "../buildings/buildings.service";
import { ClientsService } from "../clients/clients.service";
import { AssetsService } from "../assets/assets.service";
import { AuditService } from "../audit/audit.service";
import { CreateBuildingDto } from "../buildings/dto/create-building.dto";
import { UpdateBuildingDto } from "../buildings/dto/update-building.dto";
import { AdminCreateClientDto } from "./dto/admin-create-client.dto";
import { AdminCreateAssetDto } from "./dto/admin-create-asset.dto";

@ApiTags("AdminManual")
@Controller("v1/admin")
@UseGuards(JwtAuthGuard, FeatureFlagGuard, AdminOnlyGuard)
export class AdminManualController {
  constructor(
    private readonly buildings: BuildingsService,
    private readonly clients: ClientsService,
    private readonly assets: AssetsService,
    private readonly audit: AuditService,
  ) {}

  @Post("buildings")
  async createBuilding(@Body() dto: CreateBuildingDto, @Req() req: any) {
    const created = await this.buildings.createManual(dto);

    await this.audit.log({
      action: "CREATE",
      entity: "BUILDING",
      entityKey: String(created.coreId),
      req,
      payload: dto,
    });

    return created;
  }

  @Patch("buildings/:buildingCoreId")
  async updateBuilding(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Body() dto: UpdateBuildingDto,
    @Req() req: any,
  ) {
    const updated = await this.buildings.update(buildingCoreId, dto);
    
    await this.audit.log({
      action: "UPDATE",
      entity: "BUILDING",
      entityKey: String(buildingCoreId),
      req,
      payload: dto,
    });
    
    return updated;
  }

  @Post("buildings/:buildingCoreId/clients")
  async createClient(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Body() dto: AdminCreateClientDto,
    @Req() req: any,
  ) {
    const buildingCoreIds = dto.buildingCoreIds
      ? dto.buildingCoreIds
      : [buildingCoreId];

    const buildingIds = await Promise.all(
      buildingCoreIds.map((bcId: number) => this.buildings.internalId(bcId)),
    );

    const { buildingCoreIds: _, ...clientData } = dto;
    const created = await this.clients.createManual(buildingIds, clientData);

    await this.audit.log({
      action: "CREATE",
      entity: "CLIENT",
      entityKey: String(created.coreId),
      req,
      payload: { buildingCoreIds, ...clientData },
    });

    return created;
  }

  @Post("buildings/:buildingCoreId/assets")
  async createAsset(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Body() dto: AdminCreateAssetDto,
    @Req() req: any,
  ) {
    const buildingId = await this.buildings.internalId(buildingCoreId);
    const created = await this.assets.createManual(buildingId, dto);

    await this.audit.log({
      action: "CREATE",
      entity: "ASSET",
      entityKey: String(created.coreId),
      req,
      payload: { buildingCoreId, ...dto },
    });

    return created;
  }
}
