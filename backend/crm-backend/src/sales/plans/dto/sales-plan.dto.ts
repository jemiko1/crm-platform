import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  IsArray,
  IsEnum,
  IsUUID,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SalesPlanType } from '@prisma/client';

export class PlanTargetDto {
  @IsUUID()
  serviceId: string;

  @IsInt()
  @Min(0)
  targetQuantity: number;

  @IsNumber()
  @IsOptional()
  targetRevenue?: number;
}

export class CreateSalesPlanDto {
  @IsEnum(SalesPlanType)
  type: SalesPlanType;

  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  month?: number;

  @IsInt()
  @Min(1)
  @Max(4)
  @IsOptional()
  quarter?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsUUID()
  @IsOptional()
  employeeId?: string;

  @IsNumber()
  @IsOptional()
  targetRevenue?: number;

  @IsInt()
  @IsOptional()
  targetLeadConversions?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanTargetDto)
  @IsOptional()
  targets?: PlanTargetDto[];
}

export class UpdateSalesPlanDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
  @IsOptional()
  targetRevenue?: number;

  @IsInt()
  @IsOptional()
  targetLeadConversions?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanTargetDto)
  @IsOptional()
  targets?: PlanTargetDto[];
}

export class QuerySalesPlansDto {
  @IsOptional()
  @IsEnum(SalesPlanType)
  type?: SalesPlanType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
