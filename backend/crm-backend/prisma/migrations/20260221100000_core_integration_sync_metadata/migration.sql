-- AlterTable: add sync metadata to Building
ALTER TABLE "Building" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "Building" ADD COLUMN "coreUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Building" ADD COLUMN "coreCreatedAt" TIMESTAMP(3);
ALTER TABLE "Building" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Building" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable: add sync metadata to Client
ALTER TABLE "Client" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "coreUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "coreCreatedAt" TIMESTAMP(3);
ALTER TABLE "Client" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Client" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable: add sync metadata to Asset
ALTER TABLE "Asset" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "coreUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "coreCreatedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Asset" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateTable: SyncEvent (idempotency inbox)
CREATE TABLE "SyncEvent" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityCoreId" INTEGER,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "payload" JSONB,

    CONSTRAINT "SyncEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncEvent_eventId_key" ON "SyncEvent"("eventId");
CREATE INDEX "SyncEvent_status_idx" ON "SyncEvent"("status");
CREATE INDEX "SyncEvent_entityType_entityCoreId_idx" ON "SyncEvent"("entityType", "entityCoreId");
CREATE INDEX "SyncEvent_receivedAt_idx" ON "SyncEvent"("receivedAt");

-- CreateIndex: isActive indexes for filtered queries
CREATE INDEX "Building_isActive_idx" ON "Building"("isActive");
CREATE INDEX "Client_isActive_idx" ON "Client"("isActive");
CREATE INDEX "Asset_isActive_idx" ON "Asset"("isActive");
