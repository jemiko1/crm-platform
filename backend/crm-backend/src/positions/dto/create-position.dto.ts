import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsUUID, Min, Max } from 'class-validator';

export class CreatePositionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // code is auto-generated, not required from frontend

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  level?: number;

  @IsUUID('4')
  @IsNotEmpty()
  roleGroupId: string;

  @IsUUID('4')
  @IsOptional()
  departmentId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
