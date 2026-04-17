# Known Findings Carried Forward

**Phase 0 deliverable.** 68 findings extracted from prior audits (`.audit-reports/*.md`, `CURSOR_KNOWLEDGE_DUMP.md`, `CI_AUDIT.md`, `ENVIRONMENT_AUDIT.md`) that touch the in-scope surface: Calls, Client Chats, Auth/RBAC/Sockets, and cross-cutting infrastructure that feeds them.

Each entry carries severity (P0/P1/P2/P3), prior-audit status, and a **concrete verification hook** to confirm whether the issue still exists today. Phase 1 agents will resolve each as **FIXED / STILL PRESENT / NOT APPLICABLE / PARTIAL**.

Severity normalized per audit brief. "Status @ prior" is what the original report said; "Verify today" is the check Phase 1 must run.

---

## AUTH_AND_SESSIONS

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 1 | **P0** | Login endpoint had no brute-force protection beyond global 60 req/min `ThrottlerGuard` (86,400 attempts/day/IP). Now supplemented by `LoginThrottleService` (5 attempts / 5 min per email). | `src/auth/auth.controller.ts` POST /auth/login + `src/auth/login-throttle.service.ts` | Present, mitigation added | Confirm controller uses `LoginThrottleService.assertNotLocked()` + increments on failure + clears on success. |
| 2 | P1 | Login-throttle state is in-memory Map, lost on restart. | `src/auth/login-throttle.service.ts` | Present | Grep service for `Map<` and any Prisma/Redis usage. |
| 3 | P0 | JWT_SECRET fallbacks to `'dev-secret'` previously existed in `messenger.module.ts` / `clientchats.module.ts`. | `src/auth/auth.module.ts`, `src/main.ts`, `src/messenger/messenger.module.ts`, `src/clientchats/clientchats.module.ts` | **Fixed** 2026-03-24 | Grep all `.module.ts` for `'dev-secret'`; confirm `main.ts` hard-fails if `JWT_SECRET` unset. |
| 4 | P1 | ~37 raw `fetch()` calls in frontend bypass `apiGet/apiPost` and miss 401 redirect / 204 empty handling / credentials. | `frontend/crm-frontend/src/**` | Present | `Grep fetch\(` in src, excluding known-acceptable bridge/login/multipart callers. |
| 5 | P2 | HTTP CORS (`cors.ts`) and Socket.IO CORS (`clientchats.gateway.ts`) defaults disagree when `CORS_ORIGINS` unset. | `src/cors.ts`, `src/clientchats/clientchats.gateway.ts` | Present | Read both defaults; verify local `.env` sets both consistently. |
| 6 | P0/P2 | `COOKIE_SECURE` defaults to `false`; must be `true` in prod. | `src/auth/auth.controller.ts` (`authSessionCookieSecure()`) | Present (by design; risk if misconfigured) | Confirm prod env on VM has `COOKIE_SECURE=true`; confirm default is safe in dev. |
| 7 | P1 | `POST /auth/device-token` and `POST /auth/exchange-token` issue new JWTs without `@RequirePermission`. | `src/auth/auth.controller.ts` | Present | Read both handlers; confirm token reuse / TTL / DeviceHandshakeToken rotation. |

## RBAC_AND_PERMISSIONS

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 8 | P1 | 226/350 HTTP handlers have no `@RequirePermission` — JWT-only means any logged-in user can call them. | Many controllers | Present | Count handlers with `@UseGuards(JwtAuthGuard, PositionPermissionGuard)` but no `@RequirePermission`; cross-check against expected public/internal endpoints. |
| 9 | P2 | `PositionPermissionGuard` returns `true` when no `@RequirePermission` metadata — class-level guard alone is a no-op. | `src/common/guards/position-permission.guard.ts` | Present | Read guard; confirm this behavior and that in-scope controllers always declare per-handler permissions. |
| 10 | P2 | Legacy `RolesModule` + newer `RoleGroupsModule` both imported in `app.module.ts`. | `src/app.module.ts` | Present | Confirm which gateways / services still read from legacy Role; map fallthroughs. |
| 11 | P2 | `GET /v1/permissions` has no `take` — unbounded. | `src/permissions/permissions.service.ts` | Present | Read `findAll()`; confirm no pagination. |

