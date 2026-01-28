import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IncidentsService } from "../incidents/incidents.service";
import { CreateIncidentDto } from "../incidents/dto/create-incident.dto";
import { UpdateIncidentStatusDto } from "../incidents/dto/update-incident-status.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PositionPermissionGuard } from "../common/guards/position-permission.guard";
import { RequirePermission } from "../common/decorators/require-permission.decorator";

@Controller("v1")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Get("incidents")
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
  @UseGuards(JwtAuthGuard, PositionPermissionGuard)
  @RequirePermission('incidents.create')
  async create(@Body() dto: CreateIncidentDto, @Req() req: any) {
    const userId = req.user?.id;
    return this.incidents.create(dto, userId);
  }

  @Get("incidents/:id")
  async getOne(@Param("id") id: string) {
    return this.incidents.getById(id);
  }

  @Patch("incidents/:id/status")
  async updateStatus(@Param("id") id: string, @Body() dto: UpdateIncidentStatusDto) {
    return this.incidents.updateStatus(id, dto);
  }

  @Get("clients/:clientId/incidents")
  async listForClient(@Param("clientId") clientId: string) {
    return this.incidents.listForClientCoreId(Number(clientId));
  }

  @Get("buildings/:buildingId/incidents")
  async listForBuilding(@Param("buildingId") buildingId: string) {
    return this.incidents.listForBuildingCoreId(Number(buildingId));
  }
}
