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
    return this.prisma.department.findMany({
      include: {
        parent: { select: { id: true, name: true, code: true } },
        head: { select: { id: true, firstName: true, lastName: true, email: true } },
        _count: { select: { employees: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getHierarchy() {
    // Get root departments (no parent)
    const roots = await this.prisma.department.findMany({
      where: { parentId: null },
      include: {
        head: { select: { id: true, firstName: true, lastName: true, email: true } },
        children: {
          include: {
            head: { select: { id: true, firstName: true, lastName: true, email: true } },
            children: {
              include: {
                head: { select: { id: true, firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
        _count: { select: { employees: true, children: true } },
      },
      orderBy: { name: 'asc' },
    });

    return roots;
  }

  async findOne(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        head: { select: { id: true, firstName: true, lastName: true, email: true } },
        children: {
          include: {
            head: { select: { id: true, firstName: true, lastName: true, email: true } },
            _count: { select: { employees: true, children: true } },
          },
        },
        employees: {
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
        _count: { select: { employees: true, children: true } },
      },
    });

    if (!department) {
      throw new NotFoundException('Department not found');
    }

    return department;
  }

  async update(id: string, updateDepartmentDto: UpdateDepartmentDto) {
    // Check if department exists
    await this.findOne(id);

    const { code: _ignored, ...updateData } = updateDepartmentDto as any;

    // Validate parent if provided (prevent circular reference)
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

    // Validate head if provided
    if (updateDepartmentDto.headId) {
      const head = await this.prisma.employee.findUnique({
        where: { id: updateDepartmentDto.headId },
      });
      if (!head) {
        throw new BadRequestException('Department head (employee) not found');
      }
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

    // Check if department has employees
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
