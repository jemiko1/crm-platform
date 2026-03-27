import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IncidentsService } from "../incidents/incidents.service";
import { CreateIncidentDto } from "../incidents/dto/create-incident.dto";
import { UpdateIncidentStatusDto } from "../incidents/dto/update-incident-status.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PositionPermissionGuard } from "../common/guards/position-permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";
import { Doc } from "../common/openapi/doc-endpoint.decorator";

@ApiTags("Incidents")
@Controller("v1")
@UseGuards(JwtAuthGuard)
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get("incidents")
  @Doc({
    summary: "List incidents with filters",
    ok: "Paged incidents",
    queries: [
      { name: "q", description: "Search text" },
      { name: "status", description: "Status filter" },
      { name: "priority", description: "Priority filter" },
      { name: "buildingId", description: "Building core ID" },
      { name: "clientId", description: "Client core ID" },
      { name: "page", description: "Page number" },
      { name: "pageSize", description: "Page size" },
    ],
  })
  async list(
    @Query("q") q?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("buildingId") buildingId?: string,
    @Query("clientId") clientId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.incidents.list({
      q,
      status,
      priority,
      buildingCoreId: buildingId ? Number(buildingId) : undefined,
      clientCoreId: clientId ? Number(clientId) : undefined,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post("incidents")
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('incidents.create')
  @Doc({
    summary: "Create incident",
    ok: "Created incident",
    permission: true,
    status: 201,
    bodyType: CreateIncidentDto,
  })
  async create(@Body() dto: CreateIncidentDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.incidents.create(dto, userId);
  }

  @Get("incidents/:id")
  @Doc({
    summary: "Get incident by ID",
    ok: "Incident detail",
    notFound: true,
    params: [{ name: "id", description: "Incident UUID" }],
  })
  async getOne(@Param("id") id: string) {
    return this.incidents.getById(id);
  }

  @Patch("incidents/:id/status")
  @Doc({
    summary: "Update incident status",
    ok: "Updated incident",
    notFound: true,
    bodyType: UpdateIncidentStatusDto,
    params: [{ name: "id", description: "Incident UUID" }],
  })
  async updateStatus(@Param("id") id: string, @Body() dto: UpdateIncidentStatusDto) {
    return this.incidents.updateStatus(id, dto);
  }

  @Get("clients/:clientId/incidents")
  @Doc({
    summary: "Incidents for client core ID",
    ok: "Incident list for client",
    notFound: true,
    params: [{ name: "clientId", description: "Client core ID" }],
  })
  async listForClient(@Param("clientId") clientId: string) {
    return this.incidents.listForClientCoreId(Number(clientId));
  }

  @Get("buildings/:buildingId/incidents")
  @Doc({
    summary: "Incidents for building core ID",
    ok: "Incident list for building",
    notFound: true,
    params: [{ name: "buildingId", description: "Building core ID" }],
  })
  async listForBuilding(@Param("buildingId") buildingId: string) {
    return this.incidents.listForBuildingCoreId(Number(buildingId));
  }
}
