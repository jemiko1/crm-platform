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
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../../common/guards/position-permission.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { SalesConfigService } from './sales-config.service';
import {
  UpdatePipelineConfigDto,
  UpdateStageDto,
  CreateLeadSourceDto,
  UpdateLeadSourceDto,
  UpdatePipelinePermissionDto,
} from './dto/sales-config.dto';

@Controller('v1/sales/config')
@UseGuards(JwtAuthGuard)
export class SalesConfigController {
  constructor(private readonly configService: SalesConfigService) {}

  // ==================== PIPELINE CONFIGURATION ====================

  @Get('pipeline')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getAllConfigs() {
    return this.configService.getAllConfigs();
  }

  @Get('pipeline/:key')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getConfig(@Param('key') key: string) {
    return this.configService.getConfig(key);
  }

  @Patch('pipeline/:key/positions')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  async updateConfigPositions(@Param('key') key: string, @Body() dto: UpdatePipelineConfigDto) {
    return this.configService.updateConfigPositions(key, dto);
  }

  // ==================== STAGES ====================

  @Get('stages')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getAllStages() {
    return this.configService.getAllStages();
  }

  @Get('stages/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getStage(@Param('id') id: string) {
    return this.configService.getStage(id);
  }

  @Patch('stages/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  async updateStage(@Param('id') id: string, @Body() dto: UpdateStageDto) {
    return this.configService.updateStage(id, dto);
  }

  // ==================== LEAD SOURCES ====================

  @Get('sources')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getAllSources(@Query('includeInactive') includeInactive?: string) {
    return this.configService.getAllSources(includeInactive === 'true');
  }

  @Get('sources/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getSource(@Param('id') id: string) {
    return this.configService.getSource(id);
  }

  @Post('sources')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  async createSource(@Body() dto: CreateLeadSourceDto) {
    return this.configService.createSource(dto);
  }

  @Patch('sources/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  async updateSource(@Param('id') id: string, @Body() dto: UpdateLeadSourceDto) {
    return this.configService.updateSource(id, dto);
  }

  @Delete('sources/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
  async deleteSource(@Param('id') id: string) {
    return this.configService.deleteSource(id);
  }

  // ==================== PIPELINE PERMISSIONS ====================

  @Get('permissions')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getAllPipelinePermissions() {
    return this.configService.getAllPipelinePermissions();
  }

  @Get('permissions/:key')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async getPipelinePermission(@Param('key') key: string) {
    return this.configService.getPipelinePermission(key);
  }

  @Patch('permissions/:key/positions')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.config.manage')
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
  async getAllPositions() {
    return this.configService.getAllPositions();
  }
}
