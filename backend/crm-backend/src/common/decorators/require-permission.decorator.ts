import { SetMetadata } from '@nestjs/common';

export const PERMISSION_KEY = 'required_permission';

/**
 * Decorator to require a specific permission for an endpoint.
 * 
 * @param permission The permission string in format "resource.action"
 *                   Examples: "incidents.create", "buildings.details_read", "employees.manage"
 * 
 * @example
 * @RequirePermission('incidents.create')
 * @Post()
 * createIncident() { ... }
 */
export const RequirePermission = (permission: string) =>
  SetMetadata(PERMISSION_KEY, permission);
