/*
  Warnings:

  - The values [NEW,DISPATCHED,ACCEPTED,DONE] on the enum `WorkOrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [INSTALL,REPAIR] on the enum `WorkOrderType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to alter the column `status` on the `WorkOrder` table. The data in that column could be lost.
  - You are about to alter the column `type` on the `WorkOrder` table. The data in that column could be lost.

*/
-- AlterEnum
-- Note: PostgreSQL doesn't support ALTER ENUM directly, so we need to recreate it
-- First, create new enum types
CREATE TYPE "WorkOrderType_new" AS ENUM ('INSTALLATION', 'DIAGNOSTIC', 'RESEARCH', 'DEACTIVATE', 'REPAIR_CHANGE', 'ACTIVATE');
CREATE TYPE "WorkOrderStatus_new" AS ENUM ('CREATED', 'LINKED_TO_GROUP', 'IN_PROGRESS', 'COMPLETED', 'CANCELED');

-- Remove default from status column before changing type
ALTER TABLE "WorkOrder" ALTER COLUMN "status" DROP DEFAULT;

-- Update WorkOrder table to use new enum types
ALTER TABLE "WorkOrder" 
  ALTER COLUMN "type" TYPE "WorkOrderType_new" USING (
    CASE "type"::text
      WHEN 'INSTALL' THEN 'INSTALLATION'::"WorkOrderType_new"
      WHEN 'REPAIR' THEN 'REPAIR_CHANGE'::"WorkOrderType_new"
      WHEN 'DIAGNOSTIC' THEN 'DIAGNOSTIC'::"WorkOrderType_new"
      ELSE 'INSTALLATION'::"WorkOrderType_new"
    END
  ),
  ALTER COLUMN "status" TYPE "WorkOrderStatus_new" USING (
    CASE "status"::text
      WHEN 'NEW' THEN 'CREATED'::"WorkOrderStatus_new"
      WHEN 'DISPATCHED' THEN 'CREATED'::"WorkOrderStatus_new"
      WHEN 'ACCEPTED' THEN 'CREATED'::"WorkOrderStatus_new"
      WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::"WorkOrderStatus_new"
      WHEN 'DONE' THEN 'COMPLETED'::"WorkOrderStatus_new"
      WHEN 'CANCELED' THEN 'CANCELED'::"WorkOrderStatus_new"
      ELSE 'CREATED'::"WorkOrderStatus_new"
    END
  );

-- Drop old enum types
DROP TYPE "WorkOrderType";
DROP TYPE "WorkOrderStatus";

-- Rename new enum types
ALTER TYPE "WorkOrderType_new" RENAME TO "WorkOrderType";
ALTER TYPE "WorkOrderStatus_new" RENAME TO "WorkOrderStatus";

-- AlterTable
ALTER TABLE "WorkOrder" 
  ADD COLUMN "parentWorkOrderId" TEXT,
  ADD COLUMN "contactNumber" TEXT,
  ADD COLUMN "deadline" TIMESTAMP(3),
  ADD COLUMN "amountGel" DECIMAL(10,2),
  ADD COLUMN "inventoryProcessingType" TEXT,
  ADD COLUMN "techEmployeeComment" TEXT,
  ADD COLUMN "techHeadComment" TEXT,
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ALTER COLUMN "notes" SET DATA TYPE TEXT;

-- Set new default for status after type change
ALTER TABLE "WorkOrder" ALTER COLUMN "status" SET DEFAULT 'CREATED';

-- CreateTable
CREATE TABLE "WorkOrderAsset" (
    "workOrderId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderAsset_pkey" PRIMARY KEY ("workOrderId","assetId")
);

-- CreateTable
CREATE TABLE "WorkOrderProductUsage" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchId" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "filledBy" TEXT,
    "modifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrderProductUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeactivatedDevice" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "batchId" TEXT,
    "isWorkingCondition" BOOLEAN NOT NULL DEFAULT false,
    "checkedBy" TEXT,
    "checkedAt" TIMESTAMP(3),
    "transferredToStock" BOOLEAN NOT NULL DEFAULT false,
    "transferredBy" TEXT,
    "transferredAt" TIMESTAMP(3),
    "stockTransactionId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeactivatedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderNotification" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "positionId" TEXT,
    "value" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositionSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOrder_parentWorkOrderId_idx" ON "WorkOrder"("parentWorkOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderAsset_workOrderId_idx" ON "WorkOrderAsset"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderAsset_assetId_idx" ON "WorkOrderAsset"("assetId");

-- CreateIndex
CREATE INDEX "WorkOrderProductUsage_workOrderId_idx" ON "WorkOrderProductUsage"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderProductUsage_productId_idx" ON "WorkOrderProductUsage"("productId");

-- CreateIndex
CREATE INDEX "WorkOrderProductUsage_isApproved_idx" ON "WorkOrderProductUsage"("isApproved");

-- CreateIndex
CREATE INDEX "DeactivatedDevice_workOrderId_idx" ON "DeactivatedDevice"("workOrderId");

-- CreateIndex
CREATE INDEX "DeactivatedDevice_productId_idx" ON "DeactivatedDevice"("productId");

-- CreateIndex
CREATE INDEX "DeactivatedDevice_isWorkingCondition_idx" ON "DeactivatedDevice"("isWorkingCondition");

-- CreateIndex
CREATE INDEX "DeactivatedDevice_transferredToStock_idx" ON "DeactivatedDevice"("transferredToStock");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderNotification_workOrderId_employeeId_key" ON "WorkOrderNotification"("workOrderId", "employeeId");

-- CreateIndex
CREATE INDEX "WorkOrderNotification_workOrderId_idx" ON "WorkOrderNotification"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderNotification_employeeId_idx" ON "WorkOrderNotification"("employeeId");

-- CreateIndex
CREATE INDEX "WorkOrderNotification_readAt_idx" ON "WorkOrderNotification"("readAt");

-- CreateIndex
CREATE UNIQUE INDEX "PositionSetting_key_key" ON "PositionSetting"("key");

-- CreateIndex
CREATE INDEX "PositionSetting_key_idx" ON "PositionSetting"("key");

-- CreateIndex
CREATE INDEX "PositionSetting_positionId_idx" ON "PositionSetting"("positionId");

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_parentWorkOrderId_fkey" FOREIGN KEY ("parentWorkOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAsset" ADD CONSTRAINT "WorkOrderAsset_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderAsset" ADD CONSTRAINT "WorkOrderAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderProductUsage" ADD CONSTRAINT "WorkOrderProductUsage_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderProductUsage" ADD CONSTRAINT "WorkOrderProductUsage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderProductUsage" ADD CONSTRAINT "WorkOrderProductUsage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "StockBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeactivatedDevice" ADD CONSTRAINT "DeactivatedDevice_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeactivatedDevice" ADD CONSTRAINT "DeactivatedDevice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "InventoryProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderNotification" ADD CONSTRAINT "WorkOrderNotification_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderNotification" ADD CONSTRAINT "WorkOrderNotification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionSetting" ADD CONSTRAINT "PositionSetting_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
