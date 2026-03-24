# CLAUDE.md — Project Context for Claude Code

> **CRM28**: Property/building management CRM. Georgian market. Domain: crm28.asg.ge
> Manages buildings, residents, work orders, incidents, sales leads, inventory, telephony, multi-channel chat.

---

## Session Start Protocol

**Every new session, do this FIRST:**
```powershell
git checkout master
git pull origin master
git log --oneline -3
```
If you're on a stale feature branch from a previous session, warn me before switching.
Then ask what I want to work on.

---

## Quick Start (Local Development)
```powershell
# Database (Docker PostgreSQL on port 5433)
docker start crm-prod-db

# Backend (port 3000) — Terminal 1
cd C:\CRM-Platform\backend\crm-backend
npm run start:dev

# Frontend (port 4002) — Terminal 2
cd C:\CRM-Platform\frontend\crm-frontend
pnpm dev --port 4002
```

**Backend: port 3000. Frontend: port 4002. NEVER use port 4000 (Chrome blocks it).**

### First-time setup
```powershell
cd backend\crm-backend
pnpm install
pnpm prisma generate
npx prisma migrate dev
npx tsx prisma/seed-permissions.ts
npx tsx prisma/seed-system-lists.ts
npx tsx prisma/seed-workflow-steps.ts
npx tsx prisma/seed-sales.ts
```
Seed order matters: permissions first, then the rest. `seed-permissions.ts` is the canonical seed (not `seed-rbac.ts`).

---

## Workflow Rules

### Git Branch Rules
- **NEVER commit directly to master** — master is production
- **Create feature branches FROM master**: `git checkout -b feature/name master`
- **PRs target master directly** — NO dev or staging branches exist
- **I (Jemiko) merge PRs manually** after testing on localhost
- Always pull master before creating a new branch

### Feature Flow

1. git checkout master ; git pull origin master
2. git checkout -b feature/my-feature
3. Build the feature
4. git push origin feature/my-feature
5. gh pr create --base master --title "feat(scope): description"
6. Tell me: "Ready to test on localhost"
7. I test → merge PR → Railway auto-deploys

