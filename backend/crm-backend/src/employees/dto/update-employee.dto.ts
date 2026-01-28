import { IsString, IsOptional, IsEnum, IsDateString, IsEmail, MinLength } from 'class-validator';
import { EmployeeStatus } from '@prisma/client';

export class UpdateEmployeeDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string; // For password reset

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  extensionNumber?: string; // Phone extension number

  @IsDateString()
  @IsOptional()
  birthday?: string; // For birthday reminders

  // jobTitle is auto-generated from position name, not patchable

  @IsEnum(EmployeeStatus)
  @IsOptional()
  status?: EmployeeStatus;

  // Position-based RBAC (primary)
  @IsString()
  @IsOptional()
  positionId?: string;

  // Department & Role Assignment (legacy)
  @IsString()
  @IsOptional()
  departmentId?: string;

  @IsString()
  @IsOptional()
  roleId?: string;

  @IsString()
  @IsOptional()
  managerId?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsString()
  @IsOptional()
  emergencyContact?: string;

  @IsString()
  @IsOptional()
  emergencyPhone?: string;
}
