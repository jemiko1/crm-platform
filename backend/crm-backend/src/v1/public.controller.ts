import { Controller, Get, NotFoundException, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { BuildingsService } from "../buildings/buildings.service";
import { ClientsService } from "../clients/clients.service";
import { AssetsService } from "../assets/assets.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PaginationDto } from "../common/dto/pagination.dto";

@Controller("v1")
@UseGuards(JwtAuthGuard)
export class PublicController {
  constructor(
    private readonly buildings: BuildingsService,
    private readonly clients: ClientsService,
    private readonly assets: AssetsService,
  ) {}

  @Get("buildings")
  listBuildings(@Query() pagination: PaginationDto) {
    return this.buildings.list(pagination.page, pagination.pageSize);
  }

  @Get("buildings/statistics/summary")
  getBuildingsStatistics() {
    return this.buildings.getStatistics();
  }

  @Get("buildings/:buildingCoreId")
  building(@Param("buildingCoreId", ParseIntPipe) buildingCoreId: number) {
    return this.buildings.getByCoreId(buildingCoreId);
  }

  @Get("buildings/:buildingCoreId/clients")
  async buildingClients(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Query() pagination: PaginationDto,
  ) {
    const buildingId = await this.buildings.internalId(buildingCoreId);
    return this.clients.listByBuilding(buildingId, pagination.page, pagination.pageSize);
  }

  @Get("buildings/:buildingCoreId/assets")
  async buildingAssets(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Query() pagination: PaginationDto,
  ) {
    const buildingId = await this.buildings.internalId(buildingCoreId);
    return this.assets.listByBuilding(buildingId, pagination.page, pagination.pageSize);
  }

  @Get("clients")
  listClients(@Query() pagination: PaginationDto) {
    return this.clients.listDirectory(pagination.page, pagination.pageSize);
  }

  @Get("clients/:coreId")
  async getClient(@Param("coreId", ParseIntPipe) coreId: number) {
    const client = await this.clients.findByCoreId(coreId);
    if (!client) throw new NotFoundException(`Client #${coreId} not found`);
    return client;
  }
}
