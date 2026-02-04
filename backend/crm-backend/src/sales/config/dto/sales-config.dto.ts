import { IsString, IsOptional, IsArray, IsUUID, IsBoolean, IsInt, Min } from 'class-validator';

export class UpdatePipelineConfigDto {
  @IsArray()
  @IsUUID('4', { each: true })
  positionIds: string[];
}

export class CreatePipelineConfigDto {
  @IsString()
  key: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  stepOrder?: number;

  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  positionIds?: string[];
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
