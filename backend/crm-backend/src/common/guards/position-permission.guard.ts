import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

/**
 * Position-based Permission Guard
 * 
 * This guard enforces permissions based on the user's Position.
 * 
 * Permission Flow:
 * 1. If user has isSuperAdmin = true → ALLOW (bypass all checks)
 * 2. Get user's Employee → Position → RoleGroup → Permissions
 * 3. Check if required permission exists in the chain
 * 4. If not found → DENY
 * 
 * Usage:
 * @UseGuards(JwtAuthGuard, PositionPermissionGuard)
 * @RequirePermission('incidents.create')
 * @Post()
 * createIncident() { ... }
 */
@Injectable()
export class PositionPermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the required permission from decorator
    const requiredPermission = this.reflector.get<string>(
      PERMISSION_KEY,
      context.getHandler(),
    );

    // If no permission required, allow access
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // 1. SuperAdmin bypass - check isSuperAdmin flag
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { isSuperAdmin: true },
    });

    // 2. Get user's employee with position and permissions
    const employee = await this.prisma.employee.findUnique({
      where: { userId: user.id },
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

    // Attach employee to request for use in controllers
    request.user.employee = employee;
    request.user.isSuperAdmin = dbUser?.isSuperAdmin;

    // SuperAdmin bypass - allow all actions
    if (dbUser?.isSuperAdmin) {
      return true;
    }

    if (!employee) {
      throw new ForbiddenException('No employee profile found for this user');
    }

    if (!employee.position) {
      throw new ForbiddenException('No position assigned to this employee');
    }

    // 3. Check if the required permission exists in the position's role group
    const permissions = employee.position.roleGroup.permissions.map(
      (rp) => `${rp.permission.resource}.${rp.permission.action}`
    );

    // Attach permissions array to request for use in controllers
    request.user.permissions = permissions;

    if (permissions.includes(requiredPermission)) {
      return true;
    }

    // 4. Permission not found - deny access
    throw new ForbiddenException(
      `Access denied. Required permission: ${requiredPermission}`
    );
  }
}
