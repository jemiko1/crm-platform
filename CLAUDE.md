# CLAUDE.md — Project Context for Claude Code

> **CRM28**: Property/building management CRM platform. Georgian market. Domain: `crm28.asg.ge`.
> Manages buildings, residents (clients), work orders, incidents, sales leads, inventory, telephony, and multi-channel customer chat.

---

## Session Start Protocol

**Every time you start a new session, do these steps FIRST before any work:**
```bash
git checkout master
git pull origin master
```

Then read this file. Then ask what I want to work on.

**Before starting any feature:**
```bash
git checkout master
git pull origin master
git checkout -b feature/descriptive-name
```

This ensures your local files always match the latest production code before you start changing anything.

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

**Backend: port 3000. Frontend: port 4002. NEVER use port 4000.**

### First-time setup only
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

---

## Workflow Rules

### Git Branch Rules

- **NEVER commit directly to `master`** — master is production
- **Always create feature branches FROM `master`**: `git checkout -b feature/descriptive-name master`
- **PRs target `master` directly** — there is NO dev branch and NO staging branch
- **Jemiko merges PRs manually** after testing on localhost
- After PR is merged, always pull master before starting next task

### Feature Development Flow

git checkout master ; git pull origin master
git checkout -b feature/my-feature
Build the feature (commit with conventional format)
Push branch: git push origin feature/my-feature
Create PR targeting master: gh pr create --base master --title "feat(scope): description"
Tell Jemiko: "Ready to test on localhost"
Jemiko tests → merges PR → Railway auto-deploys to production


### Before Completing Any Task

1. Walk me through what you'll change BEFORE changing it — wait for my approval
2. After building, tell me it's ready so I can test on localhost
3. Do NOT merge to master — I do that manually
4. Update CLAUDE.md if you added features, routes, or schema changes

### Commit Format

`feat(scope):`, `fix(scope):`, `refactor(scope):`, `test(scope):`, `docs(scope):`, `chore(scope):`

### Stop Conditions — ASK Before Doing These

1. **Database schema breaking changes** — dropping columns, renaming without migration path
2. **API contract changes** — removing endpoints, incompatible request/response changes
3. **Asterisk/telephony config changes** — anything touching pjsip, manager, or ARI config
4. **Deleting files or large refactors** — always confirm scope first

---

## Tech Stack

- **Backend**: NestJS 11 (TypeScript) — `backend/crm-backend/`
- **Frontend**: Next.js 16 App Router, React 19 — `frontend/crm-frontend/`
- **Database**: PostgreSQL 16 (Docker `crm-prod-db`, port 5433)
- **ORM**: Prisma 7 — schema at `backend/crm-backend/prisma/schema.prisma` (2125 lines)
- **CSS**: Tailwind CSS v4 (PostCSS plugin, theme in `globals.css`, NO tailwind.config file)
- **Auth**: JWT in httpOnly cookie (`access_token`), Passport, 24h expiry
- **Real-time**: Socket.IO — `/messenger` and `/telephony` namespaces
- **Telephony**: Asterisk/FreePBX 16 + AMI Bridge (`ami-bridge/`) + Electron softphone (`crm-phone/`)
- **AI**: OpenAI GPT-4o + Whisper (call quality reviews)
- **Chat Channels**: Viber, Facebook, Telegram, WhatsApp (planned), Web Widget — adapter pattern
- **Email/SMS**: Nodemailer + IMAPFlow / sender.ge API
- **Charts**: Recharts 3, **Dates**: date-fns 4
- **CI/CD**: GitHub Actions → Railway (auto-deploy from `master`)
- **Package Manager**: pnpm 9 (both frontend and backend)
- **OS**: Windows (PowerShell) — use `;` not `&&` to chain commands, no heredoc syntax

---

