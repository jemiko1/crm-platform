-- New table for operator break sessions.
--
-- One row per break. `endedAt IS NULL` means the break is in progress.
-- Service layer enforces "at most one active row per user" invariant.
-- On end, `durationSec` and `endedAt` are stamped.
-- Cron-driven auto-close sets `isAutoEnded=true` and `autoEndReason`.

CREATE TABLE "OperatorBreakSession" (
  "id"            TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "extension"     TEXT NOT NULL,
  "startedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt"       TIMESTAMP(3),
  "durationSec"   INTEGER,
  "isAutoEnded"   BOOLEAN NOT NULL DEFAULT false,
  "autoEndReason" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OperatorBreakSession_pkey" PRIMARY KEY ("id")
);

-- User FK with cascade delete — break sessions have no meaning without
-- the operator row; if the User is hard-deleted, drop their history.
ALTER TABLE "OperatorBreakSession"
  ADD CONSTRAINT "OperatorBreakSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-user recent history lookup (primary access pattern).
CREATE INDEX "OperatorBreakSession_userId_startedAt_idx"
  ON "OperatorBreakSession"("userId", "startedAt" DESC);

-- Active-session scan (cron auto-close + manager "currently on break"
-- list filter on endedAt IS NULL). Also serves global time-range queries
-- via the endedAt NOT NULL filter plus the userId-scoped index below.
CREATE INDEX "OperatorBreakSession_endedAt_idx"
  ON "OperatorBreakSession"("endedAt");

-- Partial unique index: at most one ACTIVE (endedAt IS NULL) break per user.
-- Defense-in-depth against a TOCTOU race where two concurrent start()
-- calls from the same user (e.g. double-tap on the softphone Break
-- button before the first round-trip completes) both pass the "no
-- active session" check and try to create duplicate rows. Prisma's
-- standard @@unique can't express partial indexes, so this is raw SQL.
-- The service catches P2002 and surfaces it as ConflictException
-- ("already on break").
CREATE UNIQUE INDEX "OperatorBreakSession_userId_active_unique"
  ON "OperatorBreakSession"("userId")
  WHERE "endedAt" IS NULL;