### Commit Format
`feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `docs(scope):`, `chore(scope):`

### Stop Conditions — ASK Before Doing
1. Database schema breaking changes (dropping columns, renaming)
2. API contract changes (removing endpoints, incompatible changes)
3. Asterisk/FreePBX config changes (ALWAYS apply via GUI too — see Safety Rules)
4. Deleting files or large refactors
5. Changing environment variables (both local and Railway may need updates)
6. Changing seed scripts (affects Railway deployment)

---

## Tech Stack

- **Backend**: NestJS 11 (TypeScript) — `backend/crm-backend/`
- **Frontend**: Next.js 16 App Router, React 19 — `frontend/crm-frontend/`
- **Database**: PostgreSQL 16 (Docker `crm-prod-db`, port 5433)
- **ORM**: Prisma 7 — schema at `backend/crm-backend/prisma/schema.prisma` (2125 lines, single file)
- **CSS**: Tailwind CSS v4 (PostCSS plugin, theme in globals.css, NO tailwind.config file — it gets ignored)
- **Auth**: JWT in httpOnly cookie (`access_token`), Passport, 24h expiry. Falls back to "dev-secret" if JWT_SECRET unset — security risk.
- **Real-time**: Socket.IO — namespaces: `/messenger`, `/telephony`, `/ws/clientchats` (note the inconsistency)
- **Telephony**: Asterisk/FreePBX 16 + AMI Bridge (ami-bridge/) + Electron softphone (crm-phone/)
- **AI**: OpenAI GPT-4o + Whisper (call quality reviews)
- **Chat Channels**: Viber, Facebook, Telegram, WhatsApp (planned), Web Widget — adapter pattern
- **Email/SMS**: Nodemailer + IMAPFlow / sender.ge API
- **Charts**: Recharts 3, **Dates**: date-fns 4
- **CI/CD**: GitHub Actions → Railway (auto-deploy from master)
- **Package Manager**: pnpm (local: v10, CI: v9)
- **Node**: local v24, CI v20 — version mismatch exists
- **OS**: Windows 10 (PowerShell) — use `;` not `&&`, no heredoc, no `wc -l`
- **Rate Limiting**: Global ThrottlerGuard — 60 req/60s per IP. Applies to ALL routes including webhooks. No @SkipThrottle() anywhere.

---

## Environment & Remote Access

### Local CLIs Available
| Tool | Purpose |
|------|---------|
| `gh` (GitHub CLI) | PRs, issues, CI status. Account: jemiko1 |
| `railway` | Deploy status, logs, env vars. Project: CRM28, env: production |
| `ssh` (OpenSSH) | Asterisk access: `ssh asterisk` (requires VPN) |
| `docker` | Local PostgreSQL: `docker start crm-prod-db` |
| `git` | Version control (HTTPS protocol, credential manager) |
| `pnpm` / `npm` / `npx` | Package management, Prisma CLI, seed scripts |

`psql` is NOT installed locally. Use `npx prisma studio` or `docker exec -it crm-prod-db psql -U postgres` for DB access.

### Remote Servers
| Server | Access | Requires VPN |
|--------|--------|-------------|
| Asterisk/FreePBX (5.10.34.153) | `ssh asterisk` (ed25519 key) | Yes |
| AMI Bridge (Windows VM, private network) | Via Asterisk network | Yes |
| Railway (production) | `railway logs`, `railway status` | No |
| Production DB | `railway connect postgres` or Railway dashboard | No |

### VPN
OpenVPN is always-on (TAP adapter). If Asterisk SSH times out, VPN may have disconnected — check OpenVPN GUI.

---

## Project Structure

```
backend/crm-backend/
├── prisma/schema.prisma          # 70+ models, 40+ enums (single 2125-line file)
├── prisma/migrations/            # 28 migrations — NEVER edit applied migrations
├── prisma/seed-*.ts              # 8 seed scripts (run independently, not chained)
├── prisma.config.ts              # Fallback DB URL for CI builds (build:build@localhost)
├── src/main.ts                   # Bootstrap: Helmet, CORS, cookies, Swagger, rawBody: true
├── src/app.module.ts             # Root module — imports all feature modules + ThrottlerGuard
├── src/auth/                     # JWT login, /me, logout. Falls back to "dev-secret"
├── src/prisma/                   # PrismaService — extends PrismaClient + manages pg.Pool
├── src/buildings/                # Building CRUD
├── src/clients/                  # Client service (accessed via v1/ controllers)
├── src/assets/                   # Building devices
├── src/incidents/                # Incident management (known bug: null client constraint)
├── src/work-orders/              # Work order lifecycle, products, approval flow
├── src/inventory/                # Products, purchase orders, stock, batch tracking
├── src/employees/                # Employee lifecycle (create/dismiss/activate/delete)
├── src/departments/              # Department hierarchy
├── src/positions/                # Positions (linked to RoleGroups)
├── src/role-groups/              # Permission bundles
├── src/permissions/              # RBAC CRUD
├── src/system-lists/             # Dynamic dropdown values
├── src/workflow/                 # Workflow steps, triggers, automation
├── src/sales/                    # Leads, pipeline, services, plans
├── src/messenger/                # Internal chat (Socket.IO /messenger)
├── src/telephony/                # Call center (Socket.IO /telephony, AMI, ARI, CDR, quality)
├── src/clientchats/              # Unified inbox (Socket.IO /ws/clientchats)
├── src/notifications/            # Email + SMS
├── src/translations/             # i18n
├── src/core-integration/         # External webhook sync
├── src/audit/                    # Audit log
├── src/common/                   # Guards, filters, decorators
├── src/v1/                       # Versioned controllers
└── src/health/                   # Health module (EXISTS but NOT imported in AppModule)

frontend/crm-frontend/
├── src/app/layout.tsx            # Root layout
├── src/app/login/page.tsx        # Login page
├── src/app/app/                  # Authenticated shell (47 pages)
│   ├── layout.tsx                # Sidebar, header, messenger, modals (FRAGILE — crashes blank all pages if context providers throw)
│   ├── modal-manager.tsx         # Entity detail modal renderer
│   ├── modal-stack-context.tsx   # LIFO modal stack synced with browser history (VERY FRAGILE)
│   └── [all feature pages]
├── src/hooks/useListItems.ts     # Dynamic dropdown hook
├── src/lib/api.ts                # API client (returns undefined as T on empty responses)
├── src/lib/use-permissions.ts    # RBAC hook
└── src/locales/{en,ka}.json      # i18n

