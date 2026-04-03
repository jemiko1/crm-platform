# VM Migration Plan — COMPLETED ✅

> **Migration completed April 3, 2026.** VM is production (crm28.asg.ge, public IP 5.10.36.43).
> Railway is staging only (crm28demo.asg.ge, deploys from `dev` branch).
> The plan below is kept as a historical reference.

## Current State (as of 2026-04-01)

| Component | Points To | Status |
|-----------|-----------|--------|
| **Railway** | master branch, auto-deploy | ✅ PRODUCTION — do not touch |
| **AMI Bridge** | Railway backend URL | ✅ Working — do not touch |
| **Core Sync Bridge** | Railway webhook URL | ✅ Working — do not touch |
| **VM Backend** | localhost:3000 on VM | ✅ Running, accessible at http://192.168.65.110:8080 (VPN only) |
| **VM Frontend** | localhost:4002 on VM | ✅ Running via Nginx |
| **VM Database** | PostgreSQL 17 on VM | ✅ Running, but data is old (needs fresh dump) |
| **PR #207** | Pending merge | Contains WebSocket fix + VM configs + health improvements |

## Pre-DNS Checklist

Before starting the cutover, ensure:
- [ ] PR #207 is merged to master
- [ ] Public IP is provided by IT team
- [ ] IT confirms port 443 (HTTPS) is open on the public IP / firewall
- [ ] IT confirms port 80 (HTTP) is open (needed for Let's Encrypt validation)

---

## Step-by-Step Migration Plan

### Phase 1: SSL & DNS Setup

**Goal**: Get crm28.asg.ge pointing to VM with HTTPS

1. **Install win-acme on VM** (Let's Encrypt client for Windows)
   - Download from https://www.win-acme.com/
   - Install to `C:\win-acme\`

2. **Request SSL certificate**
   - Run win-acme, request cert for `crm28.asg.ge`
   - Use HTTP-01 validation (requires port 80 open to internet)
   - Certificate auto-renews via scheduled task

3. **Update Nginx config** — switch from HTTP :8080 to HTTPS :443
   - Add SSL certificate paths
   - Add HTTP→HTTPS redirect on port 80
   - Keep all existing proxy rules (backend, frontend, WebSocket, monitor)
   - Template is at `vm-configs/nginx.conf` — update with SSL block

4. **Update DNS** — point crm28.asg.ge A record to the new public IP
   - This is done on the CURRENT DNS provider (not Cloudflare)
   - No need to migrate entire asg.ge domain to Cloudflare
   - TTL: set low (300s) during migration, increase after verified

5. **Verify** — https://crm28.asg.ge loads the CRM login page

### Phase 2: Backend Environment Update

**Goal**: Make VM backend production-ready for public access

6. **Update VM backend .env**:
   ```
   COOKIE_SECURE=true          # Now safe — we have HTTPS
   CORS_ORIGINS=https://crm28.asg.ge
   CLIENTCHATS_WEBHOOK_BASE_URL=https://crm28.asg.ge
   APP_BASE_URL=https://crm28.asg.ge
   ```

7. **Restart backend on VM**:
   ```powershell
   pm2 restart crm-backend
   ```

8. **Verify** — Login works at https://crm28.asg.ge, cookies set correctly

### Phase 3: Fresh Database Migration

**Goal**: VM has latest production data

9. **Dump Railway database**:
   ```bash
   # Get Railway DB connection string
   railway variables -s Postgres
   # Dump
   pg_dump <RAILWAY_DB_URL> --no-owner --no-acl -F c -f crm-railway-dump.backup
   ```

10. **Restore to VM**:
    ```powershell
    # On VM
    pg_restore -U postgres -d crm --clean --if-exists crm-railway-dump.backup
    ```

11. **Run migrations on VM** (in case any are pending):
    ```powershell
    cd C:\crm\backend\crm-backend
    npx prisma migrate deploy
    ```

12. **Verify** — Spot-check data: buildings, clients, recent work orders exist

### Phase 4: Bridge Cutover

**Goal**: AMI Bridge and Core Sync Bridge send data to VM instead of Railway

> ⚠️ This is the point of no return. After this, VM is the primary backend.

13. **Update AMI Bridge .env** on VM (`C:\ami-bridge\.env`):
    ```
    CRM_BASE_URL=http://127.0.0.1:3000    # Was: https://crm28.asg.ge (Railway)
    ```

14. **Update Core Sync Bridge .env** on VM (`C:\core-sync-bridge\.env`):
    ```
    CRM_WEBHOOK_URL=http://127.0.0.1:3000/v1/core-integration/webhook    # Was: Railway URL
    ```
    Note: `CRM_WEBHOOK_SECRET` must match `CORE_WEBHOOK_SECRET` in backend .env

15. **Restart both bridges**:
    ```powershell
    pm2 restart ami-bridge core-sync-bridge
    ```

16. **Verify bridges**:
    - Check http://192.168.65.110:3100/health (AMI Bridge)
    - Check http://192.168.65.110:3101/health (Core Sync Bridge)
    - Check dashboard at /admin/monitor → Bridges tab
    - Make a test call to verify telephony events arrive
    - Check core sync: edit something in Core, verify it appears in CRM within poll interval

### Phase 5: Railway → Staging

**Goal**: Railway becomes staging environment, VM is production

17. **Create `staging` branch** from master:
    ```bash
    git checkout master
    git pull origin master
    git checkout -b staging
    git push origin staging
    ```

18. **Update Railway deployment settings**:
    - Railway dashboard → Service → Settings → Deploy
    - Change branch from `master` to `staging`
    - Railway now only deploys when `staging` branch is updated

19. **Update workflow**:
    - `master` branch = VM production (deploy via GitHub Actions self-hosted runner)
    - `staging` branch = Railway staging (deploy automatically)
    - Feature branches → PR to master → merge → auto-deploy to VM
    - To test on staging: cherry-pick or merge to `staging` branch

### Phase 6: GitHub Actions Self-Hosted Runner

**Goal**: Auto-deploy to VM when master is updated

20. **Install GitHub Actions runner on VM**:
    - GitHub repo → Settings → Actions → Runners → New self-hosted runner
    - Follow Windows installation instructions
    - Install as Windows service for auto-start

21. **Create deploy workflow** (`.github/workflows/deploy-vm.yml`) ✅ IMPLEMENTED:
    - Trigger: push to master
    - Shell: `powershell` (not `pwsh` — PowerShell Core may not be in LocalSystem PATH)
    - Steps: setup PATH → pull code → **stop backend** (release native module locks) → pnpm install (`--frozen-lockfile --prefer-offline`, shared store with Administrator) → prisma generate → migrate deploy → seed-permissions → build backend → install+build frontend → restart PM2 → health check → summary
    - Key fix: backend must be stopped before `pnpm install` because Windows locks `.node` native modules (bcrypt) while loaded by running process

22. **Test deployment**:
    - Push a small change to master
    - Verify GitHub Actions picks it up
    - Verify VM services restart with new code

### Phase 7: Post-Migration Verification

23. **Full smoke test**:
    - [ ] Login / logout
    - [ ] Buildings CRUD
    - [ ] Clients CRUD
    - [ ] Work orders: create, assign, approve, complete
    - [ ] Incidents: create, resolve
    - [ ] Sales pipeline
    - [ ] Internal messenger (WebSocket)
    - [ ] Client chats — send/receive on all channels (Viber, FB, Telegram, WebChat)
    - [ ] Telephony — make/receive calls, CDR appears
    - [ ] Core sync — changes in Core MySQL appear in CRM
    - [ ] Dashboard / reports
    - [ ] File uploads
    - [ ] Notifications

24. **Monitor for 24-48 hours**:
    - Watch /admin/monitor dashboard
    - Check health-check.log for any failures
    - Verify backups run at 3 AM
    - Check bridge health stays "healthy" during business hours

25. **Decommission Railway** (optional, after confident):
    - Keep Railway as staging or shut down to save costs
    - Remove old Railway environment variables if shutting down

---

## Rollback Plan

If anything goes wrong after cutover:

1. **Revert DNS** — Point crm28.asg.ge back to Railway IP
2. **Revert bridges** — Change CRM_BASE_URL / CRM_WEBHOOK_URL back to Railway URLs
3. **Restart bridges** — `pm2 restart ami-bridge core-sync-bridge`

Railway stays untouched during migration, so rollback is always possible.

---

## Key Secrets That Must Match

| Secret | Where (Backend .env) | Where (Bridge .env) | Must Match? |
|--------|----------------------|---------------------|-------------|
| CORE_WEBHOOK_SECRET | Backend on VM | `CRM_WEBHOOK_SECRET` in core-sync-bridge | ✅ Yes |
| TELEPHONY_INGEST_SECRET | Backend on VM | `TELEPHONY_INGEST_SECRET` in ami-bridge | ✅ Yes |
| JWT_SECRET | Backend on VM | — | Same as Railway for session continuity |

---

## Timeline Estimate

| Phase | Duration | Can be parallel? |
|-------|----------|-----------------|
| Phase 1: SSL & DNS | 30-60 min | No (prerequisite) |
| Phase 2: Backend env | 10 min | After Phase 1 |
| Phase 3: DB migration | 30 min | After Phase 1 |
| Phase 4: Bridge cutover | 15 min | After Phase 2+3 |
| Phase 5: Railway→staging | 15 min | After Phase 4 |
| Phase 6: GH Actions runner | 30-60 min | After Phase 5 |
| Phase 7: Verification | 1-2 hours | After Phase 4 |

**Total: ~3-4 hours** for complete cutover (excluding 24-48h monitoring period)
