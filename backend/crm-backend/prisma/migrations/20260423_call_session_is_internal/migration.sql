-- B7 (pre-launch audit): distinguish internal extension-to-extension calls
-- from real outbound. FreePBX uses `from-internal` context for both, so the
-- existing CallDirection=OUT classification is ambiguous. This column is
-- populated at ingest time when both caller and callee match known
-- TelephonyExtension rows; stats aggregations then exclude isInternal=true.

-- Nullable default false — safe on a populated table. No NOT NULL backfill
-- required (existing rows get the default implicitly).
ALTER TABLE "CallSession"
  ADD COLUMN IF NOT EXISTS "isInternal" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "CallSession_isInternal_idx" ON "CallSession"("isInternal");
