import { IsString, IsInt, Min, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class ProductUsageDto {
  @IsString()
  productId: string; // InventoryProduct internal ID

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsString()
  @IsOptional()
  batchId?: string; // StockBatch ID for FIFO tracking
}
