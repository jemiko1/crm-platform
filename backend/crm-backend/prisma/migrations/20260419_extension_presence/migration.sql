-- AlterTable: add SIP presence tracking to TelephonyExtension
ALTER TABLE "TelephonyExtension"
    ADD COLUMN "sipRegistered" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "sipLastSeenAt" TIMESTAMP(3);

-- CreateIndex: support stale-registration sweep (sipRegistered=true AND sipLastSeenAt < threshold)
CREATE INDEX "TelephonyExtension_sipRegistered_sipLastSeenAt_idx" ON "TelephonyExtension"("sipRegistered", "sipLastSeenAt");
