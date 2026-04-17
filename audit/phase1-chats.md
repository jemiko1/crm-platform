# Phase 1 — Client Chats Pipeline Verification

**Date:** 2026-04-17
**Scope:** Backend `src/clientchats/**`, Prisma schema, frontend reply-box, webhook adapters.
**Method:** Read-only. File paths absolute. Line numbers verified against current `fix/telephony-deep-fix` branch.
**Mapping:** covers INVENTORY.md §2 + §4.2, THREAT_MODEL.md §6 + §7 + §10 M10, findings #20–#28, #34, #37.

---

## Summary Table

| # | Check | Finding ref | Verdict | Severity |
|---|---|---|---|---|
| 1 | Dedup race (processInbound + saveMessage + schema @unique) | C1 / #20 | **FIXED** | P1 → closed |
| 2a | Escalation cron — `findMany` take/limit | C7 / #24 | **STILL PRESENT** (no `take`) | **P1** |
| 2b | Escalation cron — per-iteration try/catch | C6 / #23 | **FIXED** (try/catch in loop) | P2 → closed |
| 2c | Escalation cron — `processing` flag reset | C7 | **FIXED** (finally block) | P3 |
| 2d | Escalation cron — mid-tick schedule change | C11 / #34 | **STILL PRESENT** (not observed by escalation but by gateway room membership) | P2 |
| 2e | Duplicate warning guard (5-min / 10-min window) | C7 | **PRESENT AND CORRECT** | P3 |
| 3 | Closed-conversation archival race | C8 / #26 | **STILL PRESENT** (TOCTOU between close and inbound) | **P1** |
| 4 | Queue schedule fan-out (`queue:updated` emit) | C11 / #25 / #34 | **STILL PRESENT** (no emit; room membership fixed at connect) | P2 |
| 5 | Inbound pipeline order enforcement | C12 / #27 | **CONVENTION ONLY** (not structurally enforced) | P2 (regression test P1) |
| 6 | Operator fetches any conversation by ID | R3 / #28 | **STILL PRESENT** (no scope check) | **P1** |
| 7 | Webhook replay protection (timestamp/nonce) | C5 | **STILL PRESENT** (signature-only, no timestamp) | P1 |
| 8 | Attachment size validation + frontend handling | C10 | **PARTIAL** (server enforces 10MB; frontend pre-checks; error path swallowed) | P2 |
| 9 | WhatsApp 24h window detection | C4 | **PARTIAL** (detector exists but not enforced on send path) | **P1** |
| 10 | Conversation deletion chain walk | #46 | **STILL PRESENT** (N+1 per-hop findUnique) | P2 |
| 11 | `firstResponseAt` setter correctness | M10 | **MOSTLY OK** but race possible when two operators reply concurrently via sockets | P2 |
| 12 | Channel credential precedence (DB → env) | — | **CORRECT** but cache not invalidated until restart for some paths | P2 |

**P0 findings:** none.
**P1 findings:** #2a (escalation unbounded), #3 (close-race), #6 (scope read), #7 (replay), #9 (24h window).
**P2 findings:** everything else with non-FIXED verdict.

---

## 1. C1 / #20 — Dedup race on concurrent inbound webhooks

### Evidence

- File: `C:/CRM-Platform/backend/crm-backend/src/clientchats/services/clientchats-core.service.ts`
- `processInbound()` lines 36–105 performs pre-check `findUnique({ where: { externalMessageId } })` at line 41–43.
- `saveMessage()` lines 296–339: wrapped in try/catch; catch block at line 328–337 detects `err.code === 'P2002'` and, when `err.meta?.target?.includes('externalMessageId')`, re-reads the winning row with `findUnique` and returns it (line 329–335).
- Prisma schema: `C:/CRM-Platform/backend/crm-backend/prisma/schema.prisma` line 1778 `externalMessageId String @unique`. Index on line 1790 `@@index([externalMessageId])` (redundant but not harmful).

### Verdict

**FIXED.** The `@unique` constraint at the DB plus the P2002 catch forms a race-safe boundary: even if two concurrent `processInbound` calls both pass the line-41 existence check, only one `create` wins; the loser's catch returns the winner's row. The loser's earlier `upsertParticipant` and `upsertConversation` calls may have happened twice, but `upsertParticipant` uses `findUnique` on `externalUserId` (line 120–122) + conditional update, so worst case is a duplicate `updatedAt` bump on participant and conversation, not duplicate rows.

### Fix scope

No fix required.

### Regression test path

`src/clientchats/services/clientchats-core.service.spec.ts` should include a concurrent-insert test:

