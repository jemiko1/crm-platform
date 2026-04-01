# CLAUDE.md — Project Context for Claude Code

## Working Mode

The project owner is a non-programmer founder. For all technical decisions (libraries, config, patterns, structure, tooling), decide based on what you see in the codebase and proceed without asking. Only ask about business logic decisions — who can access what, what should happen when X occurs, user-facing behavior, and workflow rules.

## Project Overview

CRM28 — Property/building management CRM for the Georgian market. Domain: crm28.asg.ge
Manages buildings, residents, work orders, incidents, sales leads, inventory, telephony, multi-channel chat.

- **Backend**: NestJS 11 (TypeScript) — `backend/crm-backend/`, port 3000, `npm run start:dev`
- **Frontend**: Next.js 16 App Router, React 19 — `frontend/crm-frontend/`, port 4002, `pnpm dev --port 4002`
- **Database**: PostgreSQL 16 via Prisma 7 ORM in Docker (`crm-prod-db`, port 5433)
- **Real-time**: Socket.IO — namespaces: `/messenger`, `/telephony`, `/ws/clientchats`
- **Telephony**: Asterisk/FreePBX 16 + AMI Bridge (`ami-bridge/`, VM 192.168.65.110, port 3100 health) + Electron softphone (`crm-phone/`)
- **Auth**: JWT in httpOnly cookie (`access_token`), Passport, 24h expiry
- **AI**: OpenAI GPT-4o + Whisper (call quality reviews)
- **Chat Channels**: Viber, Facebook, Telegram, WebChat (WhatsApp planned) — adapter pattern
- **CSS**: Tailwind CSS v4 (PostCSS plugin, theme in `globals.css`, NO `tailwind.config` file)
- **Core Sync**: One-way sync from legacy MySQL → CRM via webhook bridge (`core-sync-bridge/`, VM 192.168.65.110, port 3101 health). See `docs/CORE_INTEGRATION.md`
- **Bridge Monitor**: Dashboard for both bridges (`bridge-monitor/`, VM 192.168.65.110, port 3200). See `docs/BRIDGE_MONITOR.md`
- **CI/CD**: GitHub Actions → Railway (auto-deploy from master). **Planned migration to local VM** for performance.
- **Deployment**: Railway auto-deploys on master merge. Build: `pnpm install && pnpm build`. Start: `prisma migrate deploy && seed-permissions && node dist/main`

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
7. I test → merge PR → Railway auto-deploys

### Stop Conditions — ASK Before Doing
1. Database schema breaking changes (dropping columns, renaming)
2. API contract changes (removing endpoints, incompatible changes)
3. Asterisk/FreePBX config changes (ALWAYS apply via GUI too)
4. Deleting files or large refactors
5. Changing environment variables (both local and Railway may need updates)
6. Changing seed scripts (affects Railway deployment)

### ⛔ ABSOLUTE RULE: Core MySQL Database is READ-ONLY
**NEVER, under ANY circumstances, execute INSERT, UPDATE, DELETE, ALTER, DROP, CREATE, TRUNCATE, or any data-modifying statement against the core MySQL database (192.168.65.97:3306).** This applies to:
- All Claude agents and subagents working on this project
- The Core Sync Bridge service
- CRM backend code
- Railway deployment
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
8. Documentation updated (CLAUDE.md, API_ROUTE_MAP.md, FRONTEND_ROUTE_MAP.md, DATABASE_SCHEMA.md)

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
2. **Telephony ingest secret sync** — `TELEPHONY_INGEST_SECRET` must match between Railway backend env and AMI Bridge VM env. Changing one without the other silently breaks telephony ingestion.
2b. **Core webhook secret sync** — `CRM_WEBHOOK_SECRET` on the bridge VM must match `CORE_WEBHOOK_SECRET` on Railway. Changing one without the other silently breaks core sync.
3. **Hardcoded cookie names** — All gateways (telephony + messenger) use `COOKIE_NAME` env var for cookie extraction. Frontend and backend must agree.
4. **Prisma enum migration behavior** — PostgreSQL CANNOT use a new enum value in the same transaction that adds it. If migration fails with "unsafe use of new value", either use fresh DB or apply `ALTER TYPE` manually outside transaction, then `npx prisma migrate resolve --applied <name>`. Always check existing data before enum changes.
5. **AMI Bridge buffer risks under load** — AMI event relay runs on separate VM with PM2. High call volume can cause event buffering/loss if the bridge falls behind.
6. **Rate limiter vs webhook conflict** — Global ThrottlerGuard (60 req/60s per IP) applies to most routes. Webhooks, health, and telephony ingestion have `@SkipThrottle()`. New webhook endpoints MUST add `@SkipThrottle()` or external services will get 429'd.
7. **Unwired HealthModule** — `/health` endpoint exists with DB + memory checks. Verify it's imported in `app.module.ts` and actually responding.
8. **Dual RBAC systems** — Legacy `RolesModule` exists alongside Position-based RBAC (`RoleGroups → Permissions`). Both are imported in `app.module.ts`. Position RBAC is authoritative. Legacy module is technical debt — do not build new features on it.
9. **Seed script ordering dependencies** — `seed:all` orchestrates 8 scripts in dependency order (permissions first). Running individual seeds out of order can cause foreign key violations. `seed-permissions.ts` is canonical for production; never run `seed-rbac.ts` in production.
10. **Frontend API rewrite localhost default** — `next.config.ts` rewrites `/auth/*`, `/v1/*`, `/public/*` to backend. `NEXT_PUBLIC_API_BASE` defaults to `http://localhost:3000`. Production must set this correctly or API calls silently hit localhost.
11. **Message deduplication race condition** — `clientchats-core.service.ts processInbound()` pipeline order is load-bearing: dedup → upsert → save → match → emit. Changing this order can cause duplicate messages or lost customer name data (`isBetterName()` guard).

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
| `telephony/` | Call center | Socket.IO `/telephony`, AMI, ARI, CDR, quality |
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

