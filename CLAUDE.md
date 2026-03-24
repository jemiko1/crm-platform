# CLAUDE.md — Project Context for Claude Code

> **CRM28**: Property/building management CRM platform. Georgian market. Domain: `crm28.asg.ge`.
> Manages buildings, residents (clients), work orders, incidents, sales leads, inventory, telephony, and multi-channel customer chat.

---

## Quick Start

```bash
# Database (Docker PostgreSQL on port 5433)
docker start crm-prod-db   # or: docker run -d --name crm-prod-db -e POSTGRES_PASSWORD=147852asg -e POSTGRES_DB=crm_db -p 5433:5432 postgres:16

# Backend (port 3000)
cd backend/crm-backend
pnpm install
pnpm prisma generate
npx prisma migrate dev
npx tsx prisma/seed-permissions.ts    # seeds ~100 RBAC permissions
npx tsx prisma/seed-system-lists.ts   # seeds dropdown data
npx tsx prisma/seed-workflow-steps.ts
npx tsx prisma/seed-sales.ts          # seeds pipeline stages/sources
npm run start:dev

# Frontend (port 3002)
cd frontend/crm-frontend
pnpm install
pnpm dev --port 3002
```

**Backend runs on port 3000. Frontend runs on port 3002. NEVER use port 4000.**

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
- **Package Manager**: pnpm 9

---

## Project Structure

```
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
├── src/hooks/useListItems.ts     # Dynamic dropdown hook (ALWAYS use this for dropdowns)
├── src/lib/api.ts                # Centralized API client (ALWAYS use apiGet/apiPost/etc.)
├── src/lib/use-permissions.ts    # RBAC permission hook
└── src/locales/{en,ka}.json      # i18n translations

ami-bridge/                       # Asterisk AMI event relay (runs on VM)
crm-phone/                        # Electron + SIP.js desktop softphone
```

---

## Database Schema

**Full schema**: `backend/crm-backend/prisma/schema.prisma`

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
| WorkOrderActivityLog | Full audit trail (action, category, metadata JSON) |
| DeactivatedDevice | Removed devices during work orders |
| Incident | Reported problems (incidentNumber, building required, client optional) |
| InventoryProduct | Warehouse products (SKU, category, currentStock, lowStockThreshold) |
| PurchaseOrder / PurchaseOrderItem | Restocking orders |
| StockBatch | Batch tracking per purchase |
| StockTransaction | All stock movements (type: PURCHASE_IN, WORK_ORDER_OUT, ADJUSTMENT_*, etc.) |

### HR & RBAC

