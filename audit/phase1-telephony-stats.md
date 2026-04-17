# Phase 1 — Telephony & Statistics Verification

**Scope.** Verify the telephony-backend and statistics findings from Phase 0 against master (HEAD `33de993`). All paths rooted at `C:/CRM-Platform/`. Read-only; no code changed. Verdicts: **STILL PRESENT / FIXED / NOT APPLICABLE / PARTIAL**.

---

## Summary Table

| # | Check | Phase 0 id | Verdict | Severity now | File(s) |
|---|---|---|---|---|---|
| 1 | TELEPHONY_INGEST_SECRET validation | T1 | **PARTIAL** (timing-safe present, but length-mismatch throws non-constant-time) | P2 | `src/telephony/guards/telephony-ingest.guard.ts` |
| 2 | AMI ingest duplicate handling | T2 | **STILL PRESENT** (partial — CallEvent dedup OK, but CallSession update order-dependent) | P1 | `src/telephony/services/telephony-ingestion.service.ts`, `ami-bridge/src/event-mapper.ts` |
| 3 | Unbounded findMany in stats | T4 / #12 / #47 | **STILL PRESENT** (all 5 stats methods do unbounded findMany + JS aggregation) | **P1** | `src/telephony/services/telephony-stats.service.ts` |
| 4 | CDR import overlap guard | T5 / #18 | **FIXED** (`processing` flag added) | P3 | `src/telephony/cdr/cdr-import.service.ts` |
| 5 | TelephonyGateway `payload.id` vs `payload.sub` | T8 / #19 | **STILL PRESENT** — confirmed. Also broken in messenger gateway. | **P1 → P0** | `src/telephony/realtime/telephony.gateway.ts`, `src/messenger/messenger.gateway.ts`, `src/auth/auth.service.ts` |
| 6 | idempotencyKey collision on bridge restart | T11 | **PARTIAL** (keys are content-addressed for most events; transfer/hold use `Date.now()` — safe on restart) | P2 | `ami-bridge/src/event-mapper.ts` |
| 7 | CDR + AMI event merge (last-wins) | T12 | **STILL PRESENT** — disposition recomputed on each `call_end`, can flip | **P1** | `src/telephony/services/telephony-ingestion.service.ts` handleCallEnd, inferDisposition |
| 8 | M1–M8 statistics correctness | — | **MOSTLY FLAWED** — see KPI table below | **P0/P1** | `src/telephony/services/telephony-stats.service.ts` |
| 9 | Callback completion attribution | M8 | **STILL PRESENT** — 48h window drops late attempts silently | P1 | `src/telephony/services/missed-calls.service.ts` |
| 10 | AMI bridge buffer + 5000-cap | S7 / #15 | **FIXED** (`MAX_QUEUE_LIMIT=5000` with oldest-eviction, 5-min stale-warn loop) | P3 | `ami-bridge/src/event-buffer.ts`, `ami-bridge/src/main.ts` |
| 11 | Recording path & ACL | E1 / E3 | **STILL PRESENT** — only `call_center.menu` gates recording access; `call_recordings.{own,department,…}` permissions exist in catalog but are **never checked in code**. | **P1** | `src/telephony/controllers/telephony-recording.controller.ts`, `src/telephony/recording/recording-access.service.ts` |

---

## Check 1 — T1 — TELEPHONY_INGEST_SECRET Validation

### Evidence

`src/telephony/controllers/telephony-ingestion.controller.ts:9–26`
```ts
@SkipThrottle()
@Controller('v1/telephony')
export class TelephonyIngestionController {
  @Post('events')
  @UseGuards(TelephonyIngestGuard)
  async ingestEvents(@Body() dto: IngestEventsDto) {
    return this.ingestionService.ingestBatch(dto.events);
  }
}
```

`src/telephony/guards/telephony-ingest.guard.ts:14–42`
```ts
canActivate(ctx: ExecutionContext): boolean {
  const secret = process.env.TELEPHONY_INGEST_SECRET;
  if (!secret) {
    this.logger.error('TELEPHONY_INGEST_SECRET is not configured');
    throw new ForbiddenException('Telephony ingest endpoint is not configured');
  }

  const req = ctx.switchToHttp().getRequest();
  const header = req.headers['x-telephony-secret'] as string | undefined;

  if (!header) {
    throw new ForbiddenException('Invalid telephony ingest secret');
  }

  try {
    const isValid = timingSafeEqual(
      Buffer.from(header),
      Buffer.from(secret),
    );
    ...
  } catch (err) {
    ...
    throw new ForbiddenException('Invalid telephony ingest secret');
  }
  return true;
}
```

Good: `crypto.timingSafeEqual` is used. Header is `x-telephony-secret`. Missing secret fail-closes (ForbiddenException). No hard-coded fallback.

### Residual risk

`timingSafeEqual` throws `RangeError` if the two buffers have different byte lengths. The guard catches it in the outer try/catch and throws ForbiddenException, but the path length differs from the equal-length path — the timing difference between "wrong length" and "wrong contents" is measurable. In practice the attacker knows the secret length anyway (because operational rotation is rare and one leak exposes it) so this is **P2 cosmetic**, not P1. Also no explicit UTF-8 handling: if the header has an odd multibyte character the Buffer length drifts.

### Verdict

**PARTIAL.** Core timing-safe guard is correct; minor length-prefix timing leak.

### Regression test

`src/telephony/guards/telephony-ingest.guard.spec.ts` (not present today — needs adding).

