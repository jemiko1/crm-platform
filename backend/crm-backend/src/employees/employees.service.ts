import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { paginate, buildPaginatedResponse } from '../common/dto/pagination.dto';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { ExtensionLinkService } from '../telephony/services/extension-link.service';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => ExtensionLinkService))
    private readonly extensionLinkService: ExtensionLinkService,
  ) {}

  /**
   * Auto-unlink the user's TelephonyExtension before dismissal / hard-delete.
   *
   * Rationale: a dismissed operator must stop receiving queue calls
   * immediately, even though their JWT stays valid up to 24h (documented
   * known gap — Option X from the dismissal-flow review). The unlink
   * service emits AMI QueueRemove per PositionQueueRule for the
   * operator's Position AND nulls crmUserId on the extension row, which
   * returns the extension to the pool so admin can link someone else.
   *
   * For hard-delete this runs BEFORE the User row is deleted — otherwise
   * the FK `onDelete: SetNull` would null crmUserId first and the unlink
   * service would short-circuit with no AMI emitted (since the Position
   * lookup goes through the User row).
   *
   * Failures are logged-and-swallowed: a PBX outage or AMI disconnect
   * must NOT block an HR dismissal. If AMI is down, the extension still
   * ends up in the pool (the DB part of unlink always succeeds); the
   * queue-membership drift is something admin can reconcile later with
   * the Resync button.
   *
   * Partial-failure window: because this runs BEFORE the dismissal /
   * hard-delete transaction, if that transaction throws and the admin
   * abandons the dismissal instead of retrying, the operator ends up
   * in a limbo state — still ACTIVE in Employee/User, but unlinked in
   * Telephony. Admin must re-link via the extensions page to restore
   * call routing. Retrying dismiss is always safe (unlink is idempotent
   * via the service's early-return on already-null crmUserId).
   */
  private async autoUnlinkForUser(userId: string, context: 'dismiss' | 'hardDelete'): Promise<void> {
    try {
      const ext = await this.prisma.telephonyExtension.findFirst({
        where: { crmUserId: userId },
        select: { id: true, extension: true },
      });
      if (!ext) return;
      await this.extensionLinkService.unlink(ext.id);
      this.logger.log(
        `${context}: auto-unlinked extension ${ext.extension} from user ${userId}`,
      );
    } catch (err: any) {
      this.logger.warn(
        `${context}: auto-unlink failed for user ${userId} — ${err?.message ?? err}. ` +
          `Proceeding with ${context}; admin may need to manually resync queues in FreePBX.`,
      );
    }
  }

  private async assertNotSuperAdmin(employeeId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { employee: { id: employeeId }, isSuperAdmin: true },
      select: { id: true },
    });
    if (user) {
      throw new ForbiddenException('Superadmin account cannot be modified');
    }
  }

  async create(createEmployeeDto: CreateEmployeeDto) {
    // Check if email already exists (in Employee or User)
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { email: createEmployeeDto.email },
    });

    if (existingEmployee) {
      throw new BadRequestException('Employee with this email already exists');
    }

    // Only check for existing user if we're creating a user account
    if (createEmployeeDto.createUserAccount) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: createEmployeeDto.email },
      });

      if (existingUser) {
        throw new BadRequestException('User with this email already exists');
      }

      // Require position for user account creation (for role-based permissions)
      if (!createEmployeeDto.positionId) {
        throw new BadRequestException('Position is required when creating a user account');
      }

      // Require password for user account creation
      if (!createEmployeeDto.password) {
        throw new BadRequestException('Password is required when creating a user account');
      }
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

    // Get position to auto-generate jobTitle and validate position belongs to department
    let jobTitle: string | undefined = undefined;

    if (createEmployeeDto.positionId) {
      const position = await this.prisma.position.findUnique({
        where: { id: createEmployeeDto.positionId },
        select: { name: true, departmentId: true },
      });
      if (!position) {
        throw new BadRequestException('Position not found');
      }
      jobTitle = position.name;
      // Position must belong to the employee's department (or be global: departmentId null)
      if (
        position.departmentId != null &&
        createEmployeeDto.departmentId !== position.departmentId
      ) {
        throw new BadRequestException(
          'Position does not belong to the selected department. Assign a position from the same department or a global position.'
        );
      }
    }

    // Generate avatar URL (using UI Avatars API)
    const avatarUrl = this.generateAvatarUrl(createEmployeeDto.firstName, createEmployeeDto.lastName);

    // Create Employee (and optionally User) in transaction
    return this.prisma.$transaction(async (tx) => {
      let userId: string | undefined = undefined;

      // Only create User account if requested
      if (createEmployeeDto.createUserAccount && createEmployeeDto.password) {
        const passwordHash = await bcrypt.hash(createEmployeeDto.password, 10);
        
        const user = await tx.user.create({
          data: {
            email: createEmployeeDto.email,
            passwordHash,
            role: UserRole.USER,
            isActive: createEmployeeDto.status !== 'TERMINATED',
          },
        });
        userId = user.id;
      }

      // Create Employee
      const employee = await tx.employee.create({
        data: {
          firstName: createEmployeeDto.firstName,
          lastName: createEmployeeDto.lastName,
          email: createEmployeeDto.email,
          phone: createEmployeeDto.phone,
          employeeId: createEmployeeDto.employeeId!, // Already validated/generated above
          birthday: createEmployeeDto.birthday ? new Date(createEmployeeDto.birthday) : null,
          jobTitle: jobTitle, // Auto-generated from position name
          status: createEmployeeDto.status || 'ACTIVE',
          address: createEmployeeDto.address,
          city: createEmployeeDto.city,
          country: createEmployeeDto.country || 'Georgia',
          emergencyContact: createEmployeeDto.emergencyContact,
          emergencyPhone: createEmployeeDto.emergencyPhone,
          avatar: avatarUrl,
          userId: userId,
          positionId: createEmployeeDto.positionId,
          departmentId: createEmployeeDto.departmentId,
          roleId: createEmployeeDto.roleId,
          managerId: createEmployeeDto.managerId,
        },
        include: {
          user: { select: { id: true, email: true, role: true, isActive: true } },
          department: { select: { id: true, name: true, code: true } },
          position: { select: { id: true, name: true, code: true } },
          role: { select: { id: true, name: true, code: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      return employee;
    });
  }

  async findAll(status?: string, search?: string, includeTerminated = false, page = 1, pageSize = 20) {
    const where: any = {};

    if (status && status !== 'ALL') {
      where.status = status;
    } else if (!includeTerminated) {
      where.status = { not: 'TERMINATED' };
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = paginate(page, pageSize);
    const include = {
      // Include the linked telephony extension via the User relation so the
      // Employees list can show "Ext: 214" for fast internal click-to-call.
      // Pool extensions (crmUserId=null) are not linked to any User, so they
      // never appear here. If User has no extension, this is null.
      user: {
        select: {
          id: true,
          isActive: true,
          telephonyExtension: {
            // Only fields the employees UI actually displays. Keep
            // `sipServer` out of the payload — it's infrastructure
            // detail with no UI consumer here, and the employees list
            // is gated by `employees.menu` which is broader than
            // `telephony.manage`.
            select: { extension: true, isActive: true },
          },
        },
      },
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
    };

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.employee.count({ where }),
    ]);

    return buildPaginatedResponse(data, total, page, pageSize);
  }

  async findOne(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            isActive: true,
            // Linked telephony extension — drives the "Ext: 214" pill on the
            // employee detail card. Null when the user has no extension or
            // is unlinked. `sipServer` is intentionally omitted — see
            // findAll's comment for rationale.
            telephonyExtension: {
              select: { extension: true, isActive: true },
            },
          },
        },
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
    await this.assertNotSuperAdmin(id);
    // Check if employee exists
    const employee = await this.findOne(id);

    if (updateEmployeeDto.email && updateEmployeeDto.email !== employee.email) {
      const existingEmployee = await this.prisma.employee.findUnique({
        where: { email: updateEmployeeDto.email },
      });

      if (existingEmployee && existingEmployee.id !== id) {
        throw new BadRequestException('Employee with this email already exists');
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
      // If employee has a position tied to a department, new department must match
      const currentPositionId =
        updateEmployeeDto.positionId ?? employee.positionId;
      if (currentPositionId) {
        const pos = await this.prisma.position.findUnique({
          where: { id: currentPositionId },
          select: { departmentId: true },
        });
        if (pos?.departmentId != null && pos.departmentId !== updateEmployeeDto.departmentId) {
          throw new BadRequestException(
            'Current position belongs to another department. Change position first or assign a position from the target department.'
          );
        }
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

    // Update jobTitle if position is being updated; validate position belongs to department
    let jobTitle: string | undefined = undefined;
    const effectiveDepartmentId =
      updateEmployeeDto.departmentId !== undefined
        ? updateEmployeeDto.departmentId
        : employee.departmentId;

    if (updateEmployeeDto.positionId) {
      const position = await this.prisma.position.findUnique({
        where: { id: updateEmployeeDto.positionId },
        select: { name: true, departmentId: true },
      });
      if (!position) {
        throw new BadRequestException('Position not found');
      }
      jobTitle = position.name;
      if (effectiveDepartmentId != null && position.departmentId != null) {
        if (position.departmentId !== effectiveDepartmentId) {
          throw new BadRequestException(
            'Position does not belong to the employee\'s department. Assign a position from the same department or a global position.'
          );
        }
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

    let passwordHash: string | undefined;
    if (updateEmployeeDto.password && employee.userId) {
      passwordHash = await bcrypt.hash(updateEmployeeDto.password, 10);
    }

    const updateData: any = {
      firstName: updateEmployeeDto.firstName,
      lastName: updateEmployeeDto.lastName,
      email: updateEmployeeDto.email,
      phone: updateEmployeeDto.phone,
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

    if (jobTitle !== undefined) {
      updateData.jobTitle = jobTitle;
    }

    return this.prisma.$transaction(async (tx) => {
      if (updateEmployeeDto.email && updateEmployeeDto.email !== employee.email && employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { email: updateEmployeeDto.email },
        });
      }

      if (passwordHash && employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { passwordHash },
        });
      }

      if (updateEmployeeDto.status && employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: updateEmployeeDto.status !== 'TERMINATED' },
        });
      }

      return tx.employee.update({
        where: { id },
        data: updateData,
        include: {
          user: { select: { id: true, email: true, role: true, isActive: true } },
          department: { select: { id: true, name: true, code: true } },
          role: { select: { id: true, name: true, code: true } },
          manager: { select: { id: true, firstName: true, lastName: true } },
        },
      });
    });
  }

  async remove(id: string) {
    await this.assertNotSuperAdmin(id);
    // Check if employee exists
    await this.findOne(id);

    // Soft delete by setting status to TERMINATED
    return this.prisma.employee.update({
      where: { id },
      data: { status: 'TERMINATED' },
    });
  }

  async resetPassword(id: string, newPassword: string) {
    await this.assertNotSuperAdmin(id);
    const employee = await this.findOne(id);

    if (!employee.userId) {
      throw new BadRequestException('Employee does not have an associated user account');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    
    await this.prisma.user.update({
      where: { id: employee.userId },
      data: { passwordHash },
    });

    return { success: true, message: 'Password reset successfully' };
  }

  async dismiss(id: string, delegateToEmployeeId?: string) {
    await this.assertNotSuperAdmin(id);
    const employee = await this.findOne(id);
    const constraints = await this.checkDeletionConstraints(id);

    if (!constraints.canDelete && !delegateToEmployeeId) {
      throw new BadRequestException({
        message: 'Employee has active items that must be delegated before dismissal',
        activeLeadsCount: constraints.activeLeadsCount,
        openWorkOrdersCount: constraints.openWorkOrdersCount,
        activeLeads: constraints.activeLeads,
        openWorkOrders: constraints.openWorkOrders,
      });
    }

    if (delegateToEmployeeId) {
      const delegate = await this.findOne(delegateToEmployeeId);
      if (delegate.status === 'TERMINATED') {
        throw new BadRequestException('Cannot delegate to a terminated employee');
      }
    }

    // Auto-unlink telephony extension (AMI QueueRemove + return to pool)
    // BEFORE opening the DB transaction — keeps AMI network I/O outside
    // the transaction scope. If AMI is down, unlink degrades gracefully
    // and dismissal still proceeds.
    if (employee.userId) {
      await this.autoUnlinkForUser(employee.userId, 'dismiss');
    }

    return this.prisma.$transaction(async (tx) => {
      if (!constraints.canDelete && delegateToEmployeeId) {
        await tx.lead.updateMany({
          where: { responsibleEmployeeId: id, status: 'ACTIVE' },
          data: { responsibleEmployeeId: delegateToEmployeeId },
        });

        await tx.workOrderAssignment.updateMany({
          where: {
            employeeId: id,
            workOrder: { status: { notIn: ['COMPLETED', 'CANCELED'] } },
          },
          data: { employeeId: delegateToEmployeeId },
        });
      }

      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: false },
        });
      }

      return tx.employee.update({
        where: { id },
        data: { status: 'TERMINATED' },
        include: {
          user: { select: { id: true, email: true, role: true, isActive: true } },
          department: { select: { id: true, name: true, code: true } },
          position: { select: { id: true, name: true, code: true } },
        },
      });
    });
  }

  async activate(id: string) {
    await this.assertNotSuperAdmin(id);
    const employee = await this.findOne(id);

    if (employee.status !== 'TERMINATED') {
      throw new BadRequestException('Only terminated employees can be activated');
    }

    return this.prisma.$transaction(async (tx) => {
      if (employee.userId) {
        await tx.user.update({
          where: { id: employee.userId },
          data: { isActive: true },
        });
      }

      return tx.employee.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: {
          user: { select: { id: true, email: true, role: true, isActive: true } },
          department: { select: { id: true, name: true, code: true } },
          position: { select: { id: true, name: true, code: true } },
        },
      });
    });
  }

  async checkDeletionConstraints(id: string) {
    const employee = await this.findOne(id);

    // Find ACTIVE leads where this employee is responsible (not WON or LOST)
    const activeLeads = await this.prisma.lead.findMany({
      where: {
        responsibleEmployeeId: id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        status: true,
        stage: {
          select: { name: true },
        },
      },
    });

    // Find OPEN work orders where this employee is assigned (not COMPLETED/CANCELED)
    const openWorkOrders = await this.prisma.workOrderAssignment.findMany({
      where: {
        employeeId: id,
        workOrder: {
          status: {
            notIn: ['COMPLETED', 'CANCELED'],
          },
        },
      },
      include: {
        workOrder: {
          select: {
            id: true,
            workOrderNumber: true,
            status: true,
            building: {
              select: { name: true },
            },
          },
        },
      },
    });

    return {
      canDelete: activeLeads.length === 0 && openWorkOrders.length === 0,
      hasUserAccount: !!employee.userId,
      isTerminated: employee.status === 'TERMINATED',
      employee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        status: employee.status,
      },
      activeLeads: activeLeads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        status: lead.status,
        stageName: lead.stage?.name || 'Unknown',
      })),
      openWorkOrders: openWorkOrders.map((assignment) => ({
        id: assignment.workOrder.id,
        workOrderNumber: assignment.workOrder.workOrderNumber,
        status: assignment.workOrder.status,
        buildingName: assignment.workOrder.building?.name || 'Unknown',
      })),
      activeLeadsCount: activeLeads.length,
      openWorkOrdersCount: openWorkOrders.length,
    };
  }

  async delegateItems(fromEmployeeId: string, toEmployeeId: string) {
    await this.assertNotSuperAdmin(fromEmployeeId);
    // Verify both employees exist
    const fromEmployee = await this.findOne(fromEmployeeId);
    const toEmployee = await this.findOne(toEmployeeId);

    if (fromEmployeeId === toEmployeeId) {
      throw new BadRequestException('Cannot delegate to the same employee');
    }

    if (toEmployee.status === 'TERMINATED') {
      throw new BadRequestException('Cannot delegate to a terminated employee');
    }

    // Delegate active leads (only responsibleEmployeeId, not createdById - that's historical)
    const leadsUpdated = await this.prisma.lead.updateMany({
      where: {
        responsibleEmployeeId: fromEmployeeId,
        status: 'ACTIVE', // Only active leads
      },
      data: {
        responsibleEmployeeId: toEmployeeId,
      },
    });

    // Delegate work order assignments (only open work orders)
    // We need to update existing assignments
    const workOrderAssignmentsUpdated = await this.prisma.workOrderAssignment.updateMany({
      where: {
        employeeId: fromEmployeeId,
        workOrder: {
          status: {
            notIn: ['COMPLETED', 'CANCELED'],
          },
        },
      },
      data: {
        employeeId: toEmployeeId,
      },
    });

    return {
      success: true,
      delegatedTo: {
        id: toEmployee.id,
        firstName: toEmployee.firstName,
        lastName: toEmployee.lastName,
      },
      delegatedFrom: {
        id: fromEmployee.id,
        firstName: fromEmployee.firstName,
        lastName: fromEmployee.lastName,
      },
      leadsReassigned: leadsUpdated.count,
      workOrdersReassigned: workOrderAssignmentsUpdated.count,
    };
  }

  async hardDelete(id: string, delegateToEmployeeId?: string) {
    await this.assertNotSuperAdmin(id);
    const employee = await this.findOne(id);

    // For employees WITH user accounts, they must be TERMINATED first
    if (employee.userId && employee.status !== 'TERMINATED') {
      throw new BadRequestException(
        'Employees with login accounts must be dismissed before permanent deletion'
      );
    }

    // Check for ACTIVE items only (not closed/completed ones)
    const constraints = await this.checkDeletionConstraints(id);

    // If there are ACTIVE items and no delegation target, return error with details
    if (!constraints.canDelete && !delegateToEmployeeId) {
      throw new BadRequestException({
        message: 'Employee has active items that must be delegated before deletion',
        activeLeadsCount: constraints.activeLeadsCount,
        openWorkOrdersCount: constraints.openWorkOrdersCount,
        activeLeads: constraints.activeLeads,
        openWorkOrders: constraints.openWorkOrders,
      });
    }

    // Validate delegate employee if provided
    if (delegateToEmployeeId) {
      const delegateEmployee = await this.findOne(delegateToEmployeeId);
      if (delegateEmployee.status === 'TERMINATED') {
        throw new BadRequestException('Cannot delegate to a terminated employee');
      }
    }

    const employeeName = `${employee.firstName} ${employee.lastName} (${employee.employeeId})`;

    // Auto-unlink telephony extension before the User is deleted. MUST run
    // before the transaction: once tx.user.delete fires, the onDelete:SetNull
    // FK nulls crmUserId, after which unlink becomes a no-op (no Position to
    // derive queues from). See comment on autoUnlinkForUser for the full
    // rationale.
    if (employee.userId) {
      await this.autoUnlinkForUser(employee.userId, 'hardDelete');
    }

    await this.prisma.$transaction(async (tx) => {
      if (!constraints.canDelete && delegateToEmployeeId) {
        await tx.lead.updateMany({
          where: { responsibleEmployeeId: id, status: 'ACTIVE' },
          data: { responsibleEmployeeId: delegateToEmployeeId },
        });

        await tx.workOrderAssignment.updateMany({
          where: {
            employeeId: id,
            workOrder: { status: { notIn: ['COMPLETED', 'CANCELED'] } },
          },
          data: { employeeId: delegateToEmployeeId },
        });
      }

      await tx.lead.updateMany({
        where: { responsibleEmployeeId: id },
        data: { responsibleEmployeeName: employeeName },
      });
      await tx.lead.updateMany({
        where: { createdById: id },
        data: { createdByName: employeeName },
      });
      await tx.leadNote.updateMany({
        where: { createdById: id },
        data: { createdByName: employeeName },
      });
      await tx.leadReminder.updateMany({
        where: { createdById: id },
        data: { createdByName: employeeName },
      });
      await tx.leadAppointment.updateMany({
        where: { createdById: id },
        data: { createdByName: employeeName },
      });
      await tx.leadProposal.updateMany({
        where: { createdById: id },
        data: { createdByName: employeeName },
      });
      await tx.leadStageHistory.updateMany({
        where: { changedById: id },
        data: { changedByName: employeeName },
      });
      await tx.salesPlan.updateMany({
        where: { createdById: id },
        data: { createdByName: employeeName },
      });
      await tx.workOrderActivityLog.updateMany({
        where: { performedById: id },
        data: { performedByName: employeeName },
      });
      await tx.leadActivity.updateMany({
        where: { performedById: id },
        data: { performedByName: employeeName },
      });
      await tx.department.updateMany({
        where: { headId: id },
        data: { headId: null },
      });
      await tx.employee.updateMany({
        where: { managerId: id },
        data: { managerId: null },
      });
      await tx.salesPlan.updateMany({
        where: { employeeId: id },
        data: { employeeId: null },
      });
      await tx.salesPlan.updateMany({
        where: { approvedById: id },
        data: { approvedById: null },
      });

      if (employee.userId) {
        await tx.user.delete({ where: { id: employee.userId } });
      }

      await tx.employee.delete({ where: { id } });
    });

    return {
      success: true,
      message: `Employee ${employee.firstName} ${employee.lastName} has been permanently deleted`,
      deletedEmployee: {
        id: employee.id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        employeeId: employee.employeeId,
      },
    };
  }

  async bulkDismiss(ids: string[], delegateToEmployeeId?: string) {
    const results: { id: string; name: string; success: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        const emp = await this.dismiss(id, delegateToEmployeeId);
        results.push({ id, name: `${emp.firstName} ${emp.lastName}`, success: true });
      } catch (err: any) {
        const employee = await this.prisma.employee.findUnique({
          where: { id },
          select: { firstName: true, lastName: true },
        });
        results.push({
          id,
          name: employee ? `${employee.firstName} ${employee.lastName}` : id,
          success: false,
          error: err.message ?? 'Unknown error',
        });
      }
    }
    return {
      dismissed: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  async bulkHardDelete(ids: string[], delegateToEmployeeId?: string) {
    const results: { id: string; name: string; success: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        const result = await this.hardDelete(id, delegateToEmployeeId);
        results.push({
          id,
          name: result.deletedEmployee
            ? `${result.deletedEmployee.firstName} ${result.deletedEmployee.lastName}`
            : id,
          success: true,
        });
      } catch (err: any) {
        const employee = await this.prisma.employee.findUnique({
          where: { id },
          select: { firstName: true, lastName: true },
        });
        results.push({
          id,
          name: employee ? `${employee.firstName} ${employee.lastName}` : id,
          success: false,
          error: err.message ?? 'Unknown error',
        });
      }
    }
    return {
      deleted: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    };
  }

  async bulkCheckConstraints(ids: string[]) {
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return await this.checkDeletionConstraints(id);
        } catch {
          return null;
        }
      }),
    );
    const valid = results.filter((r) => r !== null);
    return {
      employees: valid,
      totalActiveLeads: valid.reduce((sum, r) => sum + r.activeLeadsCount, 0),
      totalOpenWorkOrders: valid.reduce((sum, r) => sum + r.openWorkOrdersCount, 0),
      allCanDelete: valid.every((r) => r.canDelete),
    };
  }

  async createUserAccount(id: string, password: string) {
    await this.assertNotSuperAdmin(id);
    const employee = await this.findOne(id);

    if (employee.userId) {
      throw new BadRequestException('Employee already has a user account');
    }

    // Require position for user account creation (for role-based permissions)
    if (!employee.positionId) {
      throw new BadRequestException('Employee must have a position assigned before creating a user account. Please assign a position first.');
    }

    // Check if email is already used by another user
    const existingUser = await this.prisma.user.findUnique({
      where: { email: employee.email },
    });

    if (existingUser) {
      throw new BadRequestException('A user account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create user account — permissions come from Position's RoleGroup
    const user = await this.prisma.user.create({
      data: {
        email: employee.email,
        passwordHash,
        role: UserRole.USER,
        isActive: employee.status !== 'TERMINATED',
      },
    });

    // Link user to employee
    return this.prisma.employee.update({
      where: { id },
      data: { userId: user.id },
      include: {
        user: { select: { id: true, email: true, role: true, isActive: true } },
        department: { select: { id: true, name: true, code: true } },
        position: { select: { id: true, name: true, code: true } },
      },
    });
  }

  private async generateEmployeeId(): Promise<string> {
    // Use a counter table to ensure IDs are never reused even after deletion
    const counter = await this.prisma.externalIdCounter.upsert({
      where: { entity: 'employee' },
      update: { nextId: { increment: 1 } },
      create: { entity: 'employee', nextId: 1 },
    });

    // If this is a fresh counter, we need to check existing employees to avoid collisions
    if (counter.nextId === 1) {
      // Find the highest existing employee number
      const existingEmployees = await this.prisma.employee.findMany({
        where: {
          employeeId: { startsWith: 'EMP-' },
        },
        select: { employeeId: true },
      });

      let maxNumber = 0;
      for (const emp of existingEmployees) {
        const match = emp.employeeId.match(/EMP-(\d+)/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num;
          }
        }
      }

      if (maxNumber > 0) {
        // Update counter to start from maxNumber + 1
        await this.prisma.externalIdCounter.update({
          where: { entity: 'employee' },
          data: { nextId: maxNumber + 1 },
        });
        return `EMP-${(maxNumber + 1).toString().padStart(3, '0')}`;
      }
    }

    return `EMP-${counter.nextId.toString().padStart(3, '0')}`;
  }

  private generateAvatarUrl(firstName: string, lastName: string): string {
    // Generate avatar using UI Avatars API
    const name = `${firstName} ${lastName}`.trim();
    const encodedName = encodeURIComponent(name);
    return `https://ui-avatars.com/api/?name=${encodedName}&background=089738&color=fff&size=128&bold=true`;
  }
}
