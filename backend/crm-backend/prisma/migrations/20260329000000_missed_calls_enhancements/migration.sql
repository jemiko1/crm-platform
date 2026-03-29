-- AlterEnum
-- Add new statuses to MissedCallStatus enum
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction.
-- Prisma detects this and runs the migration outside a transaction block.
ALTER TYPE "MissedCallStatus" ADD VALUE IF NOT EXISTS 'CLAIMED';
ALTER TYPE "MissedCallStatus" ADD VALUE IF NOT EXISTS 'ATTEMPTED';
ALTER TYPE "MissedCallStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';

-- Add new columns to MissedCall
ALTER TABLE "MissedCall" ADD COLUMN IF NOT EXISTS "claimedByUserId" TEXT;
ALTER TABLE "MissedCall" ADD COLUMN IF NOT EXISTS "claimedAt" TIMESTAMP(3);
ALTER TABLE "MissedCall" ADD COLUMN IF NOT EXISTS "resolvedByCallSessionId" TEXT;
ALTER TABLE "MissedCall" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3);

-- Add foreign keys
DO $$ BEGIN
  ALTER TABLE "MissedCall" ADD CONSTRAINT "MissedCall_claimedByUserId_fkey"
    FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "MissedCall" ADD CONSTRAINT "MissedCall_resolvedByCallSessionId_fkey"
    FOREIGN KEY ("resolvedByCallSessionId") REFERENCES "CallSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add indexes
CREATE INDEX IF NOT EXISTS "MissedCall_claimedByUserId_idx" ON "MissedCall"("claimedByUserId");
CREATE INDEX IF NOT EXISTS "MissedCall_callerNumber_status_idx" ON "MissedCall"("callerNumber", "status");
