import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsObject,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateSalesServiceDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsString()
  nameKa: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  monthlyPrice?: number;

  @IsNumber()
  @IsOptional()
  oneTimePrice?: number;

  @IsObject()
  @IsOptional()
  parameters?: Record<string, any>;

  @IsObject()
  @IsOptional()
  pricingRules?: Record<string, any>;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}

export class UpdateSalesServiceDto {
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

  @IsNumber()
  @IsOptional()
  monthlyPrice?: number;

  @IsNumber()
  @IsOptional()
  oneTimePrice?: number;

  @IsObject()
  @IsOptional()
  parameters?: Record<string, any>;

  @IsObject()
  @IsOptional()
  pricingRules?: Record<string, any>;

  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class CreateServiceCategoryDto {
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

export class UpdateServiceCategoryDto {
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
