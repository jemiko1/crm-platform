import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleGroupDto } from './dto/create-role-group.dto';
import { UpdateRoleGroupDto } from './dto/update-role-group.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';

@Injectable()
export class RoleGroupsService {
  constructor(private prisma: PrismaService) {}

  private generateCode(name: string): string {
    let code = name
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^A-Z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return code || 'ROLE_GROUP';
  }

  private async findUniqueCode(baseCode: string): Promise<string> {
    let code = baseCode;
    let counter = 2;

    while (true) {
      const existing = await this.prisma.roleGroup.findUnique({
        where: { code },
      });

      if (!existing) {
        return code;
      }

      code = `${baseCode}_${counter}`;
      counter += 1;
    }
  }

  async create(createRoleGroupDto: CreateRoleGroupDto) {
    const { permissionIds, ...data } = createRoleGroupDto;

    // Auto-generate code
    const baseCode = this.generateCode(data.name);
    const code = await this.findUniqueCode(baseCode);

    // Check for duplicate name
    const existing = await this.prisma.roleGroup.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new ConflictException('Role group with this name already exists');
    }

    return this.prisma.roleGroup.create({
      data: {
        ...data,
        code, // Use auto-generated code
        permissions: permissionIds?.length
          ? {
              create: permissionIds.map((permissionId) => ({
                permission: { connect: { id: permissionId } },
              })),
            }
          : undefined,
      },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { positions: true } },
      },
    });
  }

  async findAll() {
    return this.prisma.roleGroup.findMany({
      include: {
        permissions: {
          include: { permission: true },
        },
        positions: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: { select: { positions: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const roleGroup = await this.prisma.roleGroup.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
        positions: {
          select: {
            id: true,
            name: true,
            code: true,
            level: true,
            _count: { select: { employees: true } },
          },
        },
      },
    });

    if (!roleGroup) {
      throw new NotFoundException(`Role group with ID ${id} not found`);
    }

    return roleGroup;
  }

  async update(id: string, updateRoleGroupDto: UpdateRoleGroupDto) {
    const { permissionIds, ...data } = updateRoleGroupDto;

    // Check if exists
    await this.findOne(id);

    // Remove code from update data - it's NOT patchable
    const { code: _ignored, ...updateData } = data as any;

    // Check for duplicate name (excluding current)
    if (updateData.name) {
      const existing = await this.prisma.roleGroup.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { name: updateData.name },
          ],
        },
      });

      if (existing) {
        throw new ConflictException('Role group with this name already exists');
      }
    }

    // If permissionIds provided, replace all permissions
    if (permissionIds !== undefined) {
      await this.prisma.roleGroupPermission.deleteMany({
        where: { roleGroupId: id },
      });

      if (permissionIds.length > 0) {
        await this.prisma.roleGroupPermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleGroupId: id,
            permissionId,
          })),
        });
      }
    }

    return this.prisma.roleGroup.update({
      where: { id },
      data: updateData,
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { positions: true } },
      },
    });
  }

  async remove(id: string, replacementRoleGroupId?: string) {
    const roleGroup = await this.findOne(id);

    // Get all positions using this role group
    const positions = await this.prisma.position.findMany({
      where: { roleGroupId: id },
      select: { id: true },
    });

    // If positions exist and no replacement provided, return positions for frontend to handle
    if (positions.length > 0 && !replacementRoleGroupId) {
      return {
        canDelete: false,
        positions: positions.map((p) => p.id),
        positionCount: positions.length,
      };
    }

    // If replacement provided, update all positions to use the new role group
    if (positions.length > 0 && replacementRoleGroupId) {
      // Verify replacement exists
      const replacement = await this.prisma.roleGroup.findUnique({
        where: { id: replacementRoleGroupId },
      });

      if (!replacement) {
        throw new NotFoundException('Replacement role group not found');
      }

      // Update all positions
      await this.prisma.position.updateMany({
        where: { roleGroupId: id },
        data: { roleGroupId: replacementRoleGroupId },
      });
    }

    // Delete the role group
    await this.prisma.roleGroup.delete({
      where: { id },
    });

    return {
      canDelete: true,
      deleted: true,
    };
  }

  async assignPermissions(id: string, dto: AssignPermissionsDto) {
    await this.findOne(id);

    // Replace all permissions
    await this.prisma.roleGroupPermission.deleteMany({
      where: { roleGroupId: id },
    });

    if (dto.permissionIds.length > 0) {
      await this.prisma.roleGroupPermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({
          roleGroupId: id,
          permissionId,
        })),
      });
    }

    return this.findOne(id);
  }

  async getPermissions(id: string) {
    const roleGroup = await this.findOne(id);
    return roleGroup.permissions.map((rp) => rp.permission);
  }
}
