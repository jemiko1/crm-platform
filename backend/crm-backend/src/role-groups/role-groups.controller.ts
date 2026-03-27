import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleGroupsService } from './role-groups.service';
import { CreateRoleGroupDto } from './dto/create-role-group.dto';
import { UpdateRoleGroupDto } from './dto/update-role-group.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { DeleteRoleGroupDto } from './dto/delete-role-group.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('RoleGroups')
@Controller('v1/role-groups')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class RoleGroupsController {
  constructor(private readonly roleGroupsService: RoleGroupsService) {}

  @Post()
  @Doc({
    summary: 'Create role group',
    ok: 'Created role group',
    permission: true,
    status: 201,
    bodyType: CreateRoleGroupDto,
  })
  create(@Body() createRoleGroupDto: CreateRoleGroupDto) {
    return this.roleGroupsService.create(createRoleGroupDto);
  }

  @Get()
  @Doc({ summary: 'List role groups', ok: 'All role groups', permission: true })
  findAll() {
    return this.roleGroupsService.findAll();
  }

  @Get(':id')
  @Doc({
    summary: 'Get role group by ID',
    ok: 'Role group detail',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Role group UUID' }],
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleGroupsService.findOne(id);
  }

  @Patch(':id')
  @Doc({
    summary: 'Update role group',
    ok: 'Updated role group',
    permission: true,
    notFound: true,
    bodyType: UpdateRoleGroupDto,
    params: [{ name: 'id', description: 'Role group UUID' }],
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateRoleGroupDto: UpdateRoleGroupDto,
  ) {
    return this.roleGroupsService.update(id, updateRoleGroupDto);
  }

  @Delete(':id')
  @Doc({
    summary: 'Delete role group',
    ok: 'Removal or replacement result',
    permission: true,
    notFound: true,
    bodyType: DeleteRoleGroupDto,
    params: [{ name: 'id', description: 'Role group UUID' }],
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() deleteDto?: DeleteRoleGroupDto,
  ) {
    return this.roleGroupsService.remove(id, deleteDto?.replacementRoleGroupId);
  }

  @Post(':id/permissions')
  @Doc({
    summary: 'Replace permissions on role group',
    ok: 'Updated permission bindings',
    permission: true,
    notFound: true,
    bodyType: AssignPermissionsDto,
    params: [{ name: 'id', description: 'Role group UUID' }],
  })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.roleGroupsService.assignPermissions(id, dto);
  }

  @Get(':id/permissions')
  @Doc({
    summary: 'List permissions for role group',
    ok: 'Permission codes on the group',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Role group UUID' }],
  })
  getPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleGroupsService.getPermissions(id);
  }
}