```ts
await Promise.all([
  service.processInbound('VIBER', acctId, parsedWithSameExternalMessageId),
  service.processInbound('VIBER', acctId, parsedWithSameExternalMessageId),
]);
expect(await prisma.clientChatMessage.count({ where: { externalMessageId } })).toBe(1);
```

---

## 2. C6 + C7 / #23 + #24 — Escalation cron correctness

### Evidence (file `src/clientchats/services/escalation.service.ts`)

- `checkEscalations()` decorator `@Cron('*/1 * * * *')` line 56.
- `processing` flag gate + finally reset at lines 57–65: `if (this.processing) return; this.processing = true; try { … } finally { this.processing = false; }`.
- `runEscalationCheck()` lines 68–117: `findMany` at line 80–96 has **no `take` or `take: N` limit**. `where` clause filters `status: LIVE`, `assignedUserId: { not: null }`, `firstResponseAt: null`, `lastMessageAt: { lt: warningThreshold }`. Include clause pulls `messages` sub-list (single latest inbound) for every row.
- Per-conversation loop (lines 98–116) has an inner `try { … } catch (err) { this.logger.error(...) }` — one failing conversation does not abort the remaining ones.
- `handleWarning()` (lines 119–153): duplicate-warning guard at line 123–130 scopes to `createdAt > Date.now() - 5 * 60_000`. Correct 5-minute window.
- `handleReassign()` (lines 155–226): duplicate-reassign guard at line 163–170 scopes to 10-minute window. Correct. Also creates a second `MANAGER_NOTIFIED` event at line 215–224 — **every time** the manager is notified a separate row is written, so over an extended outage this is `N × (frequency of re-reassignment check)`.

### Schedule change mid-tick

