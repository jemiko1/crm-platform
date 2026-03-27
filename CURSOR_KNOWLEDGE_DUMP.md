# CURSOR_KNOWLEDGE_DUMP.md — Everything Cursor Knows That CLAUDE.md Doesn't

> Generated: 2026-03-24 | Final knowledge transfer before Claude Code migration
> **DO NOT COMMIT** — contains infrastructure details and internal knowledge

---

## 1. Workarounds & Gotchas

### Prisma Quirks

**`@prisma/adapter-pg` pool management:**
`PrismaService` extends `PrismaClient` but also creates a raw `pg.Pool` for the adapter. On module destroy, it must call BOTH `this.$disconnect()` AND `this.pool.end()`. If the pool isn't ended, the Node process can hang on shutdown (open TCP connections keep the event loop alive). There is no `enableShutdownHooks()` call anywhere — lifecycle is purely NestJS module-based.

**`prisma.config.ts` fallback URL:**
The file at `backend/crm-backend/prisma.config.ts` (NOT inside `prisma/`) provides a dummy `postgresql://build:build@localhost:5432/build` when `DATABASE_URL` is unset. This allows `prisma generate` to succeed in CI/build environments that don't have a real database. If you see "build:build" in logs, it means `DATABASE_URL` isn't set.

**Enum migration failure (PostgreSQL):**
PostgreSQL cannot use a new enum value in the same transaction that adds it. If a migration fails with `unsafe use of new value "LIVE" of enum type "ClientChatStatus"`, you must either:
1. Use a fresh empty database and re-run all migrations, OR
2. Apply the failing `ALTER TYPE` manually outside a transaction, then `npx prisma migrate resolve --applied <migration_name>`

**Seed scripts have an orchestrator:**
There are 8 seed scripts (`seed.ts` + 7 `seed-*.ts`) plus `seed-all.ts` which runs them all in the correct dependency order. Use `pnpm seed:all` to run everything. The `start:railway` script only runs `seed-permissions.ts` (idempotent, safe for prod).
The others (`seed-employees.ts`, `seed-rbac.ts`, `seed-position-settings.ts`) are optional/one-time.

**`seed-rbac.ts` vs `seed-permissions.ts`:**
These overlap. `seed-permissions.ts` is the canonical one (used in `start:railway`). `seed-rbac.ts` is an older comprehensive seed that also creates role groups and positions. Don't run both — `seed-permissions.ts` is authoritative.

**Schema is one 2125-line file:**
All 70+ models in a single `schema.prisma`. No multi-file schema setup. This makes `prisma format` slow and diffs noisy. Breaking it up would require Prisma's `prismaSchemaFolder` preview feature.

### Next.js Quirks

**Tailwind v4 has no config file:**
Tailwind CSS v4 uses the PostCSS plugin at `@tailwindcss/postcss` and theme tokens live in `globals.css`. There is NO `tailwind.config.ts` or `tailwind.config.js`. If you create one, it will be ignored. Custom colors, spacing, etc. go in CSS `@theme` blocks.

**`pnpm dev` defaults to port 4002:**
The `dev` script in `package.json` hardcodes `-p 4002`. Don't use `--port 3002` — that's outdated. Port 4000 is reserved/blocked by Chrome.

**Frontend `start` script uses shell variable:**
`"start": "next start --port ${PORT:-3000}"` — this bash syntax works on Railway (Linux) but NOT in PowerShell locally. If you need to run production mode locally, set `PORT` env var first or use `next start --port 3000` directly.

**API client returns `undefined as T` on empty responses:**
`apiGet`, `apiPost`, etc. return `undefined as T` when the response has no JSON body (e.g. 204 No Content). Callers must handle this — don't destructure the result without checking.

**401 handler creates a never-resolving Promise:**
When `api.ts` gets a 401, it redirects to `/login?expired=1&next=...` and then returns `new Promise(() => {})` — a Promise that never resolves or rejects. This prevents downstream code from executing during navigation, but can confuse async/await callers expecting an error.

**`next.config.ts` rewrites (production guard ADDED):**
Three rewrite rules: `/auth/*`, `/v1/*`, `/public/*` → backend. The backend URL comes from `API_BACKEND_URL` env var. In production (Railway), the app crashes on startup if this env var is missing — prevents silent proxy-to-localhost failures. Defaults to `http://localhost:3000` only in local dev.

