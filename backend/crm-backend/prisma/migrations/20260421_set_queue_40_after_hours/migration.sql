-- Mark Asterisk queue "40" as the non-working-hours queue.
--
-- Background (April 2026 audit):
--   Asterisk is configured to route out-of-hours calls to queue 40 via IVR.
--   The backend's classifyMissedReason() sets reason=OUT_OF_HOURS on any
--   MissedCall whose CallSession's queue has isAfterHoursQueue=true. Without
--   this flag, those calls fall back to reason=NO_ANSWER and mix in with
--   regular business-hours missed calls.
--
-- Idempotent: only updates if the row exists, leaves other queues alone.
-- Running twice is a no-op.
UPDATE "TelephonyQueue"
SET "isAfterHoursQueue" = true
WHERE "name" = '40' AND "isAfterHoursQueue" = false;
