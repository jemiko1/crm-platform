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
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../common/guards/position-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { SystemListsService } from './system-lists.service';
import { CreateListCategoryDto } from './dto/create-list-category.dto';
import { UpdateListCategoryDto } from './dto/update-list-category.dto';
import { CreateListItemDto } from './dto/create-list-item.dto';
import { UpdateListItemDto } from './dto/update-list-item.dto';
import { ReassignAndDeleteDto } from './dto/reassign-and-delete.dto';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('SystemLists')
@Controller('v1/system-lists')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
export class SystemListsController {
  constructor(private readonly systemListsService: SystemListsService) {}

  // ==================== CATEGORIES ====================

  @Get('categories')
  @RequirePermission('admin.read')
  @Doc({ summary: 'List list categories', ok: 'Categories', permission: true })
  findAllCategories() {
    return this.systemListsService.findAllCategories();
  }

  @Get('categories/:id')
  @RequirePermission('admin.read')
  @Doc({
    summary: 'Get category by ID',
    ok: 'Category detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Category UUID' }],
  })
  findCategoryById(@Param('id') id: string) {
    return this.systemListsService.findCategoryById(id);
  }

  @Get('categories/code/:code')
  @Doc({
    summary: 'Get category by code',
    ok: 'Category detail',
    permission: true,
    notFound: true,
    params: [{ name: 'code', description: 'Category code' }],
  })
  findCategoryByCode(@Param('code') code: string) {
    return this.systemListsService.findCategoryByCode(code);
  }

  @Post('categories')
  @RequirePermission('admin.create')
  @Doc({
    summary: 'Create list category',
    ok: 'Created category',
    permission: true,
    status: 201,
    bodyType: CreateListCategoryDto,
  })
  createCategory(@Body() dto: CreateListCategoryDto) {
    return this.systemListsService.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermission('admin.update')
  @Doc({
    summary: 'Update list category',
    ok: 'Updated category',
    permission: true,
    notFound: true,
    bodyType: UpdateListCategoryDto,
    params: [{ name: 'id', description: 'Category UUID' }],
  })
  updateCategory(@Param('id') id: string, @Body() dto: UpdateListCategoryDto) {
    return this.systemListsService.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermission('admin.delete')
  @Doc({
    summary: 'Delete list category',
    ok: 'Removal result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Category UUID' }],
  })
  deleteCategory(@Param('id') id: string) {
    return this.systemListsService.deleteCategory(id);
  }

  // ==================== ITEMS ====================

  @Get('categories/:categoryId/items')
  @Doc({
    summary: 'List items in category',
    ok: 'List items',
    permission: true,
    notFound: true,
    params: [{ name: 'categoryId', description: 'Category UUID' }],
  })
  findAllItemsByCategory(@Param('categoryId') categoryId: string) {
    return this.systemListsService.findAllItemsByCategory(categoryId);
  }

  @Get('items/:id')
  @RequirePermission('admin.read')
  @Doc({
    summary: 'Get list item by ID',
    ok: 'Item detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Item UUID' }],
  })
  findItemById(@Param('id') id: string) {
    return this.systemListsService.findItemById(id);
  }

  @Post('items')
  @RequirePermission('admin.create')
  @Doc({
    summary: 'Create list item',
    ok: 'Created item',
    permission: true,
    status: 201,
    bodyType: CreateListItemDto,
  })
  createItem(@Body() dto: CreateListItemDto) {
    return this.systemListsService.createItem(dto);
  }

  @Patch('items/:id')
  @RequirePermission('admin.update')
  @Doc({
    summary: 'Update list item',
    ok: 'Updated item',
    permission: true,
    notFound: true,
    bodyType: UpdateListItemDto,
    params: [{ name: 'id', description: 'Item UUID' }],
  })
  updateItem(@Param('id') id: string, @Body() dto: UpdateListItemDto) {
    return this.systemListsService.updateItem(id, dto);
  }

  @Delete('items/:id')
  @RequirePermission('admin.delete')
  @Doc({
    summary: 'Delete list item',
    ok: 'Removal result',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Item UUID' }],
  })
  deleteItem(@Param('id') id: string) {
    return this.systemListsService.deleteItem(id);
  }

  @Patch('items/:id/deactivate')
  @RequirePermission('admin.update')
  @Doc({
    summary: 'Deactivate list item',
    ok: 'Item deactivated',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Item UUID' }],
  })
  deactivateItem(@Param('id') id: string) {
    return this.systemListsService.deactivateItem(id);
  }

  @Get('items/:id/usage')
  @RequirePermission('admin.read')
  @Doc({
    summary: 'Usage count for list item',
    ok: 'Reference counts',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Item UUID' }],
  })
  getItemUsageCount(@Param('id') id: string) {
    return this.systemListsService.getItemUsageCount(id);
  }

  @Post('items/:id/reassign-and-delete')
  @RequirePermission('admin.delete')
  @Doc({
    summary: 'Reassign references and delete item',
    ok: 'Item removed after reassignment',
    permission: true,
    notFound: true,
    bodyType: ReassignAndDeleteDto,
    params: [{ name: 'id', description: 'Item UUID' }],
  })
  reassignAndDeleteItem(
    @Param('id') id: string,
    @Body() dto: ReassignAndDeleteDto,
  ) {
    return this.systemListsService.reassignAndDeleteItem(id, dto);
  }
}
