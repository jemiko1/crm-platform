import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsString, MinLength, IsOptional, IsUUID } from 'class-validator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../common/guards/position-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { Doc } from '../common/openapi/doc-endpoint.decorator';

class ResetPasswordDto {
  @IsString()
  @MinLength(6)
  newPassword!: string;
}

class CreateUserAccountDto {
  @IsString()
  @MinLength(6)
  password!: string;
}

class DelegateItemsDto {
  @IsString()
  @IsUUID('4')
  toEmployeeId!: string;
}

class DismissDto {
  @IsString()
  @IsUUID('4')
  @IsOptional()
  delegateToEmployeeId?: string;
}

class HardDeleteDto {
  @IsString()
  @IsUUID('4')
  @IsOptional()
  delegateToEmployeeId?: string;
}

@ApiTags('Employees')
@Controller('v1/employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Doc({
    summary: 'Create employee',
    ok: 'Created employee record',
    status: 201,
    bodyType: CreateEmployeeDto,
  })
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
  @Doc({
    summary: 'List employees',
    ok: 'Paged or filtered employee list',
    queries: [
      { name: 'status', description: 'Filter by employment status' },
      { name: 'search', description: 'Free-text search' },
      { name: 'includeTerminated', description: 'Include terminated employees (true/false)' },
      { name: 'page', description: 'Page number' },
      { name: 'pageSize', description: 'Page size' },
    ],
  })
  findAll(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('includeTerminated') includeTerminated?: string,
    @Query() pagination?: PaginationDto,
  ) {
    return this.employeesService.findAll(
      status,
      search,
      includeTerminated === 'true',
      pagination?.page,
      pagination?.pageSize,
    );
  }

  @Get(':id')
  @Doc({
    summary: 'Get employee by ID',
    ok: 'Employee detail',
    notFound: true,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @Doc({
    summary: 'Update employee',
    ok: 'Updated employee',
    notFound: true,
    bodyType: UpdateEmployeeDto,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  update(@Param('id') id: string, @Body() updateEmployeeDto: UpdateEmployeeDto) {
    return this.employeesService.update(id, updateEmployeeDto);
  }

  @Delete(':id')
  @Doc({
    summary: 'Soft-delete or deactivate employee (service-defined)',
    ok: 'Removal result',
    notFound: true,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }

  @Post(':id/reset-password')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.reset_password')
  @Doc({
    summary: 'Reset employee user password',
    ok: 'Password updated',
    permission: true,
    notFound: true,
    bodyType: ResetPasswordDto,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.employeesService.resetPassword(id, dto.newPassword);
  }

  @Post(':id/dismiss')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.dismiss')
  @Doc({
    summary: 'Dismiss employee',
    ok: 'Employee terminated',
    permission: true,
    notFound: true,
    bodyType: DismissDto,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  dismiss(@Param('id') id: string, @Body() dto?: DismissDto) {
    return this.employeesService.dismiss(id, dto?.delegateToEmployeeId);
  }

  @Post(':id/activate')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.activate')
  @Doc({
    summary: 'Reactivate dismissed employee',
    ok: 'Employee active again',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  activate(@Param('id') id: string) {
    return this.employeesService.activate(id);
  }

  @Get(':id/deletion-constraints')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.hard_delete')
  @Doc({
    summary: 'Hard-delete prerequisites and blockers',
    ok: 'Constraints before permanent delete',
    permission: true,
    notFound: true,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  checkDeletionConstraints(@Param('id') id: string) {
    return this.employeesService.checkDeletionConstraints(id);
  }

  @Post(':id/delegate-items')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.hard_delete')
  @Doc({
    summary: 'Delegate active items before hard delete',
    ok: 'Delegation result',
    permission: true,
    notFound: true,
    bodyType: DelegateItemsDto,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  delegateItems(@Param('id') id: string, @Body() dto: DelegateItemsDto) {
    return this.employeesService.delegateItems(id, dto.toEmployeeId);
  }

  @Delete(':id/hard-delete')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.hard_delete')
  @Doc({
    summary: 'Permanently delete employee',
    ok: 'Hard delete completed',
    permission: true,
    notFound: true,
    bodyType: HardDeleteDto,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  hardDelete(@Param('id') id: string, @Body() dto?: HardDeleteDto) {
    return this.employeesService.hardDelete(id, dto?.delegateToEmployeeId);
  }

  @Post(':id/create-user-account')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.create_account')
  @Doc({
    summary: 'Create login for employee',
    ok: 'User account linked',
    permission: true,
    notFound: true,
    bodyType: CreateUserAccountDto,
    params: [{ name: 'id', description: 'Employee UUID' }],
  })
  createUserAccount(@Param('id') id: string, @Body() dto: CreateUserAccountDto) {
    return this.employeesService.createUserAccount(id, dto.password);
  }
}