ami-bridge/                       # AMI event relay (runs on separate VM, PM2)
crm-phone/                        # Electron + SIP.js softphone
```

---

## Deployment (Railway)

### How Deploy Works
1. PR merged to master → Railway auto-detects push
2. Build: `cd backend/crm-backend && pnpm install && pnpm build` (prisma generate + nest build)
3. Start: `prisma migrate deploy && npx tsx prisma/seed-permissions.ts && node dist/main`
4. Frontend deployed as separate Railway service: `next start --port ${PORT:-3000}`

### After Deploying
- Check: `railway logs` — look for "Nest application successfully started"
- Verify: `https://crm28.asg.ge/auth/login` loads
- Note: `/health` endpoint does NOT work (module not imported)

### Rollback
- Railway dashboard → Deployments → Rollback to previous
- Or push a revert commit to master

### Railway Commands
```powershell
railway status       # Current project/service/environment
railway logs         # Stream production logs
railway variables    # List env vars (redacted)
railway shell        # Open shell in production container
```

---

## CI Pipeline (GitHub Actions)

CI runs on every PR to master. All checks must pass before merge.

| Job | What it runs | Command |
|-----|-------------|---------|
| backend-test | Unit tests | `pnpm test:unit` |
| backend-typecheck | TypeScript check | `tsc --noEmit` |
| frontend-build | Production build | `pnpm build` |
| frontend-typecheck | TypeScript check | `pnpm typecheck` |

Branch protection requires: all 4 checks pass + 1 review approval + conversations resolved. Admin (Jemiko) can bypass all protection rules.

### Run CI Checks Locally Before Pushing
```powershell
cd backend\crm-backend ; pnpm typecheck
cd backend\crm-backend ; pnpm test:unit
cd frontend\crm-frontend ; pnpm typecheck
cd frontend\crm-frontend ; pnpm build
```

---

## NEVER Do These

1. **NEVER hardcode dropdown values** — use `useListItems(categoryCode)`
2. **NEVER use raw fetch()** — use `apiGet/apiPost/apiPatch/apiDelete` from `@/lib/api`
3. **NEVER use port 4000** — Chrome blocks it
4. **NEVER commit to master directly** — use feature branches + PRs
5. **NEVER hardcode API URLs** — use centralized API client
6. **NEVER render modals inline** — use `createPortal(content, document.body)` with mounted check
7. **NEVER use router.push() for detail modals** — use `openModal(type, id)`
8. **NEVER overwrite customer names** with fallback/generic names (isBetterName guard)
9. **NEVER replace joinConversation() SQL** with plain Prisma update (race condition)
10. **NEVER use && in shell commands** — PowerShell uses `;`
11. **NEVER edit applied migration files** in `prisma/migrations/`
12. **NEVER change processInbound() pipeline order** — dedup → upsert → save → match → emit
13. **NEVER change Socket.IO namespace paths** — /messenger, /telephony, /ws/clientchats
14. **NEVER change modal-stack-context.tsx URL param priority order** — messenger → incident → workOrder → employee → client → building
15. **NEVER run seed-rbac.ts in production** — use seed-permissions.ts (canonical)
16. **NEVER change TELEPHONY_INGEST_SECRET** without updating both Railway env AND AMI Bridge env on the VM

---

## Safety Rules

### Asterisk/FreePBX — CLI vs GUI Conflict (CRITICAL)
When making ANY changes to Asterisk via SSH/CLI (queues, extensions, SIP config, manager config):
1. Make the change via CLI
2. ALSO apply the same change through the FreePBX web GUI (or run `fwconsole reload` at minimum)
3. If you only change via CLI, the next time someone clicks "Apply Config" in the FreePBX GUI, the GUI's version overwrites CLI changes and they're LOST
4. For queue changes: edit in GUI → Apply Config → verify with `asterisk -rx "queue show"`
5. For manager config: edit `/etc/asterisk/manager_custom.conf` → `asterisk -rx "manager reload"` → also verify in GUI
6. Rule of thumb: treat the FreePBX GUI as the source of truth, use CLI only for verification

