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
import { SalesServicesService } from './sales-services.service';
import {
  CreateSalesServiceDto,
  UpdateSalesServiceDto,
  CreateServiceCategoryDto,
  UpdateServiceCategoryDto,
} from './dto/sales-service.dto';

@ApiTags('SalesServices')
@Controller('v1/sales/services')
@UseGuards(JwtAuthGuard)
export class SalesServicesController {
  constructor(private readonly servicesService: SalesServicesService) {}

  // ==================== SERVICES ====================

  @Get()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'List sales services',
    ok: 'Service catalog',
    permission: true,
    queries: [{ name: 'includeInactive', description: 'Include inactive (true/false)' }],
  })
  async findAllServices(@Query('includeInactive') includeInactive?: string) {
    return this.servicesService.findAllServices(includeInactive === 'true');
  }

  @Get(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Get service by ID',
    ok: 'Service detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Service UUID' }],
  })
  async findServiceById(@Param('id') id: string) {
    return this.servicesService.findServiceById(id);
  }

  @Post()
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  @Doc({
    summary: 'Create sales service',
    ok: 'Created service',
    permission: true,
    status: 201,
    bodyType: CreateSalesServiceDto,
  })
  async createService(@Body() dto: CreateSalesServiceDto) {
    return this.servicesService.createService(dto);
  }

  @Patch(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  @Doc({
    summary: 'Update sales service',
    ok: 'Updated service',
    permission: true,
    notFound: true,
    bodyType: UpdateSalesServiceDto,
    params: [{ name: 'id', description: 'Service UUID' }],
  })
  async updateService(@Param('id') id: string, @Body() dto: UpdateSalesServiceDto) {
    return this.servicesService.updateService(id, dto);
  }

  @Delete(':id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  @Doc({
    summary: 'Delete sales service',
    ok: 'Deletion result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Service UUID' }],
  })
  async deleteService(@Param('id') id: string) {
    return this.servicesService.deleteService(id);
  }

  // ==================== CATEGORIES ====================

  @Get('categories/all')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'List service categories',
    ok: 'Categories',
    permission: true,
    queries: [{ name: 'includeInactive', description: 'Include inactive (true/false)' }],
  })
  async findAllCategories(@Query('includeInactive') includeInactive?: string) {
    return this.servicesService.findAllCategories(includeInactive === 'true');
  }

  @Get('categories/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.read')
  @Doc({
    summary: 'Get service category by ID',
    ok: 'Category detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Category UUID' }],
  })
  async findCategoryById(@Param('id') id: string) {
    return this.servicesService.findCategoryById(id);
  }

  @Post('categories')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  @Doc({
    summary: 'Create service category',
    ok: 'Created category',
    permission: true,
    status: 201,
    bodyType: CreateServiceCategoryDto,
  })
  async createCategory(@Body() dto: CreateServiceCategoryDto) {
    return this.servicesService.createCategory(dto);
  }

  @Patch('categories/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  @Doc({
    summary: 'Update service category',
    ok: 'Updated category',
    permission: true,
    notFound: true,
    bodyType: UpdateServiceCategoryDto,
    params: [{ name: 'id', description: 'Category UUID' }],
  })
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateServiceCategoryDto) {
    return this.servicesService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('sales.services.manage')
  @Doc({
    summary: 'Delete service category',
    ok: 'Deletion result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Category UUID' }],
  })
  async deleteCategory(@Param('id') id: string) {
    return this.servicesService.deleteCategory(id);
  }
}