## Project Structure
backend/crm-backend/
├── prisma/schema.prisma          # 70+ models, 40+ enums
├── prisma/migrations/            # 28 migrations
├── prisma/seed-*.ts              # 8 seed scripts
├── src/main.ts                   # Bootstrap: Helmet, CORS, cookies, Swagger, port 3000
├── src/app.module.ts             # Root module — imports all feature modules
├── src/auth/                     # JWT login, /me, logout, guards, strategy
├── src/buildings/                # Building CRUD
├── src/clients/                  # Client service (no controller — accessed via v1/)
├── src/assets/                   # Building devices
├── src/incidents/                # Incident reporting/management
├── src/work-orders/              # Work order lifecycle, products, activity logs
├── src/inventory/                # Products, purchase orders, stock transactions
├── src/employees/                # Employee lifecycle (create/dismiss/activate/delete)
├── src/departments/              # Department hierarchy
├── src/positions/                # Positions (linked to RoleGroups)
├── src/role-groups/              # Permission bundles
├── src/permissions/              # RBAC permissions CRUD
├── src/system-lists/             # Dynamic dropdown values
├── src/workflow/                 # Workflow steps, triggers, automation
├── src/sales/                    # Leads, services, plans, pipeline config
├── src/messenger/                # Internal employee chat (Socket.IO)
├── src/telephony/                # Call center: AMI, ARI, CDR, recordings, quality
├── src/clientchats/              # Unified inbox: channel adapters, webhooks, agent inbox
├── src/client-intelligence/      # AI client profiling (partial)
├── src/notifications/            # Email + SMS templates, sending, logs
├── src/translations/             # i18n management
├── src/core-integration/         # External system webhook sync
├── src/audit/                    # Audit log service
├── src/common/                   # Guards, filters, decorators, id-generator
├── src/v1/                       # Versioned controllers (public, admin-manual)
└── src/prisma/                   # PrismaService
frontend/crm-frontend/
├── src/app/layout.tsx            # Root layout (fonts, metadata)
├── src/app/login/page.tsx        # Login page
├── src/app/modal-dialog.tsx      # Reusable modal component
├── src/app/app/                  # Authenticated shell (47 pages)
│   ├── layout.tsx                # Sidebar, header, messenger, modals
│   ├── modal-manager.tsx         # Centralized entity detail modal renderer
│   ├── modal-stack-context.tsx   # LIFO modal stack state
│   ├── buildings/, clients/, employees/, work-orders/, incidents/
│   ├── inventory/, tasks/, sales/, call-center/, client-chats/
│   ├── messenger/                # Chat bubbles, full messenger, context
│   └── admin/                    # 15+ admin config pages
├── src/hooks/useListItems.ts     # Dynamic dropdown hook (ALWAYS use this)
├── src/lib/api.ts                # Centralized API client (ALWAYS use apiGet/apiPost)
├── src/lib/use-permissions.ts    # RBAC permission hook
└── src/locales/{en,ka}.json      # i18n translations
ami-bridge/                       # Asterisk AMI event relay (runs on VM)
crm-phone/                        # Electron + SIP.js desktop softphone

---

## Database Schema

**Full schema**: `backend/crm-backend/prisma/schema.prisma`
**Detailed reference**: `DATABASE_SCHEMA.md`

### Core Models

| Model | Purpose |
|-------|---------|
| Building | Physical buildings (`coreId` from external system, `isActive`, soft-delete) |
| Client | Residents/customers (`coreId`, phone, idNumber) |
| ClientBuilding | M:N join table |
| Asset | Building devices (elevators, intercoms — type, status, IP) |
| WorkOrder | Service requests (status lifecycle, type, parent/child, workOrderNumber autoincrement) |
| WorkOrderAssignment | Employee ↔ WorkOrder |
| WorkOrderProductUsage | Products consumed (with batch tracking, approval flow) |
| Incident | Reported problems (incidentNumber, building required, client optional) |
| InventoryProduct | Warehouse products (SKU, category, currentStock, lowStockThreshold) |
| PurchaseOrder / PurchaseOrderItem | Restocking orders |
| StockBatch / StockTransaction | Batch tracking and all stock movements |

### HR & RBAC