### Socket.IO Quirks

**Telephony gateway cookie name (FIXED):**
Both telephony and messenger gateways now use `process.env.COOKIE_NAME ?? 'access_token'` for cookie extraction. Previously, the telephony gateway hardcoded `'access_token'`.

**JWT_SECRET fallback removed (FIXED):**
`auth.module.ts`, `jwt.strategy.ts`, and `messenger.gateway.ts` no longer fall back to `"dev-secret"`. The app crashes on startup if `JWT_SECRET` is not set (guard in `main.ts`).

**No server-side reconnect for Socket.IO:**
There is no server-side ping/reconnect logic. The client (browser/Electron) handles reconnection via Socket.IO client's built-in reconnect. On reconnect, the server runs `handleConnection` again, re-authenticates from cookie, and re-joins rooms.

**Messenger deduplication is client-side:**
When sending a message, the gateway emits `message:new` to both the conversation room AND each participant's `employee:{id}` room. A client in both rooms will receive the event twice. The client must deduplicate.

**Client Chats WebSocket namespace:**
The client chats WebSocket is at `/ws/clientchats` — not `/clientchats`. This is different from messenger (`/messenger`) and telephony (`/telephony`). Don't change this namespace.

### Windows / PowerShell Quirks

**No `&&` chaining:**
PowerShell uses `;` to chain commands. `&&` is not supported (or behaves differently in PS7). All scripts, CI instructions, and CLI examples must use `;`.

**No heredoc in PowerShell:**
`cat <<'EOF'` doesn't work. For multi-line git commits, use multiple `-m` flags or write to a temp file.

**CRLF warnings:**
Git will constantly warn about LF → CRLF conversion. This is cosmetic. The `.gitattributes` should handle it but you'll see warnings on every `git add`.

**`wc -l` doesn't exist:**
Use `(Get-Content file | Measure-Object -Line).Lines` instead.

### Other Library Quirks

**`asterisk-manager` is CommonJS:**
The AMI client uses `require('asterisk-manager')` — it's a legacy CommonJS package. In TypeScript, import carefully.

**`bcrypt` AND `bcryptjs` are both installed:**
Two bcrypt libraries in `package.json`. `bcrypt` is the native one (needs build tools), `bcryptjs` is pure JS. Check which one is actually imported in auth — likely `bcryptjs` for portability.

**Throttler is global (partially FIXED):**
`ThrottlerGuard` is registered as `APP_GUARD` in `app.module.ts` — 60 requests per 60 seconds per IP. `@SkipThrottle()` is now applied to: webhook endpoints (`ClientChatsPublicController`), telephony ingestion (`TelephonyIngestionController`), and health check (`HealthController`).

**`rawBody` is enabled globally:**
`NestFactory.create(AppModule, { rawBody: true })` — this buffers the raw request body for ALL requests, not just webhooks. Only consumed by Facebook and WhatsApp adapters for HMAC signature verification via `(req as any).rawBody`.

---

## 2. Deployment Specifics

### Railway Configuration

**No Railway config files in the repo** — no `railway.json`, `railway.toml`, `nixpacks.toml`, or `Procfile`. Railway uses Nixpacks auto-detection.

**Railway project:** CRM28, environment: production, service: crm-backend

**Build command (configured in Railway dashboard, not in repo):**
```
cd backend/crm-backend && pnpm install && pnpm build
```
The `pnpm build` script does: `prisma generate && nest build`

**Start command:**
```
cd backend/crm-backend && pnpm start:railway
```
Which expands to: `prisma migrate deploy && npx tsx prisma/seed-permissions.ts && node dist/main`

**What happens on every deploy:**
1. Railway detects push to `master`
2. Nixpacks builds: installs pnpm, runs `pnpm install`, runs `pnpm build` (generates Prisma client + compiles NestJS)
3. On start: `prisma migrate deploy` runs any pending migrations
4. `seed-permissions.ts` upserts permissions (idempotent, safe to run repeatedly)
5. `node dist/main` starts the server

**Frontend is deployed separately** — it has its own Railway service. Uses `next start --port ${PORT:-3000}` where Railway sets `PORT`.

