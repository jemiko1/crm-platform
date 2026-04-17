# Phase 1 — Static audit: consolidated findings

Seven domain-specific agents ran static audits against `audit/INVENTORY.md`, `audit/THREAT_MODEL.md`, and `audit/KNOWN_FINDINGS_CARRIED_FORWARD.md` on the master branch at commit `ad1f34d`. Full reports:

- `audit/phase1-rbac.md`
- `audit/phase1-telephony-stats.md`
- `audit/phase1-security.md`
- `audit/phase1-chats.md`
- `audit/phase1-realtime.md`
- `audit/phase1-softphone-ami.md`
- `audit/phase1-frontend.md`

All findings are read-only static evidence. No code edited. Dynamic verification runs in Phase 2 and live verification in Phase 3.

---

## P0 — launch blockers (must be fixed before any operator logs in Monday)

| # | Finding | Where | Evidence summary |
|---|---|---|---|
| P0-A | **RoleGroup permission gap** — CALL_CENTER and MANAGEMENT role groups do not carry the permissions needed. | `prisma/seed-rbac.ts:125–148`, `prisma/seed-all.ts:10–19`, `prisma/seed-permissions.ts` | seed-rbac.ts still assigns hyphenated legacy permission keys (`work-orders.read` etc.) that seed-permissions.ts already deleted. When `seed:all` runs, those strings resolve to `undefined` in the permissionMap and silently drop. Net: CALL_CENTER ends with ~6 real perms, MANAGEMENT with ~10 — neither includes `call_center.menu`, `call_logs.*`, `missed_calls.*`, `call_center.live/.quality/.statistics`, or `client_chats.manage`. On Monday, operators and managers hit 403 on every call-center endpoint and get blank sidebars. VM deploy only runs `seed-permissions.ts`, so the gap is frozen regardless of migration run. |
| P0-B | **SIP password plaintext in auth responses.** | `src/auth/auth.service.ts:51,105`, `src/auth/auth.controller.ts:283` | `/auth/me`, `/auth/app-login`, `/auth/exchange-token` all return `telephonyExtension.sipPassword` in the response body. Any authenticated user can `curl /auth/me` and read their own SIP credentials. The web UI never needs them; the softphone does. Frontend React state holds plaintext; DevTools → Network reveals it; any XSS sink dumps it. |
| P0-C | **SIP password plaintext on softphone disk + in logs.** | `crm-phone/src/main/session-store.ts:13`, `crm-phone/src/main/index.ts:188` | Softphone persists session to `%APPDATA%\crm28-phone\crm-phone-session.json` with a hardcoded XOR-equivalent `encryptionKey: "crm-phone-v1"`, AND logs the full `telephonyExtension` (incl. password) to `crm-phone-debug.log` via `JSON.stringify` at boot. |
| P0-D | **Login brute-force protection insufficient.** | `src/auth/auth.controller.ts:54–160`, `src/auth/login-throttle.service.ts:1–51` | `LoginThrottleService` is per-email only, 5 attempts / 5 min, **in-memory Map lost on restart**. No per-IP throttle on login. Global ThrottlerGuard caps 60 req/min/IP, so a single IP can try **86,400 distinct emails/day** without triggering. Any deploy restart (GitHub Actions auto-deploy on master merge) resets throttle state. |
| P0-E | **JWT `payload.id` vs `sub` mismatch breaks telephony + messenger sockets.** | `src/telephony/realtime/telephony.gateway.ts:259–282`, `src/messenger/messenger.gateway.ts:290–320` | `auth.service.ts` signs JWTs with `{sub, email, role}`. Both telephony and messenger gateways' `authenticateSocket()` reads `payload.id` and returns null if absent → every socket disconnect. Impact: no `call:report-trigger` (operators miss every post-call prompt), no screen pops, no messenger realtime for team coordination. Client chats gateway correctly uses `payload.sub`. Two-line diff per gateway. Originally P1 in Phase 0; elevated to P0 because it breaks the operator surface. |
| P0-F | **SIP no re-register on drop.** | `crm-phone/src/renderer/sip-service.ts` (Registerer.register called only on login/restore/switch-user) | SIP registration expires every 300s but Registerer never re-registers on network drop. Backend has no feedback loop — operator appears "available" in CRM while SIP is dead → incoming calls go to voicemail / timeout. |
| P0-G | **Statistics correctness: missing CallMetrics silently excluded, transfers credit only last operator, disposition replay overwrites.** | `src/telephony/services/telephony-stats.service.ts` (M3, M5); `src/telephony/services/telephony-ingestion.service.ts:230` (M2/M7) | M3: `sessions.filter(s => s.callMetrics)` drops calls missing CallMetrics → SLA%, averages inflate. M5: `handleTransfer` overwrites `assignedUserId` → earlier operators uncredited. M2/M7: `handleCallEnd` recomputes disposition on every replay with no `isFirstEnd` guard. All three directly violate the "every number a manager sees matches an independent recount" success criterion. |