Recommended test cases:
1. Secret unset → ForbiddenException "endpoint is not configured"
2. Header missing → ForbiddenException
3. Header shorter than secret → ForbiddenException (do not crash)
4. Header matches → returns true
5. Header wrong → ForbiddenException

### Fix scope

`src/telephony/guards/telephony-ingest.guard.ts` — pad/truncate to equal length or early-return on length mismatch before `timingSafeEqual`. 10-line change.

---

## Check 2 — T2 — AMI Ingest Duplicate Handling

### Evidence

**Event-level dedup** — `src/telephony/services/telephony-ingestion.service.ts:47–53`:
```ts
const existing = await this.prisma.callEvent.findUnique({
  where: { idempotencyKey: event.idempotencyKey },
});
if (existing) {
  return false;
}
```

`CallEvent.idempotencyKey` is `@unique`, so two POSTs with the same key → second returns `false` and skips. **Event-level idempotency: correct.**

**Bridge-side key generation** — `ami-bridge/src/event-mapper.ts:114–120` (`call_start`):
```ts
idempotencyKey: `${linkedId}-call_start`
```

Content-addressed by `linkedId + event-type`. Two bridges seeing the same `Newchannel` emit the same key → backend discards the second.

**Same for `call_end`** — `ami-bridge/src/event-mapper.ts:142` — `${linkedId}-call_end`; for `queue_enter`/`queue_leave` — `${linkedId}-queue_enter-${evt.Uniqueid}`; `agent_connect` — `${linkedId}-agent_connect-${extension || evt.Uniqueid}`; `call_answer` — `${linkedId}-call_answer`.

These are all **deterministic** given the same AMI event → safe against two bridges.

**But** — `transfer` and `hold_start/hold_end` use `Date.now()`:
- Line 261: `${linkedId}-transfer-${Date.now()}`
- Line 280: `${linkedId}-${type}-${Date.now()}`

Two bridges will produce **different** idempotencyKey values for the same AMI `BlindTransfer` or `MusicOnHoldStart`. Both will be accepted, incrementing `CallMetrics.transfersCount` and `holdSeconds` **twice** for the same real event.

### CallSession duplication risk

`handleCallStart` uses `upsert` keyed on `linkedId` (unique), so two `call_start` events for the same call only insert one CallSession. But `handleCallStart` **also always creates a new CallLeg** at lines 170–177 unconditionally — no idempotency guard on CallLeg. Two bridges → two CUSTOMER legs per real call.

### Impact on metrics

| Metric | Impact of duplicate bridge |
|---|---|
| totalCalls (CallSession rows) | safe — upsert keyed on linkedId |
| CallLeg CUSTOMER rows | **duplicated** (2 per real call) |
| CallMetrics.transfersCount | **doubled** |
| CallMetrics.holdSeconds | **doubled** |
| CallEvent ingestion | correctly deduped (except transfer/hold) |

Asterisk-side: Phase 0 `ASTERISK_INVENTORY.md §10` observed 3 concurrent `crm_ami` sessions on the PBX. If those three are three live bridge processes on the VM, every hold and transfer metric is inflated 3× today.

### Verdict

**STILL PRESENT** (partial). CallEvent and CallSession tables are safe; CallLeg and CallMetrics (hold/transfer counters) are not.

### Regression test

Integration test in `src/telephony/services/telephony-ingestion.service.spec.ts`: ingest the same `transfer` DTO twice → assert `CallMetrics.transfersCount === 1`.

### Fix scope

1. In `ami-bridge/src/event-mapper.ts`: make transfer and hold idempotency keys content-addressed — include `evt.Uniqueid` and `evt.TransferTransfererChannel`/`evt.Channel` rather than `Date.now()`.
2. In `handleCallStart` of ingestion service: guard CUSTOMER leg creation on "no existing leg for this session of type CUSTOMER".
3. Operational: restart bridge + kill duplicate AMI sessions (Asterisk side).

---

## Check 3 — T4 / #12 / #47 — Unbounded findMany in Stats

Five methods in `TelephonyStatsService`. All pull full session rows for a time range into Node memory and aggregate in JS. **No `take`, no `groupBy`, no SQL-level aggregation.**

### `getOverview` (`computeOverviewKpis`, line 507–514)

```ts
const sessions = await this.prisma.callSession.findMany({
  where: sessionWhere,
  select: { disposition: true, startAt: true, callMetrics: true },
});
```

Pulls **every** CallSession in range with its full CallMetrics. Then `.filter(...).length` five times over the array, `.map(...).sort(...)` for percentiles, `.filter(...).reduce(...)` for averages. **Rows at 50 operators × 30 days × 20 calls/operator/day = 30,000 rows per query.**

### `getAgentStats` (line 79)

```ts
const sessions = await this.prisma.callSession.findMany({
  where: { startAt: {gte,lte}, assignedUserId: {not:null}, ... },
  select: { assignedUserId, disposition, callMetrics: {select: ...} },
});
```

Then walks with `for...of` building `Map<userId, {talkSum, holdSum, ...}>`. Same 30k-row peak.

### `getQueueStats` (line 167)

```ts
const sessions = await this.prisma.callSession.findMany({
  where: { startAt: {gte,lte}, queueId: {not:null} },
  select: { queueId, assignedUserId, disposition, callMetrics: {...} },
});
```

Walk to build `Map<queueId, {waitSum, talkSum, agents:Set, ...}>`. Same profile.

### `getBreakdown` (line 261)

```ts
const sessions = await this.prisma.callSession.findMany({ where, select: {...} });
```

Walk to bucket by hour / day / weekday. Same profile.

### `getOverviewExtended` (line 374)

