-- P0-G stats correctness (M7): add finalizedAt to freeze terminal call fields
-- on the first concrete call_end event. See audit/STATS_STANDARDS.md for
-- decision rationale (field-level merge; disposition/endAt/hangupCause
-- frozen once set; non-terminal fields may still patch if previously null).
--
-- No CallLeg schema change: the CallLeg model + CallLegType enum already
-- exist (see prisma/schema.prisma lines 1541-1559 and 2085-2089). This
-- migration is additive on CallSession only.

ALTER TABLE "CallSession" ADD COLUMN "finalizedAt" TIMESTAMP(3);
