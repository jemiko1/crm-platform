import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../common/guards/position-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CallReportsService } from './call-reports.service';
import { CreateCallReportDto } from './dto/create-call-report.dto';
import { UpdateCallReportDto } from './dto/update-call-report.dto';

@ApiTags('Call Reports')
@Controller('v1/call-reports')
@UseGuards(JwtAuthGuard)
export class CallReportsController {
  constructor(private readonly callReports: CallReportsService) {}

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('call_center.reports')
  create(@Body() dto: CreateCallReportDto, @Req() req: any) {
    return this.callReports.create(dto, req.user.id);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('call_center.reports')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCallReportDto,
    @Req() req: any,
  ) {
    return this.callReports.update(id, dto, req.user.id, req.user.isSuperAdmin);
  }

  @Get('my-drafts')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('call_center.reports')
  myDrafts(@Req() req: any) {
    return this.callReports.myDrafts(req.user.id);
  }

  @Get('payment-lookup')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('call_center.reports')
  paymentLookup(@Query('q') q: string) {
    return this.callReports.paymentLookup(q);
  }

  @Get(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('call_center.reports')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.callReports.findOne(id, req.user.id, req.user.isSuperAdmin);
  }

  @Get()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('call_center.reports')
  list(
    @Req() req: any,
    @Query('status') status?: string,
    @Query('buildingId') buildingId?: string,
    @Query('operatorId') operatorId?: string,
    @Query('categoryCode') categoryCode?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.callReports.list(req.user.id, req.user.isSuperAdmin, {
      status,
      buildingId,
      operatorId,
      categoryCode,
      dateFrom,
      dateTo,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