## P1 — must-fix

| # | Finding | Where | Severity driver |
|---|---|---|---|
| P1-1 | Operator can read any conversation by ID | `src/clientchats/controllers/clientchats-agent.controller.ts:75–86` + core `getConversation` no scope filter | Privacy: operator reads colleague's chat with resident. |
| P1-2 | Recording access has no scope check | `src/telephony/controllers/telephony-recording.controller.ts:22–130` | `call_recordings.*` permissions defined in catalog but never read. Controller gates on `call_center.menu`. Any operator streams any recording by UUID. |
| P1-3 | Unbounded `findMany` in telephony stats (5 methods) | `src/telephony/services/telephony-stats.service.ts` | At ~730k CallSession rows (2yr) single request is ~140MB RSS; manager dashboards OOM or time out. |
| P1-4 | Escalation cron has no `take` on stale-conversation query | `src/clientchats/services/escalation.service.ts:80–96` | Every minute pulls all stale conversations into memory. |
| P1-5 | Closed-conversation archival is not transactional; customer messages can be dropped under concurrent inbound | `src/clientchats/services/clientchats-core.service.ts:192–207` | UPDATE + CREATE not wrapped in `$transaction`; P2002 on concurrent create → provider gets `EVENT_RECEIVED` → message lost. |
| P1-6 | `sendReply` never checks WhatsApp 24h window or `result.success` | `src/clientchats/services/clientchats-core.service.ts:343–417` | Silent failure after 24h; UI shows "sent". |
| P1-7 | Prompt injection in QualityPipeline | `src/telephony/quality/quality-pipeline.service.ts:175–204` | Caller transcript flows unescaped to GPT; attacker speaks injection text to manipulate their own review score. |
| P1-8 | AMI ingest transfer/hold idempotency uses `Date.now()` | `ami-bridge/src/event-mapper.ts:261,280` | Bridge restart or retry → fresh keys → dedup miss → duplicated transfer counts / hold seconds. Observed today: 3 stacked `crm_ami` sessions from Phase 0. |
| P1-9 | AMI broadcast flood: every AMI event → `queue:updated` + `agent:status` to all subscribers, no throttle or diff | `src/telephony/realtime/telephony.gateway.ts:116–176` | ~115 msg/sec during 10-call-per-minute bursts with 70 subscribers. Not harmful today because live-monitor doesn't subscribe, but trivially breaks once it does. |
| P1-10 | Switch-user mismatch banner hides when local bridge is down | `frontend/crm-frontend/src/hooks/useDesktopPhone.ts:32–63` | Bridge 404 is treated identically to "no mismatch" → calls attributed to wrong operator all day. |
| P1-11 | Queue-schedule mid-day changes don't re-fan sockets | `src/clientchats/services/queue-schedule.service.ts:32–48`, `src/clientchats/clientchats.gateway.ts:75–79` | `emitQueueUpdated` is dead code. Operator removed from queue at 11:00 keeps receiving unassigned chats until refresh. |
| P1-12 | Softphone local bridge has lax CORS + no CSRF | `crm-phone/src/main/local-server.ts` + `useDesktopPhone.ts` | `origin.includes("localhost")` matches `evil-localhost.com`. `/dial` + `/status` have no auth token. Any local malicious web tab can dial the operator's extension. |
| P1-13 | `/auth/device-token` has no `@RequirePermission`, no cleanup cron; consume race between findUnique and update is 1–5 ms | `src/auth/auth.controller.ts:162–185`, `src/auth/auth.service.ts:58–110` | Small window for race; no TTL cleanup means DeviceHandshakeToken grows. |
| P1-14 | Device token consume race in `exchangeDeviceToken` | `src/auth/auth.service.ts:70–81` | `findUnique` + `update` not atomic; second request in same 1–5ms can also consume. Same token reusable in narrow window. |

