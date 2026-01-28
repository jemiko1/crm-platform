import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { BuildingsService } from "../buildings/buildings.service";
import { ClientsService } from "../clients/clients.service";
import { AssetsService } from "../assets/assets.service";

@Controller("v1")
export class PublicController {
  constructor(
    private readonly buildings: BuildingsService,
    private readonly clients: ClientsService,
    private readonly assets: AssetsService,
  ) {}

  @Get("buildings")
  listBuildings() {
    return this.buildings.list();
  }

  @Get("buildings/:buildingCoreId")
  building(@Param("buildingCoreId", ParseIntPipe) buildingCoreId: number) {
    return this.buildings.getByCoreId(buildingCoreId);
  }

  @Get("buildings/:buildingCoreId/clients")
  async buildingClients(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
  ) {
    const buildingId = await this.buildings.internalId(buildingCoreId);
    return this.clients.listByBuilding(buildingId);
  }

  @Get("buildings/:buildingCoreId/assets")
  async buildingAssets(
    @Param("buildingCoreId", ParseIntPipe) buildingCoreId: number,
  ) {
    const buildingId = await this.buildings.internalId(buildingCoreId);
    return this.assets.listByBuilding(buildingId);
  }

  /**
   * Global clients directory
   * Used by frontend page: /app/clients
   */
  @Get("clients")
  listClients() {
    // NOTE: clients are attached to buildings internally.
    // The service should return clients with their building assignment(s).
    return this.clients.listDirectory();
  }
}
