import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { BuildingsService } from "./buildings.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PaginationDto } from "../common/dto/pagination.dto";

@Controller("buildings")
@UseGuards(JwtAuthGuard)
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  list(@Query() pagination: PaginationDto) {
    return this.buildingsService.list(pagination.page, pagination.pageSize);
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

