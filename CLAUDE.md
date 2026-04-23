# CLAUDE.md — Project Context for Claude Code

## Working Mode

> **New session starting work?** Read `audit/CURRENT_WORKSTREAM.md` FIRST. It's a continuously-updated handoff brief covering recent PRs, in-flight work, business decisions, deferred items, and open questions — saves you from re-deriving state from git history.

The project owner is a non-programmer founder. For all technical decisions (libraries, config, patterns, structure, tooling), decide based on what you see in the codebase and proceed without asking. Only ask about business logic decisions — who can access what, what should happen when X occurs, user-facing behavior, and workflow rules.

## Project Overview

CRM28 — Property/building management CRM for the Georgian market. Domain: crm28.asg.ge
Manages buildings, residents, work orders, incidents, sales leads, inventory, telephony, multi-channel chat.

- **Backend**: NestJS 11 (TypeScript) — `backend/crm-backend/`, port 3000, `npm run start:dev`
- **Frontend**: Next.js 16 App Router, React 19 — `frontend/crm-frontend/`, port 4002, `pnpm dev --port 4002`
- **Database**: PostgreSQL 17 (production VM 192.168.65.110, port 5432) / PostgreSQL 16 (local dev Docker `crm-prod-db`, port 5433) via Prisma 7 ORM
- **Real-time**: Socket.IO — namespaces: `/messenger`, `/telephony`, `/ws/clientchats`
- **Telephony**: Asterisk/FreePBX 16 + AMI Bridge (`ami-bridge/`, VM 192.168.65.110, port 3100 health) + Electron softphone (`crm-phone/`)
- **Auth**: JWT in httpOnly cookie (`access_token`), Passport, 24h expiry
- **AI**: OpenAI GPT-4o + Whisper (call quality reviews)
- **Chat Channels**: Viber, Facebook, Telegram, WebChat (WhatsApp planned) — adapter pattern
- **CSS**: Tailwind CSS v4 (PostCSS plugin, theme in `globals.css`, NO `tailwind.config` file)
- **Core Sync**: One-way sync from legacy MySQL → CRM via webhook bridge (`core-sync-bridge/`, VM 192.168.65.110, port 3101 health). See `docs/CORE_INTEGRATION.md`
- **Operations Dashboard**: Integrated monitoring at `/admin/monitor/` (password-protected, port 9090 on VM). See `vm-configs/crm-monitor/`
- **CI/CD**: GitHub Actions self-hosted runner on VM → auto-deploy on push to master (`.github/workflows/deploy-vm.yml`). Railway is staging only (`crm28demo.asg.ge`, deploys from `dev` branch).
- **Deployment**: VM auto-deploys on master merge via GitHub Actions. Steps: pull → **stop backend** → install deps (--prefer-offline, shared pnpm store) → prisma generate → migrate → seed-permissions → **seed-system-lists** (PR #267) → build → restart backend + frontend → health check. Backend is stopped before `pnpm install` to release Windows file locks on native modules (bcrypt.node). Railway serves as staging environment.

### Quick Start
```powershell
docker start crm-prod-db                          # Database
cd backend\crm-backend ; npm run start:dev         # Backend on :3000
cd frontend\crm-frontend ; pnpm dev --port 4002    # Frontend on :4002
```

### First-Time Setup
```powershell
cd backend\crm-backend
pnpm install ; pnpm prisma generate ; npx prisma migrate dev ; pnpm seed:all
```
`seed:all` runs all 8 seed scripts in dependency order. `seed-permissions.ts` is the canonical seed (not `seed-rbac.ts`).

---

## Git Rules (ENFORCED)

- **NEVER commit directly to master** — master is production
- Always work on `feature/*` branches created from master
- Branch protection is enforced via PreToolUse hook
- PRs target master directly — NO dev or staging branches exist
- Jemiko merges PRs manually after testing on localhost
- Commit format: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `docs(scope):`, `chore(scope):`

### Feature Flow
1. `git checkout master ; git pull origin master`
2. `git checkout -b feature/my-feature`
3. Build the feature
4. `git push origin feature/my-feature`
5. `gh pr create --base master --title "feat(scope): description"`
6. Tell me: "Ready to test on localhost"
7. I test → merge PR → VM auto-deploys via GitHub Actions

### Stop Conditions — ASK Before Doing
1. Database schema breaking changes (dropping columns, renaming)
2. API contract changes (removing endpoints, incompatible changes)
3. Asterisk/FreePBX config changes (ALWAYS apply via GUI too)
4. Deleting files or large refactors
5. Changing environment variables (both local and VM production may need updates; Railway staging may also need updates)
6. Changing seed scripts (affects VM production deployment)

### ⛔ ABSOLUTE RULE: Core MySQL Database is READ-ONLY
**NEVER, under ANY circumstances, execute INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, TRUNCATE, or any data-modifying statement against the core MySQL database (192.168.65.97:3306).** This applies to:
- All Claude agents and subagents working on this project
- The Core Sync Bridge service
- CRM backend code
- VM production deployment
- Any script, migration, or tool

**Read queries MUST use non-locking reads** (`SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` or explicit `LOCK IN SHARE MODE` avoidance). Never use `SELECT ... FOR UPDATE` or any locking SELECT. The core database serves critical production applications — CRM must never cause slowdowns, locks, or data corruption. Violation of this rule can halt company operations.

---

## Verification Commands

After any backend change:
```powershell
cd backend\crm-backend ; pnpm typecheck       # TypeScript check
cd backend\crm-backend ; pnpm lint             # Lint
cd backend\crm-backend ; pnpm test:unit        # Unit tests
```

After any frontend change:
```powershell
cd frontend\crm-frontend ; pnpm typecheck      # TypeScript check
cd frontend\crm-frontend ; pnpm build          # Production build
```

After any Prisma schema change:
```powershell
cd backend\crm-backend ; npx prisma generate
cd backend\crm-backend ; npx prisma migrate dev --name descriptive_name
```

After any API change, test the endpoint with curl or the existing test suite.

### Pre-Completion Checklist
Before telling me "ready to test":
1. All verification commands pass (typecheck, lint, tests)
2. No `console.log` left (unless intentional logging)
3. No hardcoded URLs, ports, credentials
4. `useListItems()` for all dropdowns — never hardcode dropdown values
5. `apiGet/apiPost/apiPatch/apiDelete` for all HTTP calls — never raw `fetch()`
6. Permissions added if needed (seed-permissions.ts + backend guard + frontend hook)
7. **i18n: All user-facing strings translated** — use `useI18nContext()` + `t()` for every string in frontend components. Add keys to both `src/locales/en.json` and `src/locales/ka.json`. Never hardcode user-facing text in English or Georgian directly in components.
8. **Documentation updated in the SAME PR** (not a separate follow-up):
    - `CLAUDE.md` — Silent Override Risks / module boundaries / business rules changes
    - `API_ROUTE_MAP.md` — any endpoint, request/response, guard changes
    - `DATABASE_SCHEMA.md` — any schema changes (new models, columns, enums)
    - `FRONTEND_ROUTE_MAP.md` — any new page / route / major component
    - `docs/TELEPHONY_INTEGRATION.md` — any softphone / Asterisk / AMI changes
    - `docs/TESTING.md` — any new test tooling or manual test plan
    - `audit/CURRENT_WORKSTREAM.md` — **always** update "Recent PRs shipped"
    - **Any other `docs/*.md`** when its subsystem changes (AMI_BRIDGE, CORE_INTEGRATION, LOCAL_DEVELOPMENT, BRIDGE_MONITOR, DESIGN_SYSTEM, DEVELOPMENT_GUIDELINES)
9. **Code review before PR** — run `code-reviewer` agent (and `db-reviewer` for schema/migration changes) against the branch before `git push`. Address critical + warning findings. Record the review round-trip in the PR body.

---

## Critical Rule: Asterisk/FreePBX

When making ANY Asterisk/FreePBX changes via CLI/SSH:
1. Make the change via CLI
2. **ALSO apply the same change through the FreePBX web GUI** (or run `fwconsole reload` at minimum)
3. If you only change via CLI, the next time someone clicks "Apply Config" in the FreePBX GUI, the GUI's version **silently overwrites** CLI changes — they're LOST
4. For queue changes: edit in GUI → Apply Config → verify with `asterisk -rx "queue show"`
5. For manager config: edit `/etc/asterisk/manager_custom.conf` → `asterisk -rx "manager reload"` → verify in GUI
6. Rule of thumb: treat the FreePBX GUI as the source of truth, use CLI only for verification

---

## Silent Override Risks (Always Check)

Flag any situation where a value lives in more than one place. Known risks:

0. **⛔ Core MySQL is READ-ONLY** — The core database at 192.168.65.97:3306 must NEVER be written to. All queries must be non-locking SELECTs. Use `SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` on every connection. Never use `FOR UPDATE`, `LOCK IN SHARE MODE`, or any write statement. This database serves multiple critical production applications.
1. **JWT secret fallback** — `JWT_SECRET` is required, app crashes if missing. Ensure no hardcoded default exists anywhere.
2. **Telephony ingest secret sync** — `TELEPHONY_INGEST_SECRET` must match between VM backend env and AMI Bridge env (both on same VM). Changing one without the other silently breaks telephony ingestion.
2b. **Core webhook secret sync** — `CRM_WEBHOOK_SECRET` on the bridge must match `CORE_WEBHOOK_SECRET` on VM backend. Changing one without the other silently breaks core sync.
3. **Hardcoded cookie names** — All gateways (telephony + messenger) use `COOKIE_NAME` env var for cookie extraction. Frontend and backend must agree.
4. **Prisma enum migration behavior** — PostgreSQL CANNOT use a new enum value in the same transaction that adds it. If migration fails with "unsafe use of new value", either use fresh DB or apply `ALTER TYPE` manually outside transaction, then `npx prisma migrate resolve --applied <name>`. Always check existing data before enum changes.
5. **AMI Bridge buffer risks under load** — AMI event relay runs on same VM as CRM backend under PM2. High call volume can cause event buffering/loss if the bridge falls behind.
6. **Rate limiter vs webhook conflict** — Global ThrottlerGuard (60 req/60s per IP) applies to most routes. Webhooks, health, and telephony ingestion have `@SkipThrottle()`. New webhook endpoints MUST add `@SkipThrottle()` or external services will get 429'd.
7. **Unwired HealthModule** — `/health` endpoint exists with DB + memory checks. Verify it's imported in `app.module.ts` and actually responding.
8. **Dual RBAC systems** — Legacy `RolesModule` exists alongside Position-based RBAC (`RoleGroups → Permissions`). Both are imported in `app.module.ts`. Position RBAC is authoritative. Legacy module is technical debt — do not build new features on it.
9. **Seed script ordering dependencies** — `seed:all` orchestrates 8 scripts in dependency order (permissions first). Running individual seeds out of order can cause foreign key violations. `seed-permissions.ts` is canonical for production; never run `seed-rbac.ts` in production.
10. **Frontend API rewrite localhost default** — `next.config.ts` rewrites `/auth/*`, `/v1/*`, `/public/*` to backend. Falls back to `http://localhost:3000` which is correct on VM (co-located). On Railway staging, `API_BACKEND_URL` must be set explicitly.
11. **Message deduplication race condition** — `clientchats-core.service.ts processInbound()` pipeline order is load-bearing: dedup → upsert → save → match → emit. Changing this order can cause duplicate messages or lost customer name data (`isBetterName()` guard).
12. **JWT claim access — always `payload.sub`, never `payload.id`** (PR #250) — the telephony Socket.IO gateway and all downstream services standardized on `sub`. Old code accessing `payload.id` will silently fail auth. JWT contract integration tests enforce this.
13. **SIP password NOT on disk** (PR #249, v1.9.0 softphone) — `sipPassword` must never be persisted to the Electron `session-store` file. `crm-phone/src/main/session-store.ts::stripPassword()` enforces this; old on-disk sessions are migrated on read. If you add a new field to `AppLoginResponse` that contains sensitive data, follow the same pattern or it will hit disk.
14. **Reduced bridge `/status` payload** (PR #253) — the local softphone bridge on `127.0.0.1:19876/status` returns only `{ id }` (user UUID). Any local process can poll this endpoint; leaking name/email/extension would expose operator identity to untrusted PCs. If extending the bridge, preserve this boundary.
15. **`timestampevents=yes` lives in `/etc/asterisk/manager.conf`, NOT `manager_custom.conf`** (PR #263) — FreePBX 15/16 does not support overriding the `[general]` section via `_custom.conf`. This is an exception to rule #123 above. A FreePBX "Apply Config" click from the web GUI WILL silently wipe it. If AMI event timestamps disappear from stats, check this setting first.
16. **Stats — missing CallMetrics ≠ silent drop** (PR #255) — any change to the stats-ingestion or stats-read path must preserve the `reason: "unknown"` behavior for CallSessions without CallMetrics. Silently dropping them masks ingest bugs. See `audit/STATS_STANDARDS.md` (M3 decision).
17. **Replayed `call_end` events merge, don't overwrite** (PR #255) — telephony ingestion applies field-level merge on duplicate terminal events. Only null/missing fields are overwritten. Changing this to a full-replace can corrupt finalized call records when the AMI bridge buffers/replays events. See `audit/STATS_STANDARDS.md` (M7 decision).
18. **`TelephonyQueue.isAfterHoursQueue` is sticky — env var only bootstraps, DB is authoritative** (PR #278) — `asterisk-sync.service.ts` writes `isAfterHoursQueue` ONLY on CREATE (using the `AFTER_HOURS_QUEUES` env var list). On subsequent UPDATE ticks (every 5 min) it leaves the flag untouched so admin/DB changes persist. Consequence: **changing `AFTER_HOURS_QUEUES` env var has NO effect on queue rows that already exist**. To toggle an existing queue, update the DB directly (or use a future admin UI). `MissedCallReason.OUT_OF_HOURS` classification depends on this flag; silent drift here = OUT_OF_HOURS calls mis-tagged as NO_ANSWER.
19. **Operator break auto-close depends on `COMPANY_WORK_END_HOUR` env** (break-feature-backend PR) — `OperatorBreakService.autoCloseStaleBreaks` cron runs every 30 min and closes active break sessions whose `startedAt` is before today's `COMPANY_WORK_END_HOUR` (env, default 19). A 12-hour hard cap catches any break that escapes that window. If the env var is misconfigured (invalid value falls back to 19 silently) OR the server's local clock is off, breaks will either auto-close at the wrong time or not at all. Verify via the "Breaks" manager tab after a full-day cycle.
20. **Operator DND state is NOT persisted — lives in Asterisk + in-memory cache** (dnd-feature-backend PR) — `OperatorDndService.enable/disable` send AMI `QueuePause` (no `Queue` field → applies to all queues the extension is a member of). `TelephonyStateManager` updates `agent.presence = 'PAUSED'` from AMI events. There is NO DB column. Consequences: (a) if AMI is unreachable at enable/disable time, the caller gets an error and state is unchanged — no silent drift. (b) If someone uses `asterisk -rx "queue pause"` directly, state manager picks it up via AMI event; CRM sees it too. (c) On backend restart, state rehydrates from Asterisk via the startup AMI queue-status query (see `TelephonyStateManager.hydrateFromDb`). (d) Auto-disable on logout is best-effort in `auth.controller.logout` — any failure (expired JWT, AMI down) is swallowed so cookie-clear always succeeds.
21. **Softphone Break: backend POST runs BEFORE SIP unregister (order is load-bearing)** (softphone v1.10.0) — `useBreak.start()` in `crm-phone/src/renderer/hooks/useBreak.ts` calls `POST /v1/telephony/breaks/start` first and only invokes `sipService.unregister()` on success. If you reverse the order, the operator's SIP tears down optimistically and a backend rejection (400 "on an active call" / "already on break") leaves them offline while CRM says they're still working — confusing manager live-monitor. `useBreak.end()` mirrors the same ordering (backend first, then `sipService.register()`). The `inFlight` ref in both hooks prevents double-click races. The break modal replaces the entire `PhonePage` when `breakState.active` is non-null, so there's no way to dial / answer during break — but if you change that, also check `sipService.registered` in App.tsx's cold-start effect still forcibly unregisters on restore-into-active-break.
22. **Softphone pnpm layout: four levers are load-bearing together** (softphone v1.10.1 hotfix) — to produce a working installer, the softphone build depends on ALL of these being in sync:
    - `crm-phone/.npmrc` → `shamefully-hoist=true`. Without it `electron-builder` bundles an incomplete asar (transitive deps missing entirely).
    - `crm-phone/package.json` → `pnpm.overrides` pins `builder-util-runtime: 9.5.1` + `fs-extra`, `js-yaml`, `semver`, `lazy-val` (shared between `electron-builder@24` and `electron-updater@6.8`). Without it, pnpm lets two versions coexist and `electron-builder` packages the wrong one — auto-update crashes with `(0, builder_util_runtime_1.retry) is not a function`.
    - `crm-phone/package.json` → `"packageManager": "pnpm@X.Y.Z"`. Corepack / CI refuses wrong-manager installs. Without it, an accidental `npm install` silently ignores `pnpm.overrides` (it's a pnpm-only field) and reintroduces the bug.
    - **No `crm-phone/package-lock.json` committed.** A stale npm lockfile overrides the override. The lockfile was removed in v1.10.1 — don't commit it back. `crm-phone/pnpm-lock.yaml` is the canonical lockfile.
  
    Verify after any dep bump: `npx asar list release/win-unpacked/resources/app.asar | grep builder-util-runtime` (list should be non-empty) AND `npx asar extract release/win-unpacked/resources/app.asar /tmp/out && cat /tmp/out/node_modules/builder-util-runtime/out/retry.js` (file should exist and export `retry`). If either check fails, one of the four levers drifted.
23. **Express's default ETag silently stale-caches live-data endpoints** (telephony-calls-cache-fix PR) — Express (NestJS's underlying HTTP adapter) ships with `etag: "weak"` enabled by default. It adds an `ETag` header on every JSON response. The browser caches the body keyed by ETag; on the next identical request it sends `If-None-Match`, Express re-hashes the CURRENT body, and if the hash matches, Express returns `304 Not Modified` with 0 bytes and the browser reuses the cached body. This is catastrophic for **paginated live-data endpoints that can return empty early** — e.g. `/v1/telephony/calls`, `/v1/telephony/missed-calls`, stats endpoints. Field symptom (April 2026): operator saw an empty Call Logs table for hours because her first page load hit the endpoint before any calls existed, the browser cached the empty `{data:[], meta:{total:0}}` body, and every reload returned 304 → stale empty render, even as the DB filled up. Fix in that PR: added `@Header('Cache-Control', 'no-store')` on every live list endpoint in `TelephonyCallsController` and `MissedCallsController`. **Any new live-data list endpoint MUST add `@Header('Cache-Control', 'no-store')`** — if you forget, the bug won't appear in dev (where fresh data keeps the ETag moving) but will reproduce in production for any user whose first page load hits an empty window. Corollary: the Call Logs frontend now also shows a visible red banner on fetch errors instead of silently blanking the table — so future stale-cache / permission failures are diagnosable from the UI alone.

24. **Softphone rejects incoming INVITE while a call is in progress** (softphone v1.11.0) — `SipService.handleIncoming()` in `crm-phone/src/renderer/sip-service.ts` checks `this.currentSession && this._callState !== "idle"` and responds with `486 Busy Here` to any colliding INVITE. Without this guard, a queue-routed call arriving while the operator's own outbound was still dialing would overwrite `currentSession`, orphan the outbound `Inviter` (no `.cancel()` sent — Asterisk's side dangles), and surface as a new ringing popup — silently hijacking the user's dial attempt. Field symptom before the fix: operator initiates outbound, a queue call arrives mid-dial, outbound vanishes without a trace in the softphone UI. If you ever add call-waiting, gate it behind an explicit setting and keep this reject path as the default.

25. **Phone lookup: both paths must share `PhoneResolverService.localDigits()` normalization; short inputs must never `contains`-query client phones** (telephony-phone-lookup fix PR) — Two separate code paths match phone numbers against `Client.primaryPhone`/`secondaryPhone`: (a) `TelephonyCallsService.lookupPhone()` (per-call popup) and (b) `TelephonyCallsService.getExtensionHistory()` (operator's 3-day history list). CDR rows store numbers in whatever form Asterisk received them (typically `995555123456`), while clients in the DB may be stored as `0555123456`, `555123456`, or `+995 555 12 34 56`. If both paths don't run inputs through `PhoneResolverService.localDigits()` (strip non-digits, keep last 9) and then use `{ contains: local }` against both phone columns, the two UIs will silently disagree — popup finds the client, history does not (or vice versa). Equally important: if `localDigits()` returns fewer than 7 digits (extensions, garbage), DO NOT run `contains` against client phones — `214` would match any client phone containing the substring "214". For short inputs, only match `TelephonyExtension.extension` exactly; return an empty `CallerLookupResult` otherwise. Tests: `telephony-calls.service.spec.ts` covers the 3-digit-extension, 3-digit-unknown, 995-prefix, and CDR-995-vs-stored-local-format cases.

26. **FreePBX queue members are `Local/<ext>@from-queue/n`, NOT `PJSIP/<ext>`** (dnd-ami-interface-format PR) — AMI `QueuePause` matches the `Interface` field verbatim against the queue member records Asterisk has on file. With FreePBX's standard agent config, every member is registered as a `Local` channel (the `/n` suffix tells Asterisk not to re-process dialplan when the Local channel answers). Sending `Interface: PJSIP/200` returns `Message: Interface not found` even though extension 200 clearly exists as a PJSIP endpoint. Verified via `QueueStatus` AMI action on production: every member across queues 30/800/801/802/803/804 reports location `Local/<ext>@from-queue/n`. If we ever move to a hosted SIP trunk setup where queues pool PJSIP endpoints directly, either make this a per-queue env var or a DB column — don't hardcode the other format. Corollary: **`asterisk-manager` rejects `sendAction()` promises with two different shapes** — `new Error('AMI not connected')` from our own wrapper when no TCP connection exists, OR a plain parsed event object like `{ response: 'error', message: 'Interface not found', actionid: '...' }` when Asterisk returned `Response: Error`. Never `String(err)` — a plain object becomes `"[object Object]"` and any error-translation regex silently never matches. Always read `err.message` as a property first, fall back to Error/String only if that's empty. (A first code-reviewer pass on this fix shipped the `String(err)` bug; tests only mocked with `new Error()` which hid it. The prod-shape test in `operator-dnd.service.spec.ts` guards against regressing.)
27. **Outbound calls need attribution at `call_start` — no AgentConnect fires for OUT direction** (outbound-attribution fix PR) — Asterisk's `AgentConnect` AMI event fires only when a queue member answers a queued call; outbound calls never pass through a queue, so `handleAgentConnect` never runs for OUT direction. Without explicit fallback, `CallSession.assignedUserId` stays NULL forever for every outbound call, and operators with `call_logs.own` scope (which filters by `assignedUserId`) never see their own outbound calls — only superadmin's `call_logs.all` scope surfaces them. Fix: `handleCallStart` in `telephony-ingestion.service.ts` looks up `TelephonyExtension` by `callerNumber` (= the originating operator's extension on outbound) when `direction === OUT`, sets `assignedUserId`/`assignedExtension`, and inserts an AGENT `CallLeg`. `handleCallAnswer` patches that leg's `answerAt` when CDR import later synthesizes `call_answer`. Two load-bearing invariants: (a) the call_start-created AGENT leg MUST be closed (`endAt` set) when `handleAgentConnect` inserts a different-agent leg for the same session — otherwise transfers cause `touched`-stat double-counting across operators. (b) The `call_answer` AGENT-leg patch MUST be scoped to `direction=OUT, userId=assignedUserId` — without that filter, an unrelated inbound AgentConnect leg still unanswered on a multi-leg session can get accidentally patched. If you ever rewrite this, re-read `audit/STATS_STANDARDS.md` M5.

---

## Module Boundaries

### Backend (`backend/crm-backend/src/`)
Each NestJS module owns its domain: controller + service + DTOs + module file. Key modules:

| Module | Domain | Notes |
|--------|--------|-------|
| `auth/` | JWT login, /me, logout | Requires JWT_SECRET |
| `prisma/` | PrismaService | Extends PrismaClient + manages pg.Pool. Must call both `$disconnect()` AND `pool.end()` on shutdown |
| `buildings/` | Building CRUD | |
| `clients/` | Client service | Accessed via `v1/` controllers |
| `assets/` | Building devices | Terminology: "Devices" = building assets |
| `incidents/` | Incident management | Known bug: null client constraint violation |
| `work-orders/` | Work order lifecycle | Products, approval flow, inventory deduction ONLY after approval |
| `inventory/` | Products, stock, batches | Terminology: "Products" = inventory items |
| `employees/` | Employee lifecycle | Hard delete requires delegating active leads/work orders first |
| `departments/` | Department hierarchy | |
| `positions/` | Positions | Linked to RoleGroups |
| `role-groups/` | Permission bundles | |
| `permissions/` | RBAC CRUD | |
| `system-lists/` | Dynamic dropdown values | |
| `workflow/` | Workflow steps, triggers | |
| `sales/` | Leads, pipeline | |
| `messenger/` | Internal chat | Socket.IO `/messenger` |
| `telephony/` | Call center | Socket.IO `/telephony`, AMI, ARI, CDR, quality, AgentPresenceService (PR #260), CallLeg backfill (PR #264). Permission-gated: `telephony.call`, `softphone.handshake`, `call_logs.*`, `call_recordings.*`, `missed_calls.*`. See `docs/TELEPHONY_INTEGRATION.md` |
| `clientchats/` | Unified inbox | Socket.IO `/ws/clientchats`. FRAGILE: `processInbound()`, `joinConversation()`, `isBetterName()` |
| `notifications/` | Email + SMS | |
| `translations/` | i18n | |
| `audit/` | Audit log | |
| `health/` | Health endpoint | DB + memory checks |
| `bug-reports/` | Bug reporter (beta) | Claude AI analysis + GitHub issue creation. Env: ANTHROPIC_API_KEY, GITHUB_TOKEN |
| `core-integration/` | Core system sync | Webhook receiver + upsert logic. See `docs/CORE_INTEGRATION.md` |
| `common/` | Guards, filters, decorators | |
| `v1/` | Versioned controllers | |

### Prisma (`backend/crm-backend/prisma/`)
- `schema.prisma` — 70+ models, 40+ enums (single file). NEVER edit applied migration files.
- `migrations/` — NEVER edit applied migrations
- `seed-*.ts` — 8 seed scripts + `seed-all.ts` orchestrator

### Frontend (`frontend/crm-frontend/`)
- All authenticated pages are `"use client"` components under `src/app/app/` (47 pages)
- `src/lib/api.ts` — API client. Returns `undefined as T` on 204. Returns never-resolving Promise on 401.
- `src/hooks/useListItems.ts` — Dynamic dropdown hook
- `src/lib/use-permissions.ts` — RBAC hook
- `src/app/app/modal-stack-context.tsx` — VERY FRAGILE. Syncs with browser history via pushState/popstate. URL param priority: messenger → incident → workOrder → employee → client → building.
- `src/app/app/layout.tsx` — FRAGILE. If MessengerContext, ModalStackContext, or I18nContext throws on init, entire app goes blank.
- Modals: `createPortal` + mounted check + z-index (detail: 10000, action: 50000+). Never render inline.
- React hooks: ALL hooks BEFORE any conditional returns (React #310 crash)

**Do not create cross-module dependencies without documenting them.**

---

## For New Sessions / Subagents

**Before doing anything, read `audit/CURRENT_WORKSTREAM.md`** — it's a continuously-updated handoff brief listing recent PRs, in-flight work, business decisions, deferred items, and open questions. Catches you up in 3 minutes.

Then key rules for any work:
1. Check the **Verification Commands** section — run relevant checks before reporting done
2. Do not modify files outside your assigned module without explicit instruction
3. Use `apiGet/apiPost` (not raw `fetch()`) and `useListItems()` (not hardcoded dropdowns)
4. Never commit to master — work on feature branches only
5. Check **Silent Override Risks** if your change touches config, env vars, or cross-module boundaries
6. Follow the **Pre-Completion Checklist** — docs updated in the SAME PR, code-reviewer before push

---

## Business Rules

### Work Order Lifecycle
`CREATED → LINKED_TO_GROUP → IN_PROGRESS → COMPLETED/CANCELED`
- Types: INSTALLATION, DIAGNOSTIC, RESEARCH, DEACTIVATE, REPAIR_CHANGE, ACTIVATE
- Approval: technician submits → head reviews products → approves (inventory deducted) → or cancels
- **Inventory deduction happens ONLY after approval — never before**

### Incident Lifecycle
`CREATED → IN_PROGRESS → COMPLETED/WORK_ORDER_INITIATED`
- Building required, client optional (null client causes known bug)
- Auto-numbered INC-YYYY-####

### Sales Pipeline
`NEW → CONTACT → MEETING → PROPOSAL → NEGOTIATION → APPROVED → WON/LOST`
- Approval: employee submits → lead locks → approver reviews → WON or rejects → unlocks

### RBAC
- Chain: User → Employee → Position → RoleGroup → Permissions
- ~100 permissions, 12 categories
- Backend: `@UseGuards(JwtAuthGuard, PositionPermissionGuard)` + `@RequirePermission()`
- Frontend: `usePermissions()`, `<PermissionButton>`, `<PermissionGuard>`
- Superadmin bypasses all
- **Scope pattern** (`*.own` / `*.department` / `*.department_tree` / `*.all`) via `backend/crm-backend/src/common/utils/data-scope.ts` — canonical for per-user vs per-department vs org-wide visibility. Used by `call_logs.*`, `call_recordings.*`.

**Production RoleGroup codes** (seeded via `seed-permissions.ts`):

| Code | Display name | Typical use |
|------|--------------|-------------|
| `ADMINISTRATOR` | Administrator | Full access, superadmin-equivalent |
| `CALL_CENTER` | Call Center Operator | Line-level operators (`call_logs.own`, `call_recordings.own`, `telephony.call`, `softphone.handshake`) |
| `CALL_CENTER_MANAGER` | Call Center Manager | Supervisors (own + department + department_tree scope, `call_center.live/quality/reports/statistics`) |
| `IT_TESTING` | IT Testing | Internal QA |
| `READ_ONLY` | Read Only | View-only dashboards |

### Employee Lifecycle
`ACTIVE → TERMINATED (dismiss) → ACTIVE (reactivate) or DELETED (permanent)`
- EMP-### IDs never reused (ExternalIdCounter table)
- Hard delete requires delegating active leads/work orders first

### Client Chats
- Channel adapters: Viber, Facebook, Telegram, WebChat (WhatsApp planned)
- Queue: weekly schedule + daily overrides, operators join manually
- Escalation: auto-escalate on SLA timeout
- Display name chain: CRM Client name → participant.displayName → "Unknown Customer"
- Closed conversation archival rewrites externalConversationId to `${id}__archived_${timestamp}` — changing this breaks conversation threading

---

## Cron Jobs
| Service | Schedule | What it does | Concern |
|---------|----------|-------------|---------|
| `escalation.service.ts` | Every 1 min | Check chat SLA rules | Overlap-guarded |
| `cdr-import.service.ts` | Every 5 min | Import CDR from Asterisk | — |
| `asterisk-sync.service.ts` | Every 5 min | Sync extension/queue state | — |
| `quality-pipeline.service.ts` | Every 2 min | OpenAI call reviews | Overlap-guarded |
| `operator-break.service.ts` `autoCloseStaleBreaks` | Every 30 min | Auto-close active operator breaks past `COMPANY_WORK_END_HOUR` (default 19) or older than 12h | Race-safe via `updateMany` with `endedAt IS NULL` predicate |

### Core Sync Bridge Schedules (PM2, separate process)
| Task | Schedule | What it does | Concern |
|---------|----------|-------------|---------|
| Delta poll (timestamp + ID sweep) | Every 5 min | Sync changed/new buildings, clients, assets from core MySQL | Overlap-guarded (10 min timeout) |
| Count check | Every 60 min | Compare entity counts core vs CRM, log mismatches | Requires bridge-health endpoint (shared secret) |
| Gap repair | 3 AM daily | Fix mismatches via ID-set diff | Only runs if countMismatches non-empty |
| Gates/contacts reload | 4 AM daily | Full reload of tables without timestamps | — |
| Failed event retry | Every 30 min | Re-process FAILED SyncEvents (max 3 retries) | — |

---

## Environment & Access

### Environment Variables
**Backend (.env):** DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CORS_ORIGINS, COOKIE_NAME, COOKIE_SECURE, VIBER_BOT_TOKEN, FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET, FB_VERIFY_TOKEN, TELEGRAM_BOT_TOKEN, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_VERIFY_TOKEN, WA_APP_SECRET, CLIENTCHATS_WEBHOOK_BASE_URL, TELEPHONY_INGEST_SECRET, AMI_ENABLED, AMI_HOST, AMI_PORT, AMI_USER, AMI_SECRET, ARI_ENABLED, ARI_BASE_URL, ARI_USER, ARI_PASSWORD, OPENAI_API_KEY, QUALITY_AI_ENABLED, QUALITY_AI_MODEL, ASTERISK_SIP_SERVER (default: 5.10.34.153)

**Frontend (.env.local):** NEXT_PUBLIC_API_BASE (default http://localhost:3000), API_BACKEND_URL

**AMI Bridge (.env on VM):** AMI_HOST, AMI_PORT, AMI_USER, AMI_SECRET, CRM_BASE_URL, TELEPHONY_INGEST_SECRET, BUFFER_MAX_SIZE, BUFFER_FLUSH_INTERVAL_MS, HEALTH_PORT, LOG_LEVEL

**Core Sync Bridge (.env on VM):** CORE_MYSQL_HOST, CORE_MYSQL_PORT, CORE_MYSQL_USER, CORE_MYSQL_PASSWORD, CORE_MYSQL_DATABASE, CRM_WEBHOOK_URL, CRM_WEBHOOK_SECRET, POLL_INTERVAL_MINUTES, COUNT_CHECK_INTERVAL_MINUTES, NIGHTLY_REPAIR_HOUR, LOG_LEVEL

### Remote Access
| Server | Access | VPN Required |
|--------|--------|-------------|
| Production VM (192.168.65.110) | `ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110` | Yes |
| Asterisk/FreePBX | `ssh asterisk` | Yes |
| Core MySQL (READ-ONLY) | 192.168.65.97:3306, user `asg_tablau`, db `tttt` | Yes (via VM only) |
| Railway (staging) | `railway logs`, `railway status` (link to dev environment) | No |
| Production DB | `psql -U postgres -h 192.168.65.110` (from VM) or via Prisma Studio | Yes |
| Staging DB | `railway variables -s Postgres` for public URL (dev environment) | No |

OpenVPN is always-on (TAP adapter). If Asterisk SSH times out, check OpenVPN GUI.

`psql` is NOT installed locally. Use `npx prisma studio` or `docker exec -it crm-prod-db psql -U postgres` (local dev). For production: SSH to VM, then `C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm`.

### VM Infrastructure (192.168.65.110) — PRODUCTION
Windows Server 2022, public IP 5.10.36.43, domain crm28.asg.ge. Full CRM stack under PM2 + Windows services:

| Service | Path on VM | Port | Description |
|---------|-----------|------|-------------|
| PostgreSQL 17 | `C:\postgresql17\` | 5432 | Production database (Windows service) |
| Nginx 1.27 | `C:\nginx\` | 80/443 | HTTPS reverse proxy (Windows service) |
| CRM Backend | `C:\crm\backend\crm-backend\` | 3000 | NestJS API (PM2) |
| CRM Frontend | `C:\crm\frontend\crm-frontend\` | 4002 | Next.js app (PM2) |
| AMI Bridge | `C:\ami-bridge\` | 3100 (health) | Asterisk AMI → CRM events (PM2) |
| Core Sync Bridge | `C:\core-sync-bridge\` | 3101 (health) | Core MySQL → CRM sync (PM2) |
| Operations Dashboard | `C:\crm\crm-monitor\` | 9090 | Monitoring UI at `/admin/monitor/` (PM2) |
| GitHub Actions Runner | `C:\actions-runner\` | — | Self-hosted runner for auto-deploy |

- **Auto-deploy**: Push to master → GitHub Actions → pulls, builds, migrates, restarts PM2
- **Dashboard**: `https://crm28.asg.ge/admin/monitor/` (password-protected)
- **SSL**: Let's Encrypt via win-acme, auto-renews
- **SSH tunnel**: AMI bridge reaches Asterisk (5.10.34.153:5038) via SSH tunnel on VM — port 5038 blocked at network level
- **Auto-start**: Windows Scheduled Task "PM2 Startup - CRM28" runs `pm2-startup.ps1` on boot (starts PostgreSQL → Nginx → PM2 resurrect)
- **Health check**: Scheduled task runs `health-check.ps1` every 2 minutes with auto-recovery
- **Docs**: `docs/AMI_BRIDGE.md`, `docs/CORE_INTEGRATION.md`, `docs/VM_MIGRATION_PLAN.md`

---

## Automation Rules

### Plan Before Code
Before writing code for medium/complex tasks: state files, explain approach, flag risks, wait for "go". Simple tasks (typo, label, spacing): just do it.

### Auto-Test
After any feature or fix: write unit tests (.spec.ts next to source) — happy path + error + edge case. Mock PrismaService and external services. Run tests, report count.

### Auto-Update Docs
After any feature, update in the same commit: CLAUDE.md, API_ROUTE_MAP.md, FRONTEND_ROUTE_MAP.md, DATABASE_SCHEMA.md (as applicable).

### Permission-Aware
When building access-controlled features: add to seed-permissions.ts → backend `@RequirePermission()` → frontend `usePermissions()` → sidebar `*.menu` permission.

---

## Known Issues & Technical Debt
- Incident without client: null constraint violation
- Dashboard: static placeholder (no API)
- WhatsApp adapter: schema ready, adapter not built
- Work order export: permissions exist, no UI
- Web chat widget: backend ready, no embeddable JS widget
- Some pages use raw `fetch()` instead of `apiGet/apiPost`
- Legacy RolesModule alongside Position RBAC (both imported — Position RBAC is authoritative)
- Single 2125-line Prisma schema
- `rawBody: true` enabled globally (only needed for webhook HMAC)
- Both `bcrypt` AND `bcryptjs` installed — check which is imported before changing auth
- Core sync bridge count-verification uses `bridge-health` endpoint (shared-secret auth, no JWT). If backend restarts during deploy, count check returns 401 transiently — gap repair skips that cycle but resumes on next success
- `smartgsmgate` and `contactperson` tables have no timestamps — can't be delta-polled, only bulk-loaded (daily 4 AM reload)
- ~51% of core MySQL clients have `NULL lastModifiedDate` — invisible to timestamp-based delta polling. Fixed by ID-based sweep (`WHERE id > maxCheckpoint`) that runs alongside timestamp polling every 5 minutes
- Railway → VM migration complete (April 2026). Railway is staging only at crm28demo.asg.ge

---

## Deeper Documentation

### Session continuity (read this FIRST when resuming work)
- **`audit/CURRENT_WORKSTREAM.md`** — living handoff brief. Lists recent PRs, in-flight work, business decisions, deferred items, open questions. Updated in every feature PR. Read this at the start of any new session.

### Reference
- DATABASE_SCHEMA.md — every table, relationship, enum
- API_ROUTE_MAP.md — every endpoint with method, auth, request/response
- FRONTEND_ROUTE_MAP.md — all 47 pages, components, status
- DEVELOPMENT_GUIDELINES.md — coding patterns with examples
- docs/TESTING.md — test setup
- docs/DESIGN_SYSTEM.md — UI design tokens
- docs/TELEPHONY_INTEGRATION.md — full telephony architecture
- docs/LOCAL_DEVELOPMENT.md — troubleshooting, health checks, Prisma enum workaround
- docs/CORE_INTEGRATION.md — core MySQL → CRM sync architecture, field mappings, bridge operations, troubleshooting
- docs/AMI_BRIDGE.md — AMI bridge architecture, deployment, troubleshooting, network topology
- docs/BRIDGE_MONITOR.md — bridge monitor dashboard, API, deployment

### Audit artifacts (April 2026 telephony audit)
- audit/MONDAY_ADMIN_CHEATSHEET.md — symptom→fix table + emergency SQL (open on phone during incidents)
- audit/MONDAY_ADMIN_UI_SETUP.md — RoleGroup permission walkthrough
- audit/PHASE3_REHEARSAL_RUNBOOK.md — live-call rehearsal plan
- audit/PHASE1_SUMMARY.md — audit findings summary
- audit/STATS_STANDARDS.md — M3/M5/M7 decisions for call stats correctness
- audit/ROLLBACK.md — roll-back steps for audit PRs
- audit/RBAC_ADMIN_CHECK.md — permission coverage verification
