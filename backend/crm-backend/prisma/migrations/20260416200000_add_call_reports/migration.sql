-- AlterEnum: add CALL_CENTER to PermissionCategory
ALTER TYPE "PermissionCategory" ADD VALUE 'CALL_CENTER';

-- CreateEnum: CallReportStatus
CREATE TYPE "CallReportStatus" AS ENUM ('DRAFT', 'COMPLETED');

-- CreateTable: CallReport
CREATE TABLE "CallReport" (
    "id" TEXT NOT NULL,
    "callSessionId" TEXT NOT NULL,
    "callerClientId" TEXT,
    "paymentId" TEXT,
    "subjectClientId" TEXT,
    "clientBuildingId" TEXT,
    "buildingId" TEXT,
    "notes" TEXT,
    "operatorUserId" TEXT NOT NULL,
    "status" "CallReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CallReportLabel
CREATE TABLE "CallReportLabel" (
    "id" TEXT NOT NULL,
    "callReportId" TEXT NOT NULL,
    "categoryCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallReportLabel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: CallReport indexes
CREATE UNIQUE INDEX "CallReport_callSessionId_key" ON "CallReport"("callSessionId");
CREATE INDEX "CallReport_callSessionId_idx" ON "CallReport"("callSessionId");
CREATE INDEX "CallReport_buildingId_idx" ON "CallReport"("buildingId");
CREATE INDEX "CallReport_operatorUserId_idx" ON "CallReport"("operatorUserId");
CREATE INDEX "CallReport_status_idx" ON "CallReport"("status");
CREATE INDEX "CallReport_createdAt_idx" ON "CallReport"("createdAt");
CREATE INDEX "CallReport_paymentId_idx" ON "CallReport"("paymentId");

-- CreateIndex: CallReportLabel indexes
CREATE UNIQUE INDEX "CallReportLabel_callReportId_categoryCode_key" ON "CallReportLabel"("callReportId", "categoryCode");
CREATE INDEX "CallReportLabel_callReportId_idx" ON "CallReportLabel"("callReportId");
CREATE INDEX "CallReportLabel_categoryCode_idx" ON "CallReportLabel"("categoryCode");

-- CreateIndex: ClientBuilding.paymentId index
CREATE INDEX "ClientBuilding_paymentId_idx" ON "ClientBuilding"("paymentId");

-- AddForeignKey: CallReport relations
ALTER TABLE "CallReport" ADD CONSTRAINT "CallReport_callSessionId_fkey" FOREIGN KEY ("callSessionId") REFERENCES "CallSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CallReport" ADD CONSTRAINT "CallReport_callerClientId_fkey" FOREIGN KEY ("callerClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallReport" ADD CONSTRAINT "CallReport_subjectClientId_fkey" FOREIGN KEY ("subjectClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallReport" ADD CONSTRAINT "CallReport_clientBuildingId_fkey" FOREIGN KEY ("clientBuildingId") REFERENCES "ClientBuilding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallReport" ADD CONSTRAINT "CallReport_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CallReport" ADD CONSTRAINT "CallReport_operatorUserId_fkey" FOREIGN KEY ("operatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: CallReportLabel relations
ALTER TABLE "CallReportLabel" ADD CONSTRAINT "CallReportLabel_callReportId_fkey" FOREIGN KEY ("callReportId") REFERENCES "CallReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