```ts
const sessions = await this.prisma.callSession.findMany({
  where: { startAt: {gte,lte}, queueId? },
  select: { disposition, callMetrics: {select:{waitSeconds}} },
});
```

Walk to build hold-time distribution. Same profile.

### `getAgentBreakdown` (line 409)

```ts
const sessions = await this.prisma.callSession.findMany({
  where: { startAt, assignedUserId: {not:null}, ... },
  select: { assignedUserId, disposition, callMetrics: {...} },
});
```

### Impact

At 30 calls/day × 16 extensions × 30 days = 14,400 rows. Realistic-2-years peak: 50 operators × 20 calls × 365 days × 2 = 730,000 rows. Each row ~200 bytes serialized → ~140 MB per request. With 3 dashboards open (overview + breakdown + agent-breakdown) the backend RSS spikes by ~400 MB. Node's V8 GC will thrash before OOM.

Concurrent requests from multiple managers compound the RSS footprint. There is no Redis cache, no memoization, no `take`, no cursor pagination.

### Verdict

**STILL PRESENT.** All six stats methods are unbounded.

### Fix scope

Rewrite each method to use:
1. `prisma.callSession.groupBy({by:['assignedUserId'], where, _count, _sum, _avg})` for counts and sums, combined with
2. `$queryRaw<...>` for percentiles (P50/P90 need PostgreSQL `percentile_cont` window function) and for bucketed breakdowns (`GROUP BY EXTRACT(hour FROM "startAt")`).

Estimate: 4 hours per method, total ~1 day. Unblocks manager dashboards on real 6-month+ data.

### Regression test

`src/telephony/services/telephony-stats.service.spec.ts` exists. Add:
- "getOverview with 10,000 seeded sessions completes in <500ms" (guard against reintroducing in-memory aggregation).
- Correctness tests that compare groupBy output with the current JS aggregate output at 100 rows to ensure the rewrite produces identical KPIs.

---

## Check 4 — T5 / #18 — CDR Import Overlap Guard

### Evidence

`src/telephony/cdr/cdr-import.service.ts:30`:
```ts
private processing = false;
```

Line 38–67:
```ts
@Cron('0 */5 * * * *')
async importCdr(): Promise<void> {
  if (!this.enabled || !this.cdrDbUrl || this.processing) return;
  this.processing = true;
  try {
    const rows = await this.fetchCdrRows();
    ...
    const latestEnd = rows.reduce(...);
    this.lastImportTimestamp = latestEnd;
  } catch (err) {
    this.logger.error(`CDR import failed: ${err.message}`);
  } finally {
    this.processing = false;
  }
}
```

Guard-and-set is correct. `lastImportTimestamp` is only updated **after** ingestion completes (reduces over the full result before reassignment).

### Issues spotted

1. **Pointer update is non-atomic with ingest.** If the backend crashes after ingest but before `lastImportTimestamp = latestEnd`, the next cycle re-imports the same window. Event-level idempotency guard (`CallEvent.idempotencyKey`) catches this — CDR keys are `cdr:start:${uniqueid}`, `cdr:end:${uniqueid}`, so re-ingest is safe. **Acceptable.**
2. **`lastImportTimestamp` lives in-memory only.** A backend restart resets it to `now() - 24h`. This re-scans the whole last day — hundreds of CDR rows — but still produces correct state because of event-level dedup. **Acceptable but wasteful.**
3. **`this.pgClient` is cached but never reconnected.** If Postgres (CDR DB) restarts, the first next-cycle query fails; there's no `client.on('error')` handler to trigger reconnect. A long backend uptime could silently lose CDR flow until backend restart.

### Verdict

**FIXED** (overlap guard present). Issue #3 (connection staleness) is a P3 operational concern, not in Phase 1 scope.

### Regression test

`src/telephony/cdr/cdr-import.service.spec.ts` — does not exist today. Should add test:
- Start two `importCdr()` in parallel → second returns immediately
- Simulate throw mid-ingest → `processing` flag resets to false.

---

## Check 5 — T8 / #19 — TelephonyGateway `payload.id` vs `payload.sub`

### Evidence

**What the token actually carries** — `src/auth/auth.service.ts`:

- Line 17 `login()`: `this.jwt.signAsync({ sub: user.id, email, role })` — only `sub`, no `id`.
- Line 36 `appLogin()`: same — `{ sub: user.id, email, role }`.
- Line 90 `exchangeDeviceToken()`: same.

**JwtStrategy for HTTP** — `src/auth/jwt.strategy.ts:22–30`:
```ts
async validate(payload: any) {
  return {
    id: payload.sub,   // <-- explicit sub → id mapping
    email: payload.email,
    ...
  };
}
```
HTTP controllers get `user.id` via Passport's `req.user = validate(payload)` — works.

**Telephony gateway** — `src/telephony/realtime/telephony.gateway.ts:259–282`:
```ts
private authenticateSocket(client: Socket): { id: string; email: string } | null {
  try {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const payload = this.jwtService.verify(authHeader.slice(7));
      if (payload?.id) return payload as { id: string; email: string };  // ❌ payload.id is undefined
    }
    const cookies = client.handshake.headers.cookie;
    if (cookies) {
      const parsed = cookie.parse(cookies);
      const token = parsed[process.env.COOKIE_NAME ?? 'access_token'];
      if (token) {
        const payload = this.jwtService.verify(token);
        if (payload?.id) return payload as { id: string; email: string };  // ❌ same bug
      }
    }
  } catch { return null; }
  return null;
}
```

