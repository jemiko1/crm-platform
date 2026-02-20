# CI/CD Pipeline

> How the GitHub Actions CI pipeline works and how to configure branch protection.

---

## Pipeline Overview

The CI runs via `.github/workflows/ci.yml` and triggers on:

- **Pull requests** to `dev`, `staging`, or `master`
- **Push** to `staging` or `master`

It runs **two parallel jobs**: Backend and Frontend.

### Backend Job

| Step | What it does |
|------|-------------|
| Install | `pnpm install --frozen-lockfile` |
| Prisma generate | Generates the Prisma client from the schema |
| Lint | `pnpm lint` (ESLint) |
| Typecheck | `pnpm typecheck` (`tsc --noEmit`) |
| Unit tests | `pnpm test:unit` (Jest, no DB) |
| Migrate | `prisma migrate deploy` against the CI Postgres container |
| E2E tests | `pnpm test:e2e` (Jest + Supertest, real Postgres) |
| Build | `pnpm build` (NestJS compile) |

The backend job uses a **Postgres 16 service container** so e2e tests have a real database.

### Frontend Job

| Step | What it does |
|------|-------------|
| Install | `pnpm install --frozen-lockfile` |
| Lint | `pnpm lint` (ESLint) |
| Typecheck | `pnpm typecheck` (`tsc --noEmit`) |
| Build | `pnpm build` (Next.js production build) |

### Caching

pnpm store is cached via `actions/setup-node` with `cache: pnpm`. This avoids re-downloading dependencies on every run.

### Concurrency

The workflow uses `concurrency` with `cancel-in-progress: true`, so pushing a new commit to the same branch cancels any in-flight CI run.

---

## GitHub Branch Protection Setup

> You must configure these settings in GitHub's repository settings. They cannot be set via code.

### Settings path

GitHub > Repository > Settings > Branches > Branch protection rules > Add rule

### master (production)

| Setting | Value |
|---------|-------|
| Branch name pattern | `master` |
| Require a pull request before merging | Yes |
| Required approving reviews | 1 |
| Dismiss stale reviews | Yes |
| Require status checks to pass | Yes |
| Required checks | `backend-ci`, `frontend-ci` |
| Require branches to be up to date | Yes |
| Do not allow bypassing | Yes |
| Restrict pushes | Only through PRs |
| Allow force pushes | No |
| Allow deletions | No |

### staging (pre-production)

| Setting | Value |
|---------|-------|
| Branch name pattern | `staging` |
| Require a pull request before merging | Yes |
| Required approving reviews | 0 (optional) |
| Require status checks to pass | Yes |
| Required checks | `backend-ci`, `frontend-ci` |
| Allow bypassing for maintainers | Yes (for hotfix merges) |
| Allow force pushes | No |

### dev (integration) -- recommended

| Setting | Value |
|---------|-------|
| Branch name pattern | `dev` |
| Require a pull request before merging | Optional (can allow direct push) |
| Require status checks to pass | Yes |
| Required checks | `backend-ci`, `frontend-ci` |
| Allow force pushes | No |

### Step-by-step instructions

1. Go to your repository on GitHub.
2. Click **Settings** > **Branches**.
3. Click **Add branch protection rule** (or **Add classic branch protection rule**).
4. Enter the branch name pattern (e.g., `master`).
5. Enable the checkboxes per the tables above.
6. Under "Require status checks to pass before merging":
   - Search for `backend-ci` and `frontend-ci` (these are the job names from the CI workflow).
   - Note: the checks will only appear after the CI has run at least once.
7. Click **Create** (or **Save changes**).
8. Repeat for `staging` and `dev`.

---

## Secrets and Environment Variables

The CI workflow does **not** require any repository secrets for Phase 1. All test environment variables are hardcoded in the workflow:

- `DATABASE_URL` -- points to the Postgres service container
- `JWT_SECRET` -- a throwaway CI test secret
- `JWT_EXPIRES_IN` -- set to 1h

For future deployment steps (Phase 2+), you will need to add secrets for:
- Production `DATABASE_URL`
- Production `JWT_SECRET`
- Any SMTP/Twilio credentials

---

## Troubleshooting

### CI fails on "prisma migrate deploy"

The Postgres service container may not be ready. The workflow includes health checks (`--health-cmd pg_isready`), but if you see connection errors, add a sleep step before migrations.

### E2E tests are flaky

Each test calls `resetDatabase()` which truncates all tables between tests. If you see data bleed between tests, ensure `--runInBand` is set (it is in `test:e2e`), and that every test calls `resetDatabase` in `beforeEach`.

### Checks not appearing in branch protection

Status checks only appear in the GitHub UI after the CI workflow has run at least once. Push a commit or open a PR to trigger the first run, then configure branch protection.
