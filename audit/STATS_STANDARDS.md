# Statistics correctness standards — decision log

Scope: settle three ambiguous semantics in CRM28's telephony statistics pipeline before implementing P0-G fixes (see `audit/PHASE1_SUMMARY.md` §"Phase 4 fix plan" item 6). The goal is to pick defaults a manager who has previously used Genesys, Five9, Amazon Connect, or Cisco UCCE would recognize — and that an external auditor can defend.

Branch at decision time: `audit/phase0/orient`. Commit: `dc0f02a`.

## Summary

- **M3 (missing CallMetrics in SLA)**: choose **(c) — include in denominator as "unknown", surface a data-quality indicator**. Treating silently-dropped calls as "met" (current) is indefensible; treating them all as "not met" punishes operators for ingest bugs. ICMI and COPC both insist the denominator reflect reality; the only safe way to reconcile that with a non-zero data-loss rate is to expose the exclusion explicitly.
- **M5 (transferred-call agent attribution)**: choose **(d) — two metrics: "handled" (primary handler by longest connected seconds) + "touched" (any leg)**. Amazon Connect's contact-chain model implicitly credits every agent who had a contact record; Genesys, Five9, and Cisco UCCE all report transfer-in / transfer-out as separate columns alongside "handled". Splitting primary from touched gives managers both views without double-counting call volume.
- **M7 (replayed `call_end` event)**: choose **(c) — field-level merge, disposition frozen from first finalization, later events may patch recording/metrics/endAt only if previously null**. Asterisk itself finalizes CDR immutably at hangup; our internal model must mirror that contract or CDR-after-AMI replay will continue to flip answered/busy/noanswer.

---

## Research notes

### M3 — missing CallMetrics handling

#### Industry references

- **ICMI — Service Level Calculations handout** (`icmi.com/files/StudentResourcePage/CCMetrics/Service_Level_Calculations_Handout.pdf`). ICMI's recommended SLA formula is `(answered in X sec + abandoned in X sec) / (total answered + total abandoned)`. The denominator must represent **real interactions**, not only the ones for which a wait-time measurement exists. ICMI's "10-point checklist" for service level begins with *"decide how to classify abandoned calls: counted, missed opportunities, or ignored"* — the decision is **deliberate and documented**, never silent.
- **COPC — "Service Level: Are You Measuring It the Wrong Way?"** (`copc.com/service-level-are-you-measuring-it-the-wrong-way/`). COPC explicitly rules out two common shortcuts: (1) calculating service level over calls handled only ("definitely not"), and (2) excluding abandoned calls below a threshold ("no"). The rationale is that every exclusion is an implicit redefinition of the metric and must be visible to whoever reads the dashboard.
- **Genesys Cloud — Service Level glossary** (`help.genesys.cloud/glossary/service-level/`). Numerator = `Answered Count – SLA Violation Count`. Denominator is configurable via three toggles (*Include Flowouts*, *Include Abandons*, *Include Short Abandons*). The toggles are **retroactive** and visible to the report reader. The default denominator is answered count, but every deviation from "default" is a persisted configuration choice the admin can see.
- **Amazon Connect — metrics definitions** (`docs.aws.amazon.com/connect/latest/adminguide/metrics-definitions.html`). Service level is defined over contacts that reached the queue. Contacts that never produced a queued record (e.g. drop before queue entry) don't show up in the denominator but also don't show up anywhere else — they're filtered upstream by definition, not silently dropped from a downstream aggregation.
- **Call Centre Helper — "Calls Answered Within SLA Calculation"** (`callcentrehelper.com/calls-answered-within-sla-calculation-207021.htm`). Catalogues four formulas in common use (answered-only, offered-only, ICMI middle ground, exclude-short-abandons). Every single one has a deterministic rule for how *every* call counts; none of them silently drop calls for which the measurement system failed to produce a data point.
- **CallMiner — "Call Center Service Levels: Calculations & Standards"** (`callminer.com/blog/call-center-service-levels-calculations`). Reiterates the ICMI standard and stresses denominator transparency for audit purposes.
- **Data-quality-dashboard literature** (Microsoft Purview, dbt, Alation, Telmai). Consensus pattern: when a metric is computed over a subset of records because some failed validation, the dashboard must expose a *completeness* indicator (`excluded / total`). If the exclusion rate drifts, an operator notices; if it is hidden in code, the metric silently degrades.