`jwtService.verify()` returns the **raw JWT claims**. The token has `sub`, not `id`. Therefore `payload?.id` is always `undefined`, the function returns `null`, and **every telephony socket is disconnected** at handleConnection line 62–65.

**Messenger gateway** — `src/messenger/messenger.gateway.ts:290–320`:

Same raw-verify pattern. Line 52 then reads `user.id` from a payload that only has `sub`. So `client.userId = undefined`, then line 54 queries `getEmployeeIdByUserId(undefined)` which returns null → line 58–59 disconnect. **Messenger sockets also broken.**

Both are functionally dead right now — and would explain if operators have not seen screen-pops, report-triggers, or messenger real-time updates.

**Clientchats gateway** — `src/clientchats/clientchats.gateway.ts:54–55`:
```ts
const payload = this.jwt.verify(token) as { sub: string };
const userId = payload.sub;   // ✓ correct
```

Clientchats is fine.

### Verdict

**STILL PRESENT.** Bug wider than Phase 0 noted — both telephony and messenger gateways broken. Originally flagged P1 for telephony; combined with silent screen-pop / report-trigger failures this is **P0** for Monday.

### Fix scope

Two-line fix in each gateway:
- `if (payload?.id) return payload;` → `if (payload?.sub) return { id: payload.sub, email: payload.email };`
- Or: `const userId = payload?.sub ?? payload?.id;` to tolerate future token variants.

### Regression test

- `src/telephony/realtime/telephony.gateway.spec.ts` — add test: sign a token with `sub`, call `authenticateSocket`, expect returned object to have `id: <userId>`.
- Repeat for `src/messenger/messenger.gateway.spec.ts`.

---

## Check 6 — T11 — idempotencyKey Collision on Bridge Restart

### Evidence

`ami-bridge/src/event-mapper.ts` generates keys at:

| Event | Key format | Collision-safe across restart? |
|---|---|---|
| Newchannel → call_start | `${linkedId}-call_start` | ✓ yes, deterministic |
| Hangup → call_end | `${linkedId}-call_end` | ✓ yes |
| Hangup → recording_ready | `${linkedId}-recording_ready` | ✓ yes |
| QueueCallerJoin → queue_enter | `${linkedId}-queue_enter-${evt.Uniqueid}` | ✓ yes |
| QueueCallerLeave → queue_leave | `${linkedId}-queue_leave-${evt.Uniqueid}` | ✓ yes |
| AgentConnect → agent_connect | `${linkedId}-agent_connect-${extension || evt.Uniqueid}` | ✓ yes |
| AgentConnect → call_answer | `${linkedId}-call_answer` | ✓ yes |
| BlindTransfer / AttendedTransfer → transfer | `${linkedId}-transfer-${Date.now()}` | **✗ no** — different at restart |
| MusicOnHoldStart/Stop → hold_start/hold_end | `${linkedId}-${type}-${Date.now()}` | **✗ no** |

### Collision scenario

If the bridge crashes after emitting a transfer event but before CRM acknowledges, then restarts and re-reads the same AMI event (unlikely — AMI has no replay, but possible if bridge keeps a local WAL or if Asterisk re-fires on reconnect), the new key has a different `Date.now()` → CRM treats it as a new transfer → `transfersCount` incremented twice.

More realistically: two bridges running simultaneously (Asterisk sees three `crm_ami` sessions per Phase 0 inventory) — each sees the same `BlindTransfer`, each picks its own `Date.now()` → **doubled metric.** This overlaps with Check 2.

### Verdict

**PARTIAL.** 7 of 9 event types are collision-safe; 2 (transfer, hold) are not.

### Fix scope

Replace `Date.now()` with `evt.Uniqueid`. For transfer the relevant uniqueid is `evt.TransfererUniqueid` / `evt.Uniqueid`. For hold, `evt.Uniqueid` is fine.

### Regression test

Unit test in `ami-bridge/src/event-mapper.spec.ts` (likely needs creation): feed the same BlindTransfer event twice, expect identical idempotencyKey.

---

## Check 7 — T12 — CDR-derived + AMI-live Event Merge

### Evidence

Both pipelines land on the same CallSession (keyed on `linkedId`, which is stable between AMI's `Linkedid` and CDR's `linkedid` column).

**Disposition inference** — `src/telephony/services/telephony-ingestion.service.ts:613–645`:
```ts
private inferDisposition(payload: AsteriskEventPayload, sessionAnswered = false): CallDisposition {
  if (sessionAnswered) return CallDisposition.ANSWERED;
  const causeTxt = (payload.causeTxt ?? '').toUpperCase().replace(/[\s-]+/g, '_');
  const causeCode = (payload.cause ?? '').trim();
  if (causeTxt === 'ANSWERED') return CallDisposition.ANSWERED;
  if (causeTxt.includes('NO_ANSWER') || causeCode === '19') return CallDisposition.NOANSWER;
  ...
  if (causeTxt.includes('NORMAL_CLEARING') || causeCode === '16') return CallDisposition.NOANSWER;
  return CallDisposition.MISSED;
}
```

**handleCallEnd** (line 211–293):
```ts
const disposition = this.inferDisposition(payload, !!fullSession?.answerAt);
const session = await this.prisma.callSession.update({
  where: { id: existingSession.id },
  data: { endAt, disposition, hangupCause: payload.causeTxt ?? payload.cause ?? null },
});
```

