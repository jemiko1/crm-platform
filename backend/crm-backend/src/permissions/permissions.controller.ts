import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('v1/permissions')
@UseGuards(JwtAuthGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Get()
  findAll() {
    return this.permissionsService.findAll();
  }

  @Get('grouped')
  findByCategory() {
    return this.permissionsService.findByCategory();
  }

  @Get('resource/:resource')
  findByResource(@Param('resource') resource: string) {
    return this.permissionsService.findByResource(resource);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @Get('me/effective')
  async getMyPermissions(@Request() req: any) {
    const userId = req.user.id;
    const permissions = await this.permissionsService.getCurrentUserPermissions(userId);
    return { permissions };
  }

  @Get('my-effective-permissions')
  async getMyEffectivePermissions(@Request() req: any) {
    const userId = req.user.id;
    const userEmail = req.user.email;
    console.log(`[Permissions] Fetching permissions for user: ${userEmail} (${userId})`);
    const permissions = await this.permissionsService.getCurrentUserPermissions(userId);
    console.log(`[Permissions] Returning ${permissions.length} permissions for ${userEmail}`);
    return permissions; // Return array directly
  }
}
