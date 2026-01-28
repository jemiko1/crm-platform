import { Body, Controller, Param, ParseIntPipe, Post, Patch, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiTags } from "@nestjs/swagger";

import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { FeatureFlagGuard } from "../common/guards/feature-flag.guard";
import { AdminOnlyGuard } from "../common/guards/admin-only.guard";
import { BuildingsService } from "../buildings/buildings.service";
import { ClientsService } from "../clients/clients.service";
import { AssetsService } from "../assets/assets.service";
import { AuditService } from "../audit/audit.service";

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

  // ========== CREATE BUILDING ==========
  @Post("buildings")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", example: "Building 1" },
        city: { type: "string", example: "Tbilisi" },
        address: { type: "string", example: "Test address 1" },
      },
      required: ["name"],
    },
  })
  async createBuilding(@Body() body: any, @Req() req: any) {
    const created = await this.buildings.createManual(body);

    await this.audit.log({
      action: "CREATE",
      entity: "BUILDING",
      entityKey: String(created.coreId),
      req,
      payload: body,
    });

    return created;
  }

  // ========== UPDATE BUILDING (NEW!) ==========
  @Patch("buildings/:buildingCoreId")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        name: { type: "string", example: "Updated Building Name" },
        city: { type: "string", example: "Tbilisi" },
        address: { type: "string", example: "Updated address" },
      },
    },
  })
  async updateBuilding(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    const updated = await this.buildings.update(buildingCoreId, body);
    
    await this.audit.log({
      action: "UPDATE",
      entity: "BUILDING",
      entityKey: String(buildingCoreId),
      req,
      payload: body,
    });
    
    return updated;
  }

  // ========== CREATE CLIENT ==========
  @Post("buildings/:buildingCoreId/clients")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        firstName: { type: "string", example: "Nika" },
        lastName: { type: "string", example: "Beridze" },
        idNumber: { type: "string", example: "01010101010" },
        paymentId: { type: "string", example: "PAY-001" },
        primaryPhone: { type: "string", example: "+995599111222" },
        secondaryPhone: { type: "string", example: "+995555000111" },
        buildingCoreIds: {
          type: "array",
          items: { type: "number" },
          example: [38, 39],
          description: "Array of building coreIds. If not provided, uses the buildingCoreId from URL.",
        },
      },
    },
  })
  async createClient(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    // Support both single building (from URL) and multiple buildings (from body)
    const buildingCoreIds = body.buildingCoreIds
      ? Array.isArray(body.buildingCoreIds)
        ? body.buildingCoreIds
        : [body.buildingCoreIds]
      : [buildingCoreId];

    // Resolve all building IDs
    const buildingIds = await Promise.all(
      buildingCoreIds.map((bcId: number) => this.buildings.internalId(bcId)),
    );

    const { buildingCoreIds: _, ...clientData } = body;
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

  // ========== CREATE ASSET ==========
  @Post("buildings/:buildingCoreId/assets")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          example: "ELEVATOR",
          enum: [
            "ELEVATOR",
            "ENTRANCE_DOOR",
            "INTERCOM",
            "SMART_GSM_GATE",
            "SMART_DOOR_GSM",
            "BOOM_BARRIER",
            "OTHER",
          ],
        },
        name: { type: "string", example: "Small Lift" },
        ip: { type: "string", example: "10.0.0.10" },
        status: {
          type: "string",
          example: "ONLINE",
          enum: ["ONLINE", "OFFLINE", "UNKNOWN"],
        },
      },
      required: ["type", "name"],
    },
  })
  async createAsset(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
    @Body() body: any,
    @Req() req: any,
  ) {
    const buildingId = await this.buildings.internalId(buildingCoreId);
    const created = await this.assets.createManual(buildingId, body);

    await this.audit.log({
      action: "CREATE",
      entity: "ASSET",
      entityKey: String(created.coreId),
      req,
      payload: { buildingCoreId, ...body },
    });

    return created;
  }
}