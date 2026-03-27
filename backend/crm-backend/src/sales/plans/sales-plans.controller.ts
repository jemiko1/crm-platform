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
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';
import { SalesPlansService } from './sales-plans.service';
import { CreateSalesPlanDto, UpdateSalesPlanDto, QuerySalesPlansDto } from './dto/sales-plan.dto';

@ApiTags('SalesPlans')
@Controller('v1/sales/plans')
@UseGuards(JwtAuthGuard)
export class SalesPlansController {
  constructor(private readonly plansService: SalesPlansService) {}

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.create_individual')
  @Doc({
    summary: 'Create sales plan',
    ok: 'Created plan',
    permission: true,
    status: 201,
    bodyType: CreateSalesPlanDto,
  })
  async create(@Body() dto: CreateSalesPlanDto, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.plansService.create(dto, employeeId);
  }

  @Get()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({ summary: 'List sales plans', ok: 'Paged plans', permission: true })
  async findAll(@Query() query: QuerySalesPlansDto) {
    return this.plansService.findAll(query);
  }

  @Get('my-progress')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({ summary: 'Current user plan progress', ok: 'Progress metrics', permission: true })
  async getMyProgress(@Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.plansService.getMyProgress(employeeId);
  }

  @Get('team-dashboard')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.view_team')
  @Doc({ summary: 'Team sales plans dashboard', ok: 'Team-wide metrics', permission: true })
  async getTeamDashboard() {
    return this.plansService.getTeamDashboard();
  }

  @Get(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Get sales plan by ID',
    ok: 'Plan detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Plan UUID' }],
  })
  async findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.edit')
  @Doc({
    summary: 'Update sales plan',
    ok: 'Updated plan',
    permission: true,
    notFound: true,
    bodyType: UpdateSalesPlanDto,
    params: [{ name: 'id', description: 'Plan UUID' }],
  })
  async update(@Param('id') id: string, @Body() dto: UpdateSalesPlanDto) {
    return this.plansService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.edit')
  @Doc({
    summary: 'Delete sales plan',
    ok: 'Deletion result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Plan UUID' }],
  })
  async delete(@Param('id') id: string) {
    return this.plansService.delete(id);
  }

  @Post(':id/activate')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.edit')
  @Doc({
    summary: 'Activate sales plan',
    ok: 'Plan activated',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Plan UUID' }],
  })
  async activate(@Param('id') id: string, @Request() req: any) {
    const employeeId = req.user.employee?.id;
    return this.plansService.activate(id, employeeId);
  }

  @Post(':id/complete')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.plans.edit')
  @Doc({
    summary: 'Mark sales plan complete',
    ok: 'Plan completed',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Plan UUID' }],
  })
  async complete(@Param('id') id: string) {
    return this.plansService.complete(id);
  }
}