**Key env vars on Railway (backend):**
- `DATABASE_URL` — Railway internal PostgreSQL URL
- `JWT_SECRET` — production secret (NOT "dev-secret")
- `JWT_EXPIRES_IN` — "24h"
- `CORS_ORIGINS` — comma-separated production origins including `https://crm28.asg.ge`
- `PORT` — set by Railway automatically
- All channel tokens (Viber, Facebook, Telegram)
- `TELEPHONY_INGEST_SECRET` — must match AMI Bridge's config
- `AMI_ENABLED` — likely "false" on Railway (AMI Bridge handles the connection)

### How to Check if Deployment Succeeded

```powershell
railway logs                    # Stream live logs, watch for "Nest application successfully started"
railway status                  # Check service status
```

Or check the Railway dashboard for build logs and deploy status.

### How to Rollback

Railway keeps previous deployments. In the Railway dashboard:
1. Go to Deployments tab
2. Find the last working deployment
3. Click "Rollback" / redeploy that commit

Or via CLI: push a revert commit to `master` → Railway auto-deploys.

### Post-Deployment Checks

1. Check Railway logs for clean startup (no migration errors, no missing env vars)
2. Hit `https://crm28.asg.ge/auth/login` — should return the login page
3. Hit `https://crm28.asg.ge/api` — should show Swagger UI
4. Hit `https://crm28.asg.ge/health` — should return `{"status":"ok"}` with DB + memory checks

---

## 3. Asterisk / Telephony Specifics

### SSH Connection

```powershell
# VPN must be connected first (OpenVPN TAP adapter must be Up)
ssh root@5.10.34.153
```
Auth: ed25519 key at `C:\Users\Geekster PC\.ssh\id_ed25519`. No password needed.

### AMI Bridge (runs on a separate Windows VM)

**Location:** The AMI Bridge code is in `ami-bridge/` in the repo, but it runs on a Windows VM that has network access to both the Asterisk server and the internet (Railway).

**How to restart:**
```bash
# On the VM:
pm2 restart ami-bridge
# Or full restart:
pm2 stop ami-bridge
pm2 start dist/main.js --name ami-bridge
pm2 logs ami-bridge     # Watch output
```

**How to check if telephony is working:**
1. Check AMI Bridge logs on the VM (`pm2 logs ami-bridge`) — should show "AMI connected" and periodic status reports every 60 seconds
2. Check Railway backend logs — should show incoming `POST /v1/telephony/events` requests
3. In the CRM UI, go to Call Center → Active Calls — should show real-time data
4. Make a test call through the PBX and verify events appear

### Asterisk Config Files

AMI user config lives at `/etc/asterisk/manager_custom.conf` on the FreePBX server. The repo has a template at `ami-bridge/asterisk/manager_custom.conf`. Key details:
- AMI user: `crm_ami` (in the template)
- Required permissions: `cdr,reporting,call,agent` (read)
- After editing: `asterisk -rx "manager reload"` to apply
- Verify: `asterisk -rx "manager show user crm_ami"`

### Common Telephony Issues

**"Cannot connect to AMI":**
- Check VPN is connected
- `telnet 5.10.34.153 5038` from the VM — should get "Asterisk Call Manager"
- Check firewall on Asterisk: `iptables -L -n | grep 5038`
- Verify AMI is enabled: `grep enabled /etc/asterisk/manager.conf`

**"Events not reaching CRM":**
- Check `TELEPHONY_INGEST_SECRET` matches between AMI Bridge `.env` and Railway env vars
- Check `CRM_BASE_URL` in AMI Bridge `.env` points to the correct Railway URL
- Test manually: `curl -X POST <CRM_BASE_URL>/v1/telephony/events -H "x-telephony-secret: <secret>" -H "Content-Type: application/json" -d '{"events":[]}'`

**"AMI Bridge reconnecting in a loop":**
- Asterisk may have restarted. AMI Bridge auto-reconnects with exponential backoff (2s → 4s → 8s → ... up to 60s)
- Check `pm2 logs ami-bridge` — look for reconnect attempt messages
- On the PBX: `asterisk -rx "core show version"` to verify Asterisk is running

**Buffer re-queue risk (mitigated):**
The AMI Bridge event buffer re-queues failed batches at the front of the queue. A max queue size of 5000 events with oldest-event eviction prevents unbounded memory growth. The CRM poster also logs stale-ingest warnings after 5 minutes of no successful POST. Restart the bridge after fixing the backend if it has been down for a long time.

