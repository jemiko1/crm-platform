# AI Working Rules

> Rules and guidelines for AI assistants (Cursor, Claude, Copilot) working on the CRM-Platform.

---

## Branch Rules

### CRITICAL: Never touch master or staging

The `master` branch is production. The `staging` branch is pre-production.
AI tools must **never**:
- Commit to `master` or `staging`
- Push to `master` or `staging`
- Merge any branch into `master` or `staging`
- Run `git checkout master` for the purpose of making changes
- Create PRs targeting `master` or `staging`

Only the developer manually promotes `dev → staging → master`.

### Allowed branches

| Branch | AI can commit? | AI can push? | AI can merge into? |
|--------|---------------|--------------|-------------------|
| `master` | **NO** | **NO** | **NO** |
| `staging` | **NO** | **NO** | **NO** |
| `dev` | Yes | Yes | Yes (via PR) |
| `feature/*` | Yes | Yes | Yes (into dev via PR) |
| `hotfix/*` | Yes | Yes | Yes (into dev via PR) |

### Creating branches

Always create feature branches from `dev`:
```bash
git checkout dev
git pull origin dev
git checkout -b feature/descriptive-name
```

### PR target branch

All PRs created by AI must target `dev`. Never target `master` or `staging`.

---

## Commit Standards

1. Use conventional commit format: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`.
2. Keep commits focused on a single logical change.
3. Never commit secrets, credentials, or `.env` files (only `.env.example` and `.env.test`).
4. Run `pnpm lint` and `pnpm test:unit` before committing.

---

## Code Standards

### Do not refactor unrelated code

When implementing a feature or fix, do not refactor code outside the scope of the task. File separate issues for refactoring opportunities.

### Follow existing patterns

- Backend: NestJS module pattern (module, service, controller, DTOs).
- Frontend: Next.js App Router with the existing component structure.
- See `DEVELOPMENT_GUIDELINES.md` for modal patterns, dynamic lists, and performance guidelines.

### Testing requirements

- New services should have unit tests (`.spec.ts` next to the source file).
- New API endpoints should be covered by e2e tests when they involve business logic.
- Use the test helpers in `test/helpers/test-utils.ts`.

### Dynamic lists

All dropdown values must use `useListItems()` hook -- never hardcode enum values. See `DEVELOPMENT_GUIDELINES.md` for details.

---

## Database Changes

1. Use `npx prisma migrate dev --name descriptive_name` to create migrations.
2. Never edit existing migration files after they have been applied.
3. Ensure migrations are backward-compatible (see `RELEASE_CHECKLIST.md`).
4. After schema changes, run `npx prisma generate` to update the client.

---

## Files to Never Modify

- `.env` (developer's local config -- not committed)
- `prisma/migrations/*/migration.sql` (applied migration files)
- `pnpm-lock.yaml` (only modify indirectly via `pnpm install`)

---

## Project Structure Reference

```
backend/crm-backend/      NestJS backend (port 3000)
frontend/crm-frontend/    Next.js frontend (port 4002 dev / 3002 prod)
docs/                      Canonical process documentation
.github/workflows/         CI pipeline
.cursor/rules/             AI assistant rules
```

---

## Quick Reference Commands

```bash
# Backend (from backend/crm-backend/)
pnpm start:dev          # Start dev server
pnpm lint               # Lint (no auto-fix)
pnpm lint:fix           # Lint with auto-fix
pnpm typecheck          # TypeScript type checking
pnpm test:unit          # Unit tests
pnpm test:e2e           # E2E tests (needs test DB)
pnpm build              # Production build

# Frontend (from frontend/crm-frontend/)
pnpm dev                # Start dev server
pnpm lint               # Lint
pnpm typecheck          # TypeScript type checking
pnpm build              # Production build

# Database (from backend/crm-backend/)
npx prisma migrate dev  # Create + apply migration
npx prisma generate     # Regenerate Prisma client
npx prisma studio       # Visual DB browser
```
