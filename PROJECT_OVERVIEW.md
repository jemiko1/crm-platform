# PROJECT_OVERVIEW.md — Full Project Anatomy

> **Purpose**: Single-file reference for any AI agent or developer onboarding onto this CRM platform.
> **Last Updated**: 2026-03-24

---

## 1. Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| **Backend Framework** | NestJS | 11.x | TypeScript, decorator-based modules |
| **Frontend Framework** | Next.js (App Router) | 16.x | React 19, `src/app/` directory |
| **Language** | TypeScript | 5.x | Strict mode on frontend, relaxed on backend |
| **Database** | PostgreSQL | 16+ | Dockerized (`crm-prod-db` container, port 5433) |
| **ORM** | Prisma | 7.x | Schema at `backend/crm-backend/prisma/schema.prisma` |
| **CSS** | Tailwind CSS | 4.x | PostCSS plugin, theme in `globals.css` (no tailwind.config) |
| **Real-time** | Socket.IO | 4.x | Messenger (`/messenger` ns), Telephony (`/telephony` ns) |
| **Auth** | Passport + JWT | — | httpOnly cookie (`access_token`), 24h expiry |
| **API Docs** | Swagger (OpenAPI) | — | Available at `/api` in dev |
| **Telephony** | Asterisk / FreePBX | 16 | PJSIP, AMI, ARI integration |
| **Desktop Softphone** | Electron + SIP.js | — | `crm-phone/` directory, WebRTC calls |
| **AMI Bridge** | Custom Node.js service | — | `ami-bridge/` directory, relays call events |
| **AI / NLP** | OpenAI (GPT-4o, Whisper) | — | Quality review pipeline for call recordings |
| **Email** | Nodemailer + IMAPFlow | — | SMTP send + IMAP receive, configurable per-tenant |
| **SMS** | sender.ge API | — | Georgian SMS provider, rate-limited |
| **Client Chat Channels** | Viber, Facebook, Telegram, WhatsApp, Web Widget | — | Adapter-based unified inbox |
| **Charts** | Recharts | 3.x | Frontend data visualizations |
| **Date Handling** | date-fns | 4.x | Frontend date formatting |
| **Security** | Helmet, compression, bcrypt, throttler | — | Rate limiting: 60 req/min global |
| **Package Manager** | pnpm | 9.x | Workspace-level lockfiles per service |
| **CI/CD** | GitHub Actions | — | Tests + typecheck on PR, auto-deploy via Railway |
| **Hosting** | Railway | — | Deploys from `master` branch, domain: `crm28.asg.ge` |
| **i18n** | Custom (JSON locales) | — | English + Georgian (`en.json`, `ka.json`) |

---

## 2. Project Structure

