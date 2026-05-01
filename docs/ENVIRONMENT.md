# Environment & Access

> Reference detail. CLAUDE.md only points here. Update both when adding/removing an env var or access path.

## Environment Variables

### Backend (`backend/crm-backend/.env`)

`DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `PORT`, `CORS_ORIGINS`, `COOKIE_NAME`, `COOKIE_SECURE`, `VIBER_BOT_TOKEN`, `FB_PAGE_ACCESS_TOKEN`, `FB_APP_SECRET`, `FB_VERIFY_TOKEN`, `TELEGRAM_BOT_TOKEN`, `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `CLIENTCHATS_WEBHOOK_BASE_URL`, `TELEPHONY_INGEST_SECRET`, `AMI_ENABLED`, `AMI_HOST`, `AMI_PORT`, `AMI_USER`, `AMI_SECRET`, `ARI_ENABLED`, `ARI_BASE_URL`, `ARI_USER`, `ARI_PASSWORD`, `OPENAI_API_KEY`, `QUALITY_AI_ENABLED`, `QUALITY_AI_MODEL`, `ASTERISK_SIP_SERVER` (default: `5.10.34.153`), `TELEPHONY_AUTO_QUEUE_SYNC` (default `true`; kill-switch that disables link/unlink writes to FreePBX `queues_details` — see `docs/TELEPHONY_EXTENSION_MANAGEMENT.md`), `PBX_SSH_HOST` (default `5.10.34.153`), `PBX_SSH_USER` (default `root`), `PBX_SSH_KEY_PATH` (default `C:\Users\Administrator\.ssh\id_rsa_asterisk` — same key the AMI bridge uses; VM's `id_ed25519` is NOT authorized on the PBX), `PBX_SSH_TIMEOUT_MS` (default `70000`).

### Frontend (`frontend/crm-frontend/.env.local`)

`NEXT_PUBLIC_API_BASE` (default `http://localhost:3000`), `API_BACKEND_URL`.

### AMI Bridge (`.env` on VM)

`AMI_HOST`, `AMI_PORT`, `AMI_USER`, `AMI_SECRET`, `CRM_BASE_URL`, `TELEPHONY_INGEST_SECRET`, `BUFFER_MAX_SIZE`, `BUFFER_FLUSH_INTERVAL_MS`, `HEALTH_PORT`, `LOG_LEVEL`.

### Core Sync Bridge (`.env` on VM)

`CORE_MYSQL_HOST`, `CORE_MYSQL_PORT`, `CORE_MYSQL_USER`, `CORE_MYSQL_PASSWORD`, `CORE_MYSQL_DATABASE`, `CRM_WEBHOOK_URL`, `CRM_WEBHOOK_SECRET`, `POLL_INTERVAL_MINUTES`, `COUNT_CHECK_INTERVAL_MINUTES`, `NIGHTLY_REPAIR_HOUR`, `LOG_LEVEL`.

### Cross-process secret pairs (Silent Override Risks #2 and #2b)

These MUST match across processes:
- `TELEPHONY_INGEST_SECRET` (backend `.env`) ↔ `TELEPHONY_INGEST_SECRET` (AMI bridge `.env`)
- `CORE_WEBHOOK_SECRET` (backend `.env`) ↔ `CRM_WEBHOOK_SECRET` (core-sync-bridge `.env`)

## Remote Access

| Server | Access | VPN Required |
|--------|--------|-------------|
| Production VM (192.168.65.110) | `ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110` | Yes |
| Asterisk/FreePBX | `ssh asterisk` | Yes |
| Core MySQL (READ-ONLY) | `192.168.65.97:3306`, user `asg_tablau`, db `tttt` | Yes (via VM only) |
| Railway (staging) | `railway logs`, `railway status` (link to dev environment) | No |
| Production DB | `psql -U postgres -h 192.168.65.110` (from VM) or via Prisma Studio | Yes |
| Staging DB | `railway variables -s Postgres` for public URL (dev environment) | No |

OpenVPN is always-on (TAP adapter). If Asterisk SSH times out, check OpenVPN GUI.

`psql` is NOT installed locally. Use `npx prisma studio` or `docker exec -it crm-prod-db psql -U postgres` (local dev). For production: SSH to VM, then `C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm`.

## VM Infrastructure (192.168.65.110) — PRODUCTION

Windows Server 2022, public IP `5.10.36.43`, domain `crm28.asg.ge`. Full CRM stack under PM2 + Windows services:

| Service | Path on VM | Port | Description |
|---------|-----------|------|-------------|
| PostgreSQL 17 | `C:\postgresql17\` | 5432 | Production database (Windows service) |
| Nginx 1.27 | `C:\nginx\` | 80/443 | HTTPS reverse proxy (Windows service) |
| CRM Backend | `C:\crm\backend\crm-backend\` | 3000 | NestJS API (PM2) |
| CRM Frontend | `C:\crm\frontend\crm-frontend\` | 4002 | Next.js app (PM2) |
| AMI Bridge | `C:\ami-bridge\` | 3100 (health) | Asterisk AMI → CRM events (PM2) |
| Core Sync Bridge | `C:\core-sync-bridge\` | 3101 (health) | Core MySQL → CRM sync (PM2) |
| Operations Dashboard | `C:\crm\crm-monitor\` | 9090 | Monitoring UI at `/admin/monitor/` (PM2) |
| GitHub Actions Runner | `C:\actions-runner\` | — | Self-hosted runner for auto-deploy |

- **Auto-deploy**: Push to master → GitHub Actions → pulls, builds, migrates, restarts PM2
- **Dashboard**: `https://crm28.asg.ge/admin/monitor/` (password-protected)
- **SSL**: Let's Encrypt via win-acme, auto-renews
- **SSH tunnel**: AMI bridge reaches Asterisk (`5.10.34.153:5038`) via SSH tunnel on VM — port 5038 blocked at network level
- **Auto-start**: Windows Scheduled Task "PM2 Startup - CRM28" runs `pm2-startup.ps1` on boot (starts PostgreSQL → Nginx → PM2 resurrect)
- **Health check**: Scheduled task runs `health-check.ps1` every 2 minutes with auto-recovery
- **Docs**: `docs/AMI_BRIDGE.md`, `docs/CORE_INTEGRATION.md`, `docs/VM_MIGRATION_PLAN.md`