#### Analysis

Today `TelephonyStatsService` runs `sessions.filter(s => s.callMetrics)` before averaging every speed / quality KPI. When AMI crashes during a `call_end`, the CallSession row exists but the CallMetrics row does not, and the call **disappears** from every average. The SLA numerator uses `isSlaMet === true`, and the denominator uses `isSlaMet !== null`. A session without CallMetrics is excluded from both. Three failure modes result:

1. **SLA% inflation.** If ingest crashes during the 10s of the day when calls are also spiking (e.g. Monday 09:00), exactly the calls that most likely missed SLA also most likely lost their metrics row. SLA% reads "98%" when it should read "84%".
2. **Average answer time inflation.** Missing-metrics calls were disproportionately the long, messy ones. Their exclusion pulls the average toward the clean calls.
3. **Quiet regression when ingest breaks.** If the P0-E socket fix or any future ingest change raises the missing-metrics rate from 0.5% → 5%, the dashboard *looks better*, not worse. A manager investigating "why did our SLA jump?" finds nothing — the cause is invisible.

Three defensible options exist.

- **(a) Current — exclude from denominator.** Violates COPC explicit guidance. Silent rate-change means regressions go undetected. Reject.
- **(b) Include as "not met".** Punishes operators for ingest failures that are not their fault. Also creates a perverse incentive: if managers see a low SLA, engineers might suppress the exclusion rather than fix ingest. Reject unless no other option works.
- **(c) Include as "unknown" with dashboard indicator.** SLA% denominator = sessions with non-null disposition (the universe of "we know this call happened"). Numerator = `isSlaMet=true`. Sessions with missing CallMetrics are neither numerator nor excluded — they sit in an "unmeasured" bucket shown next to SLA% as "data quality: 99.3%" (or whichever number it resolves to). If data quality drops below 95%, the dashboard colours the KPI amber. This is what Genesys' retroactive toggles effectively do — they force the report reader to acknowledge the denominator.

Option (c) is the only one that satisfies ICMI (denominator reflects reality), COPC (no silent exclusions), and normal data-engineering practice (completeness metric alongside the derived KPI).

#### Decision

**M3 = (c).** SLA% denominator is total sessions in the time window with `disposition IS NOT NULL` (i.e. we know the call finished). Sessions with missing CallMetrics count toward neither numerator nor denominator of the *internal* SLA ratio, BUT are surfaced as a separate `dataQualityPercent = sessionsWithMetrics / totalSessions`. The UI shows both numbers side-by-side.

Rationale (one-line): Silent exclusion is indefensible under audit; including as "not met" punishes ingest failures; making the data-loss rate visible is the only way the KPI stays trustworthy when the pipeline has bugs.

### M5 — transferred call attribution

#### Industry references

