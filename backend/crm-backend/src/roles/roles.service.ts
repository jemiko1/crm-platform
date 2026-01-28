import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async create(createRoleDto: CreateRoleDto) {
    // Check if name or code already exists
    const existingByName = await this.prisma.role.findUnique({
      where: { name: createRoleDto.name },
    });

    if (existingByName) {
      throw new BadRequestException('Role with this name already exists');
    }

    const existingByCode = await this.prisma.role.findUnique({
      where: { code: createRoleDto.code },
    });

    if (existingByCode) {
      throw new BadRequestException('Role with this code already exists');
    }

    return this.prisma.role.create({
      data: {
        name: createRoleDto.name,
        code: createRoleDto.code,
        description: createRoleDto.description,
        level: createRoleDto.level,
        legacyRole: createRoleDto.legacyRole,
      },
      include: {
        _count: { select: { employees: true, permissions: true } },
      },
    });
  }

  async findAll() {
    return this.prisma.role.findMany({
      include: {
        _count: { select: { employees: true, permissions: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: {
            permission: {
              select: {
                id: true,
                resource: true,
                action: true,
                description: true,
                category: true,
              },
            },
          },
        },
        _count: { select: { employees: true, permissions: true } },
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  async update(id: string, updateRoleDto: UpdateRoleDto) {
    // Check if role exists
    await this.findOne(id);

    // Check if name is being changed and if it's unique
    if (updateRoleDto.name) {
      const existing = await this.prisma.role.findUnique({
        where: { name: updateRoleDto.name },
      });

      if (existing && existing.id !== id) {
        throw new BadRequestException('Role with this name already exists');
      }
    }

    // Check if code is being changed and if it's unique
    if (updateRoleDto.code) {
      const existing = await this.prisma.role.findUnique({
        where: { code: updateRoleDto.code },
      });

      if (existing && existing.id !== id) {
        throw new BadRequestException('Role with this code already exists');
      }
    }

    return this.prisma.role.update({
      where: { id },
      data: {
        name: updateRoleDto.name,
        code: updateRoleDto.code,
        description: updateRoleDto.description,
        level: updateRoleDto.level,
        legacyRole: updateRoleDto.legacyRole,
        isActive: updateRoleDto.isActive,
      },
      include: {
        _count: { select: { employees: true, permissions: true } },
      },
    });
  }

  async remove(id: string) {
    const role = await this.findOne(id);

    // Check if role has employees
    if (role._count.employees > 0) {
      throw new BadRequestException(
        `Cannot delete role with ${role._count.employees} employee(s). Please reassign employees to another role first.`
      );
    }

    return this.prisma.role.delete({
      where: { id },
    });
  }

  async assignPermissions(id: string, assignPermissionsDto: AssignPermissionsDto) {
    // Check if role exists
    await this.findOne(id);

    // Validate all permissions exist
    const permissions = await this.prisma.permission.findMany({
      where: {
        id: { in: assignPermissionsDto.permissionIds },
      },
    });

    if (permissions.length !== assignPermissionsDto.permissionIds.length) {
      throw new BadRequestException('One or more permissions not found');
    }

    // Delete existing role permissions
    await this.prisma.rolePermission.deleteMany({
      where: { roleId: id },
    });

    // Create new role permissions
    await this.prisma.rolePermission.createMany({
      data: assignPermissionsDto.permissionIds.map((permissionId) => ({
        roleId: id,
        permissionId,
      })),
    });

    return this.findOne(id);
  }

  async getPermissions(id: string) {
    const role = await this.findOne(id);
    return role.permissions.map((rp) => rp.permission);
  }
}