---

## 4. Common Debugging Patterns

### Frontend Shows Blank Page

1. **Check browser console** — most common: React hydration error or uncaught exception
2. **Check if backend is running** — `http://localhost:3000` should respond. If not, the Next.js rewrites fail silently
3. **Check for hook order errors** — React hooks MUST be called before any conditional returns. A `useEffect` after an early `if (!data) return null` will crash
4. **Check for modal stack issues** — if `modal-stack-context.tsx` throws, the entire app layout crashes because it wraps all authenticated pages
5. **Check the `layout.tsx`** — `frontend/crm-frontend/src/app/app/layout.tsx` wraps everything. If MessengerContext, ModalStackContext, or I18nContext throws during initialization, the whole shell is blank

### API Returns 500

1. **Check Railway logs** (production) or NestJS terminal output (local) — the `HttpExceptionFilter` logs all errors
2. **Most common cause:** Prisma query error — null constraint violation, unique constraint violation, or relation not found
3. **Error response shape:** `{ statusCode, timestamp, path, message, error? }` — the `message` field contains the actual error
4. **Incident creation without client:** Known bug — creating an incident without `clientId` causes a null constraint violation in Prisma. The backend expects optional client but the schema has a required relation somewhere
5. **Missing Prisma generate:** If you changed the schema and didn't run `pnpm prisma generate`, the Prisma client is out of sync and will throw type errors at runtime

### Socket.IO Disconnects

1. **Check if JWT expired** — Socket.IO authenticates on connect via cookie. If the JWT expires (24h), the next reconnect will fail
2. **Check CORS** — Socket.IO needs credentials. The gateways use `getCorsOrigins()` from `cors.ts`. If the frontend URL isn't in `CORS_ORIGINS` or the default list, WebSocket upgrade fails
3. **Check namespace** — Messenger is `/messenger`, Telephony is `/telephony`, Client Chats is `/ws/clientchats`. Wrong namespace = silent connection failure
4. **Check for multiple Socket.IO client instances** — React strict mode in dev can mount components twice, creating duplicate connections. The contexts should handle cleanup in `useEffect` return functions

### Prisma Migration Fails

1. **Enum issue:** See the PostgreSQL enum gotcha above. Fresh DB or manual apply + resolve.
2. **Drift:** If you manually changed the DB, run `prisma migrate diff` to see what's out of sync
3. **Shadow database:** Prisma needs a shadow database for `migrate dev`. The Docker container must be running.
4. **Railway deploy:** If `prisma migrate deploy` fails on Railway, the server won't start. Check Railway logs for the exact migration error. You may need to manually fix the production DB via Railway's database dashboard.

### Railway Deployment Fails

1. **Build failure:** Usually a TypeScript error that CI didn't catch (CI uses Node 20, Railway may use a different version via Nixpacks). Check build logs in Railway dashboard.
2. **Start failure:** Check if `DATABASE_URL` and other required env vars are set in Railway. Missing `JWT_SECRET` will crash the app on startup (hard guard in `main.ts`).
3. **Migration failure on start:** `prisma migrate deploy` runs before the server. If a migration fails, the server never starts. Check logs for the Prisma error.
4. **Memory:** Railway free tier has memory limits. If the backend runs out of memory (large queries, memory leaks in cron jobs), the container restarts.

---

## 5. Things That Are Fragile

### Fragile Code Areas

**`modal-stack-context.tsx` — browser history state:**
This file manages a LIFO modal stack synced with browser history via `pushState`/`replaceState`/`popstate`. It uses a `handlingPopstateRef` flag and `requestAnimationFrame` to avoid infinite loops. Any change to the modal open/close logic can break back-button behavior across the entire app. The priority order for reading modals from URL params is: messenger → incident → workOrder → employee → client → building. Changing this order breaks deep links.

**Client chat `processInbound()` pipeline:**
The pipeline order in `clientchats-core.service.ts` is: dedupe → upsertParticipant → upsertConversation → saveMessage → autoMatch → emit events. Reordering breaks things — e.g., saving a message before the conversation exists causes a foreign key error.

