import { IsString, IsNotEmpty, IsNumber, IsOptional, IsEnum, IsDateString, Min, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ProductCategory, ProductUnit, PurchaseOrderStatus, StockTransactionType } from '@prisma/client';

// ===== PRODUCT DTOs =====
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ProductCategory)
  category: ProductCategory;

  @IsEnum(ProductUnit)
  @IsOptional()
  unit?: ProductUnit;

  @IsNumber()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;
}

export class UpdateProductDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ProductCategory)
  @IsOptional()
  category?: ProductCategory;

  @IsEnum(ProductUnit)
  @IsOptional()
  unit?: ProductUnit;

  @IsNumber()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;
}

// ===== PURCHASE ORDER DTOs =====
export class PurchaseOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  purchasePrice: number;

  @IsNumber()
  @Min(0)
  sellPrice: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  @IsNotEmpty()
  supplierName: string;

  @IsString()
  @IsOptional()
  supplierEmail?: string;

  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @IsDateString()
  @IsOptional()
  expectedDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  items: PurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderDto {
  @IsString()
  @IsOptional()
  supplierName?: string;

  @IsString()
  @IsOptional()
  supplierEmail?: string;

  @IsDateString()
  @IsOptional()
  orderDate?: string;

  @IsDateString()
  @IsOptional()
  expectedDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderItemDto)
  @IsOptional()
  items?: PurchaseOrderItemDto[];
}

export class UpdatePurchaseOrderStatusDto {
  @IsEnum(PurchaseOrderStatus)
  status: PurchaseOrderStatus;

  @IsDateString()
  @IsOptional()
  receivedDate?: string;
}

// ===== STOCK TRANSACTION DTOs =====
export class CreateStockAdjustmentDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsEnum(StockTransactionType)
  type: StockTransactionType;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

class WorkOrderItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class DeductStockForWorkOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkOrderItemDto)
  items: WorkOrderItemDto[];

  @IsString()
  @IsNotEmpty()
  workOrderId: string;

  @IsString()
  @IsOptional()
  performedBy?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