- **Amazon Connect — contact chains and contact attributes** (`docs.aws.amazon.com/connect/latest/adminguide/contacts-contact-chains-attributes.html`). Verbatim: *"Each time a contact is connected to an agent, a new contact record is created."* A call transferred between 3 agents produces 3 contact records, each linked via `initial / previous / next` contactId fields. The "Contacts Handled" metric is computed by summing contact records per agent — so if a customer's call hits Agent A then transfers to Agent B then transfers to Agent C, each of A, B, C individually counts one "handled". The overall call volume is reported as 1 via the contact-chain rollup.
- **Genesys — Call Transaction Record glossary** (`docs.genesys.com/Glossary:Call_Transaction_Record`). A CTR records "the entire history of each telephone call as it progresses through the contact center". Handle time is reported per agent per leg, not consolidated to the final agent.
- **Genesys Cloud — "Calls Offered and Calls Handled by an Agent"** (`community.genesys.com/discussion/calls-offered-and-calls-handled-by-an-agent-interaction-view`). Interaction view counts calls offered to the agent (presented, including rejected) vs handled (accepted and engaged). Transfer targets who accepted get a "handled" credit; transfer initiators are counted on their own offered/handled side separately.
- **Cisco UCCE — Reporting Concepts, Agent chapter** (`cisco.com/c/en/us/td/.../reporting-concepts-for-ucce_chapter_0110.html`). The "Handled" metric in `Agent_Skill_Group_Interval` counts inbound calls answered by an agent and completed with wrap-up in that interval. Transfers-in and transfers-out are reported as **separate columns** alongside Handled, so a call transferred from Agent A to Agent B shows up in: A's "Handled" (A picked up and wrapped up, even if only briefly) and A's "Transferred Out" and B's "Handled" and B's "Transferred In". Volume is not de-duplicated — the caller's single call contributes to Handled=2 across the agent pool.
- **Talkdesk — Workforce Management Glossary** (`support.talkdesk.com/hc/en-us/articles/360043909512`). "Handled calls" are those where the agent's activity record shows they accepted and completed the interaction. Transferred calls show up in activity for every agent segment.
- **Five9 — "Mastering Contact Center Metrics"** (`five9.com/blog/mastering-contact-center-metrics-guide-success`). Agent-level "Calls Handled" is counted per agent work session, not per end-to-end call. Transfers are reported separately.
- **Zoom / Zendesk / RingCentral** blog KPI guides. Converge on the same pattern: **"Calls Handled" is per-agent, per-leg**; call volume is reported separately from agent productivity.
- **Call Centre Helper — "20 Sneaky Tricks"** (`callcentrehelper.com/7-tricks-that-call-centre-employees-play-67004.htm`). Article #5 calls out the abuse pattern of "transferring the call just before wrap-up so the initiating agent still gets Handled credit, and the receiving agent absorbs the AHT." This is only an abuse if handled is attributed to the initiator — confirming that **the industry convention is to credit every agent who engaged**, which makes the abuse possible (both initiator and recipient get credit) and managers detect it via the transfer rate.
- **Zoom — "38 must-know call center metrics for 2026"** (`zoom.com/en/blog/call-center-metrics/`). Explicitly distinguishes "Calls Touched" (broader, includes any leg) from "Calls Handled" (completed engagement). Presents both as healthy complementary metrics.

#### Analysis

Today `handleTransfer` in `telephony-ingestion.service.ts` overwrites `CallSession.assignedUserId` with the transfer target. Every agent-breakdown query reads `assignedUserId`, so the originating operator loses all credit — their connect seconds, their wait-time-to-answer contribution, their talk seconds, all attributed to the target. This has three consequences:

1. **Productivity reports undercount the real workforce.** An operator who answered 40 calls but transferred 5 of them appears as 35 calls. Management looking at load distribution sees a false picture.
2. **Transfer-initiation skill (a coaching metric) is invisible.** Good operators know when to transfer; their practice is actively rewarded by AHT and actively punished by the current "handled" count.
3. **Audit of coverage gaps fails.** If Operator X is on 100% of transferred calls as the target, that is a distinct problem (overspecialisation, single point of failure) from "X takes 100% of inbound calls". Current model conflates them.

Options:

- **(a) Credit only the final assignee.** What we do today. Indefensible per every vendor referenced above.
- **(b) Credit every agent on any leg.** Matches Amazon Connect's contact-chain semantics. Simple to implement. But a call that rings an agent for 2 seconds (agent rejected) should probably not count for that agent the same as a 15-minute engagement.
- **(c) Credit primary handler by longest-connected seconds.** Cleanest single-metric answer. But loses the "touched" signal entirely.
- **(d) Two metrics: handled (primary) + touched (any involvement).** Matches Zoom's explicit distinction and Cisco UCCE's multi-column model. Backend data model already supports this — `CallLeg` rows per (callSessionId, userId, type=AGENT) with connected/disconnected timestamps are already being stored. Nothing new to capture; just different aggregation queries.
- **(e) Industry standard.** Industry standard is in fact **(d) — report handled per-agent with each agent counted once per engagement, plus separate transfer-in / transfer-out / touched counts**. Genesys, Five9, Cisco, Amazon Connect all do variations of this. "Handled" per-agent is summed across legs — the call volume number ("totalCalls" at the organisation level) comes from CallSession not CallLeg and stays correct; only the agent-breakdown switches.