## TELEPHONY_BACKEND

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 12 | P1 | `TelephonyStatsService` has 6 methods doing `findMany` with no `take` and aggregating in JS. Memory spike on month queries. | `src/telephony/services/telephony-stats.service.ts` | Present | Read each of `getOverview`, `getAgentStats`, `getQueueStats`, `getBreakdown`, `getOverviewExtended`, `getAgentsBreakdown`; verify unbounded queries. |
| 13 | **P0** | `TelephonyExtension.sipPassword` stored in plaintext; returned in multiple API responses. | `prisma/schema.prisma` + `src/auth/auth.controller.ts` (`/app-login`, `/me`) + `src/telephony/controllers/telephony-extensions.controller.ts` | Present | Grep `sipPassword` across backend for returns; confirm no encryption. Blocker for Monday if rollout exposes this. |
| 14 | P1 | `POST/PATCH/DELETE /v1/telephony/extensions` use only `JwtAuthGuard` — no `@RequirePermission`. | `src/telephony/controllers/telephony-extensions.controller.ts` | Present | Read controller; confirm permission decorators missing. |
| 15 | P2 | AMI Bridge event buffer can grow unboundedly if CRM is down; partially fixed with 5000-event cap + oldest-eviction. | `ami-bridge/src/core/crm-poster.ts` + `ami-bridge/src/main.ts` | Partial | Read file; confirm `MAX_QUEUE_SIZE` constant and eviction logic; confirm 5-min stale-ingest warning. |
| 16 | P2 | `AsteriskSyncService.syncAll` loops extensions/queues with sequential `await upsert`. | `src/telephony/sync/asterisk-sync.service.ts` | Present | Read; count `for...of` with `await` inside. |
| 17 | P2 | Quality reviews stuck in `PROCESSING` if process crashes. Now recovered by resetting PROCESSING>10min to PENDING. | `src/telephony/quality/quality-pipeline.service.ts` | **Fixed** (commit log) | Grep for 10-minute recovery logic. |
| 18 | P2 | CDR import has no overlap guard. | `src/telephony/cdr/cdr-import.service.ts` | Present | Grep for `processing` flag; verify current behavior. |
| 19 | P2 | `TelephonyGateway` reads `payload.id` from JWT; tokens issue `sub`. WebSocket auth may break. | `src/telephony/realtime/telephony.gateway.ts` | Present | Read `authenticateSocket`; compare to `messenger.gateway.ts` / `clientchats.gateway.ts`. |

## CLIENT_CHATS_BACKEND

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 20 | P1 | Message dedup race on two identical webhooks; fixed by catching P2002 in `saveMessage()`. | `src/clientchats/services/clientchats-core.service.ts` | **Fixed** | Grep for `P2002` catch; confirm returns existing message. |
| 21 | P2 | `isBetterName()` guard — customer name corruption risk if removed. | `src/clientchats/services/clientchats-core.service.ts` | Present (correct) | Confirm guard exists and all name updates go through it. |
| 22 | P2 | `joinConversation` uses raw SQL optimistic update to prevent double-claim. Do not replace with Prisma update. | `src/clientchats/services/assignment.service.ts` | Present (correct) | Grep for `$queryRawUnsafe` / `UPDATE ... WHERE assignedUserId`. |
| 23 | P2 | Escalation cron's per-conversation loop has no try/catch — one handler throw skips the rest. | `src/clientchats/services/escalation.service.ts` | Present | Read the loop; confirm no catch. |
| 24 | **P1** | Escalation `findMany` of stale conversations has no `take` — unbounded query runs every minute. | `src/clientchats/services/escalation.service.ts` `checkEscalations()` | Present | Read; confirm no limit. At realistic volumes, bound result set. |
| 25 | P2 | `QueueScheduleService.setDaySchedule` / `setDailyOverride` do not emit `queue:updated`. Room membership stale until client reconnect. | `src/clientchats/services/queue-schedule.service.ts` | Present | Grep for calls to `ClientChatsEventService.emitQueueUpdated`. |
| 26 | P2 | Closed-conversation archival rewrites `externalConversationId` to `${id}__archived_${ts}` — fragile but load-bearing. | `src/clientchats/services/clientchats-core.service.ts` `upsertConversation()` | Present (correct) | Confirm pattern unchanged. |
| 27 | P2 | `processInbound` pipeline order (dedup → upsertParticipant → upsertConversation → saveMessage → autoMatch → emit) is load-bearing. | `src/clientchats/services/clientchats-core.service.ts` | Present (correct by convention) | Re-read method; confirm order preserved. |
| 28 | P1 | Missed-call callback + single-conversation read endpoints likely lack data-scope filters. | `src/telephony/controllers/*.ts`, `src/clientchats/controllers/clientchats-agent.controller.ts` `GET conversations/:id` | Present | Read endpoints; confirm operator can (or cannot) read peer's record by ID. |

