# CRM28 — Calls & Client Chats Inventory

**Phase 0 deliverable.** Generated 2026-04-17. Read-only; all file paths and line numbers verified against master.

Scope is **everything an Operator or Manager can reach on Monday morning**, plus the infrastructure that feeds those two surfaces: telephony backend, client-chats backend, auth, RBAC, sockets, webhooks, Asterisk, AMI bridge, Electron softphone, Prisma models, cron jobs, and environment variables.

This file is a map, not an audit. Findings live in `KNOWN_FINDINGS_CARRIED_FORWARD.md` and, once Phase 1 runs, in each agent's own report under `audit/`.

---

## 1. Backend — Telephony module (`backend/crm-backend/src/telephony/`)

### 1.1 HTTP controllers and routes

| File | Route prefix | Guards | Notable per-handler permissions |
|---|---|---|---|
| `controllers/telephony-calls.controller.ts` | `v1/telephony` | JwtAuthGuard, PositionPermissionGuard | `call_center.menu` for `GET calls`, `lookup`, `history/:extension`, `callbacks`. Results filtered by `DataScopeService.resolve()` call_logs scope (own / department / department_tree / all) |
| `controllers/telephony-actions.controller.ts` | `v1/telephony/actions` | same | `telephony.call` for originate, transfer, hangup, hold, queue-login, queue-logout, queue-pause |
| `controllers/telephony-recording.controller.ts` | `v1/telephony/recordings` | same | `call_center.menu` for metadata (`:id`), fetch-from-Asterisk (`:id/fetch`), streaming (`:id/audio`, HTTP Range 206) |
| `controllers/telephony-ingestion.controller.ts` | `v1/telephony/events` | **TelephonyIngestGuard only** | Shared secret `x-telephony-secret` compared timing-safe to `TELEPHONY_INGEST_SECRET`. NO JWT. This is the AMI Bridge ingest endpoint. |
| `controllers/telephony-quality.controller.ts` | `v1/telephony/quality` | JwtAuthGuard, PositionPermissionGuard | `call_center.quality` (list / get), plus `telephony.manage` to PATCH reviews and upsert rubrics |
| `controllers/missed-calls.controller.ts` | `v1/telephony/missed-calls` | same | `missed_calls.access` for list, `missed_calls.manage` for claim / attempt / resolve / ignore |
| `controllers/telephony-live.controller.ts` | `v1/telephony` | same | `call_center.live` for `queues/live`, `agents/live` |
| `controllers/telephony-stats.controller.ts` | `v1/telephony/stats` | same | `call_center.statistics` for overview, overview-extended, agents, agents-breakdown, queues, breakdown |
| `controllers/telephony-extensions.controller.ts` | `v1/telephony/extensions` | JwtAuthGuard **only** (no permission decorator on write methods — see finding #14) | `telephony.manage` is documented but not fully wired on POST/PATCH/DELETE |

### 1.2 WebSocket — `/telephony` namespace

`src/telephony/realtime/telephony.gateway.ts`.

Auth: Bearer token OR cookie named `COOKIE_NAME` (default `access_token`). JWT verified with `JwtService.verify()`, `payload.id` read as userId — **this is the `sub` vs `id` mismatch flagged by the prior audit (finding #19); re-verify in Phase 1.**

Rooms on connect: `dashboard`, `agent:{userId}`, and any subscribed `queue:{queueId}` via `queue:subscribe` message.

Emitted events:
- `state:snapshot` — initial dump of calls + agents + queues at connect
- `call:ringing`, `call:answered`, `call:hold`, `call:ended` — per-call lifecycle
- `queue:updated` — aggregate queue state after every AMI event (high-frequency; see finding #35)
- `agent:status` — per-agent state delta, emitted to `agent:{userId}` room
- `screen:pop` — CRM context for incoming caller, payload includes `lookup` result
- `call:report-trigger` — signal for operator to open call-report modal (1s retry built in to dodge ingestion race)

Client→server: `queue:subscribe`, `queue:unsubscribe`.

State kept in memory in `TelephonyStateManager` (`realtime/telephony-state.manager.ts`): `activeCalls Map<linkedId>`, `agents Map<userId>`, `extensionToUser Map<extension>`. On AMI disconnect, live endpoints fall back to DB.

### 1.3 Services and workers

| Service | File | Cron / trigger | Overlap guard |
|---|---|---|---|
| `TelephonyIngestionService` | `services/telephony-ingestion.service.ts` | On each HTTP POST to `/events` | Idempotency key per event (`callEvent.idempotencyKey @unique`) |
| `MissedCallsService` | `services/missed-calls.service.ts` | `@Cron('0 */5 * * * *')` — expireOldMissedCalls (48h). Also runs inline from ingestion on each outbound-call end. | `isExpiring` flag |
| `TelephonyQualityService` | `services/telephony-quality.service.ts` | On-demand via controller | — |
| `QualityPipelineService` | `quality/quality-pipeline.service.ts` | `@Cron(QUALITY_AI_CRON ?? '0 */2 * * * *')` | `processing` flag; resets PROCESSING>10min back to PENDING |
| `TelephonyStatsService` | `services/telephony-stats.service.ts` | On-demand via controller. **Unbounded `findMany` per finding #12/#47.** | — |
| `TelephonyLiveService` | `services/telephony-live.service.ts` | On-demand | Falls back to DB when AMI disconnected |
| `TelephonyCallsService` | `services/telephony-calls.service.ts` | On-demand | Applies `dataScope.resolve()` for user-scoped queries |
| `TelephonyCallbackService` | `services/telephony-callback.service.ts` | Inline from ingestion | — |
| `AsteriskSyncService` | `sync/asterisk-sync.service.ts` | `@Cron(EVERY_5_MINUTES)` + on AMI-connected (3s delay) | `syncing` flag. Sync via Asterisk CLI (`core show` / `queue show` / `pjsip show`) rather than multi-event AMI actions since commit c3a4ff2. |
| `CdrImportService` | `cdr/cdr-import.service.ts` | `@Cron('0 */5 * * * *')` — `CDR_IMPORT_ENABLED` gated | `processing` flag (prior audit finding #18 said none — re-verify; commit history suggests added since) |

### 1.4 Softphone — `crm-phone/` (Electron)

Renderer under `crm-phone/src/renderer/`, main under `crm-phone/src/main/`.

- SIP stack: `sip.js` — UserAgent + Registerer, WSS to `wss://{sipServer}:8089/ws` with 300s expiry.
- Auth: `/v1/auth/app-login` (email+password) → JSON body carries JWT + `telephonyExtension` (extension, sipServer, sipPassword). **Password in plaintext — prior audit finding #13 (P0).**
- IPC channels (main↔renderer): `auth:*`, `phone:dial|answer|hangup|hold|unhold|transfer|dtmf|mute`, `phone:state-changed`, `phone:incoming-call`, `phone:sip-status`, `contact:lookup`, `call:history`, `settings:*`, `app:show|hide|quit`, `update:check|install|get-version`. Full list in `crm-phone/src/shared/ipc-channels.ts`.
- Local Express bridge at `http://127.0.0.1:19876` (main process): `GET /status`, `POST /switch-user`, `POST /dial`. CORS to `crm28.asg.ge` + localhost.
- Auto-updater feed: `https://crm28.asg.ge/downloads/phone` via `electron-updater`, no downgrade.
- Ringback (`renderer/ringback.ts`, new as of commit 567f690) plays tone during outbound pre-answer.

### 1.5 AMI Bridge — `ami-bridge/`

Standalone Node.js process on VM 192.168.65.110, PM2-managed.

- `src/ami-client.ts` subscribes to AMI events: newchannel, hangup, dialend, bridgeenter, queuecallerjoin, agentconnect, blindtransfer, attendedtransfer, musiconhold{start,stop}, queuememberstatus, queuememberpause, varset, newexten.
- `src/event-mapper.ts` maps raw AMI events to `IngestEventItemDto` schema; dedupes; tracks active-call count; purges stale calls after 4h.
- `src/event-buffer.ts` — `BUFFER_MAX_SIZE` (default 20) triggers flush; `BUFFER_FLUSH_INTERVAL_MS` (default 3000) as timer; overflow at 5000 evicts oldest.
- `src/crm-poster.ts` POSTs to `{CRM_BASE_URL}/v1/telephony/events` with header `x-telephony-secret: {TELEPHONY_INGEST_SECRET}`. Retries `CRM_RETRY_ATTEMPTS` times (default 3) with exponential backoff.
- `src/health-server.ts` on port 3100. Returns 200 if AMI connected, 503 if degraded. Stats include `totalPosted`, `totalErrors`, `lastSuccessAt`, `minutesSinceSuccess`. Main loop logs ALERT every 60s if `minutesSinceSuccess >= 5`.

### 1.6 ARI integration — `src/telephony/ari/`

Gated by `ARI_ENABLED`. Methods: originate, hangup, hold, unhold, redirect, getChannels, getBridges. `TelephonyActionsController` tries ARI first, falls back to AMI.

### 1.7 Recording access — `src/telephony/recording/recording-access.service.ts`

- Base path: `RECORDING_BASE_PATH` (default `/var/spool/asterisk/monitor`).
- `getRecordingFileInfo()` returns `{filePath, fileSize, filename, contentType}` for HTTP Range streaming (controller returns 206 with `Content-Range`; full 200 includes `Content-Length` — required for HTML `<audio>` duration display).
- `fetchFromAsterisk()` SCP/SSH from `RECORDING_SSH_HOST` (default `5.10.34.153`) using `RECORDING_SSH_KEY`. Triggered on-demand via `POST /:id/fetch`.
- Deprecated `streamRecording()` still present — does not set Content-Length; avoid.

### 1.8 Env vars (names only) — telephony scope

Backend: `TELEPHONY_INGEST_SECRET`, `AMI_ENABLED`, `AMI_HOST`, `AMI_PORT`, `AMI_USER`, `AMI_SECRET`, `ARI_ENABLED`, `ARI_BASE_URL`, `ARI_USER`, `ARI_PASSWORD`, `CDR_IMPORT_ENABLED`, `CDR_DB_URL`, `RECORDING_BASE_PATH`, `RECORDING_SSH_HOST`, `RECORDING_SSH_USER`, `RECORDING_SSH_KEY`, `SCP_EXECUTABLE`, `OPENAI_API_KEY`, `QUALITY_AI_ENABLED`, `QUALITY_AI_MODEL`, `QUALITY_AI_CRON`, `AFTER_HOURS_QUEUES`, `ASTERISK_SIP_SERVER`.

AMI Bridge: `AMI_*`, `AMI_RECONNECT_BASE_MS`, `AMI_RECONNECT_MAX_MS`, `AMI_PING_INTERVAL_MS`, `CRM_BASE_URL`, `TELEPHONY_INGEST_SECRET`, `BUFFER_MAX_SIZE`, `BUFFER_FLUSH_INTERVAL_MS`, `HEALTH_PORT`, `CRM_TIMEOUT_MS`, `CRM_RETRY_ATTEMPTS`, `CRM_RETRY_BASE_MS`, `LOG_LEVEL`.

### 1.9 Prisma models (telephony scope)

`TelephonyExtension`, `TelephonyQueue`, `CallSession`, `CallLeg`, `CallEvent`, `CallMetrics`, `Recording`, `QualityReview`, `QualityRubric`, `MissedCall`, `CallbackRequest`, `CallReport`, `CallReportLabel`, `AgentState`.

Key enums: `CallDirection` (IN/OUT), `CallDisposition` (ANSWERED, MISSED, ABANDONED, BUSY, FAILED, NOANSWER), `CallLegType` (CUSTOMER, AGENT, TRANSFER), `QueueStrategy`, `MissedCallReason` (OUT_OF_HOURS, ABANDONED, NO_ANSWER), `MissedCallStatus` (NEW/CLAIMED/ATTEMPTED/HANDLED/IGNORED/EXPIRED), `RecordingStatus`, `QualityReviewStatus`, `CallReportStatus` (DRAFT/COMPLETED).

---

## 2. Backend — Client Chats module (`backend/crm-backend/src/clientchats/`)

### 2.1 HTTP controllers

| Controller file | Route prefix | Representative endpoints | Permission |
|---|---|---|---|
| `controllers/clientchats-agent.controller.ts` | `v1/clientchats` | `GET conversations`, `GET conversations/:id`, `GET conversations/:id/messages`, `POST conversations/:id/reply` (multipart, 10MB), `POST conversations/:id/join`, `PATCH conversations/:id/assign`, `PATCH conversations/:id/status`, `POST conversations/:id/request-reopen`, `GET conversations/:id/history`, `POST conversations/:id/link-client`, `POST conversations/:id/unlink-client`, `GET whatsapp/templates`, `POST whatsapp/send-template`, `GET media/:mediaId` (WhatsApp proxy), `GET/POST/PUT/DELETE canned-responses` | `client_chats.menu` (all handlers share it). **Missing data-scope on `GET conversations/:id` — operator can fetch any conversation by ID (prior audit / new finding; see finding #28 and §2.8).** |
| `controllers/clientchats-manager.controller.ts` | `v1/clientchats/queue` | Today's queue, weekly schedule, daily override CRUD, escalation config + events, `live-status`, `DELETE conversations/:id` (full history chain), pause/unpause operator, reopen + approve-reopen | `client_chats.manage`; delete requires `client_chats.delete` |
| `controllers/clientchats-admin.controller.ts` | `v1/clientchats` | channel status, webhook-failures, channel-accounts CRUD, per-channel webhook status/register/delete (Telegram, Viber, Facebook, WhatsApp), `POST whatsapp/create-test-conversation`, analytics (overview, by-channel, by-agent) | `client_chats_config.access` |
| `controllers/clientchats-public.controller.ts` | `public/clientchats` | `POST /start` (web widget, 5/min throttle, returns 24h conversation-JWT), `POST /message` (requires `X-Conversation-Token`), per-channel webhook GETs/POSTs | `@SkipThrottle()` globally, except `/start` |

### 2.2 Webhooks

| Channel | Verb + path | Guard | Signature source | Verify-token source |
|---|---|---|---|---|
| Web widget | POST `/start`, POST `/message` | ConversationTokenGuard (JWT in `X-Conversation-Token` header) | — | — |
| Viber | POST `/webhook/viber` | ViberWebhookGuard | HMAC-SHA256 header `X-Viber-Content-Signature` | `channelAccount.metadata.viberBotToken` → `VIBER_BOT_TOKEN` |
| Facebook | GET + POST `/webhook/facebook` | FacebookWebhookGuard on POST; GET uses verify-token match | HMAC-SHA256 header `X-Hub-Signature-256` | `channelAccount.metadata.fbAppSecret` → `FB_APP_SECRET`; verify-token from `fbVerifyToken` → `FB_VERIFY_TOKEN` |
| Telegram | POST `/webhook/telegram` | TelegramWebhookGuard | Secret header `X-Telegram-Bot-API-Secret-Token` | `TELEGRAM_WEBHOOK_SECRET` (timing-safe) |
| WhatsApp | GET + POST `/webhook/whatsapp` | WhatsAppWebhookGuard on POST | HMAC-SHA256 header `X-Hub-Signature-256` | `channelAccount.metadata.waAppSecret` → `WA_APP_SECRET` → `FB_APP_SECRET`; verify token from `waVerifyToken` → `WA_VERIFY_TOKEN` → `FB_VERIFY_TOKEN` |

All POST webhooks rely on `rawBody: true` set globally in `src/main.ts` for HMAC verification.

### 2.3 WebSocket — `/ws/clientchats`

`src/clientchats/clientchats.gateway.ts`.

Auth: cookie `COOKIE_NAME` → Bearer header → `handshake.auth.token`. JWT `payload.sub` or `payload.id`.

Rooms on connect: `agents`, `agent:{userId}`, optionally `queue` (if user is in today's active queue via `QueueScheduleService.getActiveOperatorsToday()`), optionally `managers` (if superadmin or has `client_chats.manage`). Room membership is fixed at connect — prior audit finding #34: schedule changes do not move sockets mid-session.

Emitted events (via `ClientChatsEventService`):
- `conversation:new` → `managers` + `agent:{assignedId}` + `queue` (if unassigned)
- `conversation:updated` → same fan-out, plus `agent:{previousAssignedId}` on reassign
- `message:new` → same fan-out; operator in multiple rooms can receive duplicates (finding #37)
- `operator:paused` / `operator:unpaused` → `agent:{userId}`
- `reopen:requested` → `managers`; `reopen:approved` → `agent:{requestedBy}`
- `escalation:warning` → `managers`
- `queue:updated` → `managers`

No explicit client→server listeners; frontend is push-only over this namespace.

### 2.4 Pipeline order (`services/clientchats-core.service.ts` → `processInbound()`)

**LOAD-BEARING ORDER, documented in CLAUDE.md:** dedup → upsertParticipant → upsertConversation → saveMessage → autoMatch → emit. Re-ordering breaks FK integrity and risks overwriting real customer names. The `isBetterName()` helper guards against fallback names overwriting real ones. Dedup race mitigated by `externalMessageId @unique` + P2002 catch in `saveMessage()` (commit confirms fix, finding #20).

### 2.5 Channel adapters (`src/clientchats/adapters/`)

- `viber.adapter.ts` — HMAC-SHA256 verify, `/pa/send_message` POST. Outbound media: **not implemented** (TODO line 94).
- `facebook.adapter.ts` — HMAC-SHA256 verify + GET verify-token, Messenger POST. Outbound media: **not implemented** (TODO line 119).
- `telegram.adapter.ts` — secret-token verify; sends text, photos, documents via multipart. `fetchUserPhone()` for auto-linking (fires async after first TG message if no phone/mappedClientId).
- `whatsapp.adapter.ts` — HMAC-SHA256 + verify-token. Full inbound media (images, video, audio, documents, stickers, location, contacts). Outbound media via Cloud API `POST /media` upload then reference. Adapter does not enforce 24h window — WhatsApp Cloud API does.
- `web-chat.adapter.ts` — no verification (internal handshake); visitor-id + JWT flow; no outbound media.

### 2.6 Services and @Cron

- `EscalationService` (`services/escalation.service.ts`) — `@Cron('*/1 * * * *')`; guarded by `processing` flag. **Unbounded `findMany` on stale conversations — prior audit finding #24 (P1); no per-iteration try/catch — finding #23 (P2).**
- `QueueScheduleService` — weekly schedule + daily overrides. **Does not emit `queue:updated` on change — finding #25.**
- `AssignmentService` — join uses raw SQL optimistic `UPDATE ... WHERE assignedUserId IS NULL RETURNING id` (fragile but correct).
- `CannedResponsesService` — user's + global templates; scope by category / channelType / search.
- `TelegramWebhookService` / `ViberWebhookService` — register/delete webhook URL with provider at startup.

### 2.7 Env vars (names only) — chats scope

`VIBER_BOT_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_VERIFY_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `CLIENTCHATS_WEBHOOK_BASE_URL`, `PUBLIC_API_URL`, `API_PUBLIC_URL`.

### 2.8 Data scoping risk

The `listConversations` handler applies `assignedUserIdOrUnassigned = self` for operators in the queue, `assignedUserId = self` for operators outside the queue, or no filter for managers. **But the single-conversation read (`GET /conversations/:id`) does not apply the same filter** — any authenticated operator with `client_chats.menu` can retrieve any conversation by ID. This is a P1 that needs fixing before Monday.

### 2.9 Prisma models (chats scope)

`ClientChatChannelAccount`, `ClientChatConversation`, `ClientChatParticipant`, `ClientChatMessage`, `ClientChatWebhookFailure`, `ClientChatCannedResponse`, `ClientChatAssignmentConfig` (schema-only, no CRUD), `ClientChatEscalationConfig`, `ClientChatEscalationEvent`, `ClientChatQueueSchedule`, `ClientChatQueueOverride`.

Key enums: `ClientChatChannelType` (VIBER, FACEBOOK, TELEGRAM, WHATSAPP, WEB), `ClientChatStatus` (LIVE, CLOSED, PENDING_REOPEN; schema may also expose RESOLVED/ARCHIVED/PAUSED in older variant — re-check), `ClientChatDirection` (IN, OUT), `ClientChatAccountStatus`.

Archival: on inbound to CLOSED conversation, old `externalConversationId` rewritten to `${id}__archived_${ts}` and a new conversation created with `previousConversationId` link. Deletion walks the whole chain (`deleteConversation()` loops — finding #46).

---

## 3. Auth + RBAC

### 3.1 Auth flow — `src/auth/`

- `POST /auth/login` — sets httpOnly cookie `COOKIE_NAME` (default `access_token`); sameSite `none` on prod/`lax` on dev; `secure` from `COOKIE_SECURE`; maxAge 30 days.
- `POST /auth/app-login` — JSON body returns JWT + `telephonyExtension` (includes plaintext `sipPassword` — finding #13).
- `GET /auth/me` — sliding-window refresh: if past 50% of token lifetime, issue fresh token.
- `POST /auth/device-token`, `POST /auth/exchange-token` — JWT handshake for Electron softphone switch-user flow. **No `@RequirePermission` — finding #7.**
- `POST /auth/logout` — clears cookie.
- JWT: `process.env.JWT_SECRET` required, app crashes if missing (fixed since 2026-03-24, finding #3). Expiry `JWT_EXPIRES_IN` (default `24h` per `CLAUDE.md`; `auth.module.ts` example said `15m` — need to reconcile).

### 3.2 Login throttle — `src/auth/login-throttle.service.ts`

In-memory Map<email, {count, lockedUntil}>. 5 attempts, 5-minute lockout. State lost on restart (finding #2).

### 3.3 Guards

- `JwtAuthGuard` — Passport strategy, reads cookie or Authorization header.
- `PositionPermissionGuard` (`src/common/guards/position-permission.guard.ts`) — authoritative. Superadmin bypass, loads `employee.position.roleGroup.permissions`, checks `resource.action`. **Returns true if no `@RequirePermission()` decorator — finding #9.**
- `PermissionGuard` — legacy role-based; still used by some older modules. Prefer `PositionPermissionGuard` for new work.
- `AdminOnlyGuard` — `user.role === 'ADMIN'`.
- `TelephonyIngestGuard` — shared-secret guard for `/v1/telephony/events`.
- Web + channel webhook guards (Viber/FB/Telegram/WhatsApp/ConversationToken).

### 3.4 Permissions catalog (`prisma/seed-permissions.ts`)

Call Center: `call_center.menu`, `call_center.reports`, `call_center.live`, `call_center.quality`, `call_center.statistics`.

Call Logs scope: `call_logs.own` / `.department` / `.department_tree` / `.all`.

Call Recordings scope: `call_recordings.own` / `.department` / `.department_tree` / `.all`.

Missed Calls: `missed_calls.access`, `missed_calls.manage`.

Client Chats: `client_chats.menu`, `client_chats.reply`, `client_chats.assign`, `client_chats.change_status`, `client_chats.link_client`, `client_chats.send_media`, `client_chats.send_template`, `client_chats.use_canned`, `client_chats.manage_canned`, `client_chats.view_analytics`, `client_chats.manage`, `client_chats.delete`, `client_chats_config.access`.

Menu gates: `call_center.menu`, `client_chats.menu`, `telephony.menu`.

### 3.5 RoleGroups and Positions (`prisma/seed-rbac.ts`)

| RoleGroup | Position | Intent | Current seeded perms |
|---|---|---|---|
| FULL_ACCESS | ADMIN | Superadmin | all (via bypass) |
| MANAGEMENT | MANAGER | Dept leads | 13 perms — **no `call_center.*` or `client_chats.manage`** |
| CALL_CENTER | CALL_CENTER | Operator | 6 perms (buildings/clients read, incidents, work-orders.read, client_chats.menu) — **no `call_logs.own`, `call_recordings.own`, `missed_calls.access`, `call_center.menu`, `call_center.reports`** |
| TECHNICIAN | TECHNICIAN | Default fallback | 6 perms |
| WAREHOUSE | WAREHOUSE | Inventory | 3 perms |

**Gap:** Neither CALL_CENTER nor MANAGEMENT role groups actually carry the permissions needed for the Monday rollout. Seed-rbac.ts uses outdated hyphenated permission names (`work-orders.*`) while seed-permissions.ts uses underscored (`work_orders.*`). The permissions catalog has the right keys; the assignment wiring does not. This is a P0 blocker for Monday — operators and managers must be assigned a RoleGroup that actually includes the call-center and client-chats permissions they need.

### 3.6 Data scope (`src/common/utils/data-scope.ts`)

`DataScopeService.resolve(resource, userId)` → `'all' | 'department_tree' | 'department' | 'own'`. `buildUserFilter(scope)` produces a Prisma `where` clause. Applied in `TelephonyCallsService.findAll()`. Call recordings use same scope keys. Not applied to single-conversation chat reads (finding — §2.8).

### 3.7 Socket auth recap

| Gateway | Namespace | Payload field read | Presence in-memory? |
|---|---|---|---|
| Telephony | `/telephony` | `payload.id` (finding #19 — may be wrong) | Yes (StateManager maps) |
| Client Chats | `/ws/clientchats` | `payload.sub` or `payload.id` | Partial — rooms fixed at connect |
| Messenger | `/messenger` | `payload.sub` | Yes; lost on restart (finding #32) |

---

## 4. Frontend — Operator + Manager surfaces

### 4.1 Call Center pages (`frontend/crm-frontend/src/app/app/call-center/`)

| Path | Permission | Data source | Real-time? |
|---|---|---|---|
| `/app/call-center` (Overview) | `call_center.statistics` | `GET /v1/telephony/stats/overview?from&to` | No (manual refresh) |
| `/app/call-center/logs` | `call_logs.{own,department,department_tree,all}` | `GET /v1/telephony/calls` + `RecordingCell` for playback | No |
| `/app/call-center/missed` | `missed_calls.access` | `GET /v1/telephony/missed-calls` | No |
| `/app/call-center/live` | `call_center.live` | `GET /v1/telephony/queues/live` + `GET /v1/telephony/agents/live` | **10s polling (`REFRESH_INTERVAL_MS`), no socket.** |
| `/app/call-center/reports` | `call_center.reports` | `GET /v1/call-reports` + `/my-drafts`. Modal opens from softphone via `?openReport=true` | Socket listener: `call:report-trigger` |
| `/app/call-center/quality` | `call_center.quality` | `GET /v1/telephony/quality/reviews` | No |
| `/app/call-center/statistics` | `call_center.statistics` | `overview`, `overview-extended`, `agents-breakdown`, `breakdown?groupBy=hour\|day\|weekday` | No |
| `/app/call-center/agents` | (TBD) | (TBD) | — |
| `/app/call-center/callbacks` | (TBD) | `GET /v1/telephony/callbacks` | No |

Layout: `call-center/layout.tsx` wraps children in `<PermissionGuard permission="call_center.menu">`; each tab hidden if user lacks the tab's specific permission.

### 4.2 Client Chats pages (`src/app/app/client-chats/`)

- `/app/client-chats` (main inbox + conversation panel). Permission `client_chats.menu`. Manager view toggle controlled by `client_chats.manage`.
- `/app/client-chats/analytics` — manager-only.

Socket: `useClientChatSocket.ts` connects to `${WS_BASE}/ws/clientchats`, auto-reconnect 1s–30s with infinite attempts. Subscribes to `newMessage`, `conversationUpdated`, `paused`, `unpaused`, `closed`. **Fallback polling runs alongside: 5s when disconnected, 15s when connected — deduplicated client-side in `ConversationPanel` via `prev.some(m => m.id === data.message.id)`.**

Inactivity alert: 10 minutes after operator's last reply → confirm prompt for Close.

### 4.3 Internal messenger

Global floating UI (`messenger-context.tsx` + `messenger-modal-bridge.tsx` + `chat-bubble-container.tsx`), mounted once in `layout.tsx`. Not a dedicated route. Used by both operators and managers.

### 4.4 Softphone renderer (`crm-phone/src/renderer/`)

Pages: LoginPage, PhonePage (dialpad / call history / incoming popup / CallerCard), SettingsPage (muteRingtone, overrideApps), CallHistory, CallerCard, IncomingCallPopup.

Browser↔softphone bridge: `useDesktopPhone()` polls `http://127.0.0.1:19876/status` every 60s; renders a "switch user" banner when web UI and phone app users mismatch. Switch flow: frontend calls `POST /auth/device-token` → handshake token → `POST http://127.0.0.1:19876/switch-user`.

### 4.5 Critical fragility (per CLAUDE.md)

- `app/modal-stack-context.tsx` — pushState/popstate sync, URL-param priority chain (messenger → incident → workOrder → employee → client → building).
- `app/layout.tsx` — Provider nesting. If MessengerContext/ModalStackContext/I18nContext throws on init, whole app goes blank.
- Modals must use `createPortal` with z-index detail=10000, action=50000+. **6 files still render inline (finding #55).**
- ~37 raw `fetch()` calls remain in the frontend (finding #4).

---

## 5. Prisma schema, migrations, cron jobs

### 5.1 Recent migrations (last 60 days, in-scope)

```
20260416 add_call_reports                (CallReport, CallReportLabel, PermissionCategory+CALL_CENTER)
20260415 simplify_user_role_enum          (UserRole → ADMIN|USER)
20260329 missed_calls_enhancements        (resolvedByCallSessionId, EXPIRED status)
20260326 add_missing_fk_indexes           (ClientChatConversation, Conversation, etc.)
20260319 add_participant_to_conversation  (messenger)
20260318 add_escalation                   (ClientChatEscalationConfig/Event)
20260318 add_queue_schedule               (ClientChatQueueSchedule/Override)
20260317 add_assignment_config
20260317 add_canned_responses
20260302 add_softphone_support            (Extension, AgentState)
20260227 client_chat_redesign             (ClientChatConversation, Message, Participant)
20260227 add_whatsapp_channel
20260227 add_telegram_channel
20260227 add_conversation_analytics_fields
```

### 5.2 Cron jobs (NestJS @Cron)

| Service | Schedule | Overlap guard |
|---|---|---|
| `EscalationService.checkEscalations` | `*/1 * * * *` | `processing` flag |
| `CdrImportService.importCdr` | `0 */5 * * * *` (env-gated) | `processing` flag |
| `AsteriskSyncService.syncAll` | `EVERY_5_MINUTES` | `syncing` flag |
| `QualityPipelineService.processPendingReviews` | `0 */2 * * * *` (default) | `processing` + 10-min stuck recovery |
| `MissedCallsService.expireOldMissedCalls` | `0 */5 * * * *` or `0 */30 * * * *` (verify) | `isExpiring` flag |

App module wires `ScheduleModule.forRoot()` globally in `src/app.module.ts`.

### 5.3 Rate limiting (`ThrottlerModule`)

Global 60 req / 60s per IP. `@SkipThrottle()` on `HealthController`, `TelephonyIngestionController`, `ClientChatsPublicController`, `CoreIntegrationController`, `BugReportsPublicController`. **Login endpoint is throttled only by global rule plus LoginThrottleService's per-email 5/5min lockout — finding #1 (P0).**

### 5.4 Silent-override risks in scope (per CLAUDE.md)

- `TELEPHONY_INGEST_SECRET` must match between backend env and AMI bridge env on the VM.
- `CRM_WEBHOOK_SECRET` on the core-sync-bridge must match backend's `CORE_WEBHOOK_SECRET`.
- `COOKIE_NAME` must agree between frontend and backend (both read the same constant).
- Prisma enum migrations can fail with "unsafe use of new value" — never add enum value + use it in the same transaction.
- AMI bridge buffer: size-based flush + 5000-event cap with oldest eviction.
- Message dedup order is load-bearing (CLAUDE.md §11).
- Dual RBAC: legacy `RolesModule` + Position RBAC coexist; Position is authoritative.

---

## 6. Asterisk / FreePBX (production)

See `audit/ASTERISK_INVENTORY.md` for the full `asterisk -rx`/`ssh asterisk` output.

Summary:

- Host 5.10.34.153 via OpenVPN, SSH alias `asterisk`. Asterisk 16.11.1 (EOL upstream), FreePBX 15.0.16.72 on SNG7 distro. Uptime 113 days.
- PJSIP only (chan_sip not loaded). 16 internal extensions 200–214 + 501; **only ext 200 currently registered** (rest were offline at inventory time).
- Single trunk: `1055267e1-Active-NoWorkAlamex` to 89.150.1.11 (Alamex).
- 6 queues — `default`, `800`, `801`, `802`, `803`, `804`. **Queue 804 is the live call-center queue** (16 members Local/200–214, MOHNEW, 67/137 calls today, SL 98.5%). Queue 802 has `ringinuse=no`, which can double-ring busy agents.
- AMI user: `crm_ami` on `/etc/asterisk/manager_custom.conf`; wide permissions including `originate` and `command` (write). 3 concurrent `crm_ami` sessions from 127.0.0.1 observed — bridge reconnecting without clean close.
- ARI user: `freepbxuser` only. ARI on 8088 (HTTP) + 8089 (HTTPS).
- Recording path `/var/spool/asterisk/monitor/YYYY/MM/DD/`, filename scheme `q-{queue}-{cid}-YYYYMMDD-HHMMSS-{linkedid}.{uniqueid}.wav`. Disk `/` 69% full on 39GB volume, no visible rotation.
- Sangoma's `sangomacrm.agi` fires on every hangup — unrelated to our CRM, minor overhead.
- SIP transport UDP-only, `media_encryption=no` — fine inside the private network, flag if any remote extension ever registers over public Internet.

---

## 7. Local stack

Status at Phase 0 write time: Docker Desktop not running on this laptop; backend and frontend not running. Docker start was triggered. Deferred: once Docker is up, bring up `crm-prod-db`, run backend (`npm run start:dev` in `backend/crm-backend`) and frontend (`pnpm dev --port 4002` in `frontend/crm-frontend`), then confirm `/health` and softphone bridge. Phase 2 dynamic testing requires this stack live.

---

## 8. Cross-references

Source agent outputs (verbatim, for traceability) are preserved in memory of the parent conversation, not written to the repo to avoid churn. Anyone rerunning Phase 0 can regenerate them with the prompts listed in the session log.

The three other Phase 0 deliverables:
- `audit/THREAT_MODEL.md` — what can go wrong on Monday, per surface, with owner.
- `audit/KNOWN_FINDINGS_CARRIED_FORWARD.md` — 68 findings from prior audits with verification hooks.
- `audit/ASTERISK_INVENTORY.md` — full Asterisk read-only dump.

Phase 1 starts once all four are written and the local stack is confirmed running.
