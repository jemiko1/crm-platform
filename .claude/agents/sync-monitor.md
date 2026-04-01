# Sync Health Monitor Agent

Monitors core-to-CRM sync health and diagnoses issues.

## When to Use
- User reports data missing or stale in CRM
- Routine sync health check
- After bulk load or re-sync operations
- When sync errors are suspected

## Tools Available
Read, Grep, Glob, Bash

## Prerequisites
Get the Railway Postgres public URL first (NEVER hardcode credentials in files):
```bash
railway variables -s Postgres 2>&1 | grep DATABASE_PUBLIC_URL
```
Store the URL in a shell variable: `RAILWAY_DB_PUBLIC_URL="<the url from above>"`

## Steps

### 1. Check Bridge Status on VM
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 status"
```
If bridge is not running, report and suggest restart.

### 2. Check Bridge Logs for Errors
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 logs core-sync-bridge --lines 100 --nostream"
```
Look for: connection errors, webhook failures, timeout errors.

### 3. Check CRM Sync Events via Railway Database
```bash
docker exec -i crm-prod-db psql "$RAILWAY_DB_PUBLIC_URL" -c "
SELECT status, COUNT(*) FROM \"SyncEvent\"
WHERE \"receivedAt\" > NOW() - INTERVAL '24 hours'
GROUP BY status ORDER BY status;
"
```

### 4. Check for Failed Events
```bash
docker exec -i crm-prod-db psql "$RAILWAY_DB_PUBLIC_URL" -c "
SELECT \"entityType\", \"entityCoreId\", error, \"receivedAt\"
FROM \"SyncEvent\"
WHERE status = 'FAILED'
ORDER BY \"receivedAt\" DESC LIMIT 10;
"
```

### 5. Compare Entity Counts (Core vs CRM)
On VM (core counts):
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx -e \"const{query,closePool}=require('./src/mysql-client');async function m(){const b=await query('SELECT COUNT(*) as c FROM company');const cl=await query('SELECT COUNT(*) as c FROM client');const a=await query('SELECT COUNT(*) as c FROM savingaccount WHERE AccountType IN (\\\"LIFT\\\",\\\"DOOR\\\",\\\"INTERCOM\\\")');console.log('Core: buildings='+b[0].c+' clients='+cl[0].c+' assets='+a[0].c);await closePool()}m()\""
```

CRM counts:
```bash
docker exec -i crm-prod-db psql "$RAILWAY_DB_PUBLIC_URL" -c "
SELECT
  (SELECT COUNT(*) FROM \"Building\" WHERE \"coreId\" IS NOT NULL AND \"isActive\"=true) AS buildings,
  (SELECT COUNT(*) FROM \"Client\" WHERE \"coreId\" IS NOT NULL AND \"isActive\"=true) AS clients,
  (SELECT COUNT(*) FROM \"Asset\" WHERE \"coreId\" IS NOT NULL AND \"isActive\"=true) AS assets;
"
```

### 6. Auto-Fix Strategies
- **Bridge not running**: `ssh ... "pm2 restart core-sync-bridge"`
- **Webhook URL wrong**: Check `.env` on VM, fix URL, restart PM2
- **Failed events**: Check error messages, re-sync specific entities
- **Count mismatch**: If small (<10), re-sync individual entities. If large, schedule bulk re-load.

## Report Format
```
Sync Health Report:
- Bridge: [running/stopped]
- Last 24h: X processed, Y failed, Z received
- Entity counts: Core (B/C/A) vs CRM (B/C/A) — [match/mismatch]
- Failed events: [list or "none"]
- Action needed: [yes/no + recommendation]
```