## CLIENT_CHATS_WEBHOOKS_SIGNATURES

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 29 | P2 | Viber, Facebook, Telegram, WhatsApp webhook guards each verify signatures differently — strength varies. | `src/clientchats/adapters/*.adapter.ts` + guard classes | Present | Read each `verifyWebhook()`; confirm HMAC-SHA256 + timing-safe compare + rawBody use. |
| 30 | P2 | `FB_VERIFY_TOKEN`, `WA_*` tokens stored only in env. Leak = fake-webhook injection. | `.env.example`, adapters | Present | Confirm tokens are set on VM; rotate plan ready. |
| 31 | P2 | `rawBody: true` enabled globally in `main.ts` for webhook HMAC — perf cost on every request. | `src/main.ts` | Present (by design) | Confirm only Facebook + WhatsApp adapters read `req.rawBody`. |

## SOCKETS_REALTIME

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 32 | P2 | Messenger presence `onlineUsers` is in-memory Map; lost on restart. | `src/messenger/messenger.gateway.ts` | Present | Confirm no persistence layer. |
| 33 | P2 | Telephony `StateManager` holds active calls / agents / queues in-memory; lost on restart. | `src/telephony/realtime/telephony-state.manager.ts` | Present | Confirm; note that connect-time `state:snapshot` rehydrates. |
| 34 | P2 | Client chats gateway room membership fixed at connect. Schedule changes mid-day don't move sockets. | `src/clientchats/clientchats.gateway.ts` `handleConnection` | Present | Verify; this compounds with finding #25. |
| 35 | P2 | `queue:updated` + `agent:status` fire on every AMI event — high-volume on busy PBX. | `src/telephony/realtime/telephony.gateway.ts` `broadcastAmiEvent` | Present | Count emissions per AMI event; consider diffing / throttling. |
| 36 | P2 | Messenger `message:send` emits `message:new` to both `conversation:{id}` and `employee:{pid}` rooms → client-side duplicate if no dedup. | `src/messenger/messenger.gateway.ts` | Present | Confirm frontend dedupes by message ID. |
| 37 | P2 | Client chats `managers` room overlaps with `queue` / `agent:{self}` — duplicates for superadmin in queue. | `src/clientchats/services/clientchats-event.service.ts` | Present | Confirm frontend dedupes or change fan-out. |
| 38 | P2 | Messenger typing events not throttled server-side. | `src/messenger/messenger.gateway.ts` | Present | Grep for throttle; consider rate-limit per conversation. |

