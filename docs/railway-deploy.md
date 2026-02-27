# Railway Deployment Guide

## Architecture

Three Railway services inside one project:

| Service    | Source path              | Builder   |
|------------|--------------------------|-----------|
| **postgres** | — (Railway plugin)     | —         |
| **backend**  | `backend/crm-backend`  | Nixpacks  |
| **frontend** | `frontend/crm-frontend`| Nixpacks  |

---

## Backend Service (`backend/crm-backend`)

### Railway Settings

| Field         | Value                                       |
|---------------|---------------------------------------------|
| Root directory| `backend/crm-backend`                       |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Start command | `pnpm start:railway`                        |

`start:railway` runs: `prisma migrate deploy && node dist/main`

### Required Environment Variables

| Variable               | Example                                          | Notes                        |
|------------------------|--------------------------------------------------|------------------------------|
| `DATABASE_URL`         | `${{Postgres.DATABASE_URL}}`                     | Railway Postgres reference   |
| `JWT_SECRET`           | (random 64-char string)                          | **Must be unique per env**   |
| `JWT_EXPIRES_IN`       | `15m`                                            | Token lifetime               |
| `PORT`                 | (set automatically by Railway)                   | Do not override              |
| `CORS_ORIGINS`         | `https://crm28demo.asg.ge`                       | Comma-separated if multiple  |
| `COOKIE_SECURE`        | `true`                                           | Must be `true` in production |

Optional integrations (set only if used):

| Variable                    | Notes              |
|-----------------------------|--------------------|
| `VIBER_BOT_TOKEN`           | Viber chat         |
| `FB_PAGE_ACCESS_TOKEN`      | Facebook Messenger |
| `FB_APP_SECRET`             | Facebook Messenger |
| `FB_VERIFY_TOKEN`           | Facebook Messenger |
| `TELEGRAM_BOT_TOKEN`       | Telegram bot       |
| `WA_ACCESS_TOKEN`          | WhatsApp Business  |
| `WA_PHONE_NUMBER_ID`       | WhatsApp Business  |
| `WA_VERIFY_TOKEN`          | WhatsApp webhook   |
| `WA_APP_SECRET`            | WhatsApp signature |
| `CLIENTCHATS_WEBHOOK_BASE_URL` | Backend public URL for webhook registration (e.g. https://api.example.com) |
| `CORE_INTEGRATION_ENABLED`  | Core sync          |
| `CORE_WEBHOOK_SECRET`       | Core sync          |
| `TELEPHONY_INGEST_SECRET`   | Telephony          |

---

## Frontend Service (`frontend/crm-frontend`)

### Railway Settings

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Root directory| `frontend/crm-frontend`                        |
| Build command | `pnpm install --frozen-lockfile && pnpm build` |
| Start command | `pnpm start`                                   |

Next.js reads `PORT` automatically from the environment.

### Required Environment Variables

| Variable               | Example                                      | Notes                            |
|------------------------|----------------------------------------------|----------------------------------|
| `NEXT_PUBLIC_API_BASE` | `https://api-crm28demo.asg.ge`               | Backend public URL (no trailing slash) |
| `PORT`                 | (set automatically by Railway)               | Do not override                  |

---

## PostgreSQL Service

Add the **PostgreSQL** plugin from the Railway dashboard. Railway provides `DATABASE_URL` automatically — reference it in the backend service variables with `${{Postgres.DATABASE_URL}}`.

---

## Branch → Environment Mapping

| Git branch  | Railway environment | Domain                |
|-------------|---------------------|-----------------------|
| `staging`   | Staging             | crm28demo.asg.ge     |
| `master`    | Production          | (future)              |

Dev is local only — not deployed to Railway.

---

## First Deploy Checklist

1. Create Railway project with three services (Postgres, backend, frontend).
2. Set root directory for each service.
3. Set build and start commands per table above.
4. Configure all required env vars for each service.
5. Set `CORS_ORIGINS` on backend to point to the frontend Railway URL.
6. Set `NEXT_PUBLIC_API_BASE` on frontend to point to the backend Railway URL.
7. Deploy backend first (runs migrations), then frontend.
8. Run `prisma db seed` manually via Railway shell if you need the admin account.