### Database Safety
1. Always run `npx prisma migrate dev --name descriptive_name` — never manual SQL for schema changes
2. PostgreSQL CANNOT use a new enum value in the same transaction that adds it. If migration fails with "unsafe use of new value", either use fresh DB or apply ALTER TYPE manually outside transaction then `npx prisma migrate resolve --applied <name>`
3. After ANY schema change: `npx prisma generate` to update the client
4. Run `npx prisma studio` to visually verify data after migrations
5. Production migrations run automatically on deploy via `prisma migrate deploy`

### Secret Safety
1. JWT_SECRET falls back to "dev-secret" silently — NEVER deploy without it set
2. TELEPHONY_INGEST_SECRET must match between Railway backend and AMI Bridge VM
3. Never commit .env files — only .env.example
4. All channel tokens (Viber, FB, Telegram) are in backend .env — rotating one requires Railway env update too

### Code Safety
1. `api.ts` returns `undefined as T` on empty responses (204) — always check before destructuring
2. `api.ts` returns a never-resolving Promise on 401 — don't await it expecting an error
3. Both `bcrypt` AND `bcryptjs` are installed — check which is actually imported before changing auth
4. `rawBody: true` is enabled globally for all requests, not just webhooks — performance consideration
5. ThrottlerGuard (60/min) applies to ALL routes including webhooks — high webhook traffic may get rate-limited
6. Telephony gateway hardcodes cookie name `access_token` — won't respect COOKIE_NAME env var
7. Messenger gateway uses `JWT_SECRET || "dev-secret"` — silent fallback
8. PrismaService must call BOTH `$disconnect()` AND `pool.end()` on shutdown
9. `frontend/package.json` start script uses bash `${PORT:-3000}` — doesn't work in PowerShell directly
10. Quality AI pipeline cron can overlap if processing is slow — watch for duplicate reviews

### Fragile Code — Extra Caution Required
1. `modal-stack-context.tsx` — syncs with browser history via pushState/popstate with RAF timing. Any change can break back button across entire app
2. `clientchats-core.service.ts processInbound()` — pipeline order is load-bearing
3. `assignment.service.ts joinConversation()` — raw SQL optimistic lock prevents race conditions
4. `clientchats-core.service.ts isBetterName()` — prevents permanent customer name corruption
5. Closed conversation archival — rewrites externalConversationId to `${id}__archived_${timestamp}`. Changing this breaks conversation threading
6. Work order product approval — inventory deduction must happen AFTER approval, never before
7. Employee deletion delegation — must delegate active leads/work orders before hard delete
8. `app/layout.tsx` — if MessengerContext, ModalStackContext, or I18nContext throws on init, entire app goes blank

---

## Automation Rules

These rules are ALWAYS active. Follow them without me asking.

### Rule 1: Plan Before Code
Before writing code for medium/complex tasks:
1. State files you'll create/modify
2. Explain approach in 2-3 sentences
3. Flag risks
4. Wait for my "go"

For simple tasks (typo, label change, spacing): just do it.

### Rule 2: Auto-Test
After completing any feature or bug fix:
1. Write unit tests (.spec.ts next to source) — happy path + error + edge case
2. Mock PrismaService and external services
3. Run tests, fix if failing
4. Report test count

### Rule 3: Auto-Update Docs
After any feature, update in the same commit:
- CLAUDE.md if new models, routes, pages, or business rules
- API_ROUTE_MAP.md if endpoints changed
- FRONTEND_ROUTE_MAP.md if pages changed
- DATABASE_SCHEMA.md if schema changed

