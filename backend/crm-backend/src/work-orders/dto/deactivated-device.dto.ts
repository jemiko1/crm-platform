import { IsString, IsInt, Min, IsOptional } from "class-validator";
import { Type } from "class-transformer";

export class DeactivatedDeviceDto {
  @IsString()
  productId: string; // InventoryProduct internal ID

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @IsString()
  @IsOptional()
  batchId?: string; // Original StockBatch ID

  @IsString()
  @IsOptional()
  notes?: string;
}
