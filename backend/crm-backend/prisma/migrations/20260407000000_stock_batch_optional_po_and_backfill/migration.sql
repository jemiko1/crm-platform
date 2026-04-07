-- AlterTable: Make purchaseOrderItemId optional on StockBatch
-- This allows creating "adjustment batches" not tied to purchase orders
ALTER TABLE "StockBatch" ALTER COLUMN "purchaseOrderItemId" DROP NOT NULL;

-- Backfill: Create StockBatch records for products that have currentStock > 0 but no batches
-- This fixes the FIFO deduction bug where stock added via seed/adjustment had no batches
INSERT INTO "StockBatch" (id, "productId", "initialQuantity", "remainingQuantity", "purchasePrice", "sellPrice", "receivedDate", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  ip.id,
  ip."currentStock",
  ip."currentStock",
  0,
  0,
  ip."createdAt",
  NOW(),
  NOW()
FROM "InventoryProduct" ip
WHERE ip."currentStock" > 0
  AND ip."isActive" = true
  AND NOT EXISTS (
    SELECT 1 FROM "StockBatch" sb
    WHERE sb."productId" = ip.id
    AND sb."remainingQuantity" > 0
  );