### Rule 4: Pre-Completion Checklist
Before telling me "ready to test":
1. Backend TypeScript: `cd backend\crm-backend ; pnpm typecheck`
2. Frontend TypeScript: `cd frontend\crm-frontend ; pnpm typecheck`
3. Backend lint: `cd backend\crm-backend ; pnpm lint`
4. Backend tests: `cd backend\crm-backend ; pnpm test:unit`
5. No console.log left (unless intentional logging)
6. No hardcoded URLs, ports, credentials
7. useListItems() for all dropdowns
8. apiGet/apiPost for all HTTP calls
9. Permissions added if needed
10. Documentation updated

### Rule 5: Database Protocol
1. Modify schema.prisma
2. `npx prisma migrate dev --name descriptive_name`
3. `npx prisma generate`
4. Warn me if adding enums (Railway migration note needed)
5. Update seed scripts if needed
6. Update DATABASE_SCHEMA.md

### Rule 6: Permission-Aware
When building access-controlled features:
1. Add to seed-permissions.ts
2. Backend: @RequirePermission()
3. Frontend: usePermissions() + conditional render
4. Sidebar: *.menu permission
5. Test as both superadmin and regular user

### Rule 7: Error Handling
- Validate with class-validator DTOs
- Return proper HTTP status codes
- Log errors with context
- Never expose internal errors to frontend

### Rule 8: Performance
- Use select (not full includes) for list queries
- Use _count/groupBy, not loading + counting in JS
- Promise.all() for independent queries
- Add indexes for new WHERE/ORDER BY fields
- Always paginate list endpoints

### Rule 9: Task Complexity
| Type | Examples | Approach |
|------|----------|----------|
| Simple | Fix typo, change label, adjust spacing | Just do it, type check, commit |
| Medium | Add field, add filter, new endpoint, add modal | Brief plan → approval → build → test → docs → commit |
| Complex | New module, real-time feature, integration, major refactor | Detailed plan → discuss → incremental builds → full tests → docs |

---

## Business Rules

### Work Order Lifecycle
CREATED → LINKED_TO_GROUP → IN_PROGRESS → COMPLETED/CANCELED
- Types: INSTALLATION, DIAGNOSTIC, RESEARCH, DEACTIVATE, REPAIR_CHANGE, ACTIVATE
- Approval: technician submits → head reviews products → approves (inventory deducted) → or cancels
- Inventory deduction happens ONLY after approval — never before

### Incident Lifecycle
CREATED → IN_PROGRESS → COMPLETED/WORK_ORDER_INITIATED
- Building required, client optional (but null client causes known bug)
- Auto-numbered INC-YYYY-####

### Sales Pipeline
NEW → CONTACT → MEETING → PROPOSAL → NEGOTIATION → APPROVED → WON/LOST
- Approval: employee submits → lead locks → approver reviews → WON or rejects → unlocks

### RBAC
- Chain: User → Employee → Position → RoleGroup → Permissions
- ~100 permissions, 12 categories
- Backend: @UseGuards(JwtAuthGuard, PositionPermissionGuard) + @RequirePermission()
- Frontend: usePermissions(), <PermissionButton>, <PermissionGuard>
- Superadmin bypasses all

### Employee Lifecycle
ACTIVE → TERMINATED (dismiss) → ACTIVE (reactivate) or DELETED (permanent)
- EMP-### IDs never reused
- Hard delete requires delegating active leads/work orders first

### Client Chats
- Channel adapters: Viber, Facebook, Telegram, WebChat (WhatsApp planned)
- Queue: weekly schedule + daily overrides, operators join conversations manually
- Escalation: auto-escalate on SLA timeout
- Display name chain: CRM Client name → participant.displayName → "Unknown Customer"

---

## Cron Jobs (Background Tasks)
| Service | Schedule | What it does | Concern |
|---------|----------|-------------|---------|
| escalation.service.ts | Every 1 min | Check chat SLA rules | DB query on every tick |
| cdr-import.service.ts | Every 5 min | Import CDR from Asterisk | — |
| asterisk-sync.service.ts | Every 5 min | Sync extension/queue state | — |
| quality-pipeline.service.ts | Every 2 min | OpenAI call reviews | Can overlap if slow, expensive |

---

## Known Bugs & Incomplete Features

### Bugs
- Incident without client: null constraint violation
- Health module: NOT imported in AppModule — /health doesn't respond

