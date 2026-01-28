import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(createEmployeeDto: CreateEmployeeDto) {
    // Check if email already exists (in Employee or User)
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { email: createEmployeeDto.email },
    });

    if (existingEmployee) {
      throw new BadRequestException('Employee with this email already exists');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: createEmployeeDto.email },
    });

    if (existingUser) {
      throw new BadRequestException('User with this email already exists');
    }

    // Validate department, role, manager if provided
    if (createEmployeeDto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: createEmployeeDto.departmentId },
      });
      if (!department) {
        throw new BadRequestException('Department not found');
      }
    }

    if (createEmployeeDto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: createEmployeeDto.roleId },
      });
      if (!role) {
        throw new BadRequestException('Role not found');
      }
    }

    if (createEmployeeDto.managerId) {
      const manager = await this.prisma.employee.findUnique({
        where: { id: createEmployeeDto.managerId },
      });
      if (!manager) {
        throw new BadRequestException('Manager not found');
      }
    }

    // Generate employee ID if not provided
    if (!createEmployeeDto.employeeId) {
      createEmployeeDto.employeeId = await this.generateEmployeeId();
    } else {
      // Check if provided employeeId is unique
      const existingById = await this.prisma.employee.findUnique({
        where: { employeeId: createEmployeeDto.employeeId },
      });

      if (existingById) {
        throw new BadRequestException('Employee ID already exists');
      }
    }

    // Get position to auto-generate jobTitle
    let jobTitle: string | undefined = undefined;
    if (createEmployeeDto.positionId) {
      const position = await this.prisma.position.findUnique({
        where: { id: createEmployeeDto.positionId },
        select: { name: true },
      });
      if (position) {
        jobTitle = position.name;
      }
    }

    // Generate avatar URL (using UI Avatars API)
    const avatarUrl = this.generateAvatarUrl(createEmployeeDto.firstName, createEmployeeDto.lastName);

    // Hash password
    const passwordHash = await bcrypt.hash(createEmployeeDto.password, 10);

    // Determine UserRole from Role or default to TECHNICIAN
    let userRole: UserRole = UserRole.TECHNICIAN;
    if (createEmployeeDto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: createEmployeeDto.roleId },
        select: { legacyRole: true },
      });
      if (role?.legacyRole) {
        userRole = role.legacyRole;
      }
    }

    // Create User and Employee in transaction
    return this.prisma.$transaction(async (tx) => {
      // Create User account
      const user = await tx.user.create({
        data: {
          email: createEmployeeDto.email,
          passwordHash,
          role: userRole,
          isActive: createEmployeeDto.status !== 'TERMINATED',
        },
      });

      // Create Employee
      const employee = await tx.employee.create({
        data: {
          firstName: createEmployeeDto.firstName,
          lastName: createEmployeeDto.lastName,
          email: createEmployeeDto.email,
          phone: createEmployeeDto.phone,
          employeeId: createEmployeeDto.employeeId!, // Already validated/generated above
          extensionNumber: createEmployeeDto.extensionNumber,
          birthday: createEmployeeDto.birthday ? new Date(createEmployeeDto.birthday) : null,
          jobTitle: jobTitle, // Auto-generated from position name
          status: createEmployeeDto.status || 'ACTIVE',
          address: createEmployeeDto.address,
          city: createEmployeeDto.city,
          country: createEmployeeDto.country || 'Georgia',
          emergencyContact: createEmployeeDto.emergencyContact,
          emergencyPhone: createEmployeeDto.emergencyPhone,
          avatar: avatarUrl,
          userId: user.id,
          positionId: createEmployeeDto.positionId,
          departmentId: createEmployeeDto.departmentId,
          roleId: createEmployeeDto.roleId,
          managerId: createEmployeeDto.managerId,
        },
        include: {
          user: { select: { id: true, email: true, role: true, isActive: true } },
          department: { select: { id: true, name: true, code: true } },
          role: { select: { id: true, name: true, code: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return employee;
    });
  }

  async findAll(status?: string, search?: string) {
    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.employee.findMany({
      where,
      include: {
        department: { select: { id: true, name: true, code: true } },
        position: {
          select: {
            id: true,
            name: true,
            code: true,
            departmentId: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
        role: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, role: true, isActive: true } },
        department: { 
          select: { 
            id: true, 
            name: true, 
            code: true 
          } 
        },
        position: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        role: { 
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
          },
        },
        manager: { 
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            email: true 
          } 
        },
        subordinates: { 
          select: { 
            id: true, 
            firstName: true, 
            lastName: true, 
            email: true 
          } 
        },
        workOrderAssignments: {
          include: {
            workOrder: {
              select: {
                id: true,
                title: true,
                status: true,
                type: true,
                building: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto) {
    // Check if employee exists
    const employee = await this.findOne(id);

    // Check if email is being changed and if it's unique
    if (updateEmployeeDto.email && updateEmployeeDto.email !== employee.email) {
      const existingEmployee = await this.prisma.employee.findUnique({
        where: { email: updateEmployeeDto.email },
      });

      if (existingEmployee && existingEmployee.id !== id) {
        throw new BadRequestException('Employee with this email already exists');
      }

      // Also update User email if it exists
      if (employee.userId) {
        await this.prisma.user.update({
          where: { id: employee.userId },
          data: { email: updateEmployeeDto.email },
        });
      }
    }

    // Validate department, role, manager if provided
    if (updateEmployeeDto.departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: updateEmployeeDto.departmentId },
      });
      if (!department) {
        throw new BadRequestException('Department not found');
      }
    }

    if (updateEmployeeDto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: updateEmployeeDto.roleId },
      });
      if (!role) {
        throw new BadRequestException('Role not found');
      }
    }

    if (updateEmployeeDto.managerId) {
      const manager = await this.prisma.employee.findUnique({
        where: { id: updateEmployeeDto.managerId },
      });
      if (!manager) {
        throw new BadRequestException('Manager not found');
      }
      if (manager.id === id) {
        throw new BadRequestException('Employee cannot be their own manager');
      }
    }

    // Update jobTitle if position is being updated
    let jobTitle: string | undefined = undefined;
    if (updateEmployeeDto.positionId) {
      const position = await this.prisma.position.findUnique({
        where: { id: updateEmployeeDto.positionId },
        select: { name: true },
      });
      if (position) {
        jobTitle = position.name;
      }
    } else if (employee.positionId) {
      // Keep existing position's jobTitle if position not being updated
      const position = await this.prisma.position.findUnique({
        where: { id: employee.positionId },
        select: { name: true },
      });
      if (position) {
        jobTitle = position.name;
      }
    }

    // Update password if provided
    if (updateEmployeeDto.password && employee.userId) {
      const passwordHash = await bcrypt.hash(updateEmployeeDto.password, 10);
      await this.prisma.user.update({
        where: { id: employee.userId },
        data: { passwordHash },
      });
    }

    // Determine UserRole from Role if roleId is being updated
    let userRole: UserRole | undefined;
    if (updateEmployeeDto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: updateEmployeeDto.roleId },
        select: { legacyRole: true },
      });
      if (role?.legacyRole) {
        userRole = role.legacyRole;
      }
    }

    // Update User role if needed
    if (userRole && employee.userId) {
      await this.prisma.user.update({
        where: { id: employee.userId },
        data: { role: userRole },
      });
    }

    // Update User isActive based on status
    if (updateEmployeeDto.status && employee.userId) {
      await this.prisma.user.update({
        where: { id: employee.userId },
        data: { isActive: updateEmployeeDto.status !== 'TERMINATED' },
      });
    }

    // Update Employee
    const updateData: any = {
      firstName: updateEmployeeDto.firstName,
      lastName: updateEmployeeDto.lastName,
      email: updateEmployeeDto.email,
      phone: updateEmployeeDto.phone,
      extensionNumber: updateEmployeeDto.extensionNumber,
      birthday: updateEmployeeDto.birthday ? new Date(updateEmployeeDto.birthday) : undefined,
      status: updateEmployeeDto.status,
      address: updateEmployeeDto.address,
      city: updateEmployeeDto.city,
      country: updateEmployeeDto.country,
      emergencyContact: updateEmployeeDto.emergencyContact,
      emergencyPhone: updateEmployeeDto.emergencyPhone,
      positionId: updateEmployeeDto.positionId,
      departmentId: updateEmployeeDto.departmentId,
      roleId: updateEmployeeDto.roleId,
      managerId: updateEmployeeDto.managerId,
    };

    // Update jobTitle if position changed or if explicitly set
    if (jobTitle !== undefined) {
      updateData.jobTitle = jobTitle;
    }

    return this.prisma.employee.update({
      where: { id },
      data: updateData,
      include: {
        user: { select: { id: true, email: true, role: true, isActive: true } },
        department: { select: { id: true, name: true, code: true } },
        role: { select: { id: true, name: true, code: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async remove(id: string) {
    // Check if employee exists
    await this.findOne(id);

    // Soft delete by setting status to TERMINATED
    return this.prisma.employee.update({
      where: { id },
      data: { status: 'TERMINATED' },
    });
  }

  private async generateEmployeeId(): Promise<string> {
    // Get the highest employee number
    const lastEmployee = await this.prisma.employee.findFirst({
      where: {
        employeeId: {
          startsWith: 'EMP-',
        },
      },
      orderBy: {
        employeeId: 'desc',
      },
    });

    if (!lastEmployee) {
      return 'EMP-001';
    }

    // Extract number from EMP-XXX format
    const lastNumber = parseInt(lastEmployee.employeeId.split('-')[1] || '0', 10);
    const nextNumber = lastNumber + 1;

    return `EMP-${nextNumber.toString().padStart(3, '0')}`;
  }

  private generateAvatarUrl(firstName: string, lastName: string): string {
    // Generate avatar using UI Avatars API
    const name = `${firstName} ${lastName}`.trim();
    const encodedName = encodeURIComponent(name);
    return `https://ui-avatars.com/api/?name=${encodedName}&background=089738&color=fff&size=128&bold=true`;
  }
}
