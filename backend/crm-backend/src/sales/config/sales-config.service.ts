import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpdatePipelineConfigDto,
  UpdateStageDto,
  CreateLeadSourceDto,
  UpdateLeadSourceDto,
  UpdatePipelinePermissionDto,
} from './dto/sales-config.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SalesConfigService {
  constructor(private readonly prisma: PrismaService) {}

  // ==================== PIPELINE CONFIGURATION ====================

  async getAllConfigs() {
    return this.prisma.salesPipelineConfig.findMany({
      include: {
        position: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { key: 'asc' },
    });
  }

  async getConfig(key: string) {
    const config = await this.prisma.salesPipelineConfig.findUnique({
      where: { key },
      include: {
        position: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!config) {
      throw new NotFoundException(`Config "${key}" not found`);
    }

    return config;
  }

  async updateConfig(key: string, dto: UpdatePipelineConfigDto) {
    // Ensure config exists or create it
    const existing = await this.prisma.salesPipelineConfig.findUnique({
      where: { key },
    });

    if (!existing) {
      return this.prisma.salesPipelineConfig.create({
        data: {
          key,
          positionId: dto.positionId,
          value: dto.value,
          description: dto.description,
        },
        include: {
          position: {
            select: { id: true, name: true, code: true },
          },
        },
      });
    }

    return this.prisma.salesPipelineConfig.update({
      where: { key },
      data: {
        positionId: dto.positionId,
        value: dto.value,
        description: dto.description,
      },
      include: {
        position: {
          select: { id: true, name: true, code: true },
        },
      },
    });
  }

  // ==================== STAGES ====================

  async getAllStages() {
    return this.prisma.leadStage.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async getStage(id: string) {
    const stage = await this.prisma.leadStage.findUnique({
      where: { id },
    });

    if (!stage) {
      throw new NotFoundException('Stage not found');
    }

    return stage;
  }

  async updateStage(id: string, dto: UpdateStageDto) {
    await this.getStage(id);

    return this.prisma.leadStage.update({
      where: { id },
      data: {
        name: dto.name,
        nameKa: dto.nameKa,
        color: dto.color,
        requiredFields: dto.requiredFields as Prisma.InputJsonValue,
        allowedActions: dto.allowedActions as Prisma.InputJsonValue,
        autoSkipConditions: dto.autoSkipConditions as Prisma.InputJsonValue,
        isActive: dto.isActive,
      },
    });
  }

  // ==================== LEAD SOURCES ====================

  async getAllSources(includeInactive = false) {
    const where: Prisma.LeadSourceWhereInput = includeInactive
      ? {}
      : { isActive: true };

    return this.prisma.leadSource.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async getSource(id: string) {
    const source = await this.prisma.leadSource.findUnique({
      where: { id },
    });

    if (!source) {
      throw new NotFoundException('Lead source not found');
    }

    return source;
  }

  async createSource(dto: CreateLeadSourceDto) {
    const existing = await this.prisma.leadSource.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Source with code "${dto.code}" already exists`);
    }

    return this.prisma.leadSource.create({
      data: {
        code: dto.code,
        name: dto.name,
        nameKa: dto.nameKa,
        description: dto.description,
        sortOrder: dto.sortOrder || 0,
      },
    });
  }

  async updateSource(id: string, dto: UpdateLeadSourceDto) {
    await this.getSource(id);

    if (dto.code) {
      const existing = await this.prisma.leadSource.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Source with code "${dto.code}" already exists`);
      }
    }

    return this.prisma.leadSource.update({
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

  async deleteSource(id: string) {
    const source = await this.getSource(id);

    // Check if source is used
    const usageCount = await this.prisma.lead.count({
      where: { sourceId: id },
    });

    if (usageCount > 0) {
      // Soft delete
      return this.prisma.leadSource.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return this.prisma.leadSource.delete({
      where: { id },
    });
  }

  // ==================== PIPELINE PERMISSIONS ====================

  async getAllPipelinePermissions() {
    return this.prisma.salesPipelinePermission.findMany({
      where: { isActive: true },
      include: {
        positions: {
          include: {
            position: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
      orderBy: { permissionKey: 'asc' },
    });
  }

  async getPipelinePermission(key: string) {
    const permission = await this.prisma.salesPipelinePermission.findUnique({
      where: { permissionKey: key },
      include: {
        positions: {
          include: {
            position: {
              select: { id: true, name: true, code: true },
            },
          },
        },
      },
    });

    if (!permission) {
      throw new NotFoundException(`Pipeline permission "${key}" not found`);
    }

    return permission;
  }

  async updatePipelinePermissionPositions(key: string, dto: UpdatePipelinePermissionDto) {
    const permission = await this.getPipelinePermission(key);

    // Delete existing position assignments
    await this.prisma.salesPipelinePermissionPosition.deleteMany({
      where: { permissionId: permission.id },
    });

    // Create new assignments
    if (dto.positionIds.length > 0) {
      await this.prisma.salesPipelinePermissionPosition.createMany({
        data: dto.positionIds.map((positionId) => ({
          permissionId: permission.id,
          positionId,
        })),
      });
    }

    return this.getPipelinePermission(key);
  }

  // ==================== POSITIONS ====================

  async getAllPositions() {
    return this.prisma.position.findMany({
      where: { isActive: true },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
  }

  // ==================== CHECK POSITION PERMISSION ====================

  async hasPositionPermission(positionId: string, permissionKey: string): Promise<boolean> {
    const permission = await this.prisma.salesPipelinePermission.findUnique({
      where: { permissionKey },
      include: {
        positions: {
          where: { positionId },
        },
      },
    });

    return permission ? permission.positions.length > 0 : false;
  }

  async isHeadOfSales(positionId: string): Promise<boolean> {
    const config = await this.prisma.salesPipelineConfig.findUnique({
      where: { key: 'HEAD_OF_SALES_POSITION' },
    });

    return config?.positionId === positionId;
  }
}