## DATABASE_SCHEMA_AND_MIGRATIONS

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 39 | P2 | Three columns lack `@relation`/FK: `WorkflowTriggerLog.workOrderId`, `StockTransaction.workOrderId?`, `NotificationLog.templateId?`. | `prisma/schema.prisma` | Present | Out-of-scope for Monday but confirm no call/chat equivalents. |
| 40 | P2 | Missing `@@index` on several FK columns in chats schema: `ClientChatConversation.channelAccountId/clientId/participantId`, `ClientChatParticipant.channelAccountId`, `ClientChatMessage.participantId/senderUserId`. | `prisma/schema.prisma` | Present | Re-check; migration `20260326_add_missing_fk_indexes` may have added some. |
| 41 | P2 | Unbounded growth tables without cleanup: `AuditLog`, `CallEvent`, `CallSession`, `CallLeg`, `CallMetrics`, `ClientChatMessage`, `ClientChatEscalationEvent`, `ClientChatWebhookFailure`, `QualityReview`, `Recording`, `DeviceHandshakeToken`. | `prisma/schema.prisma` | Present | Confirm no cleanup cron; note disk-space risk for Monday launch. |
| 42 | P2 | `DeviceHandshakeToken` has `expiresAt` but no cleanup job. | `prisma/schema.prisma` + `src/auth/auth.service.ts` | Present | Grep for cleanup. |