## For Subagents

When working as a subagent, read this file first. Key rules:
1. Check the **Verification Commands** section — run relevant checks before reporting done
2. Do not modify files outside your assigned module without explicit instruction
3. Use `apiGet/apiPost` (not raw `fetch()`) and `useListItems()` (not hardcoded dropdowns)
4. Never commit to master — work on feature branches only
5. Check **Silent Override Risks** if your change touches config, env vars, or cross-module boundaries

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

---

## Environment & Access

### Environment Variables
**Backend (.env):** DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CORS_ORIGINS, COOKIE_NAME, COOKIE_SECURE, VIBER_BOT_TOKEN, FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET, FB_VERIFY_TOKEN, TELEGRAM_BOT_TOKEN, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_VERIFY_TOKEN, WA_APP_SECRET, CLIENTCHATS_WEBHOOK_BASE_URL, TELEPHONY_INGEST_SECRET, AMI_ENABLED, AMI_HOST, AMI_PORT, AMI_USER, AMI_SECRET, ARI_ENABLED, ARI_BASE_URL, ARI_USER, ARI_PASSWORD, OPENAI_API_KEY, QUALITY_AI_ENABLED, QUALITY_AI_MODEL

**Frontend (.env.local):** NEXT_PUBLIC_API_BASE (default http://localhost:3000), API_BACKEND_URL

**AMI Bridge (.env on VM):** AMI_HOST, AMI_PORT, AMI_USER, AMI_SECRET, CRM_BASE_URL, TELEPHONY_INGEST_SECRET, BUFFER_MAX_SIZE, BUFFER_FLUSH_INTERVAL_MS, HEALTH_PORT, LOG_LEVEL

**Core Sync Bridge (.env on VM):** CORE_MYSQL_HOST, CORE_MYSQL_PORT, CORE_MYSQL_USER, CORE_MYSQL_PASSWORD, CORE_MYSQL_DATABASE, CRM_WEBHOOK_URL, CRM_WEBHOOK_SECRET, POLL_INTERVAL_MINUTES, COUNT_CHECK_INTERVAL_MINUTES, NIGHTLY_REPAIR_HOUR, LOG_LEVEL

### Remote Access
| Server | Access | VPN Required |
|--------|--------|-------------|
| Asterisk/FreePBX | `ssh asterisk` | Yes |
| Bridge VM (192.168.65.110) | `ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110` | Yes |
| Core MySQL (READ-ONLY) | 192.168.65.97:3306, user `asg_tablau`, db `tttt` | Yes (via VM only) |
| Railway (production) | `railway logs`, `railway status` | No |
| Production DB | `railway connect postgres` or `railway variables -s Postgres` for public URL | No |

OpenVPN is always-on (TAP adapter). If Asterisk SSH times out, check OpenVPN GUI.

`psql` is NOT installed locally. Use `npx prisma studio` or `docker exec -it crm-prod-db psql -U postgres`.

### VM Infrastructure (192.168.65.110)
Windows Server running three services under PM2:

| Service | Path on VM | Health Port | Description |
|---------|-----------|-------------|-------------|
| AMI Bridge | `C:\ami-bridge\` | 3100 | Asterisk AMI → CRM events |
| Core Sync Bridge | `C:\core-sync-bridge\` | 3101 | Core MySQL → CRM sync |
| Bridge Monitor | `C:\bridge-monitor\` | 3200 | Dashboard for both bridges |

- **Deploy**: `.\deploy-bridges.ps1 -Component all|ami|core|monitor` from repo root
- **Dashboard**: `http://192.168.65.110:3200` (VPN required)
- **SSH tunnel**: AMI bridge reaches Asterisk (5.10.34.153:5038) via SSH tunnel on VM — port 5038 blocked at network level
- **PM2 persistence**: Windows Scheduled Tasks "PM2 Keeper" + "PM2 Resurrect" keep PM2 alive across reboots/SSH disconnects
- **Docs**: `docs/AMI_BRIDGE.md`, `docs/BRIDGE_MONITOR.md`, `docs/CORE_INTEGRATION.md`

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
- Core sync bridge count-verification/gap-repair require CRM health endpoint access, but endpoint needs JWT — bridge can't authenticate yet (degrades gracefully — delta polling still works)
- `smartgsmgate` and `contactperson` tables have no timestamps — can't be delta-polled, only bulk-loaded
- **Planned**: Railway → VM migration for CRM backend (better performance, same-network access to core MySQL)

---

## Deeper Documentation
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
