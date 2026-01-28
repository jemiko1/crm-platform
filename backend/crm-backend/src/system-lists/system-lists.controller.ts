import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../common/guards/position-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { SystemListsService } from './system-lists.service';
import { CreateListCategoryDto } from './dto/create-list-category.dto';
import { UpdateListCategoryDto } from './dto/update-list-category.dto';
import { CreateListItemDto } from './dto/create-list-item.dto';
import { UpdateListItemDto } from './dto/update-list-item.dto';
import { ReassignAndDeleteDto } from './dto/reassign-and-delete.dto';

@Controller('v1/system-lists')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class SystemListsController {
  constructor(private readonly systemListsService: SystemListsService) {}

  // ==================== CATEGORIES ====================

  @Get('categories')
  @RequirePermission('admin.read')
  findAllCategories() {
    return this.systemListsService.findAllCategories();
  }

  @Get('categories/:id')
  @RequirePermission('admin.read')
  findCategoryById(@Param('id') id: string) {
    return this.systemListsService.findCategoryById(id);
  }

  @Get('categories/code/:code')
  findCategoryByCode(@Param('code') code: string) {
    return this.systemListsService.findCategoryByCode(code);
  }

  @Post('categories')
  @RequirePermission('admin.create')
  createCategory(@Body() dto: CreateListCategoryDto) {
    return this.systemListsService.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermission('admin.update')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateListCategoryDto) {
    return this.systemListsService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermission('admin.delete')
  deleteCategory(@Param('id') id: string) {
    return this.systemListsService.deleteCategory(id);
  }

  // ==================== ITEMS ====================

  @Get('categories/:categoryId/items')
  findAllItemsByCategory(@Param('categoryId') categoryId: string) {
    return this.systemListsService.findAllItemsByCategory(categoryId);
  }

  @Get('items/:id')
  @RequirePermission('admin.read')
  findItemById(@Param('id') id: string) {
    return this.systemListsService.findItemById(id);
  }

  @Post('items')
  @RequirePermission('admin.create')
  createItem(@Body() dto: CreateListItemDto) {
    return this.systemListsService.createItem(dto);
  }

  @Patch('items/:id')
  @RequirePermission('admin.update')
  updateItem(@Param('id') id: string, @Body() dto: UpdateListItemDto) {
    return this.systemListsService.updateItem(id, dto);
  }

  @Delete('items/:id')
  @RequirePermission('admin.delete')
  deleteItem(@Param('id') id: string) {
    return this.systemListsService.deleteItem(id);
  }

  @Patch('items/:id/deactivate')
  @RequirePermission('admin.update')
  deactivateItem(@Param('id') id: string) {
    return this.systemListsService.deactivateItem(id);
  }

  @Get('items/:id/usage')
  @RequirePermission('admin.read')
  getItemUsageCount(@Param('id') id: string) {
    return this.systemListsService.getItemUsageCount(id);
  }

  @Post('items/:id/reassign-and-delete')
  @RequirePermission('admin.delete')
  reassignAndDeleteItem(
    @Param('id') id: string,
    @Body() dto: ReassignAndDeleteDto,
  ) {
    return this.systemListsService.reassignAndDeleteItem(id, dto);
  }
}
