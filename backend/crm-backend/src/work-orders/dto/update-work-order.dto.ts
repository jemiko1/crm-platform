import { IsString, IsOptional, IsEnum, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { WorkOrderStatus } from "@prisma/client";
import { ProductUsageDto } from "./product-usage.dto";

export class UpdateWorkOrderDto {
  @IsEnum(WorkOrderStatus)
  @IsOptional()
  status?: WorkOrderStatus;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  // Workflow comments
  @IsString()
  @IsOptional()
  techEmployeeComment?: string; // Comment from technical employee

  @IsString()
  @IsOptional()
  techHeadComment?: string; // Comment from head of technical department

  @IsString()
  @IsOptional()
  cancelReason?: string; // Reason if canceled

  // Product usages for approval/modification (head can modify before approval)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductUsageDto)
  @IsOptional()
  productUsages?: ProductUsageDto[];
}
