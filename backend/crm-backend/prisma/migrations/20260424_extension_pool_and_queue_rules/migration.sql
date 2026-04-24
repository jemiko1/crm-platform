-- Extension pool model + position-queue rules (April 2026).
--
-- Goal:
--   1. Make TelephonyExtension.crmUserId nullable so unlinked rows can sit in
--      a "pool" (pre-provisioned in FreePBX, unassigned in CRM). Admin then
--      links employee → extension from the Telephony admin UI.
--   2. Replace the hardcoded "Call Center Operator" position check with a
--      data-driven PositionQueueRule join table. Any position can be mapped
--      to any set of queues; AMI QueueAdd/Remove is driven by these rules.
--
-- Safety notes:
--   - Step 1 changes the FK cascade from CASCADE to SET NULL. Existing rows
--     are untouched (no data migration needed — all current extensions are
--     linked, crmUserId stays populated).
--   - The previous `TelephonyExtension_crmUserId_key` unique index on a NOT
--     NULL column continues to work on a nullable column in Postgres — NULLs
--     are treated as distinct, so many pool rows can coexist.
--   - FreePBX is the source of truth for extension config. CRM does not
--     write back to it; therefore no sync-status tracking is needed.

-- 1. TelephonyExtension: make crmUserId nullable + relax FK cascade ---------
ALTER TABLE "TelephonyExtension"
  ALTER COLUMN "crmUserId" DROP NOT NULL;

ALTER TABLE "TelephonyExtension"
  DROP CONSTRAINT IF EXISTS "TelephonyExtension_crmUserId_fkey";

ALTER TABLE "TelephonyExtension"
  ADD CONSTRAINT "TelephonyExtension_crmUserId_fkey"
  FOREIGN KEY ("crmUserId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. PositionQueueRule -------------------------------------------------------
CREATE TABLE IF NOT EXISTS "PositionQueueRule" (
  "id"          TEXT NOT NULL,
  "positionId"  TEXT NOT NULL,
  "queueId"     TEXT NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PositionQueueRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PositionQueueRule_positionId_queueId_key"
  ON "PositionQueueRule" ("positionId", "queueId");

CREATE INDEX IF NOT EXISTS "PositionQueueRule_queueId_idx"
  ON "PositionQueueRule" ("queueId");

ALTER TABLE "PositionQueueRule"
  ADD CONSTRAINT "PositionQueueRule_positionId_fkey"
  FOREIGN KEY ("positionId") REFERENCES "Position"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict (not Cascade) on queue delete: queues are upsert-only today, but
-- if an admin ever deletes one manually we want the operation to fail loudly
-- rather than silently wiping every Position → Queue rule that pointed at it.
ALTER TABLE "PositionQueueRule"
  ADD CONSTRAINT "PositionQueueRule_queueId_fkey"
  FOREIGN KEY ("queueId") REFERENCES "TelephonyQueue"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
