# Deployment

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Platform
**Railway** – crm28.asg.ge

---

## Services
| Service | Root | Build | Start |
|---------|------|-------|-------|
| postgres | — (plugin) | — | — |
| backend | `backend/crm-backend` | `pnpm install --frozen-lockfile && pnpm build` | `pnpm start:railway` |
| frontend | `frontend/crm-frontend` | `pnpm install --frozen-lockfile && pnpm build` | `pnpm start` |

---

## Domains
- **Option A**: Single domain – frontend + API on `https://crm28.asg.ge`
- **Option B** (recommended): Frontend `https://crm28.asg.ge`, API `https://api.crm28.asg.ge`

---

## Backend Env (Production)
- `DATABASE_URL` (Railway Postgres ref)
- `JWT_SECRET`, `JWT_EXPIRES_IN`
- `CORS_ORIGINS`, `COOKIE_SECURE`
- `CLIENTCHATS_WEBHOOK_BASE_URL`

---

## Frontend Env (Production)
- `API_BACKEND_URL` (or `NEXT_PUBLIC_API_BASE`)
- `PORT` (Railway sets)

---

## Flow
1. Merge to staging/master
2. Push
3. Railway auto-deploys from branch
4. Add custom domains in Railway dashboard

---

## References
- **Full guide**: [`docs/RAILWAY_PRODUCTION_DEPLOY.md`](../../docs/RAILWAY_PRODUCTION_DEPLOY.md)
- **Release**: [`docs/RELEASE_CHECKLIST.md`](../../docs/RELEASE_CHECKLIST.md)
- **Railway deploy**: [`docs/railway-deploy.md`](../../docs/railway-deploy.md)