Picking (d) over (b): (b) lets a 1-second ring inflate the touched number for an agent who did no real work. Primary-handler by longest connected seconds gives a clean "this is who really worked the call" number, while touched gives "who had any part in it". A manager running a coaching session with Operator X wants both.

#### Decision

**M5 = (d).** Define two KPIs:
- `handledByAgent(userId, window)` = count of CallSessions where the longest-connected AGENT leg belongs to userId. Sum of connected seconds on that leg feeds talk/hold/wrap-up averages for that agent.
- `touchedByAgent(userId, window)` = count of CallSessions where userId has any AGENT leg with connected > 0.

Backend aggregation reads CallLeg, not `CallSession.assignedUserId`. `CallSession.assignedUserId` is retained for UI "currently-on-call" display but is not used in statistics math. Transfer count (`CallMetrics.transfersCount`) is preserved per-session as it is today.

Rationale (one-line): Every major vendor (Amazon Connect, Genesys, Cisco UCCE, Five9) credits each agent who engaged with the call rather than only the final assignee; splitting into primary + touched mirrors Zoom/ICMI practice and lets managers see both "who did the work" and "who was involved".

### M7 — call_end replay

#### Industry references

- **Asterisk — CDR Specification** (`docs.asterisk.org/Configuration/Reporting/Call-Detail-Records-CDR/CDR-Specification/`). Verbatim: *"When a CDR is finalized, no further modifications can be made to the CDR by the user or Asterisk."* CDR finalization triggers: dial completes with a non-ANSWER status, bridge ends, either channel hangs up, or a fork with the finalize-on-fork flag set. Post-finalization, every field — including `disposition`, `dstchannel`, `billsec` — is **locked**. This is explicitly described as an **audit-integrity feature**.
- **Asterisk — CDR module configuration** (`docs.asterisk.org/.../Module_Configuration/cdr/`). Confirms that `endbeforehexten` and the 'h' extension produce *new* CDRs rather than mutating finalized ones. The immutable-after-finalization contract is load-bearing in the Asterisk codebase.
- **Asterisk community — "CDR after hangup"** (`community.asterisk.org/t/cdr-after-hangup/109797`). Standard community answer: you cannot update a CDR after hangup; if you need a post-hangup value, generate a new CDR (a new audit row) rather than rewriting the old one.
- **AWS — Idempotency reliability pillar** (`docs.aws.amazon.com/wellarchitected/latest/framework/rel_prevent_interaction_failure_idempotent.html`). Makes the mutating-operation-idempotent pattern explicit: a duplicate event should produce the same state as the first event, full stop, never a different state.
- **Microservices.io — "Idempotent consumer pattern"** (`microservices.io/post/microservices/patterns/2020/10/16/idempotent-consumer.html`). The canonical solution: persist processed event IDs; on redelivery, short-circuit. Event IDs in our pipeline are already persisted (`CallEvent.idempotencyKey` is unique). The issue is not duplicate detection — we correctly reject duplicate `CallEvent` rows — the issue is that two *distinct* events (AMI `call_end` with idempKey `A`, CDR `cdr:end` with idempKey `B`) both trigger `handleCallEnd` handler, which re-derives disposition from the *latest* payload rather than locking it on the first pass.
- **Cockroach Labs — "Idempotency and ordering in event-driven systems"** (`cockroachlabs.com/blog/idempotency-and-ordering-in-event-driven-systems/`). Where ordering cannot be guaranteed (which is our case — AMI live vs CDR batch by definition have different latencies), the industry convention is to make the *first* terminal event authoritative for terminal fields and accept that later information only refines non-terminal fields.
- **Confluent — "Idempotent Reader" pattern** (`developer.confluent.io/patterns/event-processing/idempotent-reader/`). Same principle: downstream processors should treat the first write to a terminal field as canonical. For non-terminal fields (enrichment), last-write-wins is acceptable. Distinction is per-field, not per-event.
- **Temporal — "What is idempotency?"** (`temporal.io/blog/idempotency-and-durable-execution`). Reinforces: when a workflow commits a decision, that decision should not be revisited by replayed events; only genuinely new information (non-overlapping fields) may update.