| Model | Purpose |
|-------|---------|
| User | Login account (email, passwordHash, isSuperAdmin) |
| Employee | Person (may lack User account; employeeId EMP-###, status lifecycle) |
| Department | Hierarchy (self-ref parentId, headId) |
| Position | Job role (linked to RoleGroup and Department) |
| RoleGroup | Named permission set |
| Permission | Granular: `resource.action` (e.g., `work_orders.approve`) |
| RoleGroupPermission | M:N join |
| EmployeePermission | Per-employee GRANT/DENY override |

**Permission chain**: User → Employee → Position → RoleGroup → Permissions. Superadmin bypasses all checks.

### Sales

| Model | Purpose |
|-------|---------|
| LeadStage | Pipeline stages (8: NEW → CONTACT → MEETING → PROPOSAL → NEGOTIATION → APPROVED → WON → LOST) |
| Lead | Sales lead (leadNumber autoincrement, pricing, approval workflow, isLocked) |
| SalesService / SalesServiceCategory | Service catalog with pricing |
| LeadService | Services attached to lead (quantity, prices) |
| LeadNote / LeadReminder / LeadAppointment / LeadProposal | Sub-resources |
| LeadStageHistory / LeadActivity | Audit trail |
| SalesPlan / SalesPlanTarget | Revenue targets per employee |

### Messenger (Internal)

Conversation (DIRECT/GROUP) → ConversationParticipant → Message → MessageReaction/MessageAttachment

### Telephony

TelephonyExtension, TelephonyQueue, CallSession, CallLeg, CallEvent, CallMetrics, MissedCall, CallbackRequest, Recording, QualityReview, QualityRubric

### Client Chats (Unified Inbox)

ClientChatChannelAccount → ClientChatConversation → ClientChatMessage. Plus: ClientChatParticipant, CannedResponse, AssignmentConfig, EscalationConfig, QueueSchedule/Override, WebhookFailure

### System

SystemListCategory/SystemListItem (dynamic dropdowns), Translation, ExternalIdCounter, SyncEvent, AuditLog, EmailConfig, SmsConfig, NotificationTemplate/NotificationLog, WorkflowStep/Trigger/Action

### Key Relationships

```
User 1:1 Employee → N:1 Position → N:1 RoleGroup → M:N Permission
Client M:N Building (via ClientBuilding)
WorkOrder N:1 Building, optional N:1 Asset, M:N Employee (via Assignment)
WorkOrder 1:N WorkOrderProductUsage N:1 InventoryProduct
Lead N:1 LeadStage, N:1 Employee (responsible), 1:N LeadService N:1 SalesService
Conversation 1:N ConversationParticipant N:1 Employee, 1:N Message
ClientChatConversation N:1 ClientChatChannelAccount, N:1 User (assigned agent)
CallSession N:1 TelephonyQueue, N:1 User, 1:N CallLeg, 1:1 CallMetrics
```

---

## API Routes

**Base**: `http://localhost:3000`. Auth via JWT cookie on most `/v1/*` endpoints.

### Auth (`/auth`)
- `POST /auth/login` → sets httpOnly cookie. `GET /auth/me` → user + employee + permissions. `POST /auth/logout`
- `POST /auth/app-login` → desktop app JWT login

### Buildings (`/v1/buildings`, `/v1/admin/buildings`)
- `GET /v1/buildings`, `GET /v1/buildings/:coreId` — public reads
- `GET /v1/buildings/:coreId/clients`, `/assets` — sub-resources
- `POST/PATCH /v1/admin/buildings` — admin CRUD (JWT + Admin, creates audit logs)
- `POST /v1/admin/buildings/:coreId/clients`, `/assets` — create sub-resources

### Clients — `GET /v1/clients` (global directory, public)

### Incidents (`/v1/incidents`)
- `GET /v1/incidents` (filters: q, status, priority, buildingId, clientId, page, pageSize)
- `POST /v1/incidents` (JWT + `incidents.create` permission)
- `GET /v1/incidents/:id`, `PATCH /v1/incidents/:id/status`

### Work Orders (`/v1/work-orders`) — all JWT
- CRUD: `POST`, `GET` (list), `GET /:id`, `PATCH /:id`, `DELETE /:id?revertInventory=`
- Workflow: `POST /:id/assign`, `PATCH /:id/start`, `POST /:id/complete`, `POST /:id/approve`, `POST /:id/cancel`
- Products: `POST /:id/products`, `POST /:id/deactivated-devices`
- `GET /:id/activity`, `GET /my-tasks` (workspace)

### Employees (`/v1/employees`) — all JWT
- CRUD + lifecycle: `POST`, `GET`, `GET /:id`, `PATCH /:id`
- `POST /:id/dismiss`, `POST /:id/activate`, `DELETE /:id/hard-delete`
- `POST /:id/create-user`, `POST /:id/reset-password`
- `GET /:id/deletion-constraints`, `POST /:id/delegate-items`

### Inventory (`/v1/inventory`) — all JWT
- Products CRUD, Purchase Orders CRUD, Stock adjustments
- `GET /reports/low-stock`, `GET /reports/inventory-value`

### Sales (`/v1/sales`) — all JWT
- Leads: CRUD + `POST /:id/change-stage`, `POST /:id/submit-for-approval`, `POST /:id/approve`, `POST /:id/reject`, `POST /:id/mark-lost`
- Sub-resources: `/:id/services`, `/:id/notes`, `/:id/reminders`, `/:id/appointments`
- Services catalog, Config (stages, sources, pipeline positions/permissions), Plans

### Messenger (`/v1/messenger`) — all JWT
- Conversations CRUD, messages (cursor-based pagination), reactions, read status, search, unread-count
- WebSocket `/messenger`: `message:new`, `typing`, `conversation:updated`, `message:read`, `message:reaction`

### Telephony (`/v1/telephony`)
- `POST /events` (secret-protected, AMI Bridge ingest)
- `GET /calls`, `GET /lookup?phone=`, `GET /stats/overview`, `GET /queues/live`, `GET /agents/live`
- `POST /actions/originate` (click-to-call)
- WebSocket `/telephony`: real-time call/queue/agent events

### Client Chats
- Public (no auth): `POST /public/clientchats/start`, `/message`, webhooks for Viber/Facebook/Telegram
- Agent (JWT): `GET/POST /v1/clientchats/conversations`, `/:id/reply`, `/:id/assign`, `/:id/status`, `/:id/link-client`

### Admin
- Positions, RoleGroups, Departments, Roles (legacy), Permissions, SystemLists, Workflow, Translations, Notifications (email/SMS config + templates), Telephony Extensions, Client Chats Config, Sales Config

---

## Frontend

### Key Pages (47 total, all under `/app/*`)

**Working**: Buildings (list + detail), Clients (list + detail), Employees (list + detail + lifecycle), Work Orders (list + detail + workflow), Incidents (list + report), Inventory (products + POs), Tasks/My Workspace, Sales (leads pipeline + detail + plans), Call Center (live + logs + agents + statistics + quality + callbacks), Client Chats (inbox + analytics), Admin (15+ config pages)

**Placeholders**: Dashboard (static, no API), Admin Users, Admin Roles (read-only legacy), Assets (empty)

### State Management
- **Local**: `useState`/`useEffect`/`useMemo`/`useCallback` — NO Redux/Zustand
- **Global contexts**: `MessengerContext` (Socket.IO + chat state), `I18nContext`, `ModalStackContext`
- **URL-driven**: Entity detail modals via query params (`?building=1`, `?client=5`, `?workOrder=123`)
- **Module-level cache**: Permissions cache in `use-permissions.ts`

### Modal System
- **Detail modals**: Stacked LIFO panels rendered by `ModalManager`, z-index 10000, opened via `openModal("building", id)`
- **Action modals**: Centered overlays (add/edit/delete forms), z-index 50000+, use `createPortal(content, document.body)`
- **Navigation**: `router.back()` closes modals. Browser back button works naturally.
- **SSR safety**: Always check `mounted` state before rendering portal

### Auth Flow
1. `GET /auth/me` → 401 → redirect to `/login?expired=1&next=<path>`
2. Login → `POST /auth/login` → cookie set → redirect to dashboard
3. Dismissed users see "account dismissed" message

---

## Business Rules

### Work Order Lifecycle
`CREATED → LINKED_TO_GROUP → IN_PROGRESS → COMPLETED/CANCELED`
- Types: INSTALLATION, DIAGNOSTIC, RESEARCH, DEACTIVATE, REPAIR_CHANGE, ACTIVATE
- Approval: technician submits → head of technical reviews products → approves (inventory deducted) or cancels
- Sub-work orders: diagnostic can spawn repair child order

### Incident Lifecycle
`CREATED → IN_PROGRESS → COMPLETED/WORK_ORDER_INITIATED`
- Priorities: LOW, MEDIUM, HIGH, CRITICAL (with colors)
- Building required, client optional. Auto-numbered INC-YYYY-####.

### Sales Pipeline
Stages: NEW → CONTACT → MEETING → PROPOSAL → NEGOTIATION → APPROVED → WON/LOST
- Approval: employee submits → lead locks → Head of Sales/CEO approves → WON, or rejects → unlocks
- Each lead has services with quantity × pricing → totalOneTimePrice + totalMonthlyPrice

### RBAC
- Chain: User → Employee → Position → RoleGroup → [Permissions]
- ~100 permissions across 12 categories (BUILDINGS, CLIENTS, INCIDENTS, WORK_ORDERS, INVENTORY, EMPLOYEES, SALES, MESSENGER, TELEPHONY, CLIENT_CHATS, ADMIN, GENERAL)
- Sidebar visibility controlled by `*.menu` permissions
- Backend: `@UseGuards(JwtAuthGuard, PositionPermissionGuard)` + `@RequirePermission('resource.action')`
- Frontend: `usePermissions()` hook, `<PermissionButton>`, `<PermissionGuard>`
- Superadmin (`user.isSuperAdmin`) bypasses all checks

### Employee Lifecycle
`(create) → ACTIVE → TERMINATED (dismiss) → ACTIVE (reactivate) or DELETED (permanent)`
- Employees can exist WITHOUT login accounts
- Employee IDs (EMP-001, EMP-002...) NEVER reused after deletion
- Permanent deletion requires delegating active leads/work orders
- Historical records preserve cached employee names (`onDelete: SetNull`)

### Client Chats
- Adapter pattern: each channel implements `ChannelAdapter` (verifyWebhook, parseInbound, sendMessage)
- Assignment: manual or round-robin with weekly schedule + date overrides
- Escalation: auto-escalate on first-response timeout, auto-reassign on inactivity

---

## Current State

### What Works
Buildings, Clients, Incidents, Work Orders (full workflow), Inventory, Employees (full lifecycle), Sales (pipeline + approval), Internal Messenger (real-time), Call Center (live monitoring + analytics + quality), Client Chats (Viber, Facebook, Telegram, Web), Admin panels, Notifications (email + SMS), i18n (EN + KA), CRM28 Phone desktop app

### Known Bugs
- **Incident without client**: Null constraint violation when creating incident without clientId (Prisma sync issue)
- **Health module**: Not imported in AppModule — `/health` endpoint doesn't respond

### Incomplete Features
- Dashboard: static placeholder (no API)
- WhatsApp adapter: schema ready, adapter not built
- Work order/report export: permissions exist, no UI
- Frontend auth middleware: `proxy.ts` exists but no `middleware.ts`
- Web chat widget: backend ready, no embeddable JS widget
- Quality rubrics admin UI, Call recording playback UI, CDR import UI

### Technical Debt
- Some frontend pages use raw `fetch()` instead of `apiGet`/`apiPost`
- Legacy role system (Role, RolePermission) exists alongside Position-based RBAC
- Single 2125-line Prisma schema file
- `dist/` files showing in git status (gitignore issue)

### Security Notes
- SIP passwords stored as plaintext in TelephonyExtension table
- Global rate limit (60/min) may be too permissive for login endpoint
- No CSRF tokens (mitigated by `sameSite: 'lax'` cookies)
- Webhook endpoints use channel-specific signature verification

---

## Environment Variables

### Backend (`backend/crm-backend/.env`)

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection (e.g., `postgresql://postgres:pass@localhost:5433/crm_db`) |
| `JWT_SECRET` | JWT signing secret |
| `JWT_EXPIRES_IN` | Token expiry (e.g., `24h`) |
| `PORT` | Backend port (default 3000) |
| `COOKIE_NAME` | Auth cookie name (default `access_token`) |
| `COOKIE_SECURE` | `true` in production |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `VIBER_BOT_TOKEN` | Viber bot token |
| `FB_PAGE_ACCESS_TOKEN` | Facebook page token |
| `FB_APP_SECRET` | Facebook app secret |
| `FB_VERIFY_TOKEN` | Facebook webhook verify token |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `WA_ACCESS_TOKEN` | WhatsApp Cloud API token |
| `WA_PHONE_NUMBER_ID` | WhatsApp phone number ID |
| `WA_VERIFY_TOKEN` / `WA_APP_SECRET` | WhatsApp webhook verification |
| `CLIENTCHATS_WEBHOOK_BASE_URL` | Public backend URL for webhook registration |
| `TELEPHONY_INGEST_SECRET` | Shared secret for call event ingestion |
| `AMI_ENABLED`, `AMI_HOST`, `AMI_PORT`, `AMI_USER`, `AMI_SECRET` | Asterisk AMI connection |
| `ARI_ENABLED`, `ARI_BASE_URL`, `ARI_USER`, `ARI_PASSWORD` | Asterisk ARI connection |
| `OPENAI_API_KEY`, `QUALITY_AI_ENABLED`, `QUALITY_AI_MODEL` | OpenAI quality reviews |

### Frontend (`frontend/crm-frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_BASE` | Backend URL (default `http://localhost:3000`) |
| `API_BACKEND_URL` | Backend URL for Next.js rewrites |

---

## Important Patterns

### NEVER Do These
1. **NEVER hardcode dropdown values** — always use `useListItems(categoryCode)` from `@/hooks/useListItems`
2. **NEVER use raw `fetch()`** — always use `apiGet`, `apiPost`, `apiPatch`, `apiDelete` from `@/lib/api`
3. **NEVER use port 4000** — backend is 3000, frontend is 3002
4. **NEVER commit to `master` or `staging`** — work on `dev` or `feature/*` branches
5. **NEVER hardcode API URLs** — use the centralized API client
6. **NEVER render modals inline** — use `createPortal(content, document.body)`
7. **NEVER use `router.push()` for detail modals** — use `openModal(type, id)` from `useModalContext`

### Coding Conventions
- **Commit format**: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `chore(scope):`
- **Branch flow**: `feature/* → dev → staging → master`
- **Terminology**: "Devices" = building assets (elevators, intercoms). "Products" = inventory items (routers, sensors).
- **Auto-generated codes**: Department, Position, RoleGroup codes auto-generated from name (never manually set)
- **Employee IDs**: EMP-### format, never reused, stored in ExternalIdCounter table
- **Dynamic lists**: Categories: `ASSET_TYPE`, `CONTACT_METHOD`, `INCIDENT_TYPE`, `INCIDENT_PRIORITY`, `PRODUCT_CATEGORY`, `PRODUCT_UNIT`, `WORK_ORDER_TYPE` (user-editable). System-managed: `WORK_ORDER_STATUS`, `INCIDENT_STATUS`, `DEVICE_STATUS`, `PURCHASE_ORDER_STATUS`, `STOCK_TRANSACTION_TYPE`

### Backend Patterns
- NestJS module per domain: controller + service + DTOs + module
- Prisma as sole DB access layer via injectable `PrismaService`
- DTOs with `class-validator` decorators for validation
- `@UseGuards(JwtAuthGuard, PositionPermissionGuard)` + `@RequirePermission('resource.action')` for protected endpoints
- Parallel queries with `Promise.all()` for independent data fetches
- `groupBy` aggregations instead of N+1 queries
- Idempotency via unique constraints (SyncEvent.eventId, CallEvent.idempotencyKey, ClientChatMessage.externalMessageId)
- Safe deletion pattern: check relationships → require replacement/delegation → delete

### Frontend Patterns
- All authenticated pages are client components (`"use client"`)
- API calls via same-origin rewrites (`next.config.ts` rewrites `/auth/*`, `/v1/*`, `/public/*` to backend)
- Modals: `createPortal` + `mounted` state check + z-index layers (detail: 10000, action: 50000+)
- Permission checks: `const { hasPermission } = usePermissions()` then conditionally render
- Forms: `useState` for form data, `useEffect` for loading, submit via `apiPost`/`apiPatch`
- Dependent dropdowns: department → position (filter by departmentId with `useMemo`)
- Cursor-based pagination for messenger, page-based for everything else

### Key Files Reference
| Purpose | Path |
|---------|------|
| Prisma schema | `backend/crm-backend/prisma/schema.prisma` |
| Backend entry | `backend/crm-backend/src/main.ts` |
| Root module | `backend/crm-backend/src/app.module.ts` |
| Auth controller | `backend/crm-backend/src/auth/auth.controller.ts` |
| Permissions seed | `backend/crm-backend/prisma/seed-permissions.ts` |
| API client | `frontend/crm-frontend/src/lib/api.ts` |
| Dynamic lists hook | `frontend/crm-frontend/src/hooks/useListItems.ts` |
| Permissions hook | `frontend/crm-frontend/src/lib/use-permissions.ts` |
| Modal manager | `frontend/crm-frontend/src/app/app/modal-manager.tsx` |
| Modal stack | `frontend/crm-frontend/src/app/app/modal-stack-context.tsx` |
| App header | `frontend/crm-frontend/src/app/app/app-header.tsx` |
| Messenger context | `frontend/crm-frontend/src/app/app/messenger/messenger-context.tsx` |
| Client chats doc | `docs/CLIENTCHATS.md` |
| Telephony doc | `docs/TELEPHONY_INTEGRATION.md` |

### Deeper Documentation
For detailed information beyond this file, see:
- `PROJECT_OVERVIEW.md` — full tech stack, directory tree, architecture
- `DATABASE_SCHEMA.md` — every table, relationship, index, migration, enum
- `API_ROUTES.md` — every endpoint with method, auth, request/response, DB tables
- `FRONTEND_MAP.md` — all 47 pages, components, forms, state management
- `BUSINESS_LOGIC.md` — all business rules, workflows, permissions, integrations
- `TODO_AND_ISSUES.md` — bugs, incomplete features, tech debt, security concerns
- `DEPENDENCIES_AND_CONFIG.md` — all dependencies, config files, CI/CD, deployment
- `DEVELOPMENT_GUIDELINES.md` — coding patterns with examples
