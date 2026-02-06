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
import { SalesServicesService } from './sales-services.service';
import {
  CreateSalesServiceDto,
  UpdateSalesServiceDto,
  CreateServiceCategoryDto,
  UpdateServiceCategoryDto,
} from './dto/sales-service.dto';

@Controller('v1/sales/services')
@UseGuards(JwtAuthGuard)
export class SalesServicesController {
  constructor(private readonly servicesService: SalesServicesService) {}

  // ==================== SERVICES ====================

  @Get()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async findAllServices(@Query('includeInactive') includeInactive?: string) {
    return this.servicesService.findAllServices(includeInactive === 'true');
  }

  @Get(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async findServiceById(@Param('id') id: string) {
    return this.servicesService.findServiceById(id);
  }

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  async createService(@Body() dto: CreateSalesServiceDto) {
    return this.servicesService.createService(dto);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  async updateService(@Param('id') id: string, @Body() dto: UpdateSalesServiceDto) {
    return this.servicesService.updateService(id, dto);
  }

  @Delete(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  async deleteService(@Param('id') id: string) {
    return this.servicesService.deleteService(id);
  }

  // ==================== CATEGORIES ====================

  @Get('categories/all')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async findAllCategories(@Query('includeInactive') includeInactive?: string) {
    return this.servicesService.findAllCategories(includeInactive === 'true');
  }

  @Get('categories/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  async findCategoryById(@Param('id') id: string) {
    return this.servicesService.findCategoryById(id);
  }

  @Post('categories')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  async createCategory(@Body() dto: CreateServiceCategoryDto) {
    return this.servicesService.createCategory(dto);
  }

  @Patch('categories/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateServiceCategoryDto) {
    return this.servicesService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  async deleteCategory(@Param('id') id: string) {
    return this.servicesService.deleteCategory(id);
  }
}