### Incomplete
- Dashboard: static placeholder (no API)
- WhatsApp adapter: schema ready, adapter not built
- Work order export: permissions exist, no UI
- Web chat widget: backend ready, no embeddable JS widget

### Technical Debt
- Some pages use raw fetch() instead of apiGet/apiPost
- Legacy Role system alongside Position RBAC (both imported)
- Single 2125-line Prisma schema
- dist/ files in git status (gitignore issue)

---

## Environment Variables

### Backend (.env)
DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CORS_ORIGINS, COOKIE_NAME, COOKIE_SECURE, VIBER_BOT_TOKEN, FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET, FB_VERIFY_TOKEN, TELEGRAM_BOT_TOKEN, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, WA_VERIFY_TOKEN, WA_APP_SECRET, CLIENTCHATS_WEBHOOK_BASE_URL, TELEPHONY_INGEST_SECRET, AMI_ENABLED, AMI_HOST, AMI_PORT, AMI_USER, AMI_SECRET, ARI_ENABLED, ARI_BASE_URL, ARI_USER, ARI_PASSWORD, OPENAI_API_KEY, QUALITY_AI_ENABLED, QUALITY_AI_MODEL

### Frontend (.env.local)
NEXT_PUBLIC_API_BASE (default http://localhost:3000), API_BACKEND_URL

---

## Coding Conventions

- Backend: NestJS module per domain (controller + service + DTOs + module)
- Frontend: All authenticated pages are "use client" components
- Terminology: "Devices" = building assets. "Products" = inventory items.
- Auto-generated codes: Department, Position, RoleGroup codes from name
- Employee IDs: EMP-### never reused (ExternalIdCounter table)
- Prisma: sole DB access via PrismaService (extends PrismaClient + pg.Pool)
- Validation: DTOs with class-validator
- Guards: @UseGuards(JwtAuthGuard, PositionPermissionGuard) + @RequirePermission()
- Performance: Promise.all(), groupBy, indexes, select, pagination
- Frontend API: same-origin rewrites in next.config.ts (/auth/*, /v1/*, /public/* → backend)
- Modals: createPortal + mounted check + z-index (detail: 10000, action: 50000+)
- Pagination: cursor-based for messenger, page-based for everything else
- React hooks: ALL hooks BEFORE any conditional returns (React #310 crash)

## Key Files

| Purpose | Path |
|---------|------|
| Prisma schema | backend/crm-backend/prisma/schema.prisma |
| Backend entry | backend/crm-backend/src/main.ts |
| Root module | backend/crm-backend/src/app.module.ts |
| Prisma config (CI fallback) | backend/crm-backend/prisma.config.ts |
| API client | frontend/crm-frontend/src/lib/api.ts |
| Dynamic lists hook | frontend/crm-frontend/src/hooks/useListItems.ts |
| Permissions hook | frontend/crm-frontend/src/lib/use-permissions.ts |
| Modal manager | frontend/crm-frontend/src/app/app/modal-manager.tsx |
| Modal stack (FRAGILE) | frontend/crm-frontend/src/app/app/modal-stack-context.tsx |
| App layout (FRAGILE) | frontend/crm-frontend/src/app/app/layout.tsx |
| Messenger context | frontend/crm-frontend/src/app/app/messenger/messenger-context.tsx |
| Client chats core (FRAGILE) | backend/crm-backend/src/clientchats/services/clientchats-core.service.ts |

## Deeper Documentation

- DATABASE_SCHEMA.md — every table, relationship, enum
- API_ROUTE_MAP.md — every endpoint with method, auth, request/response
- FRONTEND_ROUTE_MAP.md — all 47 pages, components, status
- DEVELOPMENT_GUIDELINES.md — coding patterns with examples
- docs/TESTING.md — test setup
- docs/DESIGN_SYSTEM.md — UI design tokens
- docs/TELEPHONY_INTEGRATION.md — full telephony architecture
- docs/LOCAL_DEVELOPMENT.md — troubleshooting, health checks, Prisma enum workaround

## Production
- Domain: crm28.asg.ge
- Hosting: Railway (auto-deploys from master)
- Backend start: prisma migrate deploy → seed-permissions → node dist/main
- Frontend: separate Railway service
