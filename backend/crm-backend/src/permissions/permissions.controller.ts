import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('Permissions')
@Controller('v1/permissions')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  @Doc({ summary: 'List all permissions', ok: 'Flat permission records' })
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get('grouped')
  @Doc({ summary: 'Permissions grouped by category', ok: 'Category → permissions map' })
  findByCategory() {
    return this.permissionsService.findByCategory();
  }

  @Get('resource/:resource')
  @Doc({
    summary: 'Permissions for a resource key',
    ok: 'Permissions scoped to the resource',
    params: [{ name: 'resource', description: 'RBAC resource identifier' }],
  })
  findByResource(@Param('resource') resource: string) {
    return this.permissionsService.findByResource(resource);
  }

  @Get('me/effective')
  @Doc({
    summary: 'Current user effective permissions (object wrapper)',
    ok: '{ permissions: string[] } for the authenticated user',
  })
  async getMyPermissions(@Request() req: any) {
    const userId = req.user.id;
    const permissions = await this.permissionsService.getCurrentUserPermissions(userId);
    return { permissions };
  }

  @Get('my-effective-permissions')
  @Doc({
    summary: 'Current user effective permissions (array)',
    ok: 'Permission code list for the authenticated user',
  })
  async getMyEffectivePermissions(@Request() req: any) {
    const userId = req.user.id;
    const permissions = await this.permissionsService.getCurrentUserPermissions(userId);
    return permissions;
  }

  // IMPORTANT: :id route must be LAST to avoid catching specific routes like
  // 'my-effective-permissions' or 'grouped' as an :id parameter
  @Get(':id')
  @Doc({
    summary: 'Get permission by ID',
    ok: 'Single permission record',
    notFound: true,
    params: [{ name: 'id', description: 'Permission UUID' }],
  })
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }
}
