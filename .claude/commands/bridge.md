Bridge operations — manage AMI Bridge, Core Sync Bridge, and Bridge Monitor on VM 192.168.65.110.

## Context
- AMI Bridge docs: docs/AMI_BRIDGE.md
- Core Sync docs: docs/CORE_INTEGRATION.md
- Monitor docs: docs/BRIDGE_MONITOR.md
- VM: 192.168.65.110 (Windows Server, PowerShell over SSH)
- SSH: ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110
- VPN Required: Yes (OpenVPN TAP adapter)
- Core MySQL is READ-ONLY at 192.168.65.97:3306 (database: tttt, user: asg_tablau)

## Services on VM

| Service | Path | Health | PM2 Name |
|---------|------|--------|----------|
| AMI Bridge | C:\ami-bridge\ | :3100/health | ami-bridge |
| Core Sync Bridge | C:\core-sync-bridge\ | :3101/health | core-sync-bridge |
| Ops Dashboard | C:\crm\crm-monitor\ | :9090 (/admin/monitor/) | crm-monitor |

## Available Operations

### Check all bridge status
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 status"
```

### Check health endpoints
```
curl http://192.168.65.110:3100/health   # AMI Bridge
curl http://192.168.65.110:3101/health   # Core Sync Bridge
```

### View bridge logs
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 logs ami-bridge --lines 50"
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 logs core-sync-bridge --lines 50"
```

### Restart a bridge
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 restart ami-bridge"
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "pm2 restart core-sync-bridge"
```

### Deploy updated code
```powershell
.\deploy-bridges.ps1 -Component all    # Deploy all three
.\deploy-bridges.ps1 -Component ami    # AMI Bridge only
.\deploy-bridges.ps1 -Component core   # Core Sync Bridge only
.\deploy-bridges.ps1 -Component monitor # Bridge Monitor only
```

### Check SSH tunnel (AMI Bridge needs this)
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "Get-Process ssh"
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "Test-NetConnection -ComputerName 127.0.0.1 -Port 5038"
```

### Sync single building (Core Sync)
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx src/bulk-loader.ts --building <ID>"
```

### Re-sync single client (Core Sync)
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx src/resync-client.ts <CLIENT_CORE_ID>"
```

### Run full bulk load (OFF-HOURS ONLY — takes 4-5 hours)
```
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx src/bulk-loader.ts"
```

### Check CRM sync status (requires JWT auth)
```
GET /v1/integrations/core/status     — last 24h event stats
GET /v1/integrations/core/events     — recent events (filter: ?status=FAILED)
GET /v1/integrations/core/health     — entity counts + health
GET /v1/integrations/core/checkpoints — polling checkpoints
```

## Steps when user says "/bridge"
1. Ask what operation: status, logs, deploy, restart, sync, or troubleshoot
2. SSH to VM and execute the command
3. Report results
4. If errors, check the relevant docs (AMI_BRIDGE.md or CORE_INTEGRATION.md)

## Safety Rules
- NEVER write to core MySQL — all bridge queries are SELECT only
- Full bulk load: OFF-HOURS ONLY (4-5 hours, stresses both databases)
- Verify webhook URLs point to http://127.0.0.1:3000 (localhost, since bridges and backend are on same VM)
- After deploying code, PM2 auto-restarts via ecosystem.config.js
- AMI Bridge connects via SSH tunnel — if AMI is down, check tunnel first
- If Asterisk blocks connections, check fail2ban before repeated retries
