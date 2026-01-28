import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  IsArray,
  IsNumber,
  IsDateString,
  ArrayMinSize,
  ValidateIf,
} from "class-validator";
import { Type } from "class-transformer";
import { WorkOrderType } from "@prisma/client";

export class CreateWorkOrderDto {
  @IsInt()
  @Min(1)
  buildingId: number; // coreId

  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @ArrayMinSize(1)
  assetIds: number[]; // coreIds (multiple devices)

  @IsEnum(WorkOrderType)
  type: WorkOrderType;

  @IsString()
  @IsOptional()
  title?: string; // Auto-generated if not provided

  @IsString()
  @IsOptional()
  description?: string; // Main description field (replaces notes)

  @IsString()
  @IsOptional()
  contactNumber?: string; // Building representative contact

  @IsDateString()
  @IsOptional()
  deadline?: string; // Deadline for completion

  // Only for INSTALLATION and REPAIR_CHANGE
  @ValidateIf((o) => o.type === "INSTALLATION" || o.type === "REPAIR_CHANGE")
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  amountGel?: number; // Customer payment amount

  @ValidateIf((o) => o.type === "INSTALLATION" || o.type === "REPAIR_CHANGE")
  @IsString()
  @IsOptional()
  inventoryProcessingType?: "ASG" | "Building"; // "ASG" or "Building"

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  employeeIdsToNotify?: string[]; // Employee internal IDs to notify
}
