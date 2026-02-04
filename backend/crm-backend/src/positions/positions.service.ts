import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@Injectable()
export class PositionsService {
  constructor(private prisma: PrismaService) {}

  private generateCode(name: string): string {
    let code = name
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^A-Z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return code || 'POSITION';
  }

  private async findUniqueCode(baseCode: string): Promise<string> {
    let code = baseCode;
    let counter = 2;

    while (true) {
      const existing = await this.prisma.position.findUnique({
        where: { code },
      });

      if (!existing) {
        return code;
      }

      code = `${baseCode}_${counter}`;
      counter += 1;
    }
  }

  async create(createPositionDto: CreatePositionDto) {
    // Auto-generate code
    const baseCode = this.generateCode(createPositionDto.name);
    const code = await this.findUniqueCode(baseCode);

    // Check for duplicate name
    const existing = await this.prisma.position.findUnique({
      where: { name: createPositionDto.name },
    });

    if (existing) {
      throw new ConflictException('Position with this name already exists');
    }

    // Verify role group exists
    const roleGroup = await this.prisma.roleGroup.findUnique({
      where: { id: createPositionDto.roleGroupId },
    });

    if (!roleGroup) {
      throw new NotFoundException(`Role group with ID ${createPositionDto.roleGroupId} not found`);
    }

    if (createPositionDto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: createPositionDto.departmentId },
      });
      if (!department) {
        throw new NotFoundException(
          `Department with ID ${createPositionDto.departmentId} not found`
        );
      }
    }

    return this.prisma.position.create({
      data: {
        ...createPositionDto,
        code, // Use auto-generated code
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        roleGroup: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        _count: { select: { employees: true } },
      },
    });
  }

  async findAll() {
    const list = await this.prisma.position.findMany({
      include: {
        department: { select: { id: true, name: true, code: true } },
        roleGroup: {
          select: {
            id: true,
            name: true,
            code: true,
            _count: { select: { permissions: true } },
          },
        },
        employees: {
          where: { status: { not: 'TERMINATED' } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            employeeId: true,
            status: true,
          },
        },
      },
      orderBy: [
        { level: 'desc' },
        { name: 'asc' },
      ],
    });
    return list.map((pos) => ({
      ...pos,
      _count: { employees: pos.employees.length },
    }));
  }

  async findOne(id: string) {
    const position = await this.prisma.position.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        roleGroup: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        employees: {
          where: { status: { not: 'TERMINATED' } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            employeeId: true,
            jobTitle: true,
            status: true,
          },
        },
      },
    });

    if (!position) {
      throw new NotFoundException(`Position with ID ${id} not found`);
    }

    return {
      ...position,
      _count: { employees: position.employees.length },
    };
  }

  async findByCode(code: string) {
    const position = await this.prisma.position.findUnique({
      where: { code },
      include: {
        department: { select: { id: true, name: true, code: true } },
        roleGroup: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!position) {
      throw new NotFoundException(`Position with code ${code} not found`);
    }

    return position;
  }

  async update(id: string, updatePositionDto: UpdatePositionDto) {
    // Check if exists
    await this.findOne(id);

    // Remove code from update data - it's NOT patchable
    const { code: _ignored, ...updateData } = updatePositionDto as any;

    // Check for duplicate name (excluding current)
    if (updateData.name) {
      const existing = await this.prisma.position.findFirst({
        where: {
          AND: [
            { id: { not: id } },
            { name: updateData.name },
          ],
        },
      });

      if (existing) {
        throw new ConflictException('Position with this name already exists');
      }
    }

    // Verify role group exists if updating
    if (updatePositionDto.roleGroupId) {
      const roleGroup = await this.prisma.roleGroup.findUnique({
        where: { id: updatePositionDto.roleGroupId },
      });

      if (!roleGroup) {
        throw new NotFoundException(`Role group with ID ${updatePositionDto.roleGroupId} not found`);
      }
    }

    if (updatePositionDto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: updatePositionDto.departmentId },
      });
      if (!department) {
        throw new NotFoundException(
          `Department with ID ${updatePositionDto.departmentId} not found`
        );
      }
    }

    return this.prisma.position.update({
      where: { id },
      data: updateData,
      include: {
        department: { select: { id: true, name: true, code: true } },
        roleGroup: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        _count: { select: { employees: true } },
      },
    });
  }

  async remove(id: string, replacementPositionId?: string) {
    const position = await this.findOne(id);

    // Get all employees using this position (only active ones matter)
    const employees = await this.prisma.employee.findMany({
      where: { 
        positionId: id,
        status: 'ACTIVE', // Only check active employees
      },
      select: { id: true },
    });

    // If employees exist and no replacement provided, return employees for frontend to handle
    if (employees.length > 0 && !replacementPositionId) {
      return {
        canDelete: false,
        employees: employees.map((e) => e.id),
        employeeCount: employees.length,
      };
    }

    // If replacement provided, update all active employees to use the new position
    if (employees.length > 0 && replacementPositionId) {
      // Verify replacement exists
      const replacement = await this.prisma.position.findUnique({
        where: { id: replacementPositionId },
      });

      if (!replacement) {
        throw new NotFoundException('Replacement position not found');
      }

      // Update all active employees
      await this.prisma.employee.updateMany({
        where: { 
          positionId: id,
          status: 'ACTIVE',
        },
        data: { positionId: replacementPositionId },
      });
    }

    // Delete the position
    await this.prisma.position.delete({
      where: { id },
    });

    return {
      canDelete: true,
      deleted: true,
    };
  }

  /**
   * Get all permissions for a position (through its role group)
   */
  async getPositionPermissions(id: string): Promise<string[]> {
    const position = await this.findOne(id);
    return position.roleGroup.permissions.map(
      (rp) => `${rp.permission.resource}.${rp.permission.action}`
    );
  }

  /**
   * Check if a position has a specific permission
   */
  async hasPermission(positionId: string, permission: string): Promise<boolean> {
    const permissions = await this.getPositionPermissions(positionId);
    return permissions.includes(permission);
  }

  /**
   * Get available positions for a department, including inherited positions from parent departments.
   * Positions from root-level departments (parentId = null) are EXCLUDED from inheritance.
   * 
   * Logic:
   * 1. Get positions directly assigned to this department
   * 2. Walk up the parent chain and include positions from each parent
   * 3. Stop when reaching a root-level department (don't include root's positions)
   * 
   * @param departmentId - The department to get available positions for
   * @returns Array of positions with inheritance information
   */
  async getAvailablePositionsForDepartment(departmentId: string) {
    // Get the department with its parent chain
    const department = await this.prisma.department.findUnique({
      where: { id: departmentId },
      select: {
        id: true,
        name: true,
        parentId: true,
      },
    });

    if (!department) {
      throw new NotFoundException(`Department with ID ${departmentId} not found`);
    }

    // Collect department IDs in the inheritance chain (excluding root-level departments)
    const departmentIds: string[] = [departmentId];
    const departmentInfo: Map<string, { name: string; isOwn: boolean }> = new Map();
    departmentInfo.set(departmentId, { name: department.name, isOwn: true });

    // Walk up the parent chain
    let currentDept = department;
    while (currentDept.parentId) {
      const parent = await this.prisma.department.findUnique({
        where: { id: currentDept.parentId },
        select: {
          id: true,
          name: true,
          parentId: true,
        },
      });

      if (!parent) break;

      // If parent is root level (parentId = null), don't include its positions in inheritance
      if (parent.parentId === null) {
        // This is a root-level department, stop here (don't include root positions)
        break;
      }

      // Parent is NOT root-level, include its positions
      departmentIds.push(parent.id);
      departmentInfo.set(parent.id, { name: parent.name, isOwn: false });
      currentDept = parent;
    }

    // Get all positions from collected departments
    const positions = await this.prisma.position.findMany({
      where: {
        departmentId: { in: departmentIds },
        isActive: true,
      },
      include: {
        department: { select: { id: true, name: true, code: true } },
        roleGroup: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: { select: { employees: true } },
      },
      orderBy: [
        { level: 'desc' },
        { name: 'asc' },
      ],
    });

    // Add inheritance info to each position
    return positions.map((pos) => ({
      ...pos,
      isInherited: pos.departmentId !== departmentId,
      inheritedFrom: pos.departmentId !== departmentId ? pos.department?.name : null,
    }));
  }

  /**
   * Get all positions that are not assigned to any department (global positions)
   * These can be used by any department
   */
  async getGlobalPositions() {
    return this.prisma.position.findMany({
      where: {
        departmentId: null,
        isActive: true,
      },
      include: {
        roleGroup: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: { select: { employees: true } },
      },
      orderBy: [
        { level: 'desc' },
        { name: 'asc' },
      ],
    });
  }
}
