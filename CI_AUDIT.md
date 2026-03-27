# CI_AUDIT.md — CRM28 GitHub Actions & Branch Protection

> Generated: 2026-03-24
> **DO NOT COMMIT** — reference document for migration

---

## 1. Workflow Files

### `.github/workflows/ci.yml` — **CI** (Active)

**Triggers:**
- `pull_request` → branches: `master` only

**4 parallel jobs, all run on `ubuntu-latest`:**

#### Job 1: `backend-test` ("Backend Tests")

| Step | What it does |
|------|-------------|
| `actions/checkout@v4` | Clone repo |
| `pnpm/action-setup@v4` | Install pnpm 10 |
| `actions/setup-node@v4` | Install Node 24, cache pnpm deps |
| `pnpm install --frozen-lockfile` | Install backend deps (no lockfile changes allowed) |
| `pnpm prisma generate` | Generate Prisma client (required before tests compile) |
| `pnpm test:unit` | Run Jest unit tests (`jest --testPathPatterns=\.spec\.ts$`) |

#### Job 2: `backend-typecheck` ("Backend Typecheck")

| Step | What it does |
|------|-------------|
| `actions/checkout@v4` | Clone repo |
| `pnpm/action-setup@v4` | Install pnpm 10 |
| `actions/setup-node@v4` | Install Node 24, cache pnpm deps |
| `pnpm install --frozen-lockfile` | Install backend deps |
| `pnpm prisma generate` | Generate Prisma client |
| `pnpm typecheck` | Run `tsc --noEmit` — full TypeScript type checking without emitting files |

#### Job 3: `frontend-build` ("Frontend Build")

| Step | What it does |
|------|-------------|
| `actions/checkout@v4` | Clone repo |
| `pnpm/action-setup@v4` | Install pnpm 10 |
| `actions/setup-node@v4` | Install Node 24, cache pnpm deps |
| `pnpm install --frozen-lockfile` | Install frontend deps |
| `pnpm build` | Run `next build` — full production build (catches type errors + build errors) |

#### Job 4: `frontend-typecheck` ("Frontend Typecheck")

| Step | What it does |
|------|-------------|
| `actions/checkout@v4` | Clone repo |
| `pnpm/action-setup@v4` | Install pnpm 10 |
| `actions/setup-node@v4` | Install Node 24, cache pnpm deps |
| `pnpm install --frozen-lockfile` | Install frontend deps |
| `pnpm typecheck` | Run `tsc --noEmit` — explicit TypeScript type checking for frontend |

**Secrets/env vars used:** None. All 4 jobs are pure code-quality checks with no secrets.

**Node version:** 24 (CI matches local).

**pnpm version:** 10 (CI matches local).

---

### `.github/workflows/workflow-guidance.yml` — **DELETED**

Was for the old Cursor + Claude reviewer pipeline. Deleted during CI cleanup.

### `.github/workflows/pr-labels.yml.disabled` — **DELETED**

Was intentionally disabled. Deleted during CI cleanup.

---

## 2. Last 10 CI Runs

| # | Status | Commit | Workflow | Branch | Trigger | Duration | Date |
|---|--------|--------|----------|--------|---------|----------|------|
| 1 | **Pass** | docs: add comprehensive project documentation | CI | chore/claude-code-documentation | PR | 43s | 2026-03-24 |
| 2 | **Pass** | Merge PR #156 | CI | dev | push | 45s | 2026-03-24 |
| 3 | **Pass** | docs: add comprehensive project documentation | CI | chore/claude-code-documentation | PR | 46s | 2026-03-24 |
| 4 | **Pass** | Merge PR #155 (mobile CRM UI) | CI | dev | push | 46s | 2026-03-23 |
| 5 | **Pass** | feat(frontend): mobile CRM UI | CI | feature/mobile-crm-ui-client-chats | PR | 45s | 2026-03-23 |
| 6 | **Pass** | fix: Improve mobile header responsiveness | CI | fix/mobile-header-responsive-favicon | PR | 44s | 2026-03-20 |
| 7 | **Pass** | feat: Update favicons | CI | feature/update-favicons-deep-teal | PR | 48s | 2026-03-19 |
| 8 | **Pass** | feat: Update brand colors to deep teal | CI | feature/update-brand-colors-to-deep-teal | PR | 50s | 2026-03-19 |
| 9 | **Pass** | feat(frontend): CRM28 favicons and PWA manifest | CI | feature/crm28-favicon-update | PR | 47s | 2026-03-19 |
| 10 | **Pass** | docs: Client Chats module docs | CI | feature/client-chats-documentation | PR | 47s | 2026-03-19 |

**All 10 recent runs passed.** Average duration: ~45 seconds. No failures in recent history.

---

## 3. Registered Workflows

| Workflow | Status | ID |
|----------|--------|-----|
| CI | Active | 236712480 |
| Workflow Guidance | Active | 241500836 |

