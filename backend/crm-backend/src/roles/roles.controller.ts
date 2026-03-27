import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

@ApiTags('Roles')
@Controller('v1/roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @Doc({
    summary: 'Create legacy role',
    ok: 'Created role',
    status: 201,
    bodyType: CreateRoleDto,
  })
  create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @Doc({ summary: 'List roles', ok: 'All roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @Doc({
    summary: 'Get role by ID',
    ok: 'Role detail',
    notFound: true,
    params: [{ name: 'id', description: 'Role UUID' }],
  })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Get(':id/permissions')
  @Doc({
    summary: 'Permissions on role',
    ok: 'Permission list',
    notFound: true,
    params: [{ name: 'id', description: 'Role UUID' }],
  })
  getPermissions(@Param('id') id: string) {
    return this.rolesService.getPermissions(id);
  }

  @Patch(':id')
  @Doc({
    summary: 'Update role',
    ok: 'Updated role',
    notFound: true,
    bodyType: UpdateRoleDto,
    params: [{ name: 'id', description: 'Role UUID' }],
  })
  update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto);
  }

  @Post(':id/permissions')
  @Doc({
    summary: 'Assign permissions to role',
    ok: 'Updated bindings',
    notFound: true,
    bodyType: AssignPermissionsDto,
    params: [{ name: 'id', description: 'Role UUID' }],
  })
  assignPermissions(@Param('id') id: string, @Body() assignPermissionsDto: AssignPermissionsDto) {
    return this.rolesService.assignPermissions(id, assignPermissionsDto);
  }

  @Delete(':id')
  @Doc({
    summary: 'Delete role',
    ok: 'Removal result',
    notFound: true,
    params: [{ name: 'id', description: 'Role UUID' }],
  })
  remove(@Param('id') id: string) {
    return this.rolesService.remove(id);
  }
}
