Core Sync Bridge operations — manage the sync bridge on VM 192.168.65.110.

## Context
- Full documentation: docs/CORE_INTEGRATION.md
- Bridge code: core-sync-bridge/src/
- VM: 192.168.65.110 (Windows Server, PowerShell over SSH)
- Bridge path on VM: C:\core-sync-bridge\
- SSH: ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110
- VPN Required: Yes (OpenVPN TAP adapter)
- Core MySQL is READ-ONLY at 192.168.65.97:3306 (database: tttt, user: asg_tablau)

## Available Operations

### Check bridge status
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 status"
```

### View bridge logs
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 logs core-sync-bridge --lines 50"
```

### Sync single building (test)
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx src/bulk-loader.ts --building <ID>"
```

### Re-sync single client
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx src/resync-client.ts <CLIENT_CORE_ID>"
```

### Run full bulk load (OFF-HOURS ONLY — takes 4-5 hours)
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx src/bulk-loader.ts"
```

### Deploy updated bridge code to VM
```
scp -i ~/.ssh/id_ed25519_vm -r 'C:\CRM-Platform\core-sync-bridge\src' 'Administrator@192.168.65.110:C:\core-sync-bridge\src'
# IMPORTANT: SCP -r creates nested src/src/ — fix with:
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "Copy-Item -Path C:\core-sync-bridge\src\src\* -Destination C:\core-sync-bridge\src\ -Force; Remove-Item C:\core-sync-bridge\src\src -Recurse -Force"
# Then restart PM2:
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 restart core-sync-bridge"
```

### Check CRM sync status (requires JWT auth)
```
GET /v1/integrations/core/status     — last 24h event stats
GET /v1/integrations/core/events     — recent events (filter: ?status=FAILED)
GET /v1/integrations/core/health     — entity counts + health
GET /v1/integrations/core/checkpoints — polling checkpoints
```

## Steps when user says "/bridge"
1. Ask what operation: status, logs, sync building, re-sync client, deploy, or bulk load
2. SSH to VM and execute the command
3. Report results
4. If errors, check docs/CORE_INTEGRATION.md troubleshooting section

## Safety Rules
- NEVER write to core MySQL — all bridge queries are SELECT only
- Full bulk load: OFF-HOURS ONLY (4-5 hours, stresses both databases)
- Always verify webhook URL points to api-crm28.asg.ge (NOT crm28.asg.ge)
- After deploying code, restart PM2: `pm2 restart core-sync-bridge`