## P2 — should-fix (in scope)

| # | Finding | Where |
|---|---|---|
| P2-1 | Clientchats gateway CORS reads raw env with wrong dev default (`localhost:3001`) | `src/clientchats/clientchats.gateway.ts:18–22` |
| P2-2 | Session fixation: old JWT valid for full `JWT_EXPIRES_IN` after refresh | `src/auth/auth.controller.ts:215–230`, `src/auth/auth.module.ts:19` |
| P2-3 | Superadmin + queue duplicate socket delivery | `src/clientchats/services/clientchats-event.service.ts:14–59` — frontend dedups, but wasted bandwidth |
| P2-4 | Messenger typing flood: no participant check, no server throttle | `src/messenger/messenger.gateway.ts:165–176` |
| P2-5 | Orphan CallEvents with `callSessionId:null` accumulate | `src/telephony/services/telephony-ingestion.service.ts` |
| P2-6 | Softphone auto-updater doesn't check call state before downloading | `crm-phone/src/main/auto-updater.ts` |
| P2-7 | Mixed date formatting (locale unset) in call-center + client-chats | `reports/page.tsx:194`, `call-report-modal.tsx:225`, `conversation-panel.tsx:320`, `message-bubble.tsx:92` |
| P2-8 | Inactivity alert fires while operator is drafting reply (timer keyed on `messages`, not typing focus) | `conversation-panel.tsx:93–113` |
| P2-9 | Reply-box shows no error feedback on send failure | `reply-box.tsx:181` |

## Informational — already fixed or acceptable

- JWT_SECRET hard-fail on boot (`main.ts:13–16`). Fixed.
- Cookie security helper with dev-override. Fixed.
- Telephony ingest guard timing-safe, no secret in logs. Fixed.
- All four webhook adapters: HMAC-SHA256 + timing-safe + rawBody. Fixed.
- `@SkipThrottle()` correctly scoped. Fixed.
- `TelephonyExtensionsController` POST/PATCH/DELETE: `@RequirePermission('telephony.manage')` on write methods. Finding #14 FIXED.
- `bcryptjs` removed from deps; only `bcrypt` remains. Finding #67 FIXED.
- `.env` in `.gitignore`. Fixed.
- Inline modals in `conversation-header.tsx` — FIXED (current file uses `createPortal` + dropdown-popover, not inline modals). Finding #55 no longer applies to this file.
- Raw fetch() in frontend: down from ~37 to 5, all intentional (softphone bridge + login page bootstrap). Finding #4 largely resolved; remaining callers documented.
- Call-center layout `PermissionGuard` wraps every tab page. Finding #51 FIXED.
- Client-chats manager toggle correctly gated. Finding #52 context: n/a.
- Error boundaries present in both segments.
- Frontend typecheck passes.
- Messenger dedup race fix (`P2002` catch in saveMessage): confirmed. Finding #20 FIXED.
- Escalation `processing` flag and per-iter try/catch: both present. Findings #23 and partial #24 confirmed.
- Client chats polling fallback (5s/15s) + frontend dedup by message ID: working. Finding #37 mitigated.
- Telephony `TelephonyStateManager.hydrateFromDb()` rebuilds active calls on boot. Finding #33 mitigated.
- Cookie name consistent across all three gateways + frontend. RT3 passes.
- Login throttle's `assertNotLocked` runs before password check (locked account gets 429 without DB hit). Good. Finding #1 P0 downgraded to mean: "still needs per-IP + persistence."