#### Analysis

Today `handleCallEnd` (line ~230 of `telephony-ingestion.service.ts`) runs:

```ts
const disposition = this.inferDisposition(payload, !!fullSession?.answerAt);
const session = await prisma.callSession.update({
  where: { id: existingSession.id },
  data: { endAt, disposition, hangupCause: ... },
});
```

There is an `isFirstEnd` guard (`!fullSession?.endAt`) which skips creating missed-call records on replay, but it does **not** skip the CallSession update. Every replay recomputes disposition and overwrites whatever the previous pass decided.

Concrete scenarios observed in the static audit (see `audit/phase1-telephony-stats.md` Check 7):

1. AMI `Hangup` arrives live with `cause=17` → inferDisposition returns `BUSY` → CallSession.disposition=BUSY.
2. Five minutes later, CDR import runs, fires `cdr:answer` (sets `answerAt` via `handleCallAnswer`) then `cdr:end`. Second pass: `sessionAnswered=true` (because answerAt was set in step 2a) → disposition=`ANSWERED`. Business-level state has now flipped BUSY → ANSWERED with no audit trail. This directly violates the "every number a manager sees matches an independent recount" success criterion.

The underlying root cause is that the system treats terminal-state fields (`disposition`, `endAt`, `hangupCause`) as mutable by any event that carries newer information. Asterisk itself treats these as immutable post-hangup. Our model should match.

Options:

- **(a) First-end wins, subsequent replays ignored entirely.** Matches Asterisk's CDR contract. Clean. But a later event that carries **genuinely new information** — recording URL, voicemail availability — gets discarded alongside the noise. Over-restrictive.
- **(b) Last-write-wins (current).** Fails audit. Flips dispositions. Reject.
- **(c) Field-level merge: disposition, endAt, hangupCause frozen on first finalization; recording URL, callMetrics.*, per-leg fields patched by later events if previously null.** Matches Confluent's "per-field, not per-event" guidance and Asterisk's own practice of generating a new CDR for post-hangup values rather than mutating existing ones.

Option (c) is the industry norm. Terminal fields = write-once. Non-terminal fields = mergeable with null-preferring merge rule ("only set if previously null").

#### Decision

**M7 = (c).** Implement field-level merge in `handleCallEnd`:
- Terminal fields (`disposition`, `endAt`, `hangupCause`) — write ONLY on first `call_end` (when `existingSession.endAt IS NULL`). Later calls to handleCallEnd for the same session skip these updates entirely.
- Non-terminal fields (`recordingId`, CallMetrics columns where still null, CallLeg `disconnectedAt` where still null) — patch on any replay that has non-null values to add.

Equivalent change in `handleCallAnswer`: only set `answerAt` if null; on replay with a different timestamp, keep the first one.

Rationale (one-line): Asterisk's own CDR contract treats post-hangup terminal fields as immutable; our ingest pipeline must do the same or we will continue flipping answered/busy/noanswer when CDR arrives after AMI, which no auditor will accept.

---

## Implementation guidance (for the code fix that follows)

### M3

**Query shape.** Replace today's unbounded `findMany` + `.filter(s => s.callMetrics)` with a single Postgres `$queryRaw`:

```sql
-- Conceptual shape. Build actual Prisma groupBy / $queryRaw variant.
SELECT
  COUNT(*) FILTER (WHERE s.disposition IS NOT NULL)                        AS denominator,
  COUNT(*) FILTER (WHERE m.is_sla_met = true)                              AS sla_met,
  COUNT(*) FILTER (WHERE m.is_sla_met IS NOT NULL)                         AS sla_measured,
  COUNT(*) FILTER (WHERE s.disposition IS NOT NULL AND m.id IS NOT NULL)   AS with_metrics,
  COUNT(*) FILTER (WHERE s.disposition IS NOT NULL AND m.id IS NULL)       AS without_metrics,
  AVG(m.wait_seconds) FILTER (WHERE m.wait_seconds IS NOT NULL)            AS avg_wait_seconds,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY m.wait_seconds) FILTER (WHERE m.wait_seconds IS NOT NULL)  AS median_wait_seconds
FROM "CallSession" s
LEFT JOIN "CallMetrics" m ON m."callSessionId" = s.id
WHERE s."startAt" BETWEEN $1 AND $2
  AND ($3::text IS NULL OR s."queueId" = $3);
```

