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
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { Doc } from '../../common/openapi/doc-endpoint.decorator';
import { SalesConfigService } from './sales-config.service';
import {
  UpdatePipelineConfigDto,
  UpdateStageDto,
  CreateLeadSourceDto,
  UpdateLeadSourceDto,
  UpdatePipelinePermissionDto,
} from './dto/sales-config.dto';

@ApiTags('SalesConfig')
@Controller('v1/sales/config')
@UseGuards(JwtAuthGuard)
export class SalesConfigController {
  constructor(private readonly configService: SalesConfigService) {}

  // ==================== PIPELINE CONFIGURATION ====================

  @Get('pipeline')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({ summary: 'All pipeline configurations', ok: 'Pipeline configs', permission: true })
  async getAllConfigs() {
    return this.configService.getAllConfigs();
  }

  @Get('pipeline/:key')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Pipeline config by key',
    ok: 'Single pipeline config',
    permission: true,
    notFound: true,
    params: [{ name: 'key', description: 'Pipeline key' }],
  })
  async getConfig(@Param('key') key: string) {
    return this.configService.getConfig(key);
  }

  @Patch('pipeline/:key/positions')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  @Doc({
    summary: 'Reorder pipeline stage positions',
    ok: 'Updated pipeline',
    permission: true,
    notFound: true,
    bodyType: UpdatePipelineConfigDto,
    params: [{ name: 'key', description: 'Pipeline key' }],
  })
  async updateConfigPositions(@Param('key') key: string, @Body() dto: UpdatePipelineConfigDto) {
    return this.configService.updateConfigPositions(key, dto);
  }

  // ==================== STAGES ====================

  @Get('stages')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({ summary: 'All pipeline stages', ok: 'Stage rows', permission: true })
  async getAllStages() {
    return this.configService.getAllStages();
  }

  @Get('stages/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Stage by ID',
    ok: 'Stage detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Stage UUID' }],
  })
  async getStage(@Param('id') id: string) {
    return this.configService.getStage(id);
  }

  @Patch('stages/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  @Doc({
    summary: 'Update pipeline stage',
    ok: 'Updated stage',
    permission: true,
    notFound: true,
    bodyType: UpdateStageDto,
    params: [{ name: 'id', description: 'Stage UUID' }],
  })
  async updateStage(@Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.configService.updateStage(id, dto);
  }

  // ==================== LEAD SOURCES ====================

  @Get('sources')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Lead sources',
    ok: 'Source list',
    permission: true,
    queries: [{ name: 'includeInactive', description: 'Include inactive (true/false)' }],
  })
  async getAllSources(@Query('includeInactive') includeInactive?: string) {
    return this.configService.getAllSources(includeInactive === 'true');
  }

  @Get('sources/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Lead source by ID',
    ok: 'Source detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Source UUID' }],
  })
  async getSource(@Param('id') id: string) {
    return this.configService.getSource(id);
  }

  @Post('sources')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  @Doc({
    summary: 'Create lead source',
    ok: 'Created source',
    permission: true,
    status: 201,
    bodyType: CreateLeadSourceDto,
  })
  async createSource(@Body() dto: CreateLeadSourceDto) {
    return this.configService.createSource(dto);
  }

  @Patch('sources/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  @Doc({
    summary: 'Update lead source',
    ok: 'Updated source',
    permission: true,
    notFound: true,
    bodyType: UpdateLeadSourceDto,
    params: [{ name: 'id', description: 'Source UUID' }],
  })
  async updateSource(@Param('id') id: string, @Body() dto: UpdateLeadSourceDto) {
    return this.configService.updateSource(id, dto);
  }

  @Delete('sources/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  @Doc({
    summary: 'Delete lead source',
    ok: 'Deletion result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Source UUID' }],
  })
  async deleteSource(@Param('id') id: string) {
    return this.configService.deleteSource(id);
  }

  // ==================== PIPELINE PERMISSIONS ====================

  @Get('permissions')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Pipeline permission rows',
    ok: 'Sales pipeline permission configuration',
    permission: true,
  })
  async getAllPipelinePermissions() {
    return this.configService.getAllPipelinePermissions();
  }

  @Get('permissions/:key')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Pipeline permission by key',
    ok: 'Permission config',
    permission: true,
    notFound: true,
    params: [{ name: 'key', description: 'Permission key' }],
  })
  async getPipelinePermission(@Param('key') key: string) {
    return this.configService.getPipelinePermission(key);
  }

  @Patch('permissions/:key/positions')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  @Doc({
    summary: 'Update allowed positions for pipeline permission',
    ok: 'Updated permission mapping',
    permission: true,
    notFound: true,
    bodyType: UpdatePipelinePermissionDto,
    params: [{ name: 'key', description: 'Permission key' }],
  })
  async updatePipelinePermissionPositions(
    @Param('key') key: string,
    @Body() dto: UpdatePipelinePermissionDto,
  ) {
    return this.configService.updatePipelinePermissionPositions(key, dto);
  }

  // ==================== POSITIONS ====================

  @Get('positions')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Positions available for sales configuration',
    ok: 'Position rows',
    permission: true,
  })
  async getAllPositions() {
    return this.configService.getAllPositions();
  }
}
