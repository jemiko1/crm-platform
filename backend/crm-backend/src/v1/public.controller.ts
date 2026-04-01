import { Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Patch, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { BuildingsService } from "../buildings/buildings.service";
import { ClientsService } from "../clients/clients.service";
import { AssetsService } from "../assets/assets.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PaginationDto } from "../common/dto/pagination.dto";
import { UpdateClientDto } from "../clients/dto/update-client.dto";
import { Doc } from "../common/openapi/doc-endpoint.decorator";

@ApiTags("Public")
@Controller("v1")
@UseGuards(JwtAuthGuard)
export class PublicController {
  constructor(
    private readonly buildings: BuildingsService,
    private readonly clients: ClientsService,
    private readonly assets: AssetsService,
  ) {}

  @Get("buildings")
  @Doc({
    summary: "List buildings (v1)",
    ok: "Paged buildings",
    queries: [
      { name: "page", description: "Page number" },
      { name: "pageSize", description: "Page size" },
    ],
  })
  listBuildings(
    @Query() pagination: PaginationDto,
    @Query("search") search?: string,
  ) {
    return this.buildings.list(pagination.page, pagination.pageSize, search);
  }

  @Get("buildings/statistics/summary")
  @Doc({ summary: "Building statistics (v1)", ok: "Aggregate building metrics" })
  getBuildingsStatistics() {
    return this.buildings.getStatistics();
  }

  @Get("buildings/:buildingCoreId")
  @Doc({
    summary: "Get building by core ID (v1)",
    ok: "Building detail",
    notFound: true,
    params: [{ name: "buildingCoreId", description: "Building core ID", type: "number" }],
  })
  building(@Param("buildingCoreId", ParseIntPipe) buildingCoreId: number) {
    return this.buildings.getByCoreId(buildingCoreId);
  }

  @Get("buildings/:buildingCoreId/clients")
  @Doc({
    summary: "Clients in building (v1)",
    ok: "Paged clients for building",
    notFound: true,
    params: [{ name: "buildingCoreId", description: "Building core ID", type: "number" }],
    queries: [
      { name: "page", description: "Page number" },
      { name: "pageSize", description: "Page size" },
    ],
  })
  async buildingClients(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Query() pagination: PaginationDto,
  ) {
    const buildingId = await this.buildings.internalId(buildingCoreId);
    return this.clients.listByBuilding(buildingId, pagination.page, pagination.pageSize);
  }

  @Get("buildings/:buildingCoreId/assets")
  @Doc({
    summary: "Assets in building (v1)",
    ok: "Paged assets for building",
    notFound: true,
    params: [{ name: "buildingCoreId", description: "Building core ID", type: "number" }],
    queries: [
      { name: "page", description: "Page number" },
      { name: "pageSize", description: "Page size" },
    ],
  })
  async buildingAssets(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Query() pagination: PaginationDto,
  ) {
    const buildingId = await this.buildings.internalId(buildingCoreId);
    return this.assets.listByBuilding(buildingId, pagination.page, pagination.pageSize);
  }

  @Get("clients/statistics/summary")
  @Doc({
    summary: "Client statistics summary",
    ok: "Aggregate counts and metrics for clients",
  })
  clientStatistics() {
    return this.clients.getStatistics();
  }

  @Get("clients")
  @Doc({
    summary: "Client directory (v1)",
    ok: "Paged clients",
    queries: [
      { name: "page", description: "Page number" },
      { name: "pageSize", description: "Page size" },
      { name: "search", description: "Search string" },
    ],
  })
  listClients(
    @Query() pagination: PaginationDto,
    @Query("search") search?: string,
  ) {
    return this.clients.listDirectory(pagination.page, pagination.pageSize, search);
  }

  @Get("clients/:coreId")
  @Doc({
    summary: "Get client by core ID (v1)",
    ok: "Client detail",
    notFound: true,
    params: [{ name: "coreId", description: "Client core ID", type: "number" }],
  })
  async getClient(@Param("coreId", ParseIntPipe) coreId: number) {
    const client = await this.clients.findByCoreId(coreId);
    if (!client) throw new NotFoundException(`Client #${coreId} not found`);
    return client;
  }

  @Patch("clients/:coreId")
  @Doc({
    summary: "Update client by core ID (v1)",
    ok: "Updated client",
    notFound: true,
    bodyType: UpdateClientDto,
    params: [{ name: "coreId", description: "Client core ID", type: "number" }],
  })
  async updateClient(
    @Param("coreId", ParseIntPipe) coreId: number,
    @Body() dto: UpdateClientDto,
  ) {
    const updated = await this.clients.update(coreId, dto);
    if (!updated) throw new NotFoundException(`Client #${coreId} not found`);
    return updated;
  }
}
