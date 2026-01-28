import { IsString, IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateRoleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(4)
  @IsOptional()
  level?: number;

  @IsEnum(UserRole)
  @IsOptional()
  legacyRole?: UserRole;

  @IsOptional()
  isActive?: boolean;
}
