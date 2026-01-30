import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { BuildingsService } from "./buildings.service";

@Controller("buildings")
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  /**
   * Read-only endpoints (for compatibility / internal usage).
   * Manual creation is handled under /v1/admin/* (ADMIN only).
   */

  @Get()
  list() {
    return this.buildingsService.list();
  }

  @Get("statistics/summary")
  getStatistics() {
    return this.buildingsService.getStatistics();
  }

  @Get(":coreId")
  getOne(@Param("coreId", ParseIntPipe) coreId: number) {
    return this.buildingsService.getByCoreId(coreId);
  }
}