```
CRM-Platform/
├── backend/crm-backend/          # NestJS API server
│   ├── prisma/
│   │   ├── schema.prisma         # Full database schema (2125 lines, 70+ models)
│   │   ├── migrations/           # 28 sequential Prisma migrations
│   │   ├── seed.ts               # Main seed entry point
│   │   ├── seed-permissions.ts   # Seeds ~100 RBAC permissions
│   │   ├── seed-system-lists.ts  # Seeds dynamic dropdown categories/items
│   │   ├── seed-employees.ts     # Seeds test employees
│   │   ├── seed-rbac.ts          # Seeds roles/groups
│   │   ├── seed-sales.ts         # Seeds sales pipeline stages/sources
│   │   ├── seed-workflow-steps.ts # Seeds workflow step definitions
│   │   └── seed-position-settings.ts
│   ├── src/
│   │   ├── main.ts               # Bootstrap: Helmet, CORS, cookies, Swagger, port 3000
│   │   ├── app.module.ts         # Root module importing all feature modules
│   │   ├── cors.ts               # CORS origin configuration
│   │   ├── auth/                 # JWT auth: login, /me, logout, guards, strategy
│   │   ├── buildings/            # Building CRUD service
│   │   ├── clients/              # Client service (no direct controller)
│   │   ├── assets/               # Building asset (device) service
│   │   ├── incidents/            # Incident reporting and management
│   │   ├── work-orders/          # Work order lifecycle, product usage, activity logs
│   │   ├── inventory/            # Products, purchase orders, stock transactions
│   │   ├── employees/            # Employee lifecycle (create, dismiss, activate, delete)
│   │   ├── departments/          # Department hierarchy CRUD
│   │   ├── positions/            # Position management (linked to RoleGroups)
│   │   ├── role-groups/          # Permission groups assigned to positions
│   │   ├── roles/                # Legacy role system (deprecated)
│   │   ├── permissions/          # Permission CRUD and effective-permissions endpoint
│   │   ├── system-lists/         # Dynamic dropdown categories and items
│   │   ├── workflow/             # Workflow steps, triggers, automation actions
│   │   ├── sales/                # Leads, services catalog, sales plans, pipeline config
│   │   ├── messenger/            # Internal employee messenger (Socket.IO gateway)
│   │   ├── telephony/            # Call center: AMI, ARI, CDR, recordings, quality
│   │   ├── clientchats/          # Unified inbox: adapters, webhooks, agent inbox
│   │   ├── client-intelligence/  # AI-powered client profiling
│   │   ├── notifications/        # Email + SMS sending, templates, logs
│   │   ├── translations/         # i18n translation management
│   │   ├── core-integration/     # Webhook sync from external core system
│   │   ├── audit/                # Audit log service
│   │   ├── common/               # Shared: guards, filters, decorators, id-generator
│   │   ├── health/               # Health check endpoint (not wired in AppModule)
│   │   ├── v1/                   # Versioned API controllers (public, admin-manual, etc.)
│   │   └── prisma/               # PrismaService (global DB access)
│   ├── test/                     # E2E test setup and specs
│   ├── package.json
│   ├── tsconfig.json
│   └── eslint.config.mjs
│
├── frontend/crm-frontend/        # Next.js 16 App Router SPA
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx        # Root layout: fonts, metadata
│   │   │   ├── page.tsx          # Landing redirect
│   │   │   ├── globals.css       # Tailwind v4 theme + base styles
│   │   │   ├── login/page.tsx    # Login page
│   │   │   ├── modal-dialog.tsx  # Reusable modal component
│   │   │   └── app/              # Authenticated app shell (47 pages)
│   │   │       ├── layout.tsx    # App layout: sidebar, header, messenger, modals
│   │   │       ├── app-header.tsx, sidebar-nav.tsx, profile-menu.tsx
│   │   │       ├── modal-manager.tsx, modal-provider.tsx, modal-stack-context.tsx
│   │   │       ├── dashboard/    # Dashboard page (placeholder)
│   │   │       ├── buildings/    # Building list + detail modal
│   │   │       ├── clients/      # Client list + detail modal + intelligence
│   │   │       ├── employees/    # Employee list + detail page + lifecycle modals
│   │   │       ├── work-orders/  # Work order list + detail modal + workflow
│   │   │       ├── incidents/    # Incident list + reporting modal
│   │   │       ├── inventory/    # Products + purchase orders
│   │   │       ├── tasks/        # My Workspace (employee task view)
│   │   │       ├── sales/        # Leads pipeline, plans, dashboard
│   │   │       ├── call-center/  # Live monitoring, logs, agents, statistics, quality
│   │   │       ├── client-chats/ # Unified inbox UI + analytics
│   │   │       ├── messenger/    # Chat bubbles, full messenger, context
│   │   │       └── admin/        # All admin pages (positions, departments, config, etc.)
│   │   ├── hooks/
│   │   │   ├── useListItems.ts   # Dynamic dropdown data fetching
│   │   │   ├── useDesktopPhone.ts # Desktop phone app detection
│   │   │   └── useI18n.ts        # Internationalization hook
│   │   ├── lib/
│   │   │   ├── api.ts            # Centralized API client (apiGet, apiPost, etc.)
│   │   │   ├── use-permissions.ts # RBAC permission hook
│   │   │   ├── permission-button.tsx, permission-guard.tsx
│   │   │   ├── i18n.ts           # i18n utilities
│   │   │   └── work-order-status.ts
│   │   ├── components/
│   │   │   └── click-to-call.tsx  # Click-to-call integration
│   │   ├── contexts/
│   │   │   └── i18n-context.tsx   # i18n React context
│   │   └── locales/
│   │       ├── en.json            # English translations
│   │       └── ka.json            # Georgian translations
│   ├── public/                    # Static assets (logos, sounds, manifest)
│   ├── next.config.ts             # API proxy rewrites to backend
│   ├── package.json
│   └── tsconfig.json
│
├── ami-bridge/                    # AMI event relay (runs on Asterisk VM)
│   ├── src/
│   │   ├── main.ts               # Entry: AMI connect + event loop
│   │   ├── ami-client.ts         # TCP connection to Asterisk AMI
│   │   ├── event-mapper.ts       # AMI → CRM event normalization
│   │   └── crm-poster.ts         # Batched HTTP POST to CRM backend
│   └── package.json
│
├── crm-phone/                     # Electron desktop softphone (CRM28 Phone)
│   ├── src/
│   │   ├── main/                  # Electron main process, tray, IPC, auto-updater
│   │   ├── renderer/              # SIP.js WebRTC, React UI, hooks
│   │   └── shared/                # Shared types and IPC channel constants
│   ├── electron-builder.yml
│   └── package.json
│
├── ai/                            # AI documentation context
│   ├── architecture/              # System overview, backend/frontend/telephony docs
│   ├── modules/                   # Module-specific AI context docs
│   ├── devops/                    # Deployment and CI pipeline docs
│   ├── rules/                     # Engineering rules and git workflow
│   └── README.md
│
├── docs/                          # Human-readable project docs
│   ├── TELEPHONY_INTEGRATION.md
│   ├── CALL_CENTER.md
│   ├── CLIENTCHATS.md
│   ├── SMS_MODULE.md
│   ├── DESIGN_SYSTEM.md
│   ├── LOCAL_DEVELOPMENT.md
│   ├── RAILWAY_PRODUCTION_DEPLOY.md
│   └── ...
│
├── .github/
│   ├── workflows/ci.yml           # CI: backend tests, typecheck, frontend build
│   └── PULL_REQUEST_TEMPLATE.md
│
├── CLAUDE.md                      # Claude AI role definition (reviewer only)
├── PROJECT_SNAPSHOT.md            # Primary AI reference doc
├── API_ROUTE_MAP.md               # Full API endpoint documentation
├── FRONTEND_ROUTE_MAP.md          # Full frontend route documentation
├── DEVELOPMENT_GUIDELINES.md      # Coding patterns and best practices
└── AI_START_HERE.md               # AI workflow quick reference
```