## Cross-references to threat model scenarios

| Threat | Disposition |
|---|---|
| A1 (session theft) | P2 — sliding-window refresh extends exposure window. Accept with shortened `JWT_EXPIRES_IN`. |
| A2 (brute force) | **P0-D** STILL PRESENT. |
| A3 (missing JWT_SECRET) | FIXED. |
| A4 (cookie_secure) | FIXED in dev; prod env verified. |
| A5 (device-token replay) | P1-14. |
| A6 (throttle lost on restart) | P0-D. |
| A7 (refresh leaks old cookie) | P2-2. |
| R1 (role group gap) | **P0-A** STILL PRESENT. |
| R2 (handlers without @RequirePermission) | Out of scope for Monday beyond what's been verified (extensions controller is FIXED). |
| R3 (operator reads any conversation) | **P1-1** STILL PRESENT. |
| R4 (data-scope bug in stats) | **P0-G** STILL PRESENT (M3, M5). |
| R5 (superadmin duplicate delivery) | P2-3 STILL PRESENT. |
| R6 (extensions controller missing permission) | FIXED. |
| R7 (dual RBAC systems) | Informational. |
| T1 (TELEPHONY_INGEST_SECRET drift) | Guard + AMI bridge both fail-closed. Operational risk only. |
| T2 (3 stacked AMI sessions) | P1-8 idempotency key risk; needs bridge-process audit on VM. |
| T4 (unbounded stats findMany) | **P1-3** STILL PRESENT. |
| T5 (CDR overlap) | FIXED — `processing` flag present. Finding #18. |
| T8 (payload.id vs sub) | **P0-E** STILL PRESENT. |
| T11 (idempotency collision) | **P1-8** STILL PRESENT. |
| T12 (CDR+AMI disposition flip) | **P0-G** STILL PRESENT (M2/M7). |
| S1 (SIP password plaintext) | **P0-B + P0-C** STILL PRESENT. |
| S2, S9 (SIP re-register) | **P0-F** STILL PRESENT. |
| S6 (switch-user bridge down) | **P1-10** STILL PRESENT. |
| S7 (AMI buffer overflow) | FIXED (5000 cap + oldest-eviction). |
| E3 (recording scope check) | **P1-2** STILL PRESENT. |
| M1 (duplicate ingest inflation) | Possible via P1-8 if bridge restarts / 3 sessions coalesce. |
| M2 (disposition replay) | **P0-G** STILL PRESENT. |
| M3 (SLA missing CallMetrics) | **P0-G** STILL PRESENT. |
| M5 (transfer attribution) | **P0-G** STILL PRESENT. |
| M6 (timezone drift) | Needs dynamic Phase 2/3 verification. |
| M8 (callback attribution) | Accept for now; needs live Phase 3 verification. |
| M10 (firstResponseAt race) | P2 race window is ms-scale. Non-blocker. |
| RT4 (broadcast flood) | **P1-9** STILL PRESENT. |
| C1, C8, C12 | P1-5 STILL PRESENT (archival). Pipeline order is convention-only (C12); not load-bearing unless a future PR breaks it. |
| C7 (escalation unbounded) | **P1-4** STILL PRESENT. |
| C11 (queue schedule stale) | **P1-11** STILL PRESENT. |
| O1 (master-merge auto-deploy mid-shift) | Operational: freeze deploys Monday morning. |
| O3 (API_BACKEND_URL missing) | Defensive guard in place; verify VM env. |

## Phase 4 fix plan (sequenced)

Branch every fix off master as `fix/audit/<topic>`. Each PR must:
- Include one or more regression tests (unit or integration) that would have failed before the fix.
- Be reviewed by the `code-reviewer` agent before merge.
- Be testable on local stack (Phase 2/3 to re-run after batch).

Order of work (sequence matters because some fixes depend on schema/seed changes):

