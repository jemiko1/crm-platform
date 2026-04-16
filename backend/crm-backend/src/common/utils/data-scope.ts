import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ScopeLevel = 'own' | 'department' | 'department_tree' | 'all';

export interface DataScope {
  scope: ScopeLevel;
  userId: string;
  userLevel: number;
  departmentId: string | null;
  departmentIds: string[]; // For department_tree: own + all descendant dept IDs
}

/** Priority order — highest scope wins */
const SCOPE_PRIORITY: ScopeLevel[] = ['all', 'department_tree', 'department', 'own'];

@Injectable()
export class DataScopeService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolves the effective data scope for a user on a given resource.
   * Checks permissions in priority order: .all > .department_tree > .department > .own
   */
  async resolve(
    userId: string,
    resource: string,
    isSuperAdmin?: boolean,
  ): Promise<DataScope> {
    // SuperAdmin gets full access
    if (isSuperAdmin) {
      return {
        scope: 'all',
        userId,
        userLevel: 999,
        departmentId: null,
        departmentIds: [],
      };
    }

    // Load employee → position (level) → department + permissions
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: {
        departmentId: true,
        position: {
          select: {
            level: true,
            roleGroup: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: { resource: true, action: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!employee?.position) {
      return {
        scope: 'own',
        userId,
        userLevel: 0,
        departmentId: null,
        departmentIds: [],
      };
    }

    const permissions = employee.position.roleGroup.permissions.map(
      (rp) => `${rp.permission.resource}.${rp.permission.action}`,
    );

    const userLevel = employee.position.level ?? 0;
    const departmentId = employee.departmentId;

    // Find highest scope this user has for the resource
    let resolvedScope: ScopeLevel = 'own';
    for (const scope of SCOPE_PRIORITY) {
      if (permissions.includes(`${resource}.${scope}`)) {
        resolvedScope = scope;
        break;
      }
    }

    // Check if user even has .own — if not, they have no access at all
    if (
      resolvedScope === 'own' &&
      !permissions.includes(`${resource}.own`)
    ) {
      return {
        scope: 'own',
        userId,
        userLevel,
        departmentId,
        departmentIds: [],
      };
    }

    // For department_tree: collect all descendant department IDs
    let departmentIds: string[] = [];
    if (resolvedScope === 'department_tree' && departmentId) {
      departmentIds = await this.collectDescendantDepartments(departmentId);
    } else if (resolvedScope === 'department' && departmentId) {
      departmentIds = [departmentId];
    }

    return {
      scope: resolvedScope,
      userId,
      userLevel,
      departmentId,
      departmentIds,
    };
  }

  /**
   * Recursively collects a department ID + all its descendant IDs.
   */
  private async collectDescendantDepartments(rootId: string): Promise<string[]> {
    const result: string[] = [rootId];
    const children = await this.prisma.department.findMany({
      where: { parentId: rootId, isActive: true },
      select: { id: true },
    });

    for (const child of children) {
      const descendants = await this.collectDescendantDepartments(child.id);
      result.push(...descendants);
    }

    return result;
  }

  /**
   * Builds a Prisma `where` clause fragment that filters data by operator user scope.
   * Use this for filtering call reports, call logs, recordings, etc.
   * The returned filter applies to `operatorUserId` (or whatever user field the caller maps to).
   */
  buildUserFilter(scope: DataScope): Record<string, any> {
    switch (scope.scope) {
      case 'all':
        return {};

      case 'department_tree':
        return {
          operatorUser: {
            employee: {
              departmentId: { in: scope.departmentIds },
              position: { level: { lte: scope.userLevel } },
            },
          },
        };

      case 'department':
        return {
          operatorUser: {
            employee: {
              departmentId: scope.departmentId,
              position: { level: { lte: scope.userLevel } },
            },
          },
        };

      case 'own':
      default:
        return { operatorUserId: scope.userId };
    }
  }
}