## PERFORMANCE_AND_QUERIES

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 43 | P1 | Messenger `getConversations` + `getUnreadCount` do per-conversation `count()` (N+1). Fixed in later commit. | `src/messenger/messenger.service.ts` 126–156, 644–674 | **Fixed** (commit b9a4b18) | Confirm current implementation uses `groupBy` or single aggregate query. |
| 44 | P2 | Work-order bulk create loops assets. | `src/work-orders/work-orders.service.ts` | Present | Out-of-scope for Monday. |
| 45 | P2 | Translations seed per-key N+1. | `src/translations/translations.service.ts` | Present | Out-of-scope. |
| 46 | P2 | `deleteConversation` walks `previousConversationId` chain with per-hop findUnique. | `src/clientchats/services/clientchats-core.service.ts` | Present | Out-of-scope for Monday operator delete path unless managers invoke frequently. |
| 47 | P1 | Telephony stats unbounded findMany + in-JS aggregation (same 6 methods as #12). | `src/telephony/services/telephony-stats.service.ts` | Present | Same as #12. |
| 48 | P2 | Lead create loops `addService`. | `src/sales/leads/leads.service.ts` | Present | Out-of-scope. |
| 49 | P2 | Employee create sequential lookups; hardDelete has 13 sequential updateMany. | `src/employees/employees.service.ts` | Present | Out-of-scope for Monday. |
| 50 | P2 | Buildings `getStatistics` loads all buildings into JS. | `src/buildings/buildings.service.ts` | Present | Out-of-scope. |

## FRONTEND_OPERATOR_MANAGER_SURFACES

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 51 | P2 | `/app/call-center/**` had no page-level `PermissionGuard`; relied on API 401s. | `frontend/crm-frontend/src/app/app/call-center/**` | **Likely Fixed** (commit 0282280 / eeda9b1 added route permission guards) | Confirm each page wrapped in PermissionGuard with correct permission. |
| 52 | P2 | `/app/dashboard` has no route-level PermissionGuard (only shortcut button gates). | `frontend/crm-frontend/src/app/app/dashboard/page.tsx` | Present | Confirm; low-risk for Monday as operators/managers won't land there. |
| 53 | P2 | Work-order modal uses `z-[99999]` — z-index fragmentation across modals. | `frontend/crm-frontend/src/app/app/work-orders/[id]/work-order-detail-modal.tsx` ~1962 | Present | Out-of-scope; note if chat modals collide. |
| 54 | P2 | Hardcoded enums instead of `useListItems()` in 20+ files. | Multiple | Present | Check call-center + client-chats pages only. |
| 55 | P2 | Six files render modals inline without `createPortal`: `client-chats/components/conversation-header.tsx` (336, 372), `admin/workflow/page.tsx` (753, 817, 1001), `admin/notifications/page.tsx` (224), `clients/[clientId]/client-detail-content.tsx` (589), `work-orders/[id]/page.tsx` (762, 1045), `login/page.tsx` (209). | See above | Present | **`conversation-header.tsx` is in-scope — fix before Monday.** |
| 56 | P2 | `PermissionButton` component exists but is not used anywhere. | `frontend/crm-frontend/src/lib/permission-button.tsx` | Present | Grep for imports; either remove or adopt. |
| 57 | P2 | `toLocaleDateString()` without locale arg → English-centric formatting. | Multiple | Present | Grep in call-center + client-chats pages. |
| 58 | P3 | No frontend test framework or tests. | `frontend/crm-frontend/package.json` | Present | Confirm; not a Monday blocker. |

## DEPLOYMENT_ENV_CI

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 59 | P2 | CI runs typecheck + tests + build, but no `pnpm lint`. | `.github/workflows/ci.yml` | Present (CI lint added in audit phase 1, verify) | Grep workflow for `lint`. |
| 60 | P2 | Node version not pinned via `engines.node`. | `backend/crm-backend/package.json` | Present | Confirm CI Node version matches deploy; VM migration doc says pinned. |
| 61 | P2 | No `pnpm audit` / vulnerability scanning step in CI. | `.github/workflows/ci.yml` | Present | Confirm. |
| 62 | P0 | `API_BACKEND_URL` required in prod; `next.config.ts` has a guard that crashes if missing. | `frontend/crm-frontend/next.config.ts` | Present (guard in place) | Confirm VM env has it. |
| 63 | P2 | Seed script order matters; `seed:all` orchestrator runs 8 in dep order; `start:deploy` runs only `seed-permissions.ts`. | `backend/crm-backend/prisma/seed-*.ts` + `seed-all.ts` | Present | Confirm deploy workflow only invokes `seed-permissions.ts`. |

## RATE_LIMITING_AND_WEBHOOKS

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 64 | P2 | `@SkipThrottle()` correctly applied to public webhooks + telephony ingest + health. | `src/clientchats/controllers/clientchats-public.controller.ts`, `src/telephony/controllers/telephony-ingestion.controller.ts`, `src/health/health.controller.ts` | Present (correct) | Confirm decorators still present; verify any new webhook endpoints added since. |
| 65 | P2 | Webhook signature verification implementation strength varies; must audit per-adapter. | Same files as #29 | Present | Same as #29. |
| 66 | P2 | `ClientChatWebhookFailure` accumulates without cleanup. | `prisma/schema.prisma` | Present | Grep for cleanup; confirm not blocker. |

## CROSS_CUTTING_INFRASTRUCTURE

| # | Severity | Finding | File / line | Status @ prior | Verify today |
|---|---|---|---|---|---|
| 67 | P2 | Both `bcrypt` and `bcryptjs` in backend deps. | `backend/crm-backend/package.json` | Present (one removed in audit phase 1 — verify) | Confirm only one is installed. |
| 68 | P2 | `swagger-ui-express` in prod deps; ~4MB bundle; should be conditional. | `backend/crm-backend/package.json` + `src/main.ts` | Present | Confirm current deployment strategy. |

---

## Priority summary for Monday rollout

**Launch blockers (P0 — must be green before any operator logs in):**
- #13 SIP passwords in plaintext (softphone auth response leaks them)
- #1 brute-force protection on login
- #6 COOKIE_SECURE true in prod
- #62 API_BACKEND_URL set in prod
- RoleGroup → Position gap (covered in INVENTORY.md §3.5 — not numbered here but P0)

**Must-fix (P1):**
- #12 / #47 unbounded telephony stats
- #24 unbounded escalation findMany
- #14 extensions controller missing permission decorators
- #28 data-scope gap on single-conversation read + callback endpoints
- #19 telephony gateway JWT `sub` vs `id` mismatch
- #8 226 handlers with no `@RequirePermission` — triage which touch Calls / Chats
- #43 messenger N+1 (verify already fixed)
- #4 remaining raw fetch() callers in scope
- #7 device-token / exchange-token permissions

**Should-fix (P2, select in-scope ones):**
- #2 login throttle persistence
- #5 CORS mismatch
- #18 CDR import overlap guard
- #23 escalation per-iter try/catch
- #25 queue-schedule fan-out emit
- #34 client-chats room membership stale
- #37 client-chats duplicate delivery
- #55 inline modal in `conversation-header.tsx`
- #10 legacy RolesModule (low risk if not touched)
- Asterisk-side: triple `crm_ami` sessions, ringinuse inconsistency (queue 802)

All other P2/P3 findings are deferred unless Phase 1/2/3 surfaces a live failure.