1. **P0-A** — Update `seed-rbac.ts` or introduce `seed-role-group-permissions.ts` that explicitly grants the correct permission set to CALL_CENTER + MANAGEMENT RoleGroups. Include audit test that queries each position's effective permissions and asserts the Monday-critical ones are present. Wire into `start:deploy`.
2. **P0-B + P0-C** — Strip `sipPassword` from `/auth/me`. Introduce `POST /v1/telephony/sip-credentials` (narrow permission) for the softphone. Remove `session-store.ts` disk persistence of the password; keep in Electron main-process memory only. Remove the JSON.stringify log line. Schema change deferred (column encryption separate PR).
3. **P0-D** — Add `@Throttle({ limit: 10, ttl: 60_000 })` per-IP on `/auth/login` and `/auth/app-login`. Persist `LoginThrottleService` state to Postgres (new `LoginAttempt` model with unique (email, ip) and window).
4. **P0-E** — Two-line change each in `telephony.gateway.ts` and `messenger.gateway.ts`: `payload?.id` → `payload?.sub`; return `{id: payload.sub, ...}`. Gateway spec regression tests.
5. **P0-F** — Wire Registerer to re-register on transport-disconnect. Add backend endpoint `/v1/telephony/agents/presence` for softphone to report SIP status; backend marks agent offline if no heartbeat for 60s.
6. **P0-G** — `TelephonyStatsService` methods: replace `findMany` + in-JS aggregation with `$queryRaw` GROUP BY. Fix `handleTransfer` to append a `CallLeg` instead of overwriting `assignedUserId`. Add `isFirstEnd` guard on `handleCallEnd`. Agent breakdown computes by joining CallLeg (not assignedUserId).
7. **P1-1 + P1-2** — Push scope check into `ClientChatsCoreService.getConversation(id, userId, isManager)` and `RecordingAccessService.getRecordingById(id, userId, scopeCheck)`. Jest tests for cross-operator access.
8. **P1-3 + P1-4** — Pagination + GROUP BY on stats; `take: 100` on escalation query.
9. **P1-5** — Wrap archival UPDATE + CREATE in `$transaction`.
10. **P1-6** — `sendReply` checks 24h window, persists failed messages with `deliveryStatus='FAILED'`, surfaces to frontend.
11. **P1-7** — QualityPipeline prompt hardening: transcript delimiter, heuristic cross-check, log prompt/response.
12. **P1-8** — AMI bridge idempotency: replace `Date.now()` with `(linkedid, uniqueid, eventType, seq)` composite key.
13. **P1-9** — Telephony gateway: diff-then-emit for `queue:updated`; throttle `agent:status` to 1/sec per agent.
14. **P1-10** — `useDesktopPhone.ts`: distinguish "bridge unreachable" from "no mismatch"; show banner regardless.
15. **P1-11** — `QueueScheduleService`: call `emitQueueUpdated` after any schedule mutation; gateway re-computes room membership for connected sockets.
16. **P1-12** — Softphone local bridge: exact-origin allow-list (`http://localhost:4002` only); add per-session handshake token to `/dial` + `/status`.
17. **P1-13 + P1-14** — `@RequirePermission('softphone.handshake')` on device-token; atomic `updateMany` consume; nightly cleanup cron.
18. P2 items as time allows.

Phase 2 dynamic tests and Phase 3 live loop cannot declare success until every P0 + every P1 is landed and retested.

## Remaining verification work for Phase 1 (optional)

- Dynamic DB recount against seeded month-scale dataset to prove M1/M2/M3/M5 math (Phase 2).
- Run `pnpm lint` + `pnpm test:unit` in `backend/crm-backend` and confirm baseline.
- Verify `TELEPHONY_INGEST_SECRET` actually matches between VM backend `.env` and `ami-bridge/.env` — SSH read-only once VPN is up and stable.
- Confirm only one `ami-bridge` PM2 process is running (Asterisk shows 3 `crm_ami` sessions from 127.0.0.1; at least one is probably a zombie reconnect).
