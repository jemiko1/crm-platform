import { IsString, IsOptional, IsBoolean, IsInt, IsUUID, Min, Max } from 'class-validator';

export class UpdatePositionDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsOptional()
  @IsString()
  nameKa?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  level?: number;

  @IsUUID('4')
  @IsOptional()
  roleGroupId?: string;

  @IsUUID('4')
  @IsOptional()
  departmentId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
