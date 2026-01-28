import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsEmail, MinLength } from 'class-validator';
import { EmployeeStatus } from '@prisma/client';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(6)
  @IsNotEmpty()
  password: string; // Required for User account creation

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  employeeId?: string; // Auto-generated if not provided

  @IsString()
  @IsOptional()
  extensionNumber?: string; // Phone extension number

  @IsDateString()
  @IsOptional()
  birthday?: string; // For birthday reminders

  // jobTitle is auto-generated from position name, not required

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