This is a **set-last-wins overwrite**. Consider this sequence:
1. **AMI live**: `Hangup` event fires first with `cause=17` (USER_BUSY) — before `answerAt` was set. `sessionAnswered=false`, causeTxt includes `USER_BUSY` → disposition = `BUSY`. CallSession updated with `endAt`, `disposition=BUSY`.
2. **5 min later, CDR import**: CDR row says `disposition='ANSWERED'`, `billsec=42`. Generates `cdr:start:${uniqueid}` (dedup skips — linkedId already exists), `cdr:answer:${uniqueid}` — this runs `handleCallAnswer` which sets `answerAt`. Then `cdr:end:${uniqueid}` — fires `handleCallEnd` again. This time `fullSession.answerAt` is set (from step 2b), so `sessionAnswered=true` → disposition=`ANSWERED`. CallSession updated with new `endAt`, disposition flipped BUSY → ANSWERED.

The **`isFirstEnd` guard** at line 226 (`!fullSession?.endAt`) skips **side-effects** (missed-call creation, attempt counting) on replay — but it does **NOT** skip the `callSession.update` at lines 230–237. The disposition is always recomputed and overwritten.

More painful inverse:
1. **AMI live `agentconnect` + `bridgeenter`** → `handleAgentConnect` sets `answerAt`. Disposition not yet set (end not reached).
2. Call ends normally; AMI `Hangup` → `handleCallEnd` → `sessionAnswered=true` → disposition=`ANSWERED`. ✓
3. **Later, CDR import re-ingests.** CDR reports `disposition='NO ANSWER'` (if the CDR logic for a transferred call confuses which channel was dialed). `handleCallEnd` fires again — now `fullSession.answerAt` IS still set → `sessionAnswered=true` → disposition=`ANSWERED` (stays).

In practice: **answered stays answered**, but an answered-then-abandoned sequence can flip.

Also, `handleCallAnswer` (line 187) **unconditionally** sets `answerAt = new Date(event.timestamp)` — if a later event carries a different timestamp, it overwrites the earlier one. CDR's `answer` time is often **later** than AMI's `bridgeenter` (CDR stores DAHDI answer, AMI stores channel bridge). This shifts waitSeconds computations.

### Verdict

**STILL PRESENT.** CDR and AMI merge is last-write-wins on disposition, answerAt, endAt, and hangupCause. Side effects are guarded, but stats-relevant fields are not.

### Fix scope

Guard `handleCallEnd`'s update with `isFirstEnd`:
```ts
const updateData = isFirstEnd
  ? { endAt, disposition, hangupCause }
  : {}; // only compute metrics, do not overwrite
if (Object.keys(updateData).length) {
  session = await prisma.callSession.update({where, data: updateData});
}
```

Do similarly for `handleCallAnswer` — only set `answerAt` if null.

### Regression test

Integration test: seed a CallSession with answerAt set + disposition ANSWERED, ingest a CDR-driven `call_end` with `causeTxt='FAILED'` → expect final disposition still ANSWERED, endAt not overwritten.

---

## Check 8 — Statistics Correctness (M1–M7) — KPI-by-KPI

All formulas below reference `src/telephony/services/telephony-stats.service.ts` + `inferDisposition` in the ingestion service.

### KPI Correctness Table

| KPI | Formula (current) | Correct? | Notes |
|---|---|---|---|
| **totalCalls** | `sessions.length` | **Inflated** if Check 2 doubles CallSession rows (only if linkedId not shared across bridges). Via upsert on linkedId today: safe. | M1 |
| **answered** | `count(disposition === 'ANSWERED')` | **Flawed at boundary** — disposition is last-write-wins (Check 7). CDR correction of live AMI can flip either way. | M2 |
| **missed** | `count(disposition ∈ {MISSED, NOANSWER})` | Semantically OK. Relies on inferDisposition mapping NORMAL_CLEARING-without-answer → NOANSWER (recent fix per commit fb9ee38). | M7 |
| **abandoned** | `count(disposition === 'ABANDONED')` | Only set on `ORIGINATOR_CANCEL / cause 487`. Many real abandoned calls (caller hung up mid-ring) land in NOANSWER instead. **Under-counted.** | — |
| **callbacksCreated** | `prisma.callbackRequest.count({createdAt: {gte,lte}})` | OK. Denominator independent of CallSession. | — |
| **callbacksCompleted** | same, + `status: 'DONE'` | OK — DONE is set by `autoResolveByPhone` or manual resolve. | — |
| **avgAnswerTimeSec** | `mean(CallMetrics.waitSeconds)` over ANSWERED sessions only | **Flawed (M3)** — excludes sessions whose CallMetrics row is missing (ingest failure). Silent exclusion inflates the average toward the performant calls. **Denominator mismatches "answered" count.** | M3, M4 |
| **medianAnswerTimeSec** | 50th percentile of sorted waitSeconds over ANSWERED | Same M3 caveat. Computed in JS (`percentile`, line 633) — O(n) but relies on full in-memory sort. | — |
| **p90AnswerTimeSec** | same, 90th percentile | Same. | — |
| **avgAbandonWaitSec** | `mean(CallMetrics.abandonsAfterSeconds)` over ABANDONED | Semantically OK given the earlier ABANDONED under-count (so denominator is small; individual values are fine). | — |
| **avgTalkTimeSec** | `mean(CallMetrics.talkSeconds)` over ANSWERED only | OK for denominator, but M3: sessions with missing metrics row silently dropped. | — |
| **avgHoldTimeSec** | `mean(CallMetrics.holdSeconds)` over ANSWERED only | Same. | — |
| **avgWrapupTimeSec** | `mean(CallMetrics.wrapupSeconds)` over ANSWERED only | Same. Wrap-up events likely not emitted by current Asterisk dialplan — expect this metric to be near-zero today. | — |
| **transferRate** | `sum(transfersCount over ANSWERED) / count(ANSWERED)` | **Doubled** if Check 2 triggers (transfer idempotency key uses Date.now). | M5 |
| **slaMetPercent** | `count(isSlaMet=true) / count(isSlaMet != null)` over **ALL** sessions (not just answered) | **Flawed (M3)** — denominator excludes sessions with missing CallMetrics, and NON-answered sessions have `isSlaMet=false` (line 567 in ingestion), so they pull SLA down. The KPI conflates "call came in within 20s of trying to answer" with "call was abandoned before agent picked up". | M3 |
| **longestWaitSec** | `max(waitSeconds over ANSWERED)` | OK, inherits M3 null-handling. | — |
| **Agent breakdown — totalCalls per agent** | `count(CallSession.assignedUserId = <uid>)` where assignedUserId was last writer | **M5 confirmed** — `handleTransfer` (line 420–426) overwrites `assignedUserId` to the transfer target. Original operator's contribution invisible. | M5 |
| **Queue agentCount** | `Set<assignedUserId>.size` | Same M5 — measures last-owner only. | — |
| **Breakdown hour/day/weekday** | `d.getHours() / getDate() / getDay()` in **server local time** | **M6 confirmed** — uses `Date.getHours()` which returns hours in the server's local TZ. VM is Windows, localtime depends on VM config. If VM is UTC, a 23:50 Tbilisi call (UTC+4) arrives as startAt=19:50Z, and `getHours()=19`, bucketed into the wrong day. Fix: either use a TZ-aware library (date-fns-tz) or run the groupBy in Postgres with `AT TIME ZONE 'Asia/Tbilisi'`. | M6 |

