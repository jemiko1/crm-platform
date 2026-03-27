-- AlterTable
ALTER TABLE "InventoryProduct" ADD COLUMN "reservedStock" INTEGER NOT NULL DEFAULT 0;

-- AlterEnum
ALTER TYPE "StockTransactionType" ADD VALUE 'RESERVATION_HOLD';
ALTER TYPE "StockTransactionType" ADD VALUE 'RESERVATION_RELEASE';
ALTER TYPE "StockTransactionType" ADD VALUE 'REVERSAL_IN';