---

## 3. How to Run

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL)
- Git

### Database Setup

```bash
# Start PostgreSQL container (if not already running)
docker run -d --name crm-prod-db \
  -e POSTGRES_PASSWORD=147852asg \
  -e POSTGRES_DB=crm_db \
  -p 5433:5432 \
  postgres:16

# Verify container is running
docker ps | grep crm-prod-db
```

### Backend (Port 3000)

```bash
cd backend/crm-backend

# Install dependencies
pnpm install

# Generate Prisma client
pnpm prisma generate

# Run migrations
npx prisma migrate dev

# Seed permissions and system data
npx tsx prisma/seed-permissions.ts
npx tsx prisma/seed-system-lists.ts
npx tsx prisma/seed-workflow-steps.ts
npx tsx prisma/seed-sales.ts

# Start dev server
npm run start:dev
```

### Frontend (Port 3002)

```bash
cd frontend/crm-frontend

# Install dependencies
pnpm install

# Start dev server
pnpm dev --port 3002
```

### AMI Bridge (Asterisk VM only)

```bash
cd ami-bridge
npm install
npm start
```

### CRM28 Phone (Desktop app development)

```bash
cd crm-phone
npm install
npm run dev
```

---

## 4. Environment Variables

### Backend (`backend/crm-backend/.env`)

