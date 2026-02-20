import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateListCategoryDto } from './dto/create-list-category.dto';
import { UpdateListCategoryDto } from './dto/update-list-category.dto';
import { CreateListItemDto } from './dto/create-list-item.dto';
import { UpdateListItemDto } from './dto/update-list-item.dto';
import { ReassignAndDeleteDto } from './dto/reassign-and-delete.dto';

@Injectable()
export class SystemListsService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== CATEGORIES ====================

  async findAllCategories() {
    return this.prisma.systemListCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { items: true },
        },
      },
    });
  }

  async findCategoryById(id: string) {
    const category = await this.prisma.systemListCategory.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`List category with ID ${id} not found`);
    }

    return category;
  }

  async findCategoryByCode(code: string) {
    const category = await this.prisma.systemListCategory.findUnique({
      where: { code },
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`List category with code ${code} not found`);
    }

    return category;
  }

  async createCategory(dto: CreateListCategoryDto) {
    return this.prisma.systemListCategory.create({
      data: dto,
    });
  }

  async updateCategory(id: string, dto: UpdateListCategoryDto) {
    await this.findCategoryById(id); // Ensure exists

    return this.prisma.systemListCategory.update({
      where: { id },
      data: dto,
    });
  }

  async deleteCategory(id: string) {
    const category = await this.findCategoryById(id);

    // Check if category has items
    if (category.items.length > 0) {
      throw new BadRequestException(
        `Cannot delete category: It has ${category.items.length} list item(s). Delete all items first.`,
      );
    }

    return this.prisma.systemListCategory.delete({
      where: { id },
    });
  }

  // ==================== ITEMS ====================

  async findAllItemsByCategory(categoryId: string) {
    await this.findCategoryById(categoryId); // Ensure category exists

    return this.prisma.systemListItem.findMany({
      where: { categoryId },
      orderBy: [{ sortOrder: 'asc' }, { displayName: 'asc' }],
    });
  }

  async findItemById(id: string) {
    const item = await this.prisma.systemListItem.findUnique({
      where: { id },
      include: {
        category: true,
      },
    });

    if (!item) {
      throw new NotFoundException(`List item with ID ${id} not found`);
    }

    return item;
  }

  async createItem(dto: CreateListItemDto) {
    // Verify category exists
    await this.findCategoryById(dto.categoryId);

    // If isDefault is true, unset other defaults in same category
    if (dto.isDefault) {
      await this.prisma.systemListItem.updateMany({
        where: {
          categoryId: dto.categoryId,
          isDefault: true,
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.systemListItem.create({
      data: dto,
    });
  }

  async updateItem(id: string, dto: UpdateListItemDto) {
    const item = await this.findItemById(id);

    if (item.isSystemManaged && dto.value !== undefined && dto.value !== item.value) {
      throw new BadRequestException(
        'Cannot change the backend value of a system-managed item. You may rename its display name instead.',
      );
    }

    // If isDefault is being set to true, unset other defaults
    if (dto.isDefault === true) {
      await this.prisma.systemListItem.updateMany({
        where: {
          categoryId: item.categoryId,
          isDefault: true,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    return this.prisma.systemListItem.update({
      where: { id },
      data: dto,
    });
  }

  /**
   * Get usage count for a list item across the system
   */
  async getItemUsageCount(id: string): Promise<{
    usageCount: number;
    details: Array<{ table: string; field: string; count: number }>;
  }> {
    const item = await this.findItemById(id);
    const category = item.category;

    if (!category.tableName || !category.fieldName) {
      return { usageCount: 0, details: [] };
    }

    // Map category codes to table/field names
    const usageMap: Record<string, { table: string; field: string }> = {
      ASSET_TYPE: { table: 'asset', field: 'type' },
      CONTACT_METHOD: { table: 'incident', field: 'contactMethod' },
      INCIDENT_PRIORITY: { table: 'incident', field: 'priority' },
      PRODUCT_CATEGORY: { table: 'inventoryProduct', field: 'category' },
      PRODUCT_UNIT: { table: 'inventoryProduct', field: 'unit' },
      WORK_ORDER_TYPE: { table: 'workOrder', field: 'type' },
      WORK_ORDER_STATUS: { table: 'workOrder', field: 'status' },
      INCIDENT_STATUS: { table: 'incident', field: 'status' },
      PURCHASE_ORDER_STATUS: { table: 'purchaseOrder', field: 'status' },
      STOCK_TRANSACTION_TYPE: { table: 'stockTransaction', field: 'type' },
      DEVICE_STATUS: { table: 'asset', field: 'status' },
    };

    const mapping = usageMap[category.code];
    if (!mapping) {
      return { usageCount: 0, details: [] };
    }

    // Use Prisma to count records using this value
    try {
      let count = 0;

      switch (mapping.table) {
        case 'asset':
          count = await this.prisma.asset.count({
            where: { [mapping.field]: item.value as any },
          });
          break;
        case 'incident':
          count = await this.prisma.incident.count({
            where: { [mapping.field]: item.value as any },
          });
          break;
        case 'inventoryProduct':
          count = await this.prisma.inventoryProduct.count({
            where: { [mapping.field]: item.value as any },
          });
          break;
        case 'workOrder':
          count = await this.prisma.workOrder.count({
            where: { [mapping.field]: item.value as any },
          });
          break;
        case 'purchaseOrder':
          count = await this.prisma.purchaseOrder.count({
            where: { [mapping.field]: item.value as any },
          });
          break;
        case 'stockTransaction':
          count = await this.prisma.stockTransaction.count({
            where: { [mapping.field]: item.value as any },
          });
          break;
        default:
          count = 0;
      }

      return {
        usageCount: count,
        details: [
          {
            table: mapping.table,
            field: mapping.field,
            count,
          },
        ],
      };
    } catch (error) {
      console.error('Error getting usage count:', error);
      return { usageCount: 0, details: [] };
    }
  }

  /**
   * Delete a list item (only if not in use)
   */
  async deleteItem(id: string) {
    const item = await this.findItemById(id);
    if (item.isSystemManaged) {
      throw new BadRequestException(
        'Cannot delete a system-managed item. It is required for core application logic.',
      );
    }

    const usage = await this.getItemUsageCount(id);

    if (usage.usageCount > 0) {
      throw new BadRequestException(
        `Cannot delete: This value is currently used in ${usage.usageCount} record(s). ` +
          `Please reassign or remove those records first, or deactivate this item instead.`,
      );
    }

    return this.prisma.systemListItem.delete({
      where: { id },
    });
  }

  /**
   * Deactivate (soft delete) a list item
   */
  async deactivateItem(id: string) {
    const item = await this.findItemById(id);
    if (item.isSystemManaged) {
      throw new BadRequestException(
        'Cannot deactivate a system-managed item. It is required for core application logic.',
      );
    }

    return this.prisma.systemListItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Bulk reassign records from one list item to another, then delete the source item
   */
  async reassignAndDeleteItem(sourceItemId: string, dto: ReassignAndDeleteDto) {
    const sourceItem = await this.findItemById(sourceItemId);

    if (sourceItem.isSystemManaged) {
      throw new BadRequestException(
        'Cannot reassign and delete a system-managed item. It is required for core application logic.',
      );
    }

    const targetItem = await this.findItemById(dto.targetItemId);

    // Verify both items are in same category
    if (sourceItem.categoryId !== targetItem.categoryId) {
      throw new BadRequestException(
        'Source and target items must be in the same category',
      );
    }

    // Verify target is active
    if (!targetItem.isActive) {
      throw new BadRequestException(
        'Target item is inactive and cannot be used for reassignment',
      );
    }

    const usage = await this.getItemUsageCount(sourceItemId);

    if (usage.usageCount === 0) {
      // No records to reassign, just delete
      return this.prisma.systemListItem.delete({
        where: { id: sourceItemId },
      });
    }

    // Map category codes to table/field names
    const usageMap: Record<string, { table: string; field: string }> = {
      ASSET_TYPE: { table: 'asset', field: 'type' },
      CONTACT_METHOD: { table: 'incident', field: 'contactMethod' },
      INCIDENT_PRIORITY: { table: 'incident', field: 'priority' },
      PRODUCT_CATEGORY: { table: 'inventoryProduct', field: 'category' },
      PRODUCT_UNIT: { table: 'inventoryProduct', field: 'unit' },
      WORK_ORDER_TYPE: { table: 'workOrder', field: 'type' },
      WORK_ORDER_STATUS: { table: 'workOrder', field: 'status' },
      INCIDENT_STATUS: { table: 'incident', field: 'status' },
      PURCHASE_ORDER_STATUS: { table: 'purchaseOrder', field: 'status' },
      STOCK_TRANSACTION_TYPE: { table: 'stockTransaction', field: 'type' },
      DEVICE_STATUS: { table: 'asset', field: 'status' },
    };

    const mapping = usageMap[sourceItem.category.code];
    if (!mapping) {
      throw new BadRequestException(
        `Reassignment not supported for category: ${sourceItem.category.code}`,
      );
    }

    // Perform reassignment in a transaction
    try {
      await this.prisma.$transaction(async (tx) => {
        // Update all records
        switch (mapping.table) {
          case 'asset':
            await tx.asset.updateMany({
              where: { [mapping.field]: sourceItem.value as any },
              data: { [mapping.field]: targetItem.value as any },
            });
            break;
          case 'incident':
            await tx.incident.updateMany({
              where: { [mapping.field]: sourceItem.value as any },
              data: { [mapping.field]: targetItem.value as any },
            });
            break;
          case 'inventoryProduct':
            await tx.inventoryProduct.updateMany({
              where: { [mapping.field]: sourceItem.value as any },
              data: { [mapping.field]: targetItem.value as any },
            });
            break;
          case 'workOrder':
            await tx.workOrder.updateMany({
              where: { [mapping.field]: sourceItem.value as any },
              data: { [mapping.field]: targetItem.value as any },
            });
            break;
          case 'purchaseOrder':
            await tx.purchaseOrder.updateMany({
              where: { [mapping.field]: sourceItem.value as any },
              data: { [mapping.field]: targetItem.value as any },
            });
            break;
          case 'stockTransaction':
            await tx.stockTransaction.updateMany({
              where: { [mapping.field]: sourceItem.value as any },
              data: { [mapping.field]: targetItem.value as any },
            });
            break;
          default:
            throw new BadRequestException(
              `Reassignment not implemented for table: ${mapping.table}`,
            );
        }

        // Delete the source item
        await tx.systemListItem.delete({
          where: { id: sourceItemId },
        });
      });

      return {
        message: `Successfully reassigned ${usage.usageCount} record(s) and deleted list item`,
        reassignedCount: usage.usageCount,
      };
    } catch (error) {
      console.error('Reassignment error:', error);
      throw new InternalServerErrorException(
        'Failed to reassign records. Transaction rolled back.',
      );
    }
  }
}
