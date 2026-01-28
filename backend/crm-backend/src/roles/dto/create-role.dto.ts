import { IsString, IsNotEmpty, IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  code: string;

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
}
