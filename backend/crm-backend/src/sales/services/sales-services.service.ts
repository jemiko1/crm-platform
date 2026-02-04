import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSalesServiceDto, UpdateSalesServiceDto, CreateServiceCategoryDto, UpdateServiceCategoryDto } from './dto/sales-service.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SalesServicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== SERVICES ====================

  async createService(dto: CreateSalesServiceDto) {
    // Check for duplicate code
    const existing = await this.prisma.salesService.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Service with code "${dto.code}" already exists`);
    }

    return this.prisma.salesService.create({
      data: {
        code: dto.code,
        name: dto.name,
        nameKa: dto.nameKa,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice,
        oneTimePrice: dto.oneTimePrice,
        parameters: dto.parameters as Prisma.InputJsonValue,
        pricingRules: dto.pricingRules as Prisma.InputJsonValue,
        categoryId: dto.categoryId,
        sortOrder: dto.sortOrder || 0,
      },
      include: { category: true },
    });
  }

  async findAllServices(includeInactive = false) {
    const where: Prisma.SalesServiceWhereInput = includeInactive
      ? {}
      : { isActive: true };

    return this.prisma.salesService.findMany({
      where,
      include: { category: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findServiceById(id: string) {
    const service = await this.prisma.salesService.findUnique({
      where: { id },
      include: { category: true },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    return service;
  }

  async updateService(id: string, dto: UpdateSalesServiceDto) {
    await this.findServiceById(id);

    // Check for duplicate code if code is being changed
    if (dto.code) {
      const existing = await this.prisma.salesService.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Service with code "${dto.code}" already exists`);
      }
    }

    return this.prisma.salesService.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        nameKa: dto.nameKa,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice,
        oneTimePrice: dto.oneTimePrice,
        parameters: dto.parameters as Prisma.InputJsonValue,
        pricingRules: dto.pricingRules as Prisma.InputJsonValue,
        categoryId: dto.categoryId,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: { category: true },
    });
  }

  async deleteService(id: string) {
    await this.findServiceById(id);

    // Check if service is used in any leads
    const usageCount = await this.prisma.leadService.count({
      where: { serviceId: id },
    });

    if (usageCount > 0) {
      // Soft delete
      return this.prisma.salesService.update({
        where: { id },
        data: { isActive: false },
      });
    }

    // Hard delete if not used
    return this.prisma.salesService.delete({
      where: { id },
    });
  }

  // ==================== CATEGORIES ====================

  async createCategory(dto: CreateServiceCategoryDto) {
    const existing = await this.prisma.salesServiceCategory.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Category with code "${dto.code}" already exists`);
    }

    return this.prisma.salesServiceCategory.create({
      data: {
        code: dto.code,
        name: dto.name,
        nameKa: dto.nameKa,
        description: dto.description,
        sortOrder: dto.sortOrder || 0,
      },
    });
  }

  async findAllCategories(includeInactive = false) {
    const where: Prisma.SalesServiceCategoryWhereInput = includeInactive
      ? {}
      : { isActive: true };

    return this.prisma.salesServiceCategory.findMany({
      where,
      include: {
        _count: { select: { services: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findCategoryById(id: string) {
    const category = await this.prisma.salesServiceCategory.findUnique({
      where: { id },
      include: { services: true },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    return category;
  }

  async updateCategory(id: string, dto: UpdateServiceCategoryDto) {
    await this.findCategoryById(id);

    if (dto.code) {
      const existing = await this.prisma.salesServiceCategory.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Category with code "${dto.code}" already exists`);
      }
    }

    return this.prisma.salesServiceCategory.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        nameKa: dto.nameKa,
        description: dto.description,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
    });
  }

  async deleteCategory(id: string) {
    const category = await this.findCategoryById(id);

    if (category.services.length > 0) {
      // Soft delete
      return this.prisma.salesServiceCategory.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return this.prisma.salesServiceCategory.delete({
      where: { id },
    });
  }
}
