# CI Pipeline

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Location
`.github/workflows/ci.yml`

---

## Triggers
- **Pull requests** to `dev`, `staging`, `master`
- **Push** to `dev`

---

## Jobs (Parallel)

### Backend Tests
- `pnpm install --frozen-lockfile`
- `pnpm prisma generate`
- `pnpm test:unit`

### Backend Typecheck
- `pnpm install --frozen-lockfile`
- `pnpm prisma generate`
- `pnpm typecheck`

### Frontend Build
- `pnpm install --frozen-lockfile`
- `pnpm build`

---

## Caching
- pnpm store cached via `actions/setup-node` with `cache: pnpm`

---

## Branch Protection (Manual Setup)
- **master**: PR required, 1 approval, `backend-ci`, `frontend-ci` must pass
- **staging**: PR required, checks must pass
- **dev**: Recommended – checks must pass

---

## References
- **Full doc**: [`docs/CI_CD.md`](../../docs/CI_CD.md)
- **Workflow**: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)
