import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  private generateCode(name: string): string {
    let code = name
      .toUpperCase()
      .replace(/[\s-]+/g, '_')
      .replace(/[^A-Z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    return code || 'DEPT';
  }

  private async findUniqueCode(baseCode: string): Promise<string> {
    let code = baseCode;
    let counter = 2;

    while (true) {
      const existing = await this.prisma.department.findUnique({
        where: { code },
      });

      if (!existing) {
        return code;
      }

      code = `${baseCode}_${counter}`;
      counter += 1;
    }
  }

  async create(createDepartmentDto: CreateDepartmentDto) {
    const baseCode = this.generateCode(createDepartmentDto.name);
    const code = await this.findUniqueCode(baseCode);

    // Validate parent if provided
    if (createDepartmentDto.parentId) {
      const parent = await this.prisma.department.findUnique({
        where: { id: createDepartmentDto.parentId },
      });
      if (!parent) {
        throw new BadRequestException('Parent department not found');
      }
    }

    // Validate head if provided
    if (createDepartmentDto.headId) {
      const head = await this.prisma.employee.findUnique({
        where: { id: createDepartmentDto.headId },
      });
      if (!head) {
        throw new BadRequestException('Department head (employee) not found');
      }
    }

    return this.prisma.department.create({
      data: {
        name: createDepartmentDto.name,
        nameKa: createDepartmentDto.nameKa,
        code,
        description: createDepartmentDto.description,
        parentId: createDepartmentDto.parentId,
        headId: createDepartmentDto.headId,
        isActive: createDepartmentDto.isActive ?? true,
      },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        head: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { employees: true, children: true } },
      },
    });
  }

  async findAll() {
    const list = await this.prisma.department.findMany({
      include: {
        parent: { select: { id: true, name: true, code: true } },
        head: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
        },
        employees: {
          where: { status: { not: 'TERMINATED' } },
          select: { id: true },
        },
        _count: { select: { children: true } },
      },
      orderBy: { name: 'asc' },
    });
    return list.map((dept) => {
      const head =
        dept.head && dept.head.status !== 'TERMINATED'
          ? {
              id: dept.head.id,
              firstName: dept.head.firstName,
              lastName: dept.head.lastName,
              email: dept.head.email,
            }
          : null;
      const { employees, head: _h, _count, ...rest } = dept;
      return {
        ...rest,
        head,
        _count: {
          employees: employees.length,
          children: _count.children,
        },
      };
    });
  }

  async getHierarchy() {
    // Get root departments (no parent); exclude terminated from structure and counts
    const roots = await this.prisma.department.findMany({
      where: { parentId: null },
      include: {
        head: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
        },
        children: {
          include: {
            head: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
              },
            },
            children: {
              include: {
                head: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    status: true,
                  },
                },
                employees: {
                  where: { status: { not: 'TERMINATED' } },
                  select: { id: true },
                },
              },
            },
            employees: {
              where: { status: { not: 'TERMINATED' } },
              select: { id: true },
            },
          },
        },
        employees: {
          where: { status: { not: 'TERMINATED' } },
          select: { id: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return this.mapHierarchyExcludeTerminated(roots);
  }

  private mapHierarchyExcludeTerminated(
    departments: Array<{
      id: string;
      name: string;
      code: string;
      description: string | null;
      parentId: string | null;
      headId: string | null;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
      head?: { id: string; firstName: string; lastName: string; email: string; status: string } | null;
      children?: any[];
      employees?: { id: string }[];
    }>,
  ): any[] {
    return departments.map((dept) => {
      const head =
        dept.head && dept.head.status !== 'TERMINATED'
          ? {
              id: dept.head.id,
              firstName: dept.head.firstName,
              lastName: dept.head.lastName,
              email: dept.head.email,
            }
          : null;
      const employeeCount = dept.employees?.length ?? 0;
      const children = dept.children
        ? this.mapHierarchyExcludeTerminated(dept.children)
        : undefined;
      const { employees: _e, head: _h, ...rest } = dept;
      return {
        ...rest,
        head,
        _count: {
          employees: employeeCount,
          children: (dept.children?.length ?? 0),
        },
        children,
      };
    });
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        head: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
        },
        children: {
          include: {
            head: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
              },
            },
            employees: {
              where: { status: { not: 'TERMINATED' } },
              select: { id: true },
            },
            _count: { select: { children: true } },
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
        _count: { select: { children: true } },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    const head =
      department.head && department.head.status !== 'TERMINATED'
        ? {
            id: department.head.id,
            firstName: department.head.firstName,
            lastName: department.head.lastName,
            email: department.head.email,
          }
        : null;
    const children = department.children?.map((c) => {
      const child = c as typeof c & { employees?: { id: string }[]; _count?: { children: number } };
      const chHead =
        child.head && child.head.status !== 'TERMINATED'
          ? {
              id: child.head.id,
              firstName: child.head.firstName,
              lastName: child.head.lastName,
              email: child.head.email,
            }
          : null;
      const { employees: _emp, _count: _c, ...childRest } = child;
      return {
        ...childRest,
        head: chHead,
        _count: {
          employees: _emp?.length ?? 0,
          children: _c?.children ?? 0,
        },
      };
    });
    const { head: _h, _count, ...rest } = department;
    return {
      ...rest,
      head,
      employees: department.employees,
      _count: {
        employees: department.employees.length,
        children: _count.children,
      },
      children,
    };
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    // Check if department exists
    const existing = await this.findOne(id);

    // Check for duplicate code if code is being changed
    if (updateDepartmentDto.code && updateDepartmentDto.code !== existing.code) {
      const duplicateCode = await this.prisma.department.findUnique({
        where: { code: updateDepartmentDto.code },
      });
      if (duplicateCode) {
        throw new BadRequestException(`Department with code "${updateDepartmentDto.code}" already exists`);
      }
    }

    // Validate parent if provided (prevent circular reference)
    // Note: parentId === null means "make this a root department"
    // parentId === undefined means "don't change the parent"
    if (updateDepartmentDto.parentId) {
      if (updateDepartmentDto.parentId === id) {
        throw new BadRequestException('Department cannot be its own parent');
      }

      // Check for circular reference (parent's parent chain)
      let currentParentId: string | null = updateDepartmentDto.parentId || null;
      const visited = new Set<string>([id]);
      
      while (currentParentId) {
        if (visited.has(currentParentId)) {
          throw new BadRequestException('Circular reference detected in department hierarchy');
        }
        visited.add(currentParentId);
        
        const parent = await this.prisma.department.findUnique({
          where: { id: currentParentId },
          select: { parentId: true },
        });
        currentParentId = parent?.parentId || null;
      }

      const parent = await this.prisma.department.findUnique({
        where: { id: updateDepartmentDto.parentId },
      });
      if (!parent) {
        throw new BadRequestException('Parent department not found');
      }
    }

    // Validate head if provided (not null)
    if (updateDepartmentDto.headId) {
      const head = await this.prisma.employee.findUnique({
        where: { id: updateDepartmentDto.headId },
      });
      if (!head) {
        throw new BadRequestException('Department head (employee) not found');
      }
    }

    // Build update data - only include fields that are explicitly set
    const updateData: any = {};
    
    if (updateDepartmentDto.name !== undefined) {
      updateData.name = updateDepartmentDto.name;
    }
    if (updateDepartmentDto.nameKa !== undefined) {
      updateData.nameKa = updateDepartmentDto.nameKa;
    }
    if (updateDepartmentDto.code !== undefined) {
      updateData.code = updateDepartmentDto.code;
    }
    if (updateDepartmentDto.description !== undefined) {
      updateData.description = updateDepartmentDto.description;
    }
    // parentId: null = make root, undefined = don't change
    if ('parentId' in updateDepartmentDto) {
      updateData.parentId = updateDepartmentDto.parentId;
    }
    // headId: null = remove head, undefined = don't change
    if ('headId' in updateDepartmentDto) {
      updateData.headId = updateDepartmentDto.headId;
    }
    if (updateDepartmentDto.isActive !== undefined) {
      updateData.isActive = updateDepartmentDto.isActive;
    }

    return this.prisma.department.update({
      where: { id },
      data: updateData,
      include: {
        parent: { select: { id: true, name: true, code: true } },
        head: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { employees: true, children: true } },
      },
    });
  }

  async remove(id: string) {
    const department = await this.findOne(id);

    // Check if department has non-terminated employees (terminated are not counted)
    if (department._count.employees > 0) {
      throw new BadRequestException(
        `Cannot delete department with ${department._count.employees} employee(s). Please transfer employees to another department first.`
      );
    }

    // Check if department has children
    if (department._count.children > 0) {
      throw new BadRequestException(
        `Cannot delete department with ${department._count.children} sub-department(s). Please delete or move sub-departments first.`
      );
    }

    return this.prisma.department.delete({
      where: { id },
    });
  }
}