- `runEscalationCheck()` re-reads `ClientChatEscalationConfig` every tick (line 69). Each tick uses a fresh `config` snapshot, so a config edit between ticks takes effect on the next tick. That's safe.
- What is **not** safe: if `QueueScheduleService.setDaySchedule()` or `setDailyOverride()` changes during a tick, the escalation job has no interaction with the queue schedule. Escalation only reassigns conversations back to unassigned, which is correct regardless of the schedule. **So there is no mid-tick hazard between escalation and queue schedule.**
- The hazard is elsewhere (see Check #4): gateway room membership is computed at connect and doesn't reflect mid-day changes.

### Verdict

- **STILL PRESENT @ P1**: unbounded `findMany` on stale conversations. At realistic volumes (hundreds of LIVE conversations without first-response), this is tolerable. At thousands, a single tick would block the DB and queue up subsequent ticks (gated by `processing` flag so they no-op, but downstream metrics stall).
- **FIXED @ P2**: per-iteration try/catch present (lines 99–115).
- **PRESENT AND CORRECT**: processing flag reset in finally (lines 58–65).
- **PRESENT AND CORRECT**: duplicate-warning / duplicate-reassign guards (5-min and 10-min windows).

### Fix scope

Add `take: 500` to the `findMany` at line 80–96. In `handleReassign`, consolidate the MANAGER_NOTIFIED event into the same transaction as AUTO_REASSIGN to prevent double-write on retry. No structural rewrite needed.

### Regression test path

`src/clientchats/services/escalation.service.spec.ts`:
- unit: seed 100 conversations past threshold → run `checkEscalations()` → each handled exactly once (warnings created, no duplicates).
- unit: force one conversation to throw (e.g. mock update to reject) → remaining conversations still processed.
- unit: call `checkEscalations` twice immediately → second returns without running because of `processing` flag.

---

## 3. C8 / #26 — Closed-conversation archival race

### Evidence (file `src/clientchats/services/clientchats-core.service.ts`)

- `upsertConversation()` lines 180–233.
- When an existing conversation is found in status CLOSED (line 191), the code:
  1. Line 192–195: rewrites the existing's `externalConversationId` to `${externalConversationId}__archived_${Date.now()}`.
  2. Line 197–207: creates a new conversation with the original `externalConversationId`, referencing `previousConversationId`.
- There is **no transaction wrapping these two writes.** If a second inbound arrives between the UPDATE and the CREATE, it will:
  - Do its own `findUnique({ where: { externalConversationId } })` at line 186–188.
  - See `null` (because the UPDATE ran but the CREATE hasn't), OR
  - See the archived row's new id if the UPDATE hasn't run yet.
- Further: `changeStatus()` at line 437–458 sets status to CLOSED without any lock. If an inbound arrives mid-close (operator clicks Close at the same millisecond a webhook arrives), sequencing is:

### Trace: status-change → archival → new thread → saveMessage

Worst-case interleaving, labeling the operator path O and inbound path I:

```
O  findUnique(id)                            → status=LIVE
I  findUnique(externalConversationId)        → status=LIVE (same row as O)
O  update status=CLOSED                      → now CLOSED
I  goes into the CLOSED branch (lines 191–208)
I  rewrite externalConversationId to archived
I  create new conversation (points previousConversationId to the CLOSED row)
I  saveMessage on the NEW conversation
```

This is acceptable: the inbound ends up in a new thread, not the archived one. Customer's message is not lost.

**But the harder race** is two simultaneous inbound messages on a newly-CLOSED thread:

```
I1 findUnique(externalConversationId)        → status=CLOSED row A
I2 findUnique(externalConversationId)        → status=CLOSED row A (same)
I1 rewrite A.externalConversationId to archived_t1
I2 rewrite A.externalConversationId to archived_t2   ← overwrites I1's archive rename
                                                   (no error: both are unique)
I1 create new conversation B with externalConversationId, previousConversationId=A
I2 create new conversation C with externalConversationId, previousConversationId=A
                                                   ← second create raises P2002
                                                     (externalConversationId @unique)
I2 exception unhandled → webhook returns 200 to provider
                        (caller in public controller's catch logs failure)
I2's message is LOST (parsed.externalMessageId was never inserted)
```

The second inbound's message is not saved. There is no P2002 catch in `upsertConversation`. `processInbound` then proceeds to call `saveMessage` for I2, but `conversation` variable is `undefined` because upsertConversation threw. The outer controller-level try/catch swallows the error and returns `status: 0` / `EVENT_RECEIVED`, so the provider won't retry.

**Severity:** rare in practice (requires two inbound messages within the same few-millisecond window against a CLOSED conversation) but real. The archival rename race is specifically called out in CLAUDE.md §11.

### Verdict

**STILL PRESENT @ P1.** The archival path has no transaction and no P2002 handler on the create; a P2002 during concurrent close-plus-inbound drops the customer's message silently.

### Fix scope

Wrap lines 192–207 in a `prisma.$transaction`, and catch P2002 on the create to fall back to the winning new thread. Estimated 30 lines.

### Regression test path

`clientchats-core.service.spec.ts`: mock prisma with an in-memory store that simulates the race; assert exactly one thread is created per concurrent inbound burst and all messages land.

---

## 4. C11 / #25 / #34 — Queue schedule fan-out

### Evidence

- File: `C:/CRM-Platform/backend/crm-backend/src/clientchats/services/queue-schedule.service.ts`
- `setDaySchedule` (lines 32–48): delete + re-create inside `$transaction`. **No event emission.**
- `setDailyOverride` (lines 50–61): `upsert`. **No event emission.**
- `removeDailyOverride` (lines 69–77): delete, no emission.
- No dependency on `ClientChatsEventService` anywhere in the file.

- File: `C:/CRM-Platform/backend/crm-backend/src/clientchats/clientchats.gateway.ts`
- `handleConnection` lines 45–85. Line 75–79 reads `queueSchedule.getActiveOperatorsToday()` **once** at connect and conditionally calls `client.join('queue')`. No re-evaluation on schedule change.
- `handleDisconnect` lines 120–125 only logs.

### Verdict

**STILL PRESENT @ P2.** Room membership is fixed at connect. If a manager removes an operator from today's queue mid-day, the operator's socket remains in the `queue` room and keeps receiving queue events until the socket disconnects (network blip, logout, browser refresh). Inverse: adding an operator to the queue mid-day does not move their existing socket into the `queue` room until they reconnect.

### Proposed fix

1. In `setDaySchedule` and `setDailyOverride`, after write, call a new method on `ClientChatsEventService`, e.g. `emitQueueScheduleChanged(addedUserIds, removedUserIds)`.
2. In `ClientChatsGateway`, handle the event on the server side (since it's internal, not a client-originating event). Use the `server` instance to `server.in('agent:{userId}').socketsJoin('queue')` for added and `socketsLeave('queue')` for removed.
3. Alternative, lower-risk: ignore the emit and instead have connected clients request a re-evaluation whenever a schedule-change webhook arrives (more complex; less clean).

Option 1 is ~30 lines.

### Regression test path

Manual test:
1. Two operators A, B connected; A in today's queue, B not.
2. Manager removes A from today's override.
3. New inbound arrives (unassigned).
4. Expect A no longer receives `conversation:new` on that inbound.

---

## 5. C12 / #27 — Inbound pipeline order

### Evidence (`clientchats-core.service.ts` `processInbound` lines 36–105)

Step-by-step order enforced by the code structure:

1. Line 41–49: `findUnique` on `externalMessageId`. Early return if duplicate.
2. Line 51–55: `upsertParticipant()`.
3. Line 57–63: `upsertConversation()` (returns `{ conversation, isNew }`).
4. Line 67–76: `saveMessage()` (uses `conversation.id` and `participant.id`).
5. Line 78: `matching.autoMatch(participant, conversation)`.
6. Line 80–82: if `isNewConversation`, emit `conversation:new`.
7. Line 84–88: emit `message:new`.
8. Line 90–102: async Telegram phone-fetch (fire-and-forget).

### Enforcement type

**Convention only, backed by data dependencies.** Steps 2→3 are enforced by parameter flow (participant.id is an argument to upsertConversation at line 62). Steps 3→4 enforced by conversation.id being required by saveMessage. Step 5 is after saveMessage but nothing blocks a careless PR from reordering autoMatch before saveMessage: `autoMatch` takes `participant` and `conversation`, neither of which depends on the message row. Similarly emits are independent.

No compile-time safety. Moving `this.matching.autoMatch(...)` above `saveMessage` would compile and ship; the risk called out in CLAUDE.md §11 is that autoMatch can cause a client link that changes `isBetterName` behavior on the next participant upsert of an unrelated conversation — but that path is inside `matching.autoMatch`, not `saveMessage`. **The risk in practice is mostly FK integrity** (`saveMessage` requires conversation exists), which the current ordering satisfies.

### Verdict

**CONVENTION ONLY.** Not a defect today. The pipeline is correct. The risk is future regression.

### Fix scope

Optional: add a unit test that locks the order by observing mock call sequence.

### Regression test path

`clientchats-core.service.spec.ts`:

```ts
const spy = jest.spyOn(service, 'saveMessage');
const autoMatchSpy = jest.spyOn(matching, 'autoMatch');
await service.processInbound(...);
expect(spy.mock.invocationCallOrder[0]).toBeLessThan(autoMatchSpy.mock.invocationCallOrder[0]);
```

---

## 6. R3 — Operator reads any conversation by ID

### Evidence

- Controller: `C:/CRM-Platform/backend/crm-backend/src/clientchats/controllers/clientchats-agent.controller.ts`
- Handler `GET conversations/:id` (lines 75–86):

```ts
@Get('conversations/:id')
@RequirePermission('client_chats.menu')
getConversation(@Param('id') id: string) {
  return this.core.getConversation(id);
}
```

No `req.user`, no DataScope, no ownership predicate. The permission `client_chats.menu` is granted to all operators.

- Service: `clientchats-core.service.ts` `getConversation(id)` lines 828–874. No scope filter either. Given any UUID, returns the full record including channel account metadata, assigned user identity, linked client profile, and the most recent message preview.

- Compare: `listConversations` (lines 728–826) **does** apply a filter for non-managers via the controller at lines 60–72 (`assignedUserIdOrUnassigned` for operators in today's queue, `assignedUserId` for operators outside the queue). That filter is not mirrored on the `:id` read.

### Verdict

**STILL PRESENT @ P1.** Any operator with `client_chats.menu` can enumerate UUIDs (or guess them from `conversationId` in a URL, socket payload, or logs) and fetch conversation metadata they should not see. This is the Monday-morning scenario in THREAT_MODEL.md R3. Findings #28 explicitly calls it out.

`GET conversations/:id/messages` (lines 88–111) has the same defect. Same for `conversations/:id/history` (lines 227–250), `join`, `assign`, `status`, `request-reopen`, `link-client`, `unlink-client`. All of these trust the caller to supply an ID they can legally touch.

### Fix scope

Centralize in `ClientChatsCoreService` a helper `assertCanAccess(conversationId, user)` that:
1. Loads the conversation.
2. If `user.isSuperAdmin || user.permissions.includes('client_chats.manage')` → allow.
3. Else if `conversation.assignedUserId === user.id` → allow.
4. Else if the operator is in today's queue AND `conversation.assignedUserId == null` → allow.
5. Else → throw `ForbiddenException`.

Call at the top of every handler. Estimated 60 lines + wiring across all endpoints.

### Regression test path

`clientchats-agent.controller.spec.ts`:
- GIVEN operator A is assigned conversation X and operator B is assigned conversation Y, both outside today's queue.
- WHEN operator A issues `GET /v1/clientchats/conversations/Y`, expect 403.
- WHEN operator A in today's queue issues `GET /v1/clientchats/conversations/unassignedZ`, expect 200.

---

## 7. C5 — Webhook replay protection

### Evidence

| Adapter | File | Verification |
|---|---|---|
| Viber | `adapters/viber.adapter.ts` lines 20–49 | HMAC-SHA256 of rawBody with `VIBER_BOT_TOKEN`. timingSafeEqual. **No timestamp, no nonce.** |
| Facebook | `adapters/facebook.adapter.ts` lines 50–74 | HMAC-SHA256 `x-hub-signature-256` over rawBody. timingSafeEqual. **No timestamp, no nonce.** |
| Telegram | `adapters/telegram.adapter.ts` lines 22–49 | Bearer-style secret-token header compared timing-safe to `TELEGRAM_WEBHOOK_SECRET`. **No HMAC, no timestamp, no nonce.** |
| WhatsApp | `adapters/whatsapp.adapter.ts` lines 16–84 | HMAC-SHA256 `x-hub-signature-256` over rawBody. timingSafeEqual. **No timestamp, no nonce.** |
| Web widget | `adapters/web-chat.adapter.ts` line 15 | `return true;` (internal; relies on conversation JWT 24h TTL from `/start`). |

Full grep for any `timestamp`, `nonce`, `replay`, or `x-timestamp` elsewhere in adapters: zero matches.

### Threat

An attacker who captures one signed body (e.g. via a compromised TLS proxy, old log file, or Meta-side log export) can resend it indefinitely. For Meta channels, the `externalMessageId` uniqueness (schema line 1778) will deduplicate message inserts — so replaying the identical body is mostly neutralized by that path. But:

1. The attacker can mutate the body JSON shape to change content (since HMAC is over the exact bytes, mutation breaks signature — OK).
2. The attacker can replay the **same** body, which will hit `processInbound`, pass signature, duplicate-check will find existing message, and return early. Harmless.
3. **Harmful case:** replay a body **before** it was originally delivered (if the attacker somehow gets a pre-delivery-signed body — e.g. a man-in-the-middle). Replay results in the original message being dedup'd when it arrives later. Rare attacker model.

For Telegram, the secret-token model is weaker in theory (long-lived secret) but same replay semantics because externalMessageId dedups.

**Practical severity:** P1 in theory; P2 in practice because of the dedup shield. The INVENTORY treats it as P1 — keep that labeling.

### Verdict

**STILL PRESENT @ P1** (as classified in THREAT_MODEL C5). Mitigation by `externalMessageId` dedup limits blast radius, but there is no independent replay protection.

### Fix scope

Meta webhooks do not publish a standard timestamp header, so the fix is non-trivial. Two options:

1. Add a sliding window: reject any inbound whose `externalMessageId` was already present AND whose payload `timestamp` field (Meta includes one in the entry/messaging array) is older than N minutes. Not a full defence but raises the bar.
2. Accept it as a P1 backlog item with the dedup shield as mitigation.

### Regression test path

Not testable without a replay vector; document in the security backlog.

---

## 8. C10 — Attachment size validation

### Evidence

- Controller: `clientchats-agent.controller.ts` lines 131–149. `FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 }, fileFilter: … })`.
- Accepted MIME types (lines 134–141): `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`. Anything else → `BadRequestException('File type not allowed')`.
- Multipart parser: `@nestjs/platform-express` → `multer`. Default error on limit exceeded is `MulterError` code `LIMIT_FILE_SIZE`, which NestJS surfaces as a 500 by default unless an exception filter maps it. **No exception filter observed for MulterError.** Expected browser behavior: HTTP 500 (not 413) with a default error JSON.
- Frontend: `frontend/crm-frontend/src/app/app/client-chats/components/reply-box.tsx` lines 136–154. Client-side pre-check identical thresholds and MIME list; rejects with `alert('File too large. Maximum 10 MB.')` on oversize, or `alert('File type not allowed…')` on wrong MIME. Client never hits the server when oversize.
- `handleSend` lines 163–186: on exception during send, the `catch` block is empty (line 181–183 `catch { /* keep text for retry */ }`). No user-facing toast for a server-side 413/500. Sending spinner is reset in `finally`; operator sees the input box un-disable and may assume the file was sent.

### Verdict

**PARTIAL.**
- Server enforces 10 MB limit and MIME whitelist.
- Frontend duplicates the pre-check (good UX).
- **If the pre-check is bypassed** (e.g. user sends via a different client, or multi-megabyte PDF that the browser under-reports), server's `multer` LIMIT_FILE_SIZE will produce a **500 with no body**, and the frontend's empty-catch will silently clear sending spinner. Operator sees nothing to indicate failure.

Separately, **there is no explicit 413 mapping** in the Nest app; by default `multer` errors become `InternalServerErrorException`. That's a minor P2.

### Fix scope

1. Add an exception filter in `clientchats-agent.controller.ts` (or globally) mapping `MulterError` to `PayloadTooLargeException (413)` and `BadRequestException` for file-type.
2. In `reply-box.tsx` line 181, surface a toast on error rather than silent catch.

### Regression test path

- Integration: upload 11 MB PDF via curl → expect 413 with JSON body (not 500).
- UI: same file via Electron softphone browser → expect toast with "File too large".

---

## 9. C4 — WhatsApp 24h window enforcement

### Evidence

- `clientchats-core.service.ts`:
  - `isWhatsAppWindowOpen(conversationId)` lines 983–1012. Reads latest IN message; returns `true` if < 24h. Falls back: if no IN messages but conversation is new from archived one (< 5 min old), also returns `true`.
  - `sendReply()` (operator text reply, lines 343–417): **does NOT call `isWhatsAppWindowOpen`.** It delegates directly to `adapter.sendMessage()` regardless of channel or window.
  - `sendWhatsAppTemplate()` lines 1047–1133 is the non-text path and doesn't need the 24h guard (templates are explicitly how you break out of the window).
- `whatsapp.adapter.ts` `sendMessage` lines 168–203: calls Cloud API. On failure, `parseWaResponse` lines 320–335 reads `data.error` and returns `{ success: false, error: msg }`.
- Back in `clientchats-core.service.ts sendReply` line 373–378: the result of adapter.sendMessage is **not checked for `success`**. The code proceeds unconditionally to `saveMessage` with `externalMessageId = result.externalMessageId || fallback`.
- When Cloud API rejects the message with the 24h-window error (code 131047 / `Message failed to send`), adapter returns `{ success: false, externalMessageId: '', error: '…' }`. Core service then writes a `ClientChatMessage` with a synthetic `externalMessageId` (fallback `out_${conversationId}_${Date.now()}`) and emits `message:new`. **The frontend shows the message as sent.**
- `getConversation(id)` lines 828–874 does include `whatsappWindowOpen` (line 870) — so the frontend **can** show whether the window is open. Grep for that flag on the frontend:

```
frontend/crm-frontend/src/app/app/client-chats/components/reply-box.tsx:   not observed (reply-box.tsx does not check whatsappWindowOpen)
```

Re-checking the frontend component, the frontend does not gate the text input on `whatsappWindowOpen`.

### Verdict

**PARTIAL / STILL PRESENT @ P1 (C4).**
- A detector exists (`isWhatsAppWindowOpen`) and is exposed via `getConversation`.
- The send path does not call the detector. A sent-but-failed text message is saved to DB and shown to the operator as sent.
- The frontend does not surface the window state to block the send UI.

### Fix scope

1. In `sendReply`, if `conversation.channelType === WHATSAPP` and `await this.isWhatsAppWindowOpen(conversationId)` is false **and no media is attached**, throw BadRequestException with code `wa_window_closed`. (Templates bypass this and go through `sendWhatsAppTemplate`.)
2. In reply-box.tsx, read `whatsappWindowOpen` from conversation detail; when false, replace the Send button with a "Send Template" button and show a banner.
3. Additionally: check `result.success` in `sendReply` at line 378 and throw if false; do not save the message in that case.

### Regression test path

`clientchats-core.service.spec.ts`:
- conversation with latest IN 25h ago → `sendReply` throws.
- conversation with latest IN 23h ago → `sendReply` succeeds.
- adapter returns `{ success: false }` → `sendReply` throws, no message row inserted.

---

## 10. Conversation deletion chain walk (#46)

### Evidence

- `clientchats-core.service.ts` `deleteConversation()` lines 460–503.
- Walk loop lines 466–476: `while (prevId)` does one `findUnique` per hop to fetch `previousConversationId`. For chain depth N: `N` findUniques.
- Forward-reference scan line 479–482: one `findMany` total.
- Self-nullify line 488–491: one `updateMany`.
- Delete line 494–496: one `deleteMany` (cascades messages and escalation events via FK schema).

### Query count

For a chain of N conversations:
- Backward walk: N `findUnique` calls (sequential `await`).
- Forward scan: 1 `findMany`.
- Initial fetch: 1 `findUnique`.
- Nullify: 1 `updateMany`.
- Delete: 1 `deleteMany`.

**Total: N + 4 queries.**

At realistic depths (N is typically 1–3 because a conversation is only "closed and reopened" a handful of times), this is 5–7 queries per delete. Tolerable.

Worst realistic case from production data: if an operator closed-and-reopened a resident's WhatsApp thread dozens of times over years, N could reach 10–20. Still tolerable.

### Verdict

**STILL PRESENT @ P2** (N+1 pattern exists but bounded by business-realistic N). Not a Monday blocker.

### Fix scope

Replace the while-loop with a single recursive CTE or a loop that batches via `findMany({ where: { id: { in: idsSoFar } } })` per level. Estimated 20 lines.

### Regression test path

Unit test with N=20 chain; assert exactly 1 `findMany` backward walk and 1 `deleteMany`.

---

## 11. M10 — `firstResponseAt` setting

### Evidence

- `clientchats-core.service.ts sendReply` lines 343–417.
- Line 396–407: builds `updateData`, sets `firstResponseAt = new Date()` at line 401 **only if `!conversation.firstResponseAt`** (read from line 349's findUnique at the start of the method).
- The update at line 404–407 applies `updateData`.

### Race analysis

Consider two concurrent operator replies on the same conversation (e.g. operator A and manager B both click reply simultaneously):

```
A read conversation (firstResponseAt=null)
B read conversation (firstResponseAt=null)
A adapter.sendMessage
B adapter.sendMessage
A saveMessage
B saveMessage
A update firstResponseAt=T1, lastMessageAt=T1
B update firstResponseAt=T2, lastMessageAt=T2   ← overwrites A's firstResponseAt
```

So `firstResponseAt` ends up as T2 (later of the two). This is wrong in principle (should be T1, the genuine first response) but the error is on the order of milliseconds. Negligible for the analytics consumer.

Worse case: **escalation cron updates conversation simultaneously**. EscalationService.handleReassign at line 175 sets `assignedUserId: null, lastOperatorActivityAt: null`. It does **not** touch `firstResponseAt`. So a concurrent escalation tick and first reply cannot corrupt `firstResponseAt`.

**What can drop `firstResponseAt`?**
- `changeStatus` line 437 does not clear it.
- `deleteConversation` cascades — OK.
- `assignConversation` line 421 does not touch it.
- `approveReopen` line 597–632 does not touch it.
- `changeStatus` on reopen from CLOSED (line 448–450) clears `resolvedAt` but not `firstResponseAt`. That's arguably a bug: if a conversation is closed and reopened, the firstResponseAt represents the first response of the **original** thread, not the reopened one. Analytics read this per-conversation so it could be off.
- Manager's bulk reset at `clientchats-manager.controller.ts` lines 289–307 explicitly nulls `firstResponseAt` for reopens. That's a separate path.

### Verdict

**MOSTLY OK @ P2.**
- Single-operator case is correct.
- Two-operator concurrent first-reply creates a small (millisecond) timestamp skew; not analytically significant.
- Reopen path nullifies via manager controller; core service path does not.

### Fix scope

Optional: use an atomic `updateMany` with `where: { id, firstResponseAt: null }` so only the first setter wins. 5-line change at lines 400–407.

### Regression test path

`clientchats-core.service.spec.ts`:
- Two concurrent `sendReply` calls on a fresh conversation. Expect final `firstResponseAt` to be the earlier of the two adapter responses.

---

## 12. Channel credential precedence

### Evidence

- `whatsapp.adapter.ts` `sendMessage` line 174–181:
  - token = `channelAccountMetadata.waAccessToken` ?? `process.env.WA_ACCESS_TOKEN` ?? `''`
  - phoneNumberId similar.
- Same pattern in `sendWhatsAppTemplate` (line 1065–1072 of core service): DB metadata first, no env fallback for template path.
- `viber.adapter.ts` line 17: token is `process.env.VIBER_BOT_TOKEN || ''` (no DB override on send; verify path in the `ViberAdapter` constructor / override parameter at call sites).
- Looking at `clientchats-public.controller.ts`: for GET-verify paths it passes DB overrides to the adapter (lines 205–212 for Facebook, lines 321–326 for WhatsApp). Verify the POST path:
  - Viber POST at line 141–186 does **not** pass overrides to `viber.parseInbound`; signature check is handled by `ViberWebhookGuard` (not shown here but presumably reads DB first).
- For channel metadata read on send, the `sendReply` flow at line 367–378:

```ts
const adapter = this.adapterRegistry.getOrThrow(conversation.channelType);
const metadata = (conversation.channelAccount.metadata ?? {}) as Record<string, unknown>;
const result = await adapter.sendMessage(conversation.externalConversationId, text, metadata, media);
```

So `metadata` is loaded fresh every send — DB is authoritative for send. There is no in-memory cache of metadata (except `templateCache` for WhatsApp templates, line 981, 5-minute TTL).

### Verdict

**CORRECT.** DB `channelAccount.metadata` is read fresh on every send. Env var is only a fallback when DB value is empty/missing. Admin updates via `updateChannelAccountConfig` (line 960–977) take effect immediately on the next outbound send.

### Caveat

For webhook **signature verification** paths, the guards (`ViberWebhookGuard`, `FacebookWebhookGuard`, `TelegramWebhookGuard`, `WhatsAppWebhookGuard`) need to read the metadata per-request. Verify guard implementations load fresh; if any guard caches the DB row, admin updates won't invalidate until restart. Not verified in this pass (guards live outside this phase's scope in `src/clientchats/guards/webhook-signature.guard.ts`).

### Fix scope

Nothing in core-service. If guards cache, add TTL-based cache invalidation. Out of scope for this report.

### Regression test path

Manual: update `channelAccount.metadata.waAccessToken` via admin UI, send outbound via operator UI, inspect CRM logs for the new token. If still using old: fix guard or admin-service invalidation.

---

## P0 / P1 List

### P0
_None identified by this verification pass._ The closest P0 from INVENTORY (SIP password plaintext, login throttle, cookie secure) are out of scope for chats; the chat pipeline itself has no P0.

### P1
1. **Check #2a — Escalation unbounded `findMany`** at `escalation.service.ts:80–96`. Add `take: 500`. [fix-before-monday]
2. **Check #3 — Closed-conversation archival race** at `clientchats-core.service.ts:192–207`. Wrap in `$transaction` and catch P2002 on create. [fix-before-monday]
3. **Check #6 — Scope check missing on single-conversation reads** at `clientchats-agent.controller.ts:75–86`, 88–111, 227–250, and all mutation handlers. Add `assertCanAccess` helper in core service. [P1, data leak — fix-before-monday]
4. **Check #7 — Webhook replay protection** in 4 adapters. Document as P1 backlog; dedup shield mitigates in practice.
5. **Check #9 — WhatsApp 24h window not enforced on send** at `clientchats-core.service.ts:343–417`. Call `isWhatsAppWindowOpen`; throw when closed; surface `whatsappWindowOpen` in frontend reply-box. [fix-before-monday]

### P2 (selected, in-scope)
6. Check #4 — queue schedule fan-out `emitQueueUpdated` missing. File: `queue-schedule.service.ts` entire file plus `clientchats.gateway.ts:45–85`.
7. Check #8 — attachment upload error handling (500 → 413 mapping, frontend toast).
8. Check #10 — deletion chain walk N+1 (bounded by business N; defer).
9. Check #11 — `firstResponseAt` concurrent-set race (millisecond skew; defer).
10. Check #5 — add regression test locking pipeline order; convention-only today.

---

## Appendix: file-line cross reference

| Subject | File | Lines |
|---|---|---|
| processInbound pipeline | `backend/crm-backend/src/clientchats/services/clientchats-core.service.ts` | 36–105 |
| saveMessage + P2002 catch | same | 296–339 |
| upsertConversation (archival race) | same | 180–233 |
| sendReply (24h + success-ignored) | same | 343–417 |
| isWhatsAppWindowOpen | same | 983–1012 |
| getConversation (no scope) | same | 828–874 |
| deleteConversation (chain walk) | same | 460–503 |
| listConversations (has scope filter) | same | 728–826; applied at controller 60–72 |
| checkEscalations cron | `backend/crm-backend/src/clientchats/services/escalation.service.ts` | 56–117 |
| handleWarning 5-min guard | same | 119–153 |
| handleReassign 10-min guard | same | 155–226 |
| Queue schedule write (no emit) | `backend/crm-backend/src/clientchats/services/queue-schedule.service.ts` | 32–77 |
| Gateway handleConnection (fixed rooms) | `backend/crm-backend/src/clientchats/clientchats.gateway.ts` | 45–85 |
| Agent controller GET conversations/:id | `backend/crm-backend/src/clientchats/controllers/clientchats-agent.controller.ts` | 75–86 |
| Agent controller reply (multipart) | same | 121–171 |
| Public controller webhook routes | `backend/crm-backend/src/clientchats/controllers/clientchats-public.controller.ts` | 139–372 |
| Viber verifyWebhook | `backend/crm-backend/src/clientchats/adapters/viber.adapter.ts` | 20–49 |
| Telegram verifyWebhook | `backend/crm-backend/src/clientchats/adapters/telegram.adapter.ts` | 22–49 |
| Facebook verifyWebhook | `backend/crm-backend/src/clientchats/adapters/facebook.adapter.ts` | 50–74 |
| WhatsApp verifyWebhook | `backend/crm-backend/src/clientchats/adapters/whatsapp.adapter.ts` | 16–84 |
| WhatsApp sendMessage (success ignored by caller) | same | 168–203 |
| Prisma @unique on externalMessageId | `backend/crm-backend/prisma/schema.prisma` | 1778 |
| Reply-box client-side size check + silent error catch | `frontend/crm-frontend/src/app/app/client-chats/components/reply-box.tsx` | 136–186 |

---

*End of phase1-chats.md*
