# Bridge & Sync Health Monitor Agent

Monitors health of all bridges on VM 192.168.65.110: AMI Bridge, Core Sync Bridge, and Bridge Monitor.

## When to Use
- User reports data missing or stale in CRM
- User reports telephony events not recording
- Routine bridge/sync health check
- After bulk load, re-sync, or deployment operations
- When sync or telephony errors are suspected

## Tools Available
Read, Grep, Glob, Bash

## Prerequisites
Production database is on the VM at localhost:5432. Access via SSH:
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm -c 'SELECT 1'"
```

## Steps

### 1. Check All Bridge Status on VM
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 status"
```
Expected online: crm-backend, crm-frontend, ami-bridge, core-sync-bridge, crm-monitor.

### 2. Check Health Endpoints
```bash
# AMI Bridge health
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "Invoke-WebRequest -Uri http://127.0.0.1:3100/health -UseBasicParsing | Select-Object -ExpandProperty Content"

# Core Sync Bridge health
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "Invoke-WebRequest -Uri http://127.0.0.1:3101/health -UseBasicParsing | Select-Object -ExpandProperty Content"
```

AMI Bridge: check `ami.connected === true`, `poster.minutesSinceSuccess < 5`
Core Sync: check `status === "healthy"`, `poster.minutesSinceSuccess < 15`

### 3. Check AMI Bridge — SSH Tunnel
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "Get-Process ssh -ErrorAction SilentlyContinue | Select-Object Id,ProcessName"
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "Test-NetConnection -ComputerName 127.0.0.1 -Port 5038 -WarningAction SilentlyContinue | Select-Object TcpTestSucceeded"
```
If no SSH process or port 5038 test fails, tunnel is down. Restart "AMI Tunnel" scheduled task.

### 4. Check Bridge Logs for Errors
```bash
# AMI Bridge logs
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 logs ami-bridge --lines 50 --nostream"

# Core Sync Bridge logs
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 logs core-sync-bridge --lines 100 --nostream"
```
Look for: connection errors, webhook failures, timeout errors, ALERT lines.

### 5. Check CRM Sync Events via VM Database
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm -c \"SELECT status, COUNT(*) FROM \\\"SyncEvent\\\" WHERE \\\"receivedAt\\\" > NOW() - INTERVAL '24 hours' GROUP BY status ORDER BY status;\""
```

### 6. Check for Failed Events
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm -c \"SELECT \\\"entityType\\\", \\\"entityCoreId\\\", error, \\\"receivedAt\\\" FROM \\\"SyncEvent\\\" WHERE status = 'FAILED' ORDER BY \\\"receivedAt\\\" DESC LIMIT 10;\""
```

### 7. Compare Entity Counts (Core vs CRM)
On VM (core counts):
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx -e \"const{query,closePool}=require('./src/mysql-client');async function m(){const b=await query('SELECT COUNT(*) as c FROM company');const cl=await query('SELECT COUNT(*) as c FROM client');const a=await query('SELECT COUNT(*) as c FROM savingaccount WHERE AccountType IN (\\\"LIFT\\\",\\\"DOOR\\\",\\\"INTERCOM\\\")');console.log('Core: buildings='+b[0].c+' clients='+cl[0].c+' assets='+a[0].c);await closePool()}m()\""
```

CRM counts:
```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm -c \"SELECT (SELECT COUNT(*) FROM \\\"Building\\\" WHERE \\\"coreId\\\" IS NOT NULL AND \\\"isActive\\\"=true) AS buildings, (SELECT COUNT(*) FROM \\\"Client\\\" WHERE \\\"coreId\\\" IS NOT NULL AND \\\"isActive\\\"=true) AS clients, (SELECT COUNT(*) FROM \\\"Asset\\\" WHERE \\\"coreId\\\" IS NOT NULL AND \\\"isActive\\\"=true) AS assets;\""
```

### 8. Auto-Fix Strategies
- **Bridge not running**: `ssh ... "pm2 restart <bridge-name>"`
- **SSH tunnel down**: `ssh ... "schtasks /Run /TN 'AMI Tunnel'"` then verify with port test
- **AMI disconnected**: Check fail2ban on Asterisk, check tunnel, restart ami-bridge
- **Webhook URL wrong**: Check `.env` on VM, fix URL, restart PM2
- **Failed events**: Check error messages, re-sync specific entities
- **Count mismatch**: If small (<10), re-sync individual entities. If large, schedule bulk re-load.
- **No successful ingest for 5+ min**: Check TELEPHONY_INGEST_SECRET matches backend env on VM

## Report Format
```
Bridge Health Report (VM 192.168.65.110):

AMI Bridge:
- PM2: [online/stopped], PID: X, Memory: XMB, Restarts: X
- AMI Connection: [connected/disconnected]
- SSH Tunnel: [active/down]
- Active Calls: X
- Events posted: X, Errors: X
- Last success: [time or "never"]
- Status: [HEALTHY / DEGRADED / DOWN]

Core Sync Bridge:
- PM2: [online/stopped], PID: X, Memory: XMB, Restarts: X
- Last 24h: X processed, Y failed
- Entity counts: Core (B/C/A) vs CRM (B/C/A) — [match/mismatch]
- Failed events: [list or "none"]
- Status: [HEALTHY / DEGRADED / DOWN]

Bridge Monitor:
- PM2: [online/stopped]
- Dashboard: [accessible/down]

Action needed: [yes/no + recommendation]
```