Emit `slaMetPercent = sla_met / sla_measured` and `dataQualityPercent = with_metrics / (with_metrics + without_metrics)`. The UI shows both and badges the KPI amber when `dataQualityPercent < 0.95`, red when `< 0.90`.

**Affected endpoints** (per `audit/INVENTORY.md §5`):
- `GET /v1/telephony/statistics/overview` — most exposed; used on manager dashboard home
- `GET /v1/telephony/statistics/overview-extended`
- `GET /v1/telephony/statistics/breakdown` (hour/day/weekday buckets share the same data-quality indicator per bucket)
- `GET /v1/telephony/statistics/agents`
- `GET /v1/telephony/statistics/agents-breakdown`
- `GET /v1/telephony/statistics/queues`

All six methods in `telephony-stats.service.ts` need the rewrite; they all share the same root bug.

**Regression test.** Add to `src/telephony/services/telephony-stats.service.spec.ts`:
- `test: missing-metrics sessions appear in denominator and data-quality but not numerator`
  - Seed 10 CallSessions. 8 have CallMetrics with `isSlaMet=true`. 1 has CallMetrics with `isSlaMet=false`. 1 has no CallMetrics row.
  - Call `getOverview(...)`.
  - Assert `totalCalls === 10`, `slaMetPercent === 0.8 / 0.9` (numerator 8, denominator-measured 9), `dataQualityPercent === 9/10`.

### M5

**Data model.** Compute agent-level stats from CallLeg, not from CallSession.assignedUserId.

Conceptual query for `handledByAgent`:

```sql
WITH leg_durations AS (
  SELECT
    cl."callSessionId",
    cl."userId",
    EXTRACT(EPOCH FROM (cl."disconnectedAt" - cl."connectedAt")) AS connected_seconds
  FROM "CallLeg" cl
  WHERE cl.type = 'AGENT' AND cl."connectedAt" IS NOT NULL
),
primary_leg AS (
  SELECT DISTINCT ON ("callSessionId") "callSessionId", "userId", connected_seconds
  FROM leg_durations
  ORDER BY "callSessionId", connected_seconds DESC
)
SELECT p."userId", COUNT(*) AS handled_count
FROM primary_leg p
JOIN "CallSession" s ON s.id = p."callSessionId"
WHERE s."startAt" BETWEEN $1 AND $2
GROUP BY p."userId";
```

Conceptual query for `touchedByAgent`:

```sql
SELECT cl."userId", COUNT(DISTINCT cl."callSessionId") AS touched_count
FROM "CallLeg" cl
JOIN "CallSession" s ON s.id = cl."callSessionId"
WHERE cl.type = 'AGENT'
  AND cl."connectedAt" IS NOT NULL
  AND s."startAt" BETWEEN $1 AND $2
GROUP BY cl."userId";
```

Talk / hold / wrap-up averages are computed per agent over their *primary* leg rows only (so a call transferred out of Agent A after 1s doesn't inflate A's AHT).

**Affected stats.** Any KPI that today reads `CallSession.assignedUserId` needs to move to CallLeg:
- Agent breakdown — totalCalls per agent
- Queue stats — `agentCount` (currently `new Set(assignedUserIds).size`)
- Agent ranking / leaderboards
- "My team" manager views
- Per-agent AHT, talk, hold, wrap-up

KPIs unaffected (still from CallSession or CallMetrics):
- Total organisational call volume
- SLA% (org-wide; queue-wide does not pivot on agent)
- Abandon rate, missed-call rate
- Hourly / daily / weekday breakdown buckets

