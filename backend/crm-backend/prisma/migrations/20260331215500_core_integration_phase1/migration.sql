-- Core Integration Phase 1: Schema changes for building/client/device sync
-- Adds new fields to Building, Client, Asset
-- Restructures ClientBuilding from composite PK to UUID PK with apartment data
-- Adds BuildingContact and SyncCheckpoint models

-- ============================================
-- Building: add new fields
-- ============================================
ALTER TABLE "Building" ADD COLUMN "phone" TEXT;
ALTER TABLE "Building" ADD COLUMN "email" TEXT;
ALTER TABLE "Building" ADD COLUMN "numberOfApartments" INTEGER;
ALTER TABLE "Building" ADD COLUMN "disableCrons" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Building" ADD COLUMN "branchId" INTEGER;

-- Make coreId nullable (to support manual buildings without core link)
ALTER TABLE "Building" ALTER COLUMN "coreId" DROP NOT NULL;

-- ============================================
-- Client: add new fields
-- ============================================
ALTER TABLE "Client" ADD COLUMN "email" TEXT;

-- Make coreId nullable (to support manual clients without core link)
ALTER TABLE "Client" ALTER COLUMN "coreId" DROP NOT NULL;

-- Drop source and state columns if they exist (from earlier migration attempt)
-- These are handled by coreId presence (coreId != null = synced from core)

-- ============================================
-- Asset: add new fields
-- ============================================
-- Change port from Int to Text (core DB stores as varchar with mixed content)
ALTER TABLE "Asset" ALTER COLUMN "port" TYPE TEXT USING port::text;

ALTER TABLE "Asset" ADD COLUMN "productId" TEXT;
ALTER TABLE "Asset" ADD COLUMN "assignedBuildingCoreId" INTEGER;
ALTER TABLE "Asset" ADD COLUMN "door1" TEXT;
ALTER TABLE "Asset" ADD COLUMN "door2" TEXT;
ALTER TABLE "Asset" ADD COLUMN "door3" TEXT;

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
-- NULLS NOT DISTINCT prevents duplicate rows when apartmentCoreId is null (PG16+)
CREATE UNIQUE INDEX "ClientBuilding_clientId_buildingId_apartmentCoreId_key" ON "ClientBuilding"("clientId", "buildingId", "apartmentCoreId") NULLS NOT DISTINCT;

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
-- New/updated indexes
-- ============================================
CREATE INDEX "Building_coreId_idx" ON "Building"("coreId");
CREATE INDEX "Client_coreId_idx" ON "Client"("coreId");
CREATE INDEX "Asset_coreId_idx" ON "Asset"("coreId");

-- Drop source-related indexes and columns (source not needed; coreId presence is sufficient)
DROP INDEX IF EXISTS "Building_source_idx";
DROP INDEX IF EXISTS "Client_source_idx";
DROP INDEX IF EXISTS "Asset_source_idx";
DROP INDEX IF EXISTS "Client_state_idx";

ALTER TABLE "Building" DROP COLUMN IF EXISTS "source";
ALTER TABLE "Building" DROP COLUMN IF EXISTS "identificationCode";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "source";
ALTER TABLE "Client" DROP COLUMN IF EXISTS "state";
ALTER TABLE "Asset" DROP COLUMN IF EXISTS "source";
