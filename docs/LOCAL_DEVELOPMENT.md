# Local development (CRM Platform)

You need **three** things running for a working login:

1. **PostgreSQL** (e.g. Docker) — database reachable at the URL in `backend/crm-backend/.env` (`DATABASE_URL`).
2. **Backend (NestJS)** — **port `3000`** by default. This is required for auth and all `/v1/*` APIs.
3. **Frontend (Next.js)** — e.g. port `4002` (`pnpm dev` in `frontend/crm-frontend`).

## Sign-in fails with “socket hang up” / Next “Failed to proxy …:3000”

The UI talks to the API via Next **rewrites** to `http://localhost:3000`. If **nothing healthy** is listening there, the dev server logs `Failed to proxy http://localhost:3000/auth/login Error: socket hang up` and sign-in fails.

**Very common:** you started `pnpm start:dev` while **another process already held port 3000**. Nest then logs **`EADDRINUSE: address already in use :::3000`** and **exits**, but the old (or wrong) process may still be bound to 3000 and reset connections.

**Fix:**

1. See what owns the port (PowerShell): `netstat -ano | findstr :3000`
2. Stop that PID: `taskkill /PID <pid> /F` (or stop the old terminal running Nest).
3. Start **one** backend: `cd backend/crm-backend` → `pnpm start:dev` and wait for **`Nest application successfully started`** with **no** `EADDRINUSE` line after it.
4. Retry `http://localhost:4002/login`.

## Login succeeds then immediately returns to login (no session)

Typical causes:

1. **`COOKIE_SECURE=true` on `http://localhost`** — Browsers do not store cookies marked `Secure` over plain HTTP, so the JWT is never saved. The API still returns 200, but the next `/auth/me` is unauthenticated.

   - **Fix:** In `backend/crm-backend/.env`, set `COOKIE_SECURE=false` for local HTTP, **or** rely on the backend behavior: when `NODE_ENV` is **not** `production`, the auth cookie is always sent with `Secure=false` so localhost works even if production env was copied.

2. **Backend not running on port 3000** — Same as below; login request never completes or fails.

## Why login fails with only the frontend

The frontend uses **Next.js rewrites** (`frontend/crm-frontend/next.config.ts`):

- `/auth/*` → `http://localhost:3000/auth/*` (or `API_BACKEND_URL` if set)
- `/v1/*` → `http://localhost:3000/v1/*`

If nothing listens on **3000**, the browser gets a failed / timed-out request when you submit login.

### Check quickly

- **Backend up?** Open `http://localhost:3000` — you should get a response (e.g. 404 from Nest, not “connection refused”).
- **Database up?** From `backend/crm-backend`:

  ```powershell
  echo "SELECT 1;" | npx prisma db execute --stdin
  ```

  Expect: `Script executed successfully.`

## PostgreSQL in Docker

If Postgres is published on a **non-default host port** (e.g. `5433->5432`), `DATABASE_URL` must use that host port:

```env
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5433/DATABASE_NAME"
```

Copy `backend/crm-backend/.env.example` to `backend/crm-backend/.env` and adjust user, password, port, and database name to match your container.

## First-time backend setup

From `backend/crm-backend`:

```powershell
# After .env exists with correct DATABASE_URL
npx prisma migrate deploy
pnpm seed:all    # runs permissions + system-lists + everything else
```

`pnpm seed:all` orchestrates all seeds in dependency order (permissions
first, then system-lists which now includes `CALL_REPORT_CATEGORY`, then
RBAC, employees, workflow, sales, etc.). This mirrors what the VM deploy
workflow runs on every push to master (PR #267).

Create an admin user if needed (see `prisma/seed.ts` or project scripts for `create-admin`).

### If `prisma migrate deploy` fails on `ClientChatStatus` / enum (PostgreSQL)

PostgreSQL does not allow using a **new** enum value in the same transaction as `ALTER TYPE ... ADD VALUE`. If a migration fails with:

`unsafe use of new value "LIVE" of enum type "ClientChatStatus"`

you must either:

1. **Use an empty local database** (simplest): create a new DB, point `DATABASE_URL` at it, run `npx prisma migrate deploy` again, then seed; or  
2. **Apply the failing steps manually** outside a transaction (run the `ALTER TYPE` in one session, commit, then run the `UPDATE` / remaining SQL), then mark the migration as applied with `npx prisma migrate resolve`.

Until migrations complete, the API may start but some features (e.g. client chat escalation cron) will log errors about missing tables.

## Run both servers

**Terminal 1 — API:**

```powershell
cd backend/crm-backend
pnpm start:dev
```

**Terminal 2 — UI:**

```powershell
cd frontend/crm-frontend
pnpm dev
```

Then open `http://localhost:4002` (or your Next port) and log in.

## Optional: point frontend at a different API URL

If the API runs on another host/port, set before starting Next:

```powershell
$env:API_BACKEND_URL="http://localhost:3000"
pnpm dev
```

Or add `API_BACKEND_URL` to `frontend/crm-frontend/.env.local` (see `.env.local.example` if present).

---

## Monday-morning preflight (production readiness check)

`scripts/monday-morning-preflight.sh` runs 18 production-readiness checks
against the VM + Asterisk. Useful as a local sanity check before any
high-stakes production window.

```bash
bash scripts/monday-morning-preflight.sh
```

Requires: OpenVPN connected, `~/.ssh/id_ed25519_vm` in place, `asterisk`
SSH alias configured. See `docs/TESTING.md` for the full check list.

---

## Troubleshooting

### Softphone registers with CRM but fails at `/v1/telephony/sip-credentials` with 403

The softphone was built after PR #257, which gated `/auth/device-token` and
`/v1/telephony/sip-credentials` behind the `softphone.handshake` permission.
If your locally-seeded user doesn't have this permission, the softphone will
log in but fail to fetch SIP credentials.

Fix locally:
```powershell
cd backend\crm-backend
pnpm seed:permissions   # reseeds latest permission catalog
```

Then in the CRM admin UI (`/app/admin/role-groups`), assign
`softphone.handshake` to the RoleGroup your local user belongs to.

Production RoleGroups that have it: `ADMINISTRATOR`, `CALL_CENTER`,
`CALL_CENTER_MANAGER`, `IT_TESTING`.

### Socket.IO `/telephony` connects but disconnects immediately (401 / "Invalid token")

Likely cause: code still reading `payload.id` from the JWT instead of
`payload.sub`. Since PR #250, all gateways standardize on `sub`. Check
any WsJwtGuard or payload-extraction you wrote against this convention.

### `sipPassword` missing in `/auth/me` response

This is correct behavior since PR #249. `/auth/me` no longer returns
the SIP secret. The softphone fetches it via
`GET /v1/telephony/sip-credentials` (see Phone flow in
`docs/TELEPHONY_INTEGRATION.md`).