**Client chat `joinConversation()` optimistic lock:**
In `assignment.service.ts`, joining a conversation uses raw SQL `UPDATE ... WHERE assignedUserId IS NULL RETURNING id` to prevent two agents from claiming the same conversation. NEVER replace this with a regular Prisma update — it creates a race condition.

**Client chat display name logic:**
`isBetterName()` in the core service prevents overwriting real customer names with fallback names (Unknown, TG User, phone numbers, etc.). If this check is removed or weakened, customer names get permanently corrupted in the database.

**Closed conversation → new thread archival:**
When a conversation is closed and a new message arrives from the same external thread, the old conversation's `externalConversationId` is rewritten to `${id}__archived_${Date.now()}`. This allows the external ID to be reused on the new conversation. Changing this archival pattern breaks conversation threading.

### Features That Depend on Ordering

**Work order product approval flow:**
Technician submits products → status changes → head reviews → approves (inventory deducted) or rejects. If inventory deduction happens before approval, stock goes negative.

**Employee deletion requires delegation:**
You can't hard-delete an employee who has active leads or work orders. The system requires delegating those items first. Bypassing this check orphans records.

**Seed script order matters (first time only):**
Permissions must be seeded before workflow steps (workflow steps reference positions which need role groups which need permissions). Run `seed-permissions.ts` first.

### Known Race Conditions

**Message deduplication (client chats — FIXED):**
The `saveMessage` method now catches P2002 unique constraint violations on `externalMessageId` and returns the existing record instead of throwing a 500. Previously, two identical webhook deliveries could both pass `findUnique` before either inserts.

**WhatsApp 24h window check:**
A new conversation from a closed one may briefly have no inbound messages. The code works around this with a 5-minute grace period using `previousConversationId`.

**AMI Bridge buffer re-queue (partially FIXED):**
Failed POST batches are still `unshift`ed back to the front of the queue, but the buffer now has a max queue size (5000 events) with oldest-event eviction. The CRM poster also tracks `lastSuccessAt` and logs a warning when no successful ingest has occurred for 5+ minutes.

### Performance / Memory Concerns

**Single Prisma schema (2125 lines):**
Every `prisma generate` parses the entire file. This is slow but functional.

**AMI Bridge in-memory call state:**
The event mapper keeps a `Map` of call state per `linkedId`. Stale entries are cleaned on hangup/CDR, but if events are lost, entries can accumulate.

**Escalation cron runs every minute (overlap-guarded):**
`escalation.service.ts` checks for conversations needing escalation every 60 seconds with a `processing` flag to prevent overlapping runs. This queries the database on every tick. On a large dataset with many open conversations, this could become expensive.

**Quality AI pipeline (overlap-guarded):**
`quality-pipeline.service.ts` runs every 2 minutes (configurable) and sends call recordings to OpenAI Whisper + GPT-4o. Each processing cycle can be expensive and slow. Has a `processing` flag to prevent overlapping runs.

**No pagination on some admin endpoints:**
Some admin CRUD endpoints fetch all records. For tables with thousands of rows, this causes slow responses and large payloads.

---

## 6. Credentials & Connection Details

### SSH to Asterisk

```powershell
# Requires: OpenVPN connected, ed25519 key at ~/.ssh/id_ed25519
ssh root@5.10.34.153
```

### Railway CLI

```powershell
# Authenticated via browser OAuth (j.bodokia@gmail.com)
railway status                    # Project: CRM28, env: production, service: crm-backend
railway logs                      # Stream production logs
railway variables                 # List env vars (values redacted in CLI output)
railway shell                     # Open shell in production container
```

### GitHub CLI

```powershell
# Authenticated via keyring (account: jemiko1)
# Token scopes: gist, read:org, repo
# Git operations: HTTPS protocol via Windows Credential Manager
gh pr create --base master --title "feat(scope): ..."
gh pr list
gh run list
```

### Database Connection Strings

**Local (Docker):**
```
postgresql://<USER>:<PASSWORD>@localhost:5433/<DB_NAME>
```
Container name: `crm-prod-db`, image: `postgres:16`, host port: `5433` → container port: `5432`

**Production (Railway):**
```
postgresql://<USER>:<PASSWORD>@<RAILWAY_HOST>:<PORT>/<DB_NAME>
```
Not directly accessible. Use `railway connect postgres` or the Railway dashboard SQL editor.