**Migration path for historical backfill.** No backfill is required *if* CallLeg rows have been populated correctly since day one. Audit that today (Phase 2 task): `SELECT COUNT(*) FROM "CallLeg" WHERE type='AGENT' GROUP BY "callSessionId"` — if sessions with transfers show only one leg, there is no historical data to recompute from. In that case, document a cut-over date: "handled" and "touched" KPIs are available from the fix-landing date forward; prior periods continue to use the legacy `assignedUserId`-based definition. Add a banner in the UI ("Before <cutover-date>, handled == assigned operator; transfers not counted in touched").

If CallLeg rows are populated for historical data, no UI banner needed; run a one-time recompute of cached aggregates and move on.

**Regression test.** Add to `telephony-stats.service.spec.ts`:
- `test: transferred call credits both originator (touched) and recipient (handled)`
  - Seed 1 CallSession with 2 AGENT CallLegs: user A connected 2024-01-01T10:00-10:02 (2 min), user B connected 10:02-10:12 (10 min).
  - Call `getAgentStats(window covering 10:00)`.
  - Assert A: `handled=0, touched=1`; B: `handled=1, touched=1`.
- `test: rejected leg (no connected seconds) does not contribute to touched`
  - Seed 1 CallSession with an AGENT CallLeg for user C where `connectedAt IS NULL` (rang but rejected).
  - Assert C does not appear in either handled or touched rollup.

### M7

**Guard placement.** In `telephony-ingestion.service.ts` `handleCallEnd` around line 230, the update payload must split into two:

```ts
const isFirstEnd = !existingSession.endAt;
const updateData: Prisma.CallSessionUpdateInput = {};
if (isFirstEnd) {
  // Terminal fields — write once
  updateData.endAt = endAt;
  updateData.disposition = this.inferDisposition(payload, !!existingSession.answerAt);
  updateData.hangupCause = payload.causeTxt ?? payload.cause ?? null;
}
// Non-terminal fields — patch if null
if (payload.recordingPath && !existingSession.recordingId) {
  // handled by separate handleRecordingReady path, but guard here too if recording arrives with end
}
if (Object.keys(updateData).length > 0) {
  await this.prisma.callSession.update({
    where: { id: existingSession.id },
    data: updateData,
  });
}
```

Equivalent treatment in `handleCallAnswer`:

```ts
if (!existingSession.answerAt) {
  await this.prisma.callSession.update({
    where: { id: existingSession.id },
    data: { answerAt: new Date(event.timestamp) },
  });
}
```

And for CallMetrics fields (wait/ring/talk/hold/wrap): only set if currently null.

**Affected handlers.**
- `handleCallEnd` — primary site of the bug (disposition flip)
- `handleCallAnswer` — secondary; answerAt can shift when CDR arrives after AMI
- `handleQueueLeave` — waitSeconds computed from queue-leave minus queue-enter; replay could recompute with different values
- `handleAgentConnect` — connectedAt per CallLeg; first-write guard needed per-leg (keyed on leg, not session)
- `handleHoldStart / handleHoldEnd` — holdSeconds; first-write guard

**Regression test.** Add to `src/telephony/services/telephony-ingestion.service.spec.ts`:
- `test: replayed call_end does not flip disposition`
  - Seed CallSession with `answerAt=2024-01-01T10:00`, `endAt=2024-01-01T10:05`, `disposition=ANSWERED`.
  - Ingest a `call_end` event with `causeTxt='FAILED'` and a different `endAt`.
  - Assert session disposition still `ANSWERED`, endAt still `10:05`.
- `test: replayed call_end patches recording url when previously null`
  - Seed CallSession with `endAt=2024-01-01T10:05`, `disposition=ANSWERED`, no Recording row.
  - Ingest `recording_ready` (or a late `call_end` that carries a recording reference).
  - Assert Recording row created / linked; disposition still ANSWERED.
- `test: replayed call_answer does not change answerAt`
  - Seed CallSession with `answerAt=10:00:15`.
  - Ingest call_answer with `timestamp=10:00:18`.
  - Assert answerAt still `10:00:15`.
- `test: first call_end on previously open session applies all fields`
  - Seed CallSession with `endAt=NULL`.
  - Ingest call_end.
  - Assert endAt, disposition, hangupCause all populated.

---

## Cross-references