| Variable | Description | Service |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Prisma / PostgreSQL |
| `JWT_SECRET` | Secret key for JWT token signing | Auth module |
| `JWT_EXPIRES_IN` | Token expiry duration (e.g., `24h`) | Auth module |
| `PORT` | Backend port (default: 3000) | NestJS |
| `COOKIE_NAME` | Auth cookie name (default: `access_token`) | Auth module |
| `COOKIE_SECURE` | Set `true` in production for HTTPS-only cookies | Auth module |
| `CORS_ORIGINS` | Comma-separated allowed origins | CORS config |
| `VIBER_BOT_TOKEN` | Viber bot authentication token | Client Chats - Viber |
| `FB_PAGE_ACCESS_TOKEN` | Facebook Page access token | Client Chats - Facebook |
| `FB_APP_SECRET` | Facebook app secret for signature verification | Client Chats - Facebook |
| `FB_VERIFY_TOKEN` | Custom string for Facebook webhook verification | Client Chats - Facebook |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from BotFather | Client Chats - Telegram |
| `WA_ACCESS_TOKEN` | WhatsApp Business Cloud API token | Client Chats - WhatsApp |
| `WA_PHONE_NUMBER_ID` | WhatsApp phone number ID | Client Chats - WhatsApp |
| `WA_VERIFY_TOKEN` | WhatsApp webhook verification token | Client Chats - WhatsApp |
| `WA_APP_SECRET` | WhatsApp app secret for signature verification | Client Chats - WhatsApp |
| `CLIENTCHATS_WEBHOOK_BASE_URL` | Public URL for webhook registration (e.g., `https://api.crm28.asg.ge`) | Client Chats |
| `TELEPHONY_INGEST_SECRET` | Shared secret for call event ingestion | Telephony |
| `AMI_ENABLED` | Enable Asterisk AMI connection (`true`/`false`) | Telephony |
| `AMI_HOST` | Asterisk AMI host IP | Telephony |
| `AMI_PORT` | Asterisk AMI port (default: 5038) | Telephony |
| `AMI_USER` | AMI username | Telephony |
| `AMI_SECRET` | AMI password | Telephony |
| `ARI_ENABLED` | Enable Asterisk ARI connection (`true`/`false`) | Telephony |
| `ARI_BASE_URL` | Asterisk ARI REST URL (e.g., `http://127.0.0.1:8088/ari`) | Telephony |
| `ARI_USER` | ARI username | Telephony |
| `ARI_PASSWORD` | ARI password | Telephony |
| `AFTER_HOURS_QUEUES` | Comma-separated after-hours queue names | Telephony |
| `CDR_IMPORT_ENABLED` | Enable CDR import from Asterisk DB | Telephony |
| `CDR_DB_URL` | Asterisk CDR database connection string | Telephony |
| `RECORDING_BASE_PATH` | Path to Asterisk call recordings | Telephony |
| `OPENAI_API_KEY` | OpenAI API key for quality reviews | Quality AI |
| `QUALITY_AI_ENABLED` | Enable AI quality review pipeline | Quality AI |
| `QUALITY_AI_MODEL` | OpenAI model for scoring (e.g., `gpt-4o`) | Quality AI |
| `QUALITY_AI_CRON` | Cron schedule for quality processing | Quality AI |

### Frontend (`frontend/crm-frontend/.env.local`)

| Variable | Description | Service |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE` | Backend API URL (default: `http://localhost:3000`) | API client |
| `API_BACKEND_URL` | Backend URL for Next.js rewrites (default: `http://localhost:3000`) | next.config.ts |
| `PORT` | Frontend port (Railway sets this; local dev uses `--port 3002`) | Next.js |

### AMI Bridge (`ami-bridge/.env`)

| Variable | Description | Service |
|----------|-------------|---------|
| `AMI_HOST` | Asterisk server IP | AMI connection |
| `CRM_BASE_URL` | CRM backend URL for event posting | HTTP poster |
| `TELEPHONY_INGEST_SECRET` | Shared secret matching backend config | Authentication |

---

## 5. Architecture Pattern

**Pattern**: API + SPA (decoupled backend and frontend) with real-time WebSocket layer.

### Data Flow

```
Browser (Next.js SPA on :3002)
  ├── REST API calls ──→ Next.js rewrites ──→ NestJS API (:3000) ──→ Prisma ORM ──→ PostgreSQL (:5433)
  ├── WebSocket (Socket.IO) ──→ NestJS Gateways (/messenger, /telephony namespaces)
  └── Static assets served by Next.js

External Channels (Viber, Facebook, Telegram, WhatsApp)
  └── Webhook POST ──→ NestJS Public Controller ──→ Channel Adapter ──→ Core Service ──→ PostgreSQL

Asterisk PBX
  └── AMI Events ──→ AMI Bridge (Node.js) ──→ HTTP POST ──→ NestJS Telephony Module ──→ PostgreSQL
                                                            └──→ WebSocket broadcast to frontend

CRM28 Phone (Electron desktop app)
  ├── SIP.js WebRTC ──→ Asterisk PJSIP (WSS :8089) ──→ Phone calls
  └── REST API ──→ NestJS Auth + Telephony ──→ Caller ID lookup, call logs
```

### Key Architectural Decisions

- **No SSR for authenticated pages**: All `/app/*` pages are client components (`"use client"`)
- **Cookie-based auth**: JWT stored in httpOnly cookie, not localStorage
- **API proxy**: Next.js rewrites `/auth/*`, `/v1/*`, `/public/*` to backend — same-origin for cookies
- **Modal-based navigation**: Entity details open as stacked modals with URL-driven state
- **Position-based RBAC**: User → Employee → Position → RoleGroup → Permissions (not role-based)
- **Dynamic lists**: All dropdowns fetched from SystemLists API, never hardcoded
- **Adapter pattern for channels**: Each chat channel implements a `ChannelAdapter` interface
