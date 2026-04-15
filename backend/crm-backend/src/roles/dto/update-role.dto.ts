import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

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

  @IsOptional()
  isActive?: boolean;
}
