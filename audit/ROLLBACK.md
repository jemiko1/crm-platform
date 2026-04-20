# Rollback procedure

How to restore CRM28 to the pre-audit baseline if any Phase 4 fix breaks production.

## Baseline captured 2026-04-19

**Code:**
- Git tag: `audit/baseline-2026-04-19` on branch `audit/phase0/orient` (commit `dc0f02a`)
- Origin: `https://github.com/jemiko1/crm-platform.git` → tag pushed
- Tag pointer: Phase 0 + Phase 1 audit deliverables only. No production code changes yet.

**Data:**
- On VM: `C:\crm\backups\crm-backup-2026-04-19_114014-preaudit.dump` (54.4 MB, PostgreSQL custom format)
- On laptop: `C:\CRM-Platform\backups\crm-backup-2026-04-19_114014-preaudit.dump` (54.4 MB, identical SHA)
- Plus nightly rotation on VM: last 7 days at `C:\crm\backups\crm-backup-YYYY-MM-DD_030001.dump`

## Rollback steps

### Code rollback (VM production)

SSH to VM as Administrator; from `C:\crm\backend\crm-backend\`:

```powershell
# Stop PM2 backend + frontend so pnpm doesn't hit file locks
pm2 stop crm-backend crm-frontend

# Reset to baseline
cd C:\crm
git fetch origin
git checkout audit/baseline-2026-04-19

# Reinstall and rebuild
cd backend\crm-backend
pnpm install --prefer-offline
pnpm prisma generate
pnpm build

cd ..\..\frontend\crm-frontend
pnpm install --prefer-offline
pnpm build

# Start services
pm2 start crm-backend
pm2 start crm-frontend

# Health check
curl http://localhost:3000/health
```

Expected downtime: ~3 minutes.

### Data rollback (VM Postgres)

**Only if schema or data was corrupted.** Code-only issues do not need data rollback.

```powershell
# Stop backend first so no writes hit the DB during restore
pm2 stop crm-backend

# Drop and recreate the target DB (destructive!)
& C:\postgresql17\pgsql\bin\psql.exe -U postgres -c "DROP DATABASE IF EXISTS crm_rollback_stage"
& C:\postgresql17\pgsql\bin\psql.exe -U postgres -c "CREATE DATABASE crm_rollback_stage"

# Restore into staging DB first (safety: never restore directly over crm)
& C:\postgresql17\pgsql\bin\pg_restore.exe -U postgres -d crm_rollback_stage --no-owner --no-privileges C:\crm\backups\crm-backup-2026-04-19_114014-preaudit.dump

# Sanity check (row counts, most recent call session, etc.)
& C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm_rollback_stage -c "SELECT COUNT(*) FROM \"CallSession\"; SELECT MAX(\"startAt\") FROM \"CallSession\";"

# Rename current crm → crm_broken, rename staging → crm (atomic-ish, ~1s of DB unavailability)
& C:\postgresql17\pgsql\bin\psql.exe -U postgres -c "ALTER DATABASE crm RENAME TO crm_broken_2026_04_19"
& C:\postgresql17\pgsql\bin\psql.exe -U postgres -c "ALTER DATABASE crm_rollback_stage RENAME TO crm"

# Restart backend
pm2 start crm-backend
curl http://localhost:3000/health
```

Keep `crm_broken_2026_04_19` for 1 week to recover any data written after the baseline before rolling back, if needed.

### Bridge rollback (AMI + core-sync)

```powershell
cd C:\ami-bridge
git checkout audit/baseline-2026-04-19
pnpm install --prefer-offline
pm2 restart ami-bridge

cd C:\core-sync-bridge
git checkout audit/baseline-2026-04-19
pnpm install --prefer-offline
pm2 restart core-sync-bridge
```

### Softphone rollback

Old releases at `https://github.com/jemiko1/crm-platform/releases`. Softphone auto-updates won't downgrade by default (electron-updater).

If operators need to downgrade: uninstall softphone, reinstall from a release tagged before 2026-04-19.

## Verification after rollback

1. `curl https://crm28.asg.ge/health` — returns 200 with `db.connected: true`.
2. Operator logs in → sees Call Center + Client Chats in sidebar.
3. Inbound test call → CallSession row created; softphone rings.
4. Inbound WhatsApp test message → conversation + message rows created.

## Inverse: recover data from partial rollback

If rollback is partial (code rolled back, data kept) and you need to restore specific rows:

```powershell
# From the broken DB kept as crm_broken_2026_04_19 or from a nightly dump
& C:\postgresql17\pgsql\bin\pg_restore.exe -U postgres -d crm --data-only --table="CallSession" C:\crm\backups\crm-backup-2026-04-XX_030001.dump
```

## Checksums

```
crm-backup-2026-04-19_114014-preaudit.dump
  Size: 54,455,405 bytes
  VM path: C:\crm\backups\crm-backup-2026-04-19_114014-preaudit.dump
  Laptop path: C:\CRM-Platform\backups\crm-backup-2026-04-19_114014-preaudit.dump
```

SHA256 (verified match on VM and laptop 2026-04-19):
`e7c698cd7e77738e5a5fe71879db59b7168b8c9593b80fdd14e63fff8ba01cb4`

---

## Selective revert of a specific fix

Each audit fix lives on its own branch; PRs are #249–#262. If one fix breaks production after merge, revert only that PR instead of rolling the whole stack back. Branch → PR mapping:

- **#249** `fix/audit/jwt-gateway-sub` — P0-E (JWT sub claim in telephony + messenger gateways)
- **#250** `fix/audit/escalation-limit-ami-idempotency` — P1-4 + P1-8 (escalation query bound + AMI idempotency keys)
- **#251** `fix/audit/switch-user-banner-and-queue-fanout` — P1-10 + P1-11 (switch-user 3-state + queue schedule re-fan)
- **#252** `fix/audit/conversation-and-recording-scope` — P1-1 + P1-2 (conversation + recording scope checks)
- **#253** `fix/audit/telephony-stats-aggregated-sql` — P1-3 (telephony stats via SQL GROUP BY)
- **#254** `fix/audit/quality-pipeline-prompt-injection` — P1-7 (quality AI prompt hardening)
- **#255** `fix/audit/archival-transaction` — P1-5 (closed-conversation archival transaction)
- **#256** `fix/audit/whatsapp-24h-window` — P1-6 (WhatsApp 24h + delivery failure surfacing)
- **#257** `fix/audit/device-token-flow` — P1-13 + P1-14 (device token atomic consume + cleanup cron + softphone.handshake permission)
- **#258** `fix/audit/login-throttle-persistence` — P0-D (login throttle Postgres + per-IP rate limit)
- **#259** `fix/audit/sip-password-memory-only` — P0-B + P0-C (SIP password not in `/auth/me`, not on softphone disk)
- **#260** `fix/audit/sip-re-register-and-heartbeat` — P0-F (softphone SIP auto re-register + backend presence heartbeat)
- **#261** `fix/audit/telephony-gateway-throttle` — P1-9 (diff + throttle telephony gateway broadcasts)
- **#262** `fix/audit/softphone-bridge-lockdown` — P1-12 (softphone local bridge exact-origin + rotating token)

### Procedure

To revert PR #N after merge:

```powershell
# 1. Find the merge commit on master
cd C:\CRM-Platform
git checkout master
git pull origin master
git log --merges --oneline -20     # locate the "Merge pull request #N" line, copy the SHA

# 2. Create a revert branch and revert the merge
git checkout -b revert/pr-N-<short-topic>
git revert -m 1 <merge-commit-sha>     # -m 1 selects the master-side parent; required for merge commits
# Resolve any conflicts that appear, then:
git commit                              # finalize the revert commit message

# 3. Open a revert PR
git push origin revert/pr-N-<short-topic>
gh pr create --base master --title "revert: PR #N (<topic>)" \
  --body "Reverts PR #N because <reason>. Original merge: <merge-sha>."

# 4. After CI passes, merge the revert PR. VM auto-deploys within ~2 min.
# 5. Verify /health returns 200 and the regression is gone.
```

### Notes

- Always `git revert -m 1 <sha>` — omitting `-m 1` on a merge commit errors with "cannot revert without specifying the parent".
- Never force-push a revert to master; use a normal PR so branch-protection + CI run.
- If a revert introduces conflicts with subsequent PRs, resolve them in the revert branch — do NOT reset master.
- After revert, re-open the original PR (or file a new one) with the fix strategy adjusted. The feature branch still exists at `fix/audit/<topic>` — rebase it on master and iterate.
- PRs #250 and #251 each bundle two findings (P1-4 + P1-8, P1-10 + P1-11). Reverting them rolls back both. If only one finding regresses, cherry-pick the inverse commit instead of a full merge revert.

