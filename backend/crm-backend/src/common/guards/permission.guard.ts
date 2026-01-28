import { Injectable, CanActivate, ExecutionContext, ForbiddenException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionsService } from '../../permissions/permissions.service';

export const PERMISSION_KEY = 'permission';

export const RequirePermission = (resource: string, action: string) => {
  return SetMetadata(PERMISSION_KEY, { resource, action });
};

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private prisma: PrismaService,
    private permissionsService: PermissionsService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Get required permission from metadata
    const permission = this.reflector.get<{ resource: string; action: string }>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    if (!permission) {
      // No permission required, allow access
      return true;
    }

    // Find employee by userId
    const employee = await this.prisma.employee.findUnique({
      where: { userId: user.id },
      include: {
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
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
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
      throw new ForbiddenException('Employee record not found');
    }

    // Get effective permissions
    const effectivePermissions = await this.permissionsService.getEffectivePermissions(employee.id);

    // Check if user has required permission
    const requiredPerm = `${permission.resource}.${permission.action}`;
    if (!effectivePermissions.includes(requiredPerm)) {
      throw new ForbiddenException(`Missing permission: ${requiredPerm}`);
    }

    return true;
  }
}
