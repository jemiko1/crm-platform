import { IsString, IsOptional, IsArray, IsUUID, IsBoolean, IsInt, Min } from 'class-validator';

export class UpdatePipelineConfigDto {
  @IsUUID()
  @IsOptional()
  positionId?: string;

  @IsString()
  @IsOptional()
  value?: string;

  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdateStageDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  nameKa?: string;

  @IsString()
  @IsOptional()
  color?: string;

  @IsOptional()
  requiredFields?: string[];

  @IsOptional()
  allowedActions?: string[];

  @IsOptional()
  autoSkipConditions?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateLeadSourceDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  nameKa: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateLeadSourceDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  nameKa?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePipelinePermissionDto {
  @IsArray()
  @IsUUID('4', { each: true })
  positionIds: string[];
}
