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
import { IsString, MinLength, IsOptional, IsUUID } from 'class-validator';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PositionPermissionGuard } from '../common/guards/position-permission.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';

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

class HardDeleteDto {
  @IsString()
  @IsUUID('4')
  @IsOptional()
  delegateToEmployeeId?: string;
}

@Controller('v1/employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(@Body() createEmployeeDto: CreateEmployeeDto) {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
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
  findOne(@Param('id') id: string) {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateEmployeeDto: UpdateEmployeeDto) {
    return this.employeesService.update(id, updateEmployeeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.employeesService.remove(id);
  }

  @Post(':id/reset-password')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.reset_password')
  resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.employeesService.resetPassword(id, dto.newPassword);
  }

  @Post(':id/dismiss')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.dismiss')
  dismiss(@Param('id') id: string) {
    return this.employeesService.dismiss(id);
  }

  @Post(':id/activate')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.activate')
  activate(@Param('id') id: string) {
    return this.employeesService.activate(id);
  }

  @Get(':id/deletion-constraints')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.hard_delete')
  checkDeletionConstraints(@Param('id') id: string) {
    return this.employeesService.checkDeletionConstraints(id);
  }

  @Post(':id/delegate-items')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.hard_delete')
  delegateItems(@Param('id') id: string, @Body() dto: DelegateItemsDto) {
    return this.employeesService.delegateItems(id, dto.toEmployeeId);
  }

  @Delete(':id/hard-delete')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.hard_delete')
  hardDelete(@Param('id') id: string, @Body() dto?: HardDeleteDto) {
    return this.employeesService.hardDelete(id, dto?.delegateToEmployeeId);
  }

  @Post(':id/create-user-account')
  @UseGuards(PositionPermissionGuard)
  @RequirePermission('employee.create_account')
  createUserAccount(@Param('id') id: string, @Body() dto: CreateUserAccountDto) {
    return this.employeesService.createUserAccount(id, dto.password);
  }
}
