-- CreateTable: ClientBuilding join table for many-to-many relationship
CREATE TABLE "ClientBuilding" (
    "clientId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientBuilding_pkey" PRIMARY KEY ("clientId", "buildingId")
);

-- Migrate existing data: Copy all existing client-building relationships to join table
INSERT INTO "ClientBuilding" ("clientId", "buildingId", "createdAt")
SELECT "id" as "clientId", "buildingId", "createdAt"
FROM "Client"
WHERE "buildingId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "ClientBuilding_buildingId_idx" ON "ClientBuilding"("buildingId");

-- CreateIndex
CREATE INDEX "ClientBuilding_clientId_idx" ON "ClientBuilding"("clientId");

-- AddForeignKey
ALTER TABLE "ClientBuilding" ADD CONSTRAINT "ClientBuilding_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientBuilding" ADD CONSTRAINT "ClientBuilding_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex: Remove old index on buildingId
DROP INDEX IF EXISTS "Client_buildingId_idx";

-- AlterTable: Remove buildingId column from Client
ALTER TABLE "Client" DROP COLUMN "buildingId";
