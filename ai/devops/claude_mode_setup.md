# Claude Code Setup

> Setup guide for Claude Code working on the CRM Platform. Read this before making changes.

---

## SECTION 1 – What Claude Must Read

**Before any changes, Claude must read these files (in order):**

1. **`ai/rules/git_workflow.md`** – Branch rules, PR target, commit format
2. **`ai/rules/engineering_rules.md`** – Code standards, performance, files to never modify
3. **`ai/architecture/system_overview.md`** – Tech stack, ports, design decisions
4. **`ai/architecture/backend_architecture.md`** – Backend structure (if touching backend)
5. **`ai/architecture/frontend_architecture.md`** – Frontend structure (if touching frontend)
6. **`ai/architecture/telephony_architecture.md`** – If touching telephony, AMI Bridge, or CRM28 Phone

**Additional references as needed:**
- `DEVELOPMENT_GUIDELINES.md` – Modal patterns, dynamic lists
- `docs/AI_WORKING_RULES.md` – Full AI rules
- `API_ROUTE_MAP.md` – Backend endpoints
- `FRONTEND_ROUTE_MAP.md` – Frontend routes

---

## SECTION 2 – Common Developer Commands

### Backend (`backend/crm-backend/`)

| Action | Command |
|--------|---------|
| **Install** | `pnpm install` |
| **Build** | `pnpm build` (runs `prisma generate` + `nest build`) |
| **Test** | `pnpm test:unit` |
| **Lint** | `pnpm lint` |
| **Typecheck** | `pnpm typecheck` |
| **Dev server** | `pnpm start:dev` (port 3000) |
| **E2E tests** | `pnpm test:e2e` (requires test DB) |

### Frontend (`frontend/crm-frontend/`)

| Action | Command |
|--------|---------|
| **Install** | `pnpm install` |
| **Dev server** | `pnpm dev` (default port 4002; use `pnpm dev --port 3002` for documented port) |
| **Build** | `pnpm build` |
| **Lint** | `pnpm lint` |
| **Typecheck** | `pnpm typecheck` |

### Database (from `backend/crm-backend/`)

```bash
npx prisma migrate dev --name descriptive_name   # Create + apply migration
npx prisma generate                             # Regenerate client after schema change
npx prisma studio                                # Visual DB browser
```

---

## SECTION 3 – Telephony Development Rules

### How AMI Bridge Interacts with Backend

1. **AMI Bridge** runs as a separate Node.js service (typically on a Windows VM near Asterisk).
2. It connects to **Asterisk AMI** (TCP port 5038) and listens for raw call events.
3. It **maps** AMI events (Newchannel, Hangup, AgentConnect, etc.) to CRM event types (`call_start`, `call_end`, `agent_connect`, etc.).
4. It **batches** events (up to 20 events or 3 seconds) and **POSTs** them to the CRM backend:
   - **Endpoint**: `POST /v1/telephony/events`
   - **Header**: `x-telephony-secret: <shared secret>` (must match `TELEPHONY_INGEST_SECRET` in backend)
   - **Body**: `{ "events": [...] }`
5. The **CRM backend** (`TelephonyIngestionService`) receives the batch, deduplicates via `idempotencyKey`, persists to DB, and updates in-memory state.
6. The backend **WebSocket** (`/telephony` namespace) pushes live events to the Call Center UI.

### Rules When Changing Telephony

- **AMI Bridge** and **backend** must agree on event format and `TELEPHONY_INGEST_SECRET`.
- Adding a new AMI event type: update `ami-bridge` event mapper and `backend` ingestion handler together.
- Never change `idempotencyKey` logic without considering duplicate handling.

**References:** `docs/TELEPHONY_INTEGRATION.md`, `ami-bridge/README.md`, `ai/modules/ami_bridge_module.md`

---

## SECTION 4 – CI Pipeline Overview

**Workflow file:** `.github/workflows/ci.yml`

**Triggers:**
- Pull requests to `dev`, `staging`, `master`
- Push to `dev`

**Jobs (run in parallel):**

| Job | What it does |
|-----|---------------|
| **Backend Tests** | `pnpm install --frozen-lockfile` → `prisma generate` → `pnpm test:unit` |
| **Backend Typecheck** | `pnpm install --frozen-lockfile` → `prisma generate` → `pnpm typecheck` |
| **Frontend Build** | `pnpm install --frozen-lockfile` → `pnpm build` |

**Before merging:** All three jobs must pass. Run `pnpm test:unit`, `pnpm typecheck`, and `pnpm build` locally before pushing.

**Reference:** `docs/CI_CD.md`, `ai/devops/ci_pipeline.md`

---

## SECTION 5 – Safe Change Procedure

Claude **must** follow this procedure for any non-trivial change:

### Step 1: Scan Repo

- Read the files in Section 1.
- Identify all files and modules affected by the requested change.
- Note dependencies (backend ↔ frontend, ami-bridge ↔ backend, etc.).

### Step 2: Propose PR Plan

- Break the work into **sequential PRs** (one logical change per PR).
- For each PR, list:
  - Branch name (e.g., `feature/add-x`)
  - Files to modify
  - Tests to add/update
  - Any migration or config changes
- Present the plan to the user **before** implementing.

### Step 3: Implement PR 1 Only

- Create branch from `dev`: `git checkout -b feature/... dev`
- Implement **only** the first PR from the plan.
- Run `pnpm lint`, `pnpm test:unit`, `pnpm typecheck` (backend) and `pnpm build` (frontend) before committing.
- Commit with conventional format: `feat:`, `fix:`, `refactor:`, etc.
- Push and open PR to `dev` (never to `master` or `staging`).
- **Stop.** Do not implement PR 2, 3, etc. until the user approves or requests more.

---

**Last updated:** 2026-03-04
