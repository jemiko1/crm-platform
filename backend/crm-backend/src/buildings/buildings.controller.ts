import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { BuildingsService } from "./buildings.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PaginationDto } from "../common/dto/pagination.dto";
import { Doc } from "../common/openapi/doc-endpoint.decorator";

@ApiTags("Buildings")
@Controller("buildings")
@UseGuards(JwtAuthGuard)
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Get()
  @Doc({
    summary: "List buildings (paginated)",
    ok: "Paged building rows",
    queries: [
      { name: "page", description: "Page number (1-based)" },
      { name: "pageSize", description: "Page size" },
      { name: "search", description: "Search by name, address, city, or core ID" },
    ],
  })
  list(
    @Query() pagination: PaginationDto,
    @Query("search") search?: string,
  ) {
    return this.buildingsService.list(pagination.page, pagination.pageSize, search);
  }

  @Get("statistics/summary")
  @Doc({
    summary: "Building statistics summary",
    ok: "Aggregate counts and metrics for buildings",
  })
  getStatistics() {
    return this.buildingsService.getStatistics();
  }

  @Get(":coreId")
  @Doc({
    summary: "Get building by core ID",
    ok: "Building detail",
    notFound: true,
    params: [{ name: "coreId", description: "Building core identifier", type: "number" }],
  })
  getOne(@Param("coreId", ParseIntPipe) coreId: number) {
    return this.buildingsService.getByCoreId(coreId);
  }
}