User → Employee → Position → RoleGroup → Permissions. Superadmin bypasses all checks.
Employee IDs (EMP-###) NEVER reused. Permanent deletion requires delegating active leads/work orders.

### Sales

LeadStage (8 stages: NEW → CONTACT → MEETING → PROPOSAL → NEGOTIATION → APPROVED → WON → LOST), Lead, SalesService, LeadService, LeadNote, LeadReminder, SalesPlan/SalesPlanTarget

### Messenger (Internal)

Conversation (DIRECT/GROUP) → ConversationParticipant → Message → MessageReaction/MessageAttachment

### Telephony

TelephonyExtension, TelephonyQueue, CallSession, CallLeg, CallEvent, CallMetrics, MissedCall, CallbackRequest, Recording, QualityReview

### Client Chats (Unified Inbox)

ClientChatChannelAccount → ClientChatConversation → ClientChatMessage. Plus: ClientChatParticipant, CannedResponse, AssignmentConfig, EscalationConfig, QueueSchedule/Override

### Key Relationships
User 1:1 Employee → N:1 Position → N:1 RoleGroup → M:N Permission
Client M:N Building (via ClientBuilding)
WorkOrder N:1 Building, optional N:1 Asset, M:N Employee (via Assignment)
Lead N:1 LeadStage, N:1 Employee (responsible), 1:N LeadService N:1 SalesService
ClientChatConversation N:1 ClientChatChannelAccount, N:1 User (assigned agent)
CallSession N:1 TelephonyQueue, N:1 User, 1:N CallLeg, 1:1 CallMetrics

---

## API Routes

**Base**: `http://localhost:3000`. Auth via JWT cookie on most `/v1/*` endpoints.
**Detailed reference**: `API_ROUTE_MAP.md`

- Auth: `/auth/login`, `/auth/me`, `/auth/logout`
- Buildings: `/v1/buildings` (public reads) + `/v1/admin/buildings` (admin CRUD)
- Clients: `GET /v1/clients`
- Incidents: `/v1/incidents` (CRUD + status transitions)
- Work Orders: `/v1/work-orders` (CRUD + workflow: assign, start, complete, approve, cancel + products + activity)
- Employees: `/v1/employees` (CRUD + lifecycle: dismiss, activate, hard-delete + user account management)
- Inventory: `/v1/inventory` (products, purchase orders, stock, reports)
- Sales: `/v1/sales` (leads pipeline + services + config + plans)
- Messenger: `/v1/messenger` (conversations, messages, reactions) + WebSocket `/messenger`
- Telephony: `/v1/telephony` (events, calls, stats, queues, agents) + WebSocket `/telephony`
- Client Chats: public webhooks + agent endpoints + manager queue/schedule
- Admin: positions, role-groups, departments, permissions, system-lists, workflow, translations, notifications, telephony, client-chats config, sales config

---

## Frontend

**Detailed reference**: `FRONTEND_ROUTE_MAP.md`

**Working** (47 pages): Buildings, Clients, Employees, Work Orders, Incidents, Inventory, Tasks, Sales, Call Center, Client Chats, Messenger, Admin (15+ pages)

**Placeholders**: Dashboard (static), Admin Users, Admin Roles (legacy), Assets (empty)

### State & Patterns
- Local state only (NO Redux/Zustand). Global: MessengerContext, I18nContext, ModalStackContext
- URL-driven detail modals: `?building=1`, `?client=5`, `?workOrder=123`
- Detail modals: z-index 10000, opened via `openModal(type, id)`
- Action modals: z-index 50000+, `createPortal(content, document.body)`
- `router.back()` closes modals

---

## Business Rules

### Work Order Lifecycle
`CREATED → LINKED_TO_GROUP → IN_PROGRESS → COMPLETED/CANCELED`
- Types: INSTALLATION, DIAGNOSTIC, RESEARCH, DEACTIVATE, REPAIR_CHANGE, ACTIVATE
- Approval: technician submits → head reviews products → approves (inventory deducted) or cancels

### Incident Lifecycle
`CREATED → IN_PROGRESS → COMPLETED/WORK_ORDER_INITIATED`
- Building required, client optional. Auto-numbered INC-YYYY-####.

### Sales Pipeline
NEW → CONTACT → MEETING → PROPOSAL → NEGOTIATION → APPROVED → WON/LOST
- Approval: employee submits → lead locks → approver reviews → WON or rejects → unlocks

### RBAC
- ~100 permissions across 12 categories
- Backend: `@UseGuards(JwtAuthGuard, PositionPermissionGuard)` + `@RequirePermission('resource.action')`
- Frontend: `usePermissions()` hook, `<PermissionButton>`, `<PermissionGuard>`

### Client Chats Safety Rules
- NEVER overwrite real customer names with fallback/generic names
- NEVER replace optimistic concurrency SQL in `joinConversation()` with plain Prisma update
- Maintain `processInbound()` pipeline order: dedup → upsertParticipant → upsertConversation → saveMessage → autoMatch → emit events
- WebSocket namespace is `/ws/clientchats` — never change it
- React hooks MUST be declared BEFORE any conditional returns

---

## Current State

### Known Bugs
- Incident without client: null constraint violation when creating without clientId
- Health module: not imported in AppModule

### Incomplete Features
- Dashboard: static placeholder (no API)
- WhatsApp adapter: schema ready, adapter not built
- Work order/report export: permissions exist, no UI
- Web chat widget: backend ready, no embeddable JS widget

### Technical Debt
- Some frontend pages use raw `fetch()` instead of `apiGet`/`apiPost`
- Legacy role system exists alongside Position-based RBAC
- Single 2125-line Prisma schema file

---

## Environment Variables

### Backend (`backend/crm-backend/.env`)

DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, PORT, CORS_ORIGINS, VIBER_BOT_TOKEN, FB_PAGE_ACCESS_TOKEN, FB_APP_SECRET, FB_VERIFY_TOKEN, TELEGRAM_BOT_TOKEN, WA_ACCESS_TOKEN, WA_PHONE_NUMBER_ID, CLIENTCHATS_WEBHOOK_BASE_URL, TELEPHONY_INGEST_SECRET, AMI_ENABLED/HOST/PORT/USER/SECRET, ARI_ENABLED/BASE_URL/USER/PASSWORD, OPENAI_API_KEY

### Frontend (`frontend/crm-frontend/.env.local`)

NEXT_PUBLIC_API_BASE (default `http://localhost:3000`), API_BACKEND_URL

---

## NEVER Do These

1. **NEVER hardcode dropdown values** — always use `useListItems(categoryCode)`
2. **NEVER use raw `fetch()`** — always use `apiGet`, `apiPost`, `apiPatch`, `apiDelete` from `@/lib/api`
3. **NEVER use port 4000** — backend is 3000, frontend is 4002
4. **NEVER commit directly to `master`** — always work on `feature/*` branches
5. **NEVER hardcode API URLs** — use the centralized API client
6. **NEVER render modals inline** — use `createPortal(content, document.body)`
7. **NEVER use `router.push()` for detail modals** — use `openModal(type, id)`
8. **NEVER overwrite customer display names** with fallback names in client chats
9. **NEVER use `&&` in shell commands** — Windows PowerShell uses `;`
10. **NEVER start work without pulling master first** — always `git checkout master ; git pull origin master` before creating a feature branch

## Coding Conventions

- **Backend**: NestJS module per domain (controller + service + DTOs + module)
- **Frontend**: All authenticated pages are `"use client"` components
- **Terminology**: "Devices" = building assets. "Products" = inventory items.
- **Auto-generated codes**: Department, Position, RoleGroup codes from name
- **Employee IDs**: EMP-### format, never reused
- **Prisma**: Sole DB access via `PrismaService`
- **Validation**: DTOs with `class-validator`
- **Guards**: `@UseGuards(JwtAuthGuard, PositionPermissionGuard)` + `@RequirePermission()`
- **Performance**: `Promise.all()` for independent queries, `groupBy` not N+1, indexes on WHERE/ORDER BY
- **Frontend API**: Same-origin rewrites in `next.config.ts`
- **Modals**: `createPortal` + `mounted` check + z-index layers
- **Pagination**: Cursor-based for messenger, page-based for everything else

## Key Files Reference

| Purpose | Path |
|---------|------|
| Prisma schema | `backend/crm-backend/prisma/schema.prisma` |
| Backend entry | `backend/crm-backend/src/main.ts` |
| Root module | `backend/crm-backend/src/app.module.ts` |
| API client | `frontend/crm-frontend/src/lib/api.ts` |
| Dynamic lists hook | `frontend/crm-frontend/src/hooks/useListItems.ts` |
| Permissions hook | `frontend/crm-frontend/src/lib/use-permissions.ts` |
| Modal manager | `frontend/crm-frontend/src/app/app/modal-manager.tsx` |
| Modal stack | `frontend/crm-frontend/src/app/app/modal-stack-context.tsx` |
| Messenger context | `frontend/crm-frontend/src/app/app/messenger/messenger-context.tsx` |

## Deeper Documentation

- `DATABASE_SCHEMA.md` — every table, relationship, index, migration, enum
- `API_ROUTE_MAP.md` — every endpoint with method, auth, request/response
- `FRONTEND_ROUTE_MAP.md` — all 47 pages, components, status
- `DEVELOPMENT_GUIDELINES.md` — coding patterns with concrete examples
- `docs/TESTING.md` — test setup and how to run tests
- `docs/DESIGN_SYSTEM.md` — UI design tokens and patterns
- `docs/TELEPHONY_INTEGRATION.md` — full telephony architecture

## Production

- **Domain**: crm28.asg.ge
- **Hosting**: Railway (auto-deploys from `master`)
- **Deploy flow**: Merge PR to master → Railway auto-deploys backend + frontend
