import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SalesPlansService } from './sales-plans.service';
import { CreateSalesPlanDto, UpdateSalesPlanDto, QuerySalesPlansDto } from './dto/sales-plan.dto';

@Controller('v1/sales/plans')
@UseGuards(JwtAuthGuard)
export class SalesPlansController {
  constructor(private readonly plansService: SalesPlansService) {}

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.create_individual')
  async create(@Body() dto: CreateSalesPlanDto, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.plansService.create(dto, employeeId);
  }

  @Get()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async findAll(@Query() query: QuerySalesPlansDto) {
    return this.plansService.findAll(query);
  }

  @Get('my-progress')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getMyProgress(@Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.plansService.getMyProgress(employeeId);
  }

  @Get('team-dashboard')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.view_team')
  async getTeamDashboard() {
    return this.plansService.getTeamDashboard();
  }

  @Get(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateSalesPlanDto) {
    return this.plansService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.edit')
  async delete(@Param('id') id: string) {
    return this.plansService.delete(id);
  }

  @Post(':id/activate')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.edit')
  async activate(@Param('id') id: string, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.plansService.activate(id, employeeId);
  }

  @Post(':id/complete')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.edit')
  async complete(@Param('id') id: string) {
    return this.plansService.complete(id);
  }
}
