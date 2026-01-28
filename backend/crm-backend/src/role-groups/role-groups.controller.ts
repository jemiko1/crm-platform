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
import { RoleGroupsService } from './role-groups.service';
import { CreateRoleGroupDto } from './dto/create-role-group.dto';
import { UpdateRoleGroupDto } from './dto/update-role-group.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { DeleteRoleGroupDto } from './dto/delete-role-group.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminOnlyGuard } from '../common/guards/admin-only.guard';

@Controller('v1/role-groups')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class RoleGroupsController {
  constructor(private readonly roleGroupsService: RoleGroupsService) {}

  @Post()
  create(@Body() createRoleGroupDto: CreateRoleGroupDto) {
    return this.roleGroupsService.create(createRoleGroupDto);
  }

  @Get()
  findAll() {
    return this.roleGroupsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleGroupsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateRoleGroupDto: UpdateRoleGroupDto,
  ) {
    return this.roleGroupsService.update(id, updateRoleGroupDto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() deleteDto?: DeleteRoleGroupDto,
  ) {
    return this.roleGroupsService.remove(id, deleteDto?.replacementRoleGroupId);
  }

  @Post(':id/permissions')
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    return this.roleGroupsService.assignPermissions(id, dto);
  }

  @Get(':id/permissions')
  getPermissions(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleGroupsService.getPermissions(id);
  }
}
