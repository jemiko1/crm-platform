import { IsOptional, IsInt, Min, Max, IsEnum } from "class-validator";
import { Type } from "class-transformer";
import { WorkOrderStatus, WorkOrderType } from "@prisma/client";

export class QueryWorkOrdersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  buildingId?: number; // coreId

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  assetId?: number; // coreId

  @IsOptional()
  @IsEnum(WorkOrderStatus)
  status?: WorkOrderStatus;

  @IsOptional()
  @IsEnum(WorkOrderType)
  type?: WorkOrderType;
}
