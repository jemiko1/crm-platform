# Development Workflow

> Canonical reference for the CRM-Platform branching strategy, commit conventions, and merge flow.

---

## Branch Model

| Branch | Purpose | Deploys to | Protected |
|--------|---------|------------|-----------|
| `master` | Production releases | Production | Yes -- PR required, CI must pass, 1 approval |
| `staging` | Pre-production validation | Staging env | Yes -- PR required, CI must pass |
| `dev` | Integration of feature work | Development env | Recommended -- CI must pass |
| `feature/*` | Short-lived feature branches | N/A | No |
| `hotfix/*` | Urgent production fixes | N/A | No |

## Branch Flow

```
feature/my-feature
       │
       ▼  (PR + CI)
      dev
       │
       ▼  (PR + CI)
    staging
       │
       ▼  (PR + CI + approval)
     master  ← production
```

### Feature development

1. Create a branch from `dev`:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/my-feature
   ```
2. Work on the feature with small, focused commits.
3. Push and open a PR to `dev`.
4. CI runs automatically; merge after checks pass.
5. Delete the feature branch after merge.

### Promoting to staging

1. Open a PR from `dev` to `staging`.
2. CI runs the full suite (lint, typecheck, unit tests, e2e tests, build).
3. After CI passes, merge into `staging`.
4. Deploy staging and perform manual validation if needed.

### Releasing to production

1. Open a PR from `staging` to `master`.
2. CI runs again on the PR.
3. Require at least 1 approval.
4. Merge. Tag the release: `git tag v1.x.x && git push origin v1.x.x`.

### Hotfix flow

For urgent production fixes:

1. Create a branch from `master`:
   ```bash
   git checkout master
   git pull origin master
   git checkout -b hotfix/fix-description
   ```
2. Fix the issue. Open a PR to `master`.
3. After merge to master, cherry-pick the fix into `staging` and `dev`:
   ```bash
   git checkout staging && git cherry-pick <commit-sha> && git push origin staging
   git checkout dev && git cherry-pick <commit-sha> && git push origin dev
   ```

---

## Commit Conventions

Use [Conventional Commits](https://www.conventionalcommits.org/) format:

```
<type>: <short description>

[optional body]
```

**Types:**
- `feat:` -- new feature
- `fix:` -- bug fix
- `refactor:` -- code change that neither fixes nor adds
- `test:` -- adding or updating tests
- `docs:` -- documentation only
- `chore:` -- build, CI, dependency changes
- `perf:` -- performance improvement

**Examples:**
```
feat: add building statistics endpoint
fix: handle null clientId in incident creation
test: add auth service unit tests
docs: update CI/CD setup guide
```

---

## Pull Request Guidelines

1. Title follows the same conventional format as commits.
2. Description explains **why**, not just what.
3. Link related issues if applicable.
4. Keep PRs small and focused (< 400 lines when possible).
5. All CI checks must pass before merge.
6. Squash-merge feature branches to keep history clean.

---

## Environment Setup

See the [TESTING.md](./TESTING.md) guide for database setup and running tests locally.

Backend (port 3000):
```bash
cd backend/crm-backend
cp .env.example .env       # edit with your local DB credentials
pnpm install
npx prisma migrate dev
pnpm start:dev
```

Frontend (port 4002 dev / 3002 prod):
```bash
cd frontend/crm-frontend
pnpm install
pnpm dev
```
