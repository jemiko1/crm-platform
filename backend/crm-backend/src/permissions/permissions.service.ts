import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async findByCategory() {
    const permissions = await this.findAll();
    
    const grouped: Record<string, typeof permissions> = {};
    for (const perm of permissions) {
      const category = perm.category || 'GENERAL';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(perm);
    }

    return grouped;
  }

  async findByResource(resource: string) {
    return this.prisma.permission.findMany({
      where: { resource },
      orderBy: { action: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.permission.findUnique({
      where: { id },
    });
  }

  /**
   * Get effective permissions for an employee
   * Priority: Employee Overrides > Department > Role
   */
  async getEffectivePermissions(employeeId: string): Promise<string[]> {
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        department: {
          include: {
            departmentPermissions: {
              include: {
                permission: true,
              },
            },
            parent: {
              include: {
                departmentPermissions: {
                  include: {
                    permission: true,
                  },
                },
                parent: {
                  include: {
                    departmentPermissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        permissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!employee) {
      return [];
    }

    const permissionSet = new Set<string>();

    // 1. Add role permissions (lowest priority)
    if (employee.role?.permissions) {
      for (const rp of employee.role.permissions) {
        const key = `${rp.permission.resource}.${rp.permission.action}`;
        permissionSet.add(key);
      }
    }

    // 2. Traverse department hierarchy and add department permissions
    let currentDept: typeof employee.department = employee.department;
    while (currentDept) {
      if (currentDept.departmentPermissions) {
        for (const dp of currentDept.departmentPermissions) {
          const key = `${dp.permission.resource}.${dp.permission.action}`;
          permissionSet.add(key);
        }
      }
      currentDept = currentDept.parent as typeof employee.department;
    }

    // 3. Apply employee overrides (highest priority)
    for (const ep of employee.permissions) {
      const key = `${ep.permission.resource}.${ep.permission.action}`;
      if (ep.type === 'GRANT') {
        permissionSet.add(key);
      } else if (ep.type === 'DENY') {
        permissionSet.delete(key);
      }
    }

    return Array.from(permissionSet).sort();
  }

  /**
   * Get effective permissions for current user (Position-based RBAC)
   * This is the same logic used in PositionPermissionGuard
   */
  async getCurrentUserPermissions(userId: string): Promise<string[]> {
    // Check if user is SuperAdmin or has ADMIN role (legacy support)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { isSuperAdmin: true, role: true, email: true },
    });

    console.log(`[Permissions] User check: email=${user?.email}, isSuperAdmin=${user?.isSuperAdmin}, role=${user?.role}`);

    // SuperAdmin or legacy ADMIN role gets all permissions
    if (user?.isSuperAdmin || user?.role === UserRole.ADMIN) {
      console.log(`[Permissions] User is admin, fetching all permissions`);
      // SuperAdmin/Admin has all permissions - return all available permissions
      const allPermissions = await this.findAll();
      if (allPermissions.length === 0) {
        // If no permissions exist in DB, return common permissions for admin
        return [
          'buildings.create', 'buildings.read', 'buildings.update', 'buildings.delete',
          'clients.create', 'clients.read', 'clients.update', 'clients.delete',
          'incidents.create', 'incidents.read', 'incidents.update', 'incidents.delete',
          'work-orders.create', 'work-orders.read', 'work-orders.update', 'work-orders.delete',
          'employees.create', 'employees.read', 'employees.update', 'employees.delete',
          'inventory.create', 'inventory.read', 'inventory.update', 'inventory.delete',
          'assets.create', 'assets.read', 'assets.update', 'assets.delete',
          'positions.manage', 'role-groups.manage',
        ];
      }
      return allPermissions.map(
        (p) => `${p.resource}.${p.action}`
      );
    }

    // Get user's employee with position and permissions
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      include: {
        position: {
          include: {
            roleGroup: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    if (!employee || !employee.position) {
      return [];
    }

    // Return permissions from position's role group
    return employee.position.roleGroup.permissions.map(
      (rp) => `${rp.permission.resource}.${rp.permission.action}`
    );
  }
}
