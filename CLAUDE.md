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

Flag any situation where a value lives in more than one place. **Full PR-history narratives in [docs/SILENT_OVERRIDE_RISKS.md](docs/SILENT_OVERRIDE_RISKS.md) — read on demand when your work touches the area.** One-line index:

0. ⛔ **Core MySQL is READ-ONLY** (192.168.65.97:3306). All queries must be non-locking SELECTs.
1. **JWT secret required** — no hardcoded fallback anywhere; app crashes if missing.
2. **`TELEPHONY_INGEST_SECRET`** must match VM backend ↔ AMI Bridge envs.
2b. **`CRM_WEBHOOK_SECRET` ↔ `CORE_WEBHOOK_SECRET`** must match bridge ↔ backend.
3. **Cookie name (`COOKIE_NAME` env)** must agree across all gateways + frontend.
4. **Prisma enums:** new value cannot be USED in same migration that adds it.
5. **AMI Bridge under load** can buffer/lose events; runs on same VM under PM2.
6. **`@SkipThrottle()`** required on new webhook endpoints (60 req/60s global).
7. **HealthModule** — verify it's actually wired into `app.module.ts`.
8. **Position-based RBAC is authoritative**; legacy `RolesModule` is tech debt — no new features on it.
9. **`seed-permissions.ts`** is canonical for prod; never `seed-rbac.ts`.
10. **`next.config.ts` API rewrite** — `API_BACKEND_URL` required on Railway.
11. **`clientchats-core.service.ts processInbound()`** order is load-bearing: dedup → upsert → save → match → emit.
12. **JWT claim — always `payload.sub`, never `payload.id`** (PR #250).
13. **SIP password never on disk** — `stripPassword()` enforces (PR #249).
14. **Softphone bridge `/status`** returns only `{id}` — never leak operator identity (PR #253).
15. **`timestampevents=yes`** lives in `/etc/asterisk/manager.conf`, NOT `_custom.conf` (PR #263). FreePBX GUI Apply Config wipes it. Exception to the FreePBX/CLI rule.
16. **Stats: missing CallMetrics** → `reason: "unknown"`, never silently drop (PR #255).
17. **Replayed `call_end` events** merge field-level, don't overwrite (PR #255).
18. **`TelephonyQueue.isAfterHoursQueue` is sticky** — env var bootstraps only; DB authoritative (PR #278).
19. **Operator break auto-close** uses `COMPANY_WORK_END_HOUR` env + 12h cap.
20. **Operator DND state**: NOT persisted; lives in Asterisk + in-memory; rehydrates on restart.
21. **Softphone Break:** backend POST → SIP unregister (load-bearing order, v1.10.0).
22. **Softphone pnpm:** `.npmrc shamefully-hoist` + `pnpm.overrides` + `packageManager` field + no `package-lock.json` — all four together (v1.10.1).
23. **Express ETag** stale-caches live-data — every list endpoint needs `@Header('Cache-Control','no-store')`.
24. **Softphone rejects** incoming INVITE during active call with `486 Busy Here` (v1.11.0).
25. **Phone lookup:** both `lookupPhone()` and `getExtensionHistory()` must share `PhoneResolverService.localDigits()`; never `contains` on <7 digits.
26. **FreePBX queue members** are `Local/<ext>@from-queue/n`, NOT `PJSIP/<ext>` (AMI `QueuePause`). And `asterisk-manager` rejects with two error shapes — read `err.message` as a property.
27. **Outbound calls:** attribute at `call_start` (no `AgentConnect` for OUT). Close stale AGENT leg on `AgentConnect` to avoid double-counting.
28. **Queue membership** writes to FreePBX MariaDB `queues_details`, NOT AMI (supersedes #296's AMI approach).
29. **Softphone trusts FreePBX self-signed via hostname-scoped override** (v1.14.0, replacing the SPKI pin from v1.12.1). The override accepts any TLS cert presented at `pbx.asg.ge` / `5.10.34.153`; everything else goes through Chromium's normal verifier. The perimeter is the FreePBX firewall's IP-whitelist of office public IPs — a cert pin would have been belt-and-braces for an internal-MITM attack on a managed LAN, traded against fleet-wide outage on cert rotation. Do NOT widen the override to additional hosts. Do NOT remove the override (PBX has no public-CA cert today).
30. **`asterisk-sync` cleanup** hard-deletes CRM extensions when missing from FreePBX. Single safety guard: AMI fetch must succeed first.
31. **Extension auto-rebind** via `extension:changed` event: rebind if idle, soft-defer if on a call. **Never drop active call.**
32. **SSO handoff:** native Electron Allow/Deny dialog is the security boundary. Never weaken.
33. **`DataScopeService` null `position.level`** → `?? 999` (not `?? 0`). CALL_CENTER_MANAGER needs `call_logs.department_tree` permission.
34. **Live agents grid** is filtered by `RoleGroup.code='CALL_CENTER'` + `PositionQueueRule` for `TelephonyQueue.name='30'` (the main inbound queue). Both string constants live in `telephony-live.service.ts`; renaming queue 30 in FreePBX GUI or splitting the role group will silently empty the grid. Throttled warn log fires when filter rejects everyone — watch backend logs.
35. **Live online/offline derived from SIP heartbeat**, not the in-memory AMI map (`telephony-live.service.ts::applySipPresenceToCurrentState`). The AMI map only flips on call events — without the heartbeat override (`sipRegistered + sipLastSeenAt` fresh < 90s) freshly-registered or post-switch operators stay frozen at their last call-event state.
36. **Softphone `/switch-user`** must POST `state: unregistered` for the outgoing user (with the OLD JWT) before `setSession(data)` (`crm-phone/src/main/local-server.ts`). Otherwise the renderer-side unregister fires under the NEW JWT and the backend's extension-mismatch guard rejects it, leaving the previous operator's `sipRegistered=true` until the 90s sweep.
37. **`TelephonyExtension.sipRegistered` has TWO writers** — CRM softphone heartbeat (per-user keyed) AND Asterisk reconciliation cron (extension-keyed, `agent-presence.service.ts::runAsteriskReconciliation`). Asterisk wins on conflict (it's the truth for SIP). The reconciliation cron (every 60s) covers MicroSIP, Zoiper, hardware phones, and any non-CRM SIP client that doesn't heartbeat. Reconciliation is a NO-OP when AMI is down — the stale-heartbeat sweep is the safety net for that case. **Never** make reconciliation pessimistic-flip-everyone-offline when `getEndpointStatuses()` returns empty; that creates a presence outage on every AMI blip.

---

## Module Boundaries

### Backend (`backend/crm-backend/src/`)
Each NestJS module owns its domain: controller + service + DTOs + module file. Most are standard CRUD — only the FRAGILE / load-bearing modules are flagged below:

| Module | Domain | Notes |
|--------|--------|-------|
| `auth/` | JWT login, /me, logout | |
| `prisma/` | PrismaService | FRAGILE: shutdown order — `$disconnect()` THEN `pool.end()` |
| `buildings/` `clients/` `assets/` `incidents/` `departments/` `positions/` `role-groups/` `permissions/` `system-lists/` `workflow/` `notifications/` `translations/` `audit/` `health/` `common/` `v1/` | standard CRUD / generic | (`incidents`: known null-client bug; `assets`: "Devices" in UI) |
| `work-orders/` | Work order lifecycle | Inventory deduction ONLY after approval |
| `inventory/` | Products, stock, batches | "Products" = inventory items |
| `employees/` | Employee lifecycle | Hard-delete requires delegating active leads/work orders first |
| `sales/` | Leads, pipeline | |
| `messenger/` | Internal chat | Socket.IO `/messenger` |
| `telephony/` | Call center | Socket.IO `/telephony`, AMI/ARI/CDR/quality. Queue link/unlink writes to FreePBX `queues_details` MariaDB via `/usr/local/sbin/crm-queue-member` (Silent Override #28). Permission-gated. See `docs/TELEPHONY_EXTENSION_MANAGEMENT.md`. |
| `clientchats/` | Unified inbox | Socket.IO `/ws/clientchats`. FRAGILE: `processInbound()`, `joinConversation()`, `isBetterName()` |
| `bug-reports/` | Bug reporter (beta) | GitHub issue creator. Env: `GITHUB_TOKEN`/`OWNER`/`REPO`. |
| `core-integration/` | Core system sync | Webhook receiver. See `docs/CORE_INTEGRATION.md` |

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

Full table in [docs/CRON_JOBS.md](docs/CRON_JOBS.md). Concerns to remember:
- `escalation` and `quality-pipeline` are overlap-guarded — safe to leave running.
- `operator-break.autoCloseStaleBreaks` depends on `COMPANY_WORK_END_HOUR` env (Silent Override Risk #19).
- Core Sync gap repair only runs at 3 AM if count check found mismatches.

---

## Environment & Access

Full env-var lists, remote access table, and VM infrastructure detail in [docs/ENVIRONMENT.md](docs/ENVIRONMENT.md). The dangerous bits to remember:

- **`JWT_SECRET`** — required, no fallback (Silent Override #1).
- **Cross-process secret pairs** — `TELEPHONY_INGEST_SECRET` ↔ AMI bridge, `CRM_WEBHOOK_SECRET` ↔ `CORE_WEBHOOK_SECRET` (Silent Override #2, #2b).
- **OpenVPN always-on (TAP)** — if Asterisk SSH times out, check OpenVPN GUI first.
- **Production VM:** `ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110`. Full stack on PM2 (backend :3000, frontend :4002, AMI bridge :3100, core-sync bridge :3101, monitor :9090).
- **Auto-deploy:** push to master → GitHub Actions self-hosted runner → builds → restarts PM2.

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
- **docs/CLAUDE_CODE_CHEATSHEET.md** — how Jemiko + Claude work together (fast vs careful mode, sacred rules, common patterns)
- **docs/SILENT_OVERRIDE_RISKS.md** — full PR-history narratives for every numbered risk in CLAUDE.md
- **docs/CRON_JOBS.md** — every cron with schedule and concern
- **docs/ENVIRONMENT.md** — env vars, remote access, VM infrastructure
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