- `audit/PHASE1_SUMMARY.md` P0-G row describes the three failures this doc resolves.
- `audit/phase1-telephony-stats.md` Check 7 (CDR+AMI merge) and Check 8 (KPI correctness table) are the primary evidence base.
- `audit/INVENTORY.md` §5 lists all affected endpoints for M3 denominator change.
- `audit/KNOWN_FINDINGS_CARRIED_FORWARD.md` M2/M3/M5/M7 entries are closed by these decisions.

## Sources

### ICMI / COPC (standards bodies)
- https://www.icmi.com/files/StudentResourcePage/CCMetrics/Service_Level_Calculations_Handout.pdf
- https://www.icmi.com/files/StudentResourcePage/CCF/CCMetricsKPIs.pdf
- https://www.copc.com/service-level-are-you-measuring-it-the-wrong-way/
- https://www.copc.com/copc-standards/

### Vendor documentation
- https://help.genesys.cloud/glossary/service-level/
- https://docs.genesys.com/Glossary:Service_Level
- https://docs.genesys.com/Glossary:Call_Transaction_Record
- https://all.docs.genesys.com/PEC-WFM/Current/Administrator/CCPerf
- https://community.genesys.com/discussion/calls-offered-and-calls-handled-by-an-agent-interaction-view
- https://docs.aws.amazon.com/connect/latest/adminguide/metrics-definitions.html
- https://docs.aws.amazon.com/connect/latest/adminguide/contacts-contact-chains-attributes.html
- https://docs.aws.amazon.com/connect/latest/adminguide/ctr-data-model.html
- https://www.cisco.com/c/en/us/td/docs/voice_ip_comm/cust_contact/contact_center/icm_enterprise/icm_enterprise_12_0_1/User/Guide/ucce_b_1201-reporting-concepts-for-ucce/ucce_b_1171-reporting-concepts-for-ucce_chapter_0110.html
- https://support.talkdesk.com/hc/en-us/articles/360043909512-Workforce-Management-Glossary
- https://www.five9.com/blog/mastering-contact-center-metrics-guide-success

### Asterisk-specific (the platform this CRM is on)
- https://docs.asterisk.org/Configuration/Reporting/Call-Detail-Records-CDR/CDR-Specification/
- https://docs.asterisk.org/Latest_API/API_Documentation/AMI_Events/Cdr/
- https://docs.asterisk.org/Latest_API/API_Documentation/Module_Configuration/cdr/
- https://community.asterisk.org/t/cdr-after-hangup/109797
- https://community.asterisk.org/t/cdr-call-disposition/102643

### Industry practice / KPI literature
- https://www.callcentrehelper.com/calls-answered-within-sla-calculation-207021.htm
- https://www.callcentrehelper.com/how-to-calculate-service-level-71275.htm
- https://www.callcentrehelper.com/7-tricks-that-call-centre-employees-play-67004.htm
- https://callminer.com/blog/call-center-service-levels-calculations
- https://www.zoom.com/en/blog/call-center-metrics/
- https://www.genesys.com/blog/post/the-definitive-list-of-29-call-center-metrics-and-kpis
- https://www.zendesk.com/blog/call-center-metrics-really-focus/
- https://www.ringcentral.com/call-center-metrics.html
- https://justcall.io/blog/call-center-metrics.html

### Idempotency / event-driven patterns (for M7)
- https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_prevent_interaction_failure_idempotent.html
- https://microservices.io/post/microservices/patterns/2020/10/16/idempotent-consumer.html
- https://developer.confluent.io/patterns/event-processing/idempotent-reader/
- https://www.cockroachlabs.com/blog/idempotency-and-ordering-in-event-driven-systems/
- https://temporal.io/blog/idempotency-and-durable-execution
- https://event-driven.io/en/idempotent_command_handling/

### Data-quality dashboards (for M3 exclusion indicator)
- https://www.telm.ai/blog/data-quality-key-performance-indicators/
- https://lakefs.io/data-quality/data-quality-metrics/
- https://www.alation.com/blog/data-quality-metrics/
- https://learn.microsoft.com/en-us/purview/unified-catalog-reports-data-quality-health
