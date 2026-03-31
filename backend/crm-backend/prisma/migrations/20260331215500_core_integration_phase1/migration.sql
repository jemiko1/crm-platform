-- Core Integration Phase 1: Schema changes for building/client/device sync
-- Adds new fields to Building, Client, Asset
-- Restructures ClientBuilding from composite PK to UUID PK with apartment data
-- Adds BuildingContact and SyncCheckpoint models

-- ============================================
-- Building: add new fields
-- ============================================
ALTER TABLE "Building" ADD COLUMN "phone" TEXT;
ALTER TABLE "Building" ADD COLUMN "email" TEXT;
ALTER TABLE "Building" ADD COLUMN "identificationCode" TEXT;
ALTER TABLE "Building" ADD COLUMN "numberOfApartments" INTEGER;
ALTER TABLE "Building" ADD COLUMN "disableCrons" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Building" ADD COLUMN "branchId" INTEGER;
ALTER TABLE "Building" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- Make coreId nullable (to support manual buildings without core link)
ALTER TABLE "Building" ALTER COLUMN "coreId" DROP NOT NULL;

-- ============================================
-- Client: add new fields
-- ============================================
ALTER TABLE "Client" ADD COLUMN "email" TEXT;
ALTER TABLE "Client" ADD COLUMN "state" TEXT DEFAULT 'ACTIVE';
ALTER TABLE "Client" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- Make coreId nullable (to support manual clients without core link)
ALTER TABLE "Client" ALTER COLUMN "coreId" DROP NOT NULL;

-- ============================================
-- Asset: add new fields
-- ============================================
ALTER TABLE "Asset" ADD COLUMN "port" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "productId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "assignedBuildingCoreId" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "door1" TEXT;
ALTER TABLE "Asset" ADD COLUMN "door2" TEXT;
ALTER TABLE "Asset" ADD COLUMN "door3" TEXT;
ALTER TABLE "Asset" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- Make coreId nullable (to support manual assets without core link)
ALTER TABLE "Asset" ALTER COLUMN "coreId" DROP NOT NULL;

-- ============================================
-- ClientBuilding: restructure from composite PK to UUID PK
-- ============================================

-- Step 1: Drop existing primary key and indexes
ALTER TABLE "ClientBuilding" DROP CONSTRAINT "ClientBuilding_pkey";

-- Step 2: Add new columns
ALTER TABLE "ClientBuilding" ADD COLUMN "id" TEXT;
ALTER TABLE "ClientBuilding" ADD COLUMN "apartmentCoreId" INTEGER;
ALTER TABLE "ClientBuilding" ADD COLUMN "apartmentNumber" TEXT;
ALTER TABLE "ClientBuilding" ADD COLUMN "entranceNumber" TEXT;
ALTER TABLE "ClientBuilding" ADD COLUMN "floorNumber" TEXT;
ALTER TABLE "ClientBuilding" ADD COLUMN "paymentId" TEXT;
ALTER TABLE "ClientBuilding" ADD COLUMN "balance" DOUBLE PRECISION;
ALTER TABLE "ClientBuilding" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Step 3: Generate UUIDs for existing rows
UPDATE "ClientBuilding" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;

-- Step 4: Set as new primary key
ALTER TABLE "ClientBuilding" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "ClientBuilding" ADD CONSTRAINT "ClientBuilding_pkey" PRIMARY KEY ("id");

-- Step 5: Add composite unique constraint (replaces old composite PK)
CREATE UNIQUE INDEX "ClientBuilding_clientId_buildingId_apartmentCoreId_key" ON "ClientBuilding"("clientId", "buildingId", "apartmentCoreId");

-- ============================================
-- BuildingContact: new model
-- ============================================
CREATE TABLE "BuildingContact" (
    "id" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "coreId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "documentId" TEXT,
    "clientId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildingContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BuildingContact_coreId_key" ON "BuildingContact"("coreId");
CREATE INDEX "BuildingContact_buildingId_idx" ON "BuildingContact"("buildingId");
CREATE INDEX "BuildingContact_type_idx" ON "BuildingContact"("type");

ALTER TABLE "BuildingContact" ADD CONSTRAINT "BuildingContact_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BuildingContact" ADD CONSTRAINT "BuildingContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- SyncCheckpoint: new model
-- ============================================
CREATE TABLE "SyncCheckpoint" (
    "entity" TEXT NOT NULL,
    "lastPolledAt" TIMESTAMP(3) NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncCheckpoint_pkey" PRIMARY KEY ("entity")
);

-- ============================================
-- New indexes
-- ============================================
CREATE INDEX "Building_source_idx" ON "Building"("source");
CREATE INDEX "Client_state_idx" ON "Client"("state");
CREATE INDEX "Client_source_idx" ON "Client"("source");
CREATE INDEX "Asset_source_idx" ON "Asset"("source");