(`pr-labels.yml.disabled` does not appear because it's disabled via rename.)

---

## 4. Branch Protection on `master`

| Rule | Setting |
|------|---------|
| **Required status checks** | `backend-test`, `backend-typecheck`, `frontend-build`, `frontend-typecheck` — all 4 must pass |
| **Strict status checks** | `false` — branch does NOT need to be up-to-date with master before merging |
| **Required PR reviews** | 1 approving review required |
| **Dismiss stale reviews** | `true` — new pushes dismiss previous approvals |
| **Require code owner reviews** | `false` |
| **Require last push approval** | `false` |
| **Required conversation resolution** | `true` — all PR conversations must be resolved before merge |
| **Required signatures** | `false` |
| **Enforce admins** | `false` — admins (you) can bypass protection rules |
| **Allow force pushes** | `false` |
| **Allow deletions** | `false` |
| **Required linear history** | `false` — merge commits allowed |

**Note:** `enforce_admins: false` means you (as repo admin) can push directly to master and bypass all checks — which is what we did for the docs migration commit earlier.

---

## 5. CI Analysis

### What CI checks:

| Check | Runs? | Tool | What it catches |
|-------|-------|------|-----------------|
| **TypeScript type checking (backend)** | Yes | `tsc --noEmit` | Type errors in NestJS code |
| **TypeScript type checking (frontend)** | Yes | `tsc --noEmit` + `next build` | Explicit type check + build errors |
| **Unit tests (backend)** | Yes | `jest --testPathPatterns=\.spec\.ts$` | Regressions in backend logic |
| **Production build (frontend)** | Yes | `next build` | Build errors, missing imports, dead code |
| **Linting (backend)** | **No** | — | Not checked in CI |
| **Linting (frontend)** | **No** | — | `pnpm lint` exists but is not in CI |
| **Unit tests (frontend)** | **No** | — | No frontend test runner in CI |
| **E2E tests** | **No** | — | No integration/E2E tests |
| **Dependency audit** | **No** | — | No `pnpm audit` or similar |

### What's missing:

1. **No linting in CI** — Both backend (`eslint`) and frontend (`eslint`) have lint commands but CI doesn't run them. Lint errors only get caught locally.
2. **No frontend unit tests** — No test runner configured for frontend.
3. **No E2E tests** — No Playwright, Cypress, or similar.

### What Claude Code can do locally instead:

| CI Check | Can Claude Code run it locally? | Command |
|----------|---------------------------------|---------|
| `backend-typecheck` | Yes — run before committing | `cd backend/crm-backend ; pnpm typecheck` |
| `backend-test` | Yes — run before pushing | `cd backend/crm-backend ; pnpm test:unit` |
| `frontend-build` | Yes — run before pushing | `cd frontend/crm-frontend ; pnpm build` |
| `frontend-typecheck` | Yes — even though CI doesn't | `cd frontend/crm-frontend ; pnpm typecheck` |
| `frontend-lint` | Yes — even though CI doesn't | `cd frontend/crm-frontend ; pnpm lint` |

Running these locally before creating PRs means CI becomes a safety net rather than the primary gatekeeper, and you'll never have to wait for CI to catch something Claude Code could have caught.

### Cleanup completed:

1. **`workflow-guidance.yml`** — Deleted (obsolete Cursor + Claude reviewer pipeline).
2. **`pr-labels.yml.disabled`** — Deleted (already disabled and obsolete).
3. **`ci.yml`** triggers — Updated to only `pull_request` on `master`. Push trigger to `dev` removed.
4. **`frontend-typecheck`** job — Added as 4th parallel CI job.
5. **Node/pnpm versions** — Updated to Node 24 / pnpm 10 (matches local).

---

## 6. Summary

```
┌──────────────────────────────────────────────────────────────┐
│                    CI PIPELINE (ci.yml)                       │
│                                                              │
│  Trigger: PR to master only                                  │
│  Node: 24, pnpm: 10                                         │
│                                                              │
│  ┌────────────┐ ┌─────────────┐ ┌──────────┐ ┌────────────┐ │
│  │backend-test│ │backend-type-│ │frontend- │ │frontend-   │ │
│  │            │ │check        │ │build     │ │typecheck   │ │
│  │ prisma gen │ │ prisma gen  │ │ pnpm inst│ │ pnpm inst  │ │
│  │ jest tests │ │ tsc --noEmit│ │ pnpm     │ │ tsc        │ │
│  │            │ │             │ │ build    │ │ --noEmit   │ │
│  └─────┬──────┘ └──────┬──────┘ └────┬─────┘ └─────┬──────┘ │
│        │               │             │              │        │
│        ▼               ▼             ▼              ▼        │
│        All 4 must pass for PR merge to master                │
└──────────────────────────────────────────────────────────────┘
```