### API Keys & Tokens (locations only)

| Secret | Location | Notes |
|--------|----------|-------|
| JWT_SECRET | `backend/crm-backend/.env` (local), Railway env vars (prod) | Required — app crashes on startup if missing |
| DATABASE_URL | Same locations | Different values local vs prod |
| VIBER_BOT_TOKEN | Same locations | Viber channel bot |
| FB_PAGE_ACCESS_TOKEN | Same locations | Facebook Messenger |
| FB_APP_SECRET | Same locations | Used for webhook HMAC verification (rawBody) |
| TELEGRAM_BOT_TOKEN | Same locations | Telegram bot |
| OPENAI_API_KEY | Same locations | GPT-4o + Whisper for call quality |
| TELEPHONY_INGEST_SECRET | Backend .env + AMI Bridge .env (on VM) | Must match between both |
| AMI credentials | Backend .env + AMI Bridge .env | AMI_USER, AMI_SECRET |
| ARI credentials | Backend .env | ARI_USER, ARI_PASSWORD |
| SSH private key | `C:\Users\Geekster PC\.ssh\id_ed25519` | For Asterisk server access |
| GitHub token | Windows Credential Manager (keyring) | For `gh` CLI and git push |
| Railway token | Railway CLI internal storage | OAuth-based login |
| VPN certs | `C:\Users\Geekster PC\OpenVPN\config\` | OpenVPN client certificates |

---

## Appendix: Scheduled Tasks (Cron Jobs)

| Service | Schedule | What it does |
|---------|----------|-------------|
| `escalation.service.ts` | Every 1 minute | Checks client chat conversations for escalation rules |
| `cdr-import.service.ts` | Every 5 minutes | Imports CDR records from Asterisk CDR database |
| `asterisk-sync.service.ts` | Every 5 minutes | Syncs extension/queue state from Asterisk |
| `quality-pipeline.service.ts` | Every 2 minutes (configurable) | Processes pending call quality reviews via OpenAI |

## Appendix: Module Lifecycle Hooks

**`onModuleInit` (runs on startup):**
- `PrismaService` — connects to database
- `PermissionsService` — initializes permission cache
- `AmiClientService` — connects to Asterisk AMI (if enabled)
- `AmiEventMapperService` — subscribes to AMI events
- `AriClientService` — connects to Asterisk ARI (if enabled)
- `TelephonyGateway` — subscribes to AMI event broadcasts
- `TelephonyStateManager` — initializes agent state
- `AsteriskSyncService` — runs initial sync
- `TelegramPollingService` — starts Telegram bot polling

**`onModuleDestroy` (runs on shutdown):**
- `PrismaService` — disconnects + ends pg pool
- `AmiClientService` — disconnects from AMI
- `TelegramPollingService` — stops polling

## Appendix: Things NOT Wired Up

- WhatsApp adapter: schema and models exist, adapter code is partial, no production channel account.
- Web chat widget: backend channel type exists, no embeddable frontend widget.
- `RolesModule` (legacy role system) is still imported in `AppModule` alongside the newer Position-based RBAC. Both coexist.

## Appendix: Issues Fixed (2026-03-24)

| # | Issue | Fix |
|---|-------|-----|
| 1 | JWT_SECRET "dev-secret" fallback | Removed all fallbacks, crash guard in main.ts |
| 2 | AMI Bridge no stale-ingest alerting | lastSuccessAt tracking + 5-min warning in crm-poster |
| 3 | Telephony gateway hardcoded cookie name | Uses COOKIE_NAME env var now |
| 4 | CI version drift (Node 20/pnpm 9) | CI updated to Node 24/pnpm 10 |
| 6 | AMI Bridge buffer memory leak | Max 5000 events with oldest-event eviction |
| 7 | Escalation cron overlap | processing flag guard added |
| 9 | ThrottlerGuard on webhooks | @SkipThrottle() on public, ingestion, health controllers |
| 11 | HealthModule not imported | Imported in AppModule, @SkipThrottle added |
| 13 | Seed script ordering | seed-all.ts orchestrator + pnpm seed:all |
| 14 | API_BACKEND_URL silent failure | Crash in production if not set, warn in dev |
| 15 | Message dedup race condition | P2002 catch returns existing record |
