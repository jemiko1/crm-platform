-- Adds silence-after-first-reply SLA thresholds to the escalation config.
-- Part of the April 2026 audit follow-up (Q1 decision B): after the operator
-- sends their first reply, each new customer message starts a silence clock.
-- If the operator doesn't respond within these thresholds, warn/unassign fires.
--
-- Both columns default to sensible minutes so rollout is seamless. Set either
-- to 0 via the admin panel to disable that side of the check.

ALTER TABLE "ClientChatEscalationConfig"
  ADD COLUMN "postReplyTimeoutMins" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "ClientChatEscalationConfig"
  ADD COLUMN "postReplyReassignAfterMins" INTEGER NOT NULL DEFAULT 20;
