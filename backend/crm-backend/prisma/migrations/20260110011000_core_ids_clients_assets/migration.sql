/*
  Warnings:

  - The values [BUILDING_DOOR] on the enum `AssetType` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[coreId]` on the table `Asset` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[coreId]` on the table `Building` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `coreId` to the `Asset` table without a default value. This is not possible if the table is not empty.
  - Made the column `name` on table `Asset` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `coreId` to the `Building` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

-- AlterEnum
BEGIN;
CREATE TYPE "AssetType_new" AS ENUM ('ELEVATOR', 'ENTRANCE_DOOR', 'INTERCOM', 'SMART_GSM_GATE', 'SMART_DOOR_GSM', 'BOOM_BARRIER', 'OTHER');
ALTER TABLE "Asset" ALTER COLUMN "type" TYPE "AssetType_new" USING ("type"::text::"AssetType_new");
ALTER TYPE "AssetType" RENAME TO "AssetType_old";
ALTER TYPE "AssetType_new" RENAME TO "AssetType";
DROP TYPE "public"."AssetType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Asset" DROP CONSTRAINT "Asset_buildingId_fkey";

-- DropForeignKey
ALTER TABLE "WorkOrder" DROP CONSTRAINT "WorkOrder_buildingId_fkey";

-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "coreId" INTEGER NOT NULL,
ADD COLUMN     "ip" TEXT,
ADD COLUMN     "status" "DeviceStatus" NOT NULL DEFAULT 'UNKNOWN',
ALTER COLUMN "name" SET NOT NULL;

-- AlterTable
ALTER TABLE "Building" ADD COLUMN     "city" TEXT,
ADD COLUMN     "coreId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "coreId" INTEGER NOT NULL,
    "buildingId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "idNumber" TEXT,
    "paymentId" TEXT,
    "primaryPhone" TEXT,
    "secondaryPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalIdCounter" (
    "entity" TEXT NOT NULL,
    "nextId" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalIdCounter_pkey" PRIMARY KEY ("entity")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_coreId_key" ON "Client"("coreId");

-- CreateIndex
CREATE INDEX "Client_buildingId_idx" ON "Client"("buildingId");

-- CreateIndex
CREATE INDEX "Client_primaryPhone_idx" ON "Client"("primaryPhone");

-- CreateIndex
CREATE INDEX "Client_idNumber_idx" ON "Client"("idNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_coreId_key" ON "Asset"("coreId");

-- CreateIndex
CREATE INDEX "Asset_buildingId_idx" ON "Asset"("buildingId");

-- CreateIndex
CREATE INDEX "Asset_type_idx" ON "Asset"("type");

-- CreateIndex
CREATE INDEX "Asset_status_idx" ON "Asset"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Building_coreId_key" ON "Building"("coreId");

-- CreateIndex
CREATE INDEX "Building_name_idx" ON "Building"("name");

-- CreateIndex
CREATE INDEX "Building_city_idx" ON "Building"("city");

-- CreateIndex
CREATE INDEX "WorkOrder_buildingId_idx" ON "WorkOrder"("buildingId");

-- CreateIndex
CREATE INDEX "WorkOrder_assetId_idx" ON "WorkOrder"("assetId");

-- CreateIndex
CREATE INDEX "WorkOrder_status_idx" ON "WorkOrder"("status");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;