### Overall Verdict

**FLAWED — P0 on M1/M2/M3/M5, P1 on M6.**

The most consequential failures today:

- **M3 — missing CallMetrics row silent exclusion.** All six speed / quality KPIs use `filter(s => s.callMetrics)`. If ingest failed mid-call_end (FK violation, Prisma error, transient Postgres), the CallMetrics row is absent but the CallSession exists. Those calls silently drop out of every average. SLA% is inflated.
- **M5 — assignedUserId is last owner.** Transfers overwrite `assignedUserId`. Every agent-breakdown KPI attributes the whole call to the last leg. Operators who took the initial call but transferred get zero credit.
- **M6 — timezone.** `Date.getHours()` is server-local. On the Windows VM this is Tbilisi time (confirmed by CLAUDE.md), so server-local and customer-local align. **But CI / dev environments run UTC** — tests and dev stats will show different buckets than prod. Low impact in prod, high impact on test correctness.
- **M2 — last-write-wins disposition.** From Check 7.

### Fix scope (statistics)

1. **M3**: outer-left-join CallMetrics and treat missing row as null (don't exclude the session). Or, change the KPI definition to "AVG over sessions with metrics" and surface the excluded count.
2. **M5**: sum over CallLeg rows grouped by `userId` + `type=AGENT`, not CallSession.assignedUserId. Attribute partial contribution.
3. **M6**: move breakdown into `$queryRaw` with `date_trunc(AT TIME ZONE 'Asia/Tbilisi', "startAt")`.
4. **M7** (missed-call semantics): clarify whether missed dashboards count NEW/CLAIMED/ATTEMPTED or also HANDLED/EXPIRED. Currently, `callbacksCompleted` counts `CallbackRequestStatus=DONE`, but the missed-call dashboard lists `in:['NEW','CLAIMED','ATTEMPTED']`. The two surfaces disagree.

### Regression test

`src/telephony/services/telephony-stats.service.spec.ts` exists; extend with fixtures:
- Seed 1 answered + 1 answered-but-missing-metrics → assert `answered=2`, `avgAnswerTime` uses only 1 (or, post-fix, uses null-tolerant average).
- Seed 1 transferred call → assert BOTH agents get `totalCalls=1` (post-fix).
- Breakdown across DST / non-DST boundary — assert hours bucket per Asia/Tbilisi.

---

## Check 9 — M8 — Callback Completion Attribution

### Evidence

`src/telephony/services/missed-calls.service.ts:363–470` — `recordOutboundAttempt()`:

```ts
const windowStart = new Date(Date.now() - ATTEMPT_MATCH_WINDOW_HOURS * 3600 * 1000);
```
`ATTEMPT_MATCH_WINDOW_HOURS = 48` (line 25).

```ts
const ringSeconds = session.callMetrics?.ringSeconds ?? 0;
if (ringSeconds < MIN_ATTEMPT_RING_SECONDS) { return; }
```
`MIN_ATTEMPT_RING_SECONDS = 10` (line 20).

Matches the callee number's last 9 digits against pending MissedCalls with `detectedAt ≥ now - 48h`.

### Scenarios where attribution silently fails

1. **Operator calls back on day 3** (> 48h after missed call). `recordOutboundAttempt` scans only MissedCalls from last 48h → no match → attempt not recorded. MissedCall is still `EXPIRED` by the 30-min expiry cron (line 588). **Outbound call succeeds, customer is served, but dashboards show the missed call as unattended.**
2. **Operator rings 9 seconds then hangs up** (e.g. realizes wrong number). `ringSeconds < 10` → not counted. Expected / correct.
3. **Auto-resolve on ANSWERED** (line 254–275 of ingestion service) bypasses `recordOutboundAttempt` entirely — `autoResolveByPhone` marks missed call HANDLED. **Good.**
4. **Outbound call disposition FAILED** (line 374): skipped. **Correct** (trunk/congestion not operator fault).
5. **Phone number normalization**: uses `phoneResolver.localDigits` + `endsWith` match on last 9 digits. Works for Georgia (9-digit local subscribers). If international number >9 digits, matching could cross-collide. Low risk.

### Verdict

**STILL PRESENT** — 48h window silently drops late callbacks from attribution. This understates operator effort on any campaign that spans >2 days.

### Fix scope

Either:
1. Extend window to match the EXPIRY_HOURS (currently both 48h — so window drops equally with expiry — but an operator calling back a **just-expired** missed call loses attribution). Extend attempt window to 72h or align with visibility window.
2. OR: attribute based on `resolvedByCallSessionId` regardless of age — same column used by autoResolveByPhone; `recordOutboundAttempt` could also set it.

### Regression test

`src/telephony/services/missed-calls.service.spec.ts` exists; add case: seed a MissedCall with `detectedAt = now-49h`, ingest outbound attempt → assert **either** rejected-by-window **or** counted (per chosen fix).

---

## Check 10 — S7 / #15 — AMI Bridge Buffer + 5000-cap

### Evidence

`ami-bridge/src/event-buffer.ts:6`:
```ts
const MAX_QUEUE_LIMIT = 5000;
```

Constructor (line 17): `maxQueueSize: number = MAX_QUEUE_LIMIT`.

Push with overflow (line 35–49):
```ts
push(events: CrmEvent[]): void {
  this.queue.push(...events);
  if (this.queue.length > this.maxQueueSize) {
    const evicted = this.queue.length - this.maxQueueSize;
    this.queue = this.queue.slice(evicted);
    log.warn(`Queue overflow: evicted ${evicted} oldest event(s) to stay within ${this.maxQueueSize} limit`);
  }
  ...
  if (this.queue.length >= this.maxSize) {
    this.flush();
  }
}
```

5-min stale-warn loop — `ami-bridge/src/main.ts:77–97`:
```ts
const STALE_INGEST_THRESHOLD_MINS = 5;
...
if (stats.minutesSinceSuccess !== null && stats.minutesSinceSuccess >= STALE_INGEST_THRESHOLD_MINS) {
  log.warn(`ALERT: No successful CRM ingest for ${stats.minutesSinceSuccess} minute(s). ...`);
}
```

Ticks every 60s.

### Verdict

**FIXED.** Cap exists, oldest-eviction works, stale alert works.

### Residual operational concern

Eviction is silent beyond the log line — the bridge has no metric exported for "events lost". No alert is raised externally (PM2 doesn't scan logs for "Queue overflow"). If the backend is down for > (5000 / event-rate) minutes, calls during that window are permanently lost. Given an AMI event rate of ~10 events/min at average call volume, 5000 events ≈ 8h buffer. This is actually quite generous. Not a Monday-blocker.

### Regression test

`ami-bridge/src/event-buffer.spec.ts` — needs creation. Push 5010 events in one shot → expect exactly 5000 remain, warn-log seen.

---

## Check 11 — E1 / E3 — Recording Path & ACL

### Evidence — path resolution

`src/telephony/recording/recording-access.service.ts:17`:
```ts
const ASTERISK_LINUX_PREFIX = '/var/spool/asterisk/monitor';
```

Constructor line 28–30:
```ts
this.basePath = normalize(
  process.env.RECORDING_BASE_PATH ?? '/var/spool/asterisk/monitor',
);
```

`resolveFilePath` (line 236–269):
- if input starts with `/var/spool/asterisk/monitor`, strip that, treat the rest as relative-to-basePath.
- if absolute but unknown prefix, first try as-is; else fall back to `basename()`.
- prevents path traversal by `resolved.startsWith(normalizedBase)` check.

**The existsSync check happens first in `getRecordingFileInfo`**:
```ts
const filePath = this.resolveFilePath(recording.filePath);
if (!filePath || !existsSync(filePath)) {
  throw new NotFoundException('Recording file not found on disk');
}
```

`streamAudio` controller (line 70): if `recording.url` is set, it redirects; otherwise local.

### Evidence — ACL

`src/telephony/controllers/telephony-recording.controller.ts:20–23`:
```ts
@Controller('v1/telephony/recordings')
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
@RequirePermission('call_center.menu')
export class TelephonyRecordingController { ... }
```

All three endpoints (`GET :id` metadata, `POST :id/fetch`, `GET :id/audio`) require only `call_center.menu`. **No per-recording scope filter.**

Grep for `call_recordings`:
```
$ rg "call_recordings" src/
(no matches)
```

The permissions catalog defines `call_recordings.own / .department / .department_tree / .all` (seed-permissions.ts, per INVENTORY.md §3.4), but **backend code never reads these scopes.** The call-logs LIST endpoint filters by `DataScopeService.resolve('call_logs', userId)` — but once the frontend has any CallSession.id with a Recording.id, an operator can open `GET /v1/telephony/recordings/:id/audio` and stream any colleague's recording.

### Verdict

**STILL PRESENT — P1 privacy risk.** Any operator with `call_center.menu` can stream any recording given its Recording UUID. UUIDs are not enumerable but are logged in frontend state for any call shown in the operator's list. A curious operator can inspect a colleague via URL manipulation.

### Fix scope

1. In `telephony-recording.controller.ts`: replace `call_center.menu` with `call_recordings.own | .department | .department_tree | .all`, using `DataScopeService.resolve('call_recordings', userId)` to filter.
2. In `RecordingAccessService.getRecordingById`: take `userId` and compute whether that user's scope includes the owning CallSession.assignedUserId. If not, throw `ForbiddenException` (not 404 — the operator knows the call exists because they saw it in a list; hiding existence provides no benefit).
3. Backfill: confirm all existing `call_recordings.*` permissions are granted appropriately — operators get `.own`, team leads get `.department`, etc.

### Regression test

- `src/telephony/controllers/telephony-recording.controller.spec.ts` — operator A seeds a recording, operator B requests `GET /:id/audio` → expect 403.
- Superadmin with `.all` scope → 200 for any recording.

---

## P0 / P1 Items for Phase 4

Ranked by operational blast radius for Monday rollout.

### P0 (must-fix before launch)

1. **Telephony and messenger gateway `payload.id` vs `sub` (Check 5)** — confirmed broken in both gateways. Without this, no screen-pops, no report-triggers, no internal chat real-time. Two-line fix per gateway. Regression-test: token-with-sub test.
2. **Statistics correctness M1/M2/M3/M5 (Check 8)** — manager dashboards show numbers that are demonstrably wrong: last-write-wins disposition, missing-metric silent exclusion, transfer-over-write of assignedUserId. The rewrite of the six stats methods (Check 3) must land here simultaneously — both correctness and performance share the same files.

### P1 (launch would bleed trust)

3. **Unbounded stats `findMany` (Check 3)** — manager dashboards will hang or OOM at month queries. Rewrite with Prisma `groupBy` + `$queryRaw` for percentiles.
4. **Recording ACL (Check 11)** — operator can stream colleague's recording by UUID. Privacy / compliance blocker.
5. **AMI ingest double-counting of transfers and holds (Check 2 + Check 6)** — kill duplicate AMI sessions on PBX side, then make transfer/hold idempotency keys content-addressed. Without this, `transferRate` and `avgHoldTimeSec` are unreliable.
6. **CDR + AMI disposition overwrite (Check 7)** — guard `handleCallEnd`'s CallSession update with `isFirstEnd`. One-line change.
7. **Timezone drift in breakdown KPIs (M6)** — low prod-impact if VM is in Asia/Tbilisi, but CI / dev tests will differ and mask regressions.

### P2 (can launch with logged mitigation)

8. **TELEPHONY_INGEST_SECRET length-timing (Check 1)** — minor leak.
9. **Callback attribution 48h window (Check 9)** — under-credits late callbacks.
10. **CDR import pg-client reconnect (Check 4 residual)** — operational longevity.
11. **Stats service no caching / memoization** — compounds Check 3.

---

## Phase 4 regression-test bundle (recommended file additions)

- `src/telephony/guards/telephony-ingest.guard.spec.ts` (new)
- `src/telephony/realtime/telephony.gateway.spec.ts` (new — auth tests only; existing state-manager tests elsewhere)
- `src/messenger/messenger.gateway.spec.ts` (new)
- `src/telephony/services/telephony-stats.service.spec.ts` (extend — correctness + perf tests)
- `src/telephony/services/telephony-ingestion.service.spec.ts` (extend — idempotency on replayed call_end, CDR-after-AMI disposition lock)
- `src/telephony/services/missed-calls.service.spec.ts` (extend — late-attempt attribution)
- `src/telephony/cdr/cdr-import.service.spec.ts` (new — overlap guard)
- `src/telephony/controllers/telephony-recording.controller.spec.ts` (new — cross-operator access)
- `ami-bridge/src/event-mapper.spec.ts` (new — idempotency determinism)
- `ami-bridge/src/event-buffer.spec.ts` (new — 5000-cap eviction)

---

## Appendix — file citations used

Backend:
- `C:/CRM-Platform/backend/crm-backend/src/telephony/controllers/telephony-ingestion.controller.ts:1–26`
- `C:/CRM-Platform/backend/crm-backend/src/telephony/controllers/telephony-recording.controller.ts:1–131`
- `C:/CRM-Platform/backend/crm-backend/src/telephony/guards/telephony-ingest.guard.ts:1–43`
- `C:/CRM-Platform/backend/crm-backend/src/telephony/services/telephony-ingestion.service.ts:1–646`
- `C:/CRM-Platform/backend/crm-backend/src/telephony/services/telephony-stats.service.ts:1–668`
- `C:/CRM-Platform/backend/crm-backend/src/telephony/services/missed-calls.service.ts:1–629`
- `C:/CRM-Platform/backend/crm-backend/src/telephony/cdr/cdr-import.service.ts:1–177`
- `C:/CRM-Platform/backend/crm-backend/src/telephony/recording/recording-access.service.ts:1–270`
- `C:/CRM-Platform/backend/crm-backend/src/telephony/realtime/telephony.gateway.ts:1–283`
- `C:/CRM-Platform/backend/crm-backend/src/messenger/messenger.gateway.ts:40–320`
- `C:/CRM-Platform/backend/crm-backend/src/clientchats/clientchats.gateway.ts:54–95`
- `C:/CRM-Platform/backend/crm-backend/src/auth/auth.service.ts:14–121`
- `C:/CRM-Platform/backend/crm-backend/src/auth/jwt.strategy.ts:1–31`

AMI Bridge:
- `C:/CRM-Platform/ami-bridge/src/event-mapper.ts:1–337`
- `C:/CRM-Platform/ami-bridge/src/event-buffer.ts:1–77`
- `C:/CRM-Platform/ami-bridge/src/crm-poster.ts:1–103`
- `C:/CRM-Platform/ami-bridge/src/main.ts:1–135`

Branch at audit time: `fix/telephony-deep-fix` (HEAD `33de993`).
