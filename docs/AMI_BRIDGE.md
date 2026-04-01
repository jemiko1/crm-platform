# AMI Bridge — Asterisk Manager Interface Integration

## Overview

The AMI Bridge is a standalone Node.js service that connects to Asterisk PBX via the AMI (Manager Interface) protocol, filters and maps telephony events, and forwards them to the CRM backend in batches.

**Location**: `ami-bridge/` (source), `C:\ami-bridge\` (deployed on VM)
**Runtime**: Node.js 22 LTS, PM2 process manager
**VM**: 192.168.65.110 (Windows Server)

## Architecture

```
                        SSH Tunnel (port 5038)
FreePBX/Asterisk  ──────────────────────────────▶  Windows VM 192.168.65.110
(5.10.34.153)         ▲                              │
                      │                              ▼
                      │                         AMI Bridge (PM2)
                      │                              │
                      │                         ┌────┴────┐
                      │                         │ ami-client │── TCP login + event stream
                      │                         └────┬────┘
                      │                              │ raw AMI events
                      │                         ┌────┴────────┐
                      │                         │ event-mapper │── filters 12 event types
                      │                         └────┬────────┘
                      │                              │ CRM events
                      │                         ┌────┴──────┐
                      │                         │ event-buffer │── batches (20 events or 3s)
                      │                         └────┬──────┘
                      │                              │ batch POST
                      │                         ┌────┴──────┐
                      │                         │ crm-poster │── HTTPS with retry
                      │                         └────┬──────┘
                      │                              │
                      │                              ▼
                      │                    Railway CRM Backend
                      │                    POST /v1/telephony/events
                      │                    (x-telephony-secret header)
```

## Network Topology

Port 5038 is blocked at the hosting provider network level between subnets (5.10.36.x <-> 5.10.34.x). The AMI bridge uses an SSH tunnel to reach Asterisk:

- **SSH Tunnel**: `C:\ami-tunnel.ps1` on VM — tunnels `localhost:5038` -> `5.10.34.153:5038` via SSH port 22
- **Scheduled Task**: "AMI Tunnel" runs on VM startup with HIGHEST privileges
- **AMI Bridge connects to**: `127.0.0.1:5038` (tunnel endpoint)

## Components

### ami-client.ts
Raw TCP connection to Asterisk AMI. Handles:
- AMI protocol (greeting → login → event stream)
- Exponential backoff reconnect (2s base, 60s max)
- Keepalive ping every 30s
- Pending action tracking with timeouts
- Graceful disconnect with Logoff action

### event-mapper.ts
Stateful mapper that tracks in-flight calls and converts AMI events to CRM format:

| AMI Event | CRM Event | Notes |
|-----------|-----------|-------|
| Newchannel | call_start | Only first channel per linkedId |
| Hangup | call_end | + recording_ready if recording captured |
| QueueCallerJoin | queue_enter | Queue name, position |
| QueueCallerLeave | queue_leave | Queue name |
| AgentConnect | agent_connect + call_answer | Extension, hold time |
| BlindTransfer | transfer | Target extension |
| AttendedTransfer | transfer | Target extension |
| MusicOnHoldStart | hold_start | Only for answered calls |
| MusicOnHoldStop | hold_end | Only for answered calls |
| VarSet | (internal) | Captures CALLFILENAME/MIXMONITOR_FILENAME |
| MixMonitor | (internal) | Captures recording file path |
| Cdr | (internal) | Fallback recording path from CDR |

### event-buffer.ts
Batches CRM events before sending:
- Flushes at 20 events or every 3 seconds (configurable)
- Max queue size: 5000 events (oldest evicted on overflow)
- Re-queues failed batches to front of queue
- Flushes remaining events on shutdown

### crm-poster.ts
HTTP client that POSTs event batches to CRM backend:
- Endpoint: `POST /v1/telephony/events`
- Auth: `x-telephony-secret` header
- Retry: 3 attempts with exponential backoff (1s base)
- Timeout: 15s per request
- Stats tracking: totalPosted, totalErrors, lastSuccessAt

### health-server.ts
HTTP health endpoint on port 3100:
- `GET /health` → 200 (healthy) or 503 (degraded)
- Returns: AMI connection state, active calls, buffer size, poster stats, uptime

### config.ts
All configuration from environment variables with sensible defaults. Required vars: `AMI_HOST`, `AMI_USER`, `AMI_SECRET`, `CRM_BASE_URL`, `TELEPHONY_INGEST_SECRET`.

## Deployment

### On VM (Production)
```
C:\ami-bridge\
├── dist\         ← compiled JS
├── logs\         ← PM2 logs (out.log, error.log)
├── .env          ← production config (AMI_HOST=127.0.0.1 for SSH tunnel)
├── package.json
└── ecosystem.config.js
```

### Deploy Script
From local machine: `.\deploy-bridges.ps1 -Component ami`

This builds locally, SCPs dist + package.json + ecosystem.config.js to VM, installs deps, and restarts PM2.

### PM2 Management
```powershell
# On VM via SSH
pm2 status                     # Check all processes
pm2 logs ami-bridge --lines 50 # Tail logs
pm2 restart ami-bridge         # Restart
pm2 stop ami-bridge            # Stop
pm2 start ami-bridge           # Start
```

### PM2 Persistence on Windows
PM2 daemon dies when SSH session disconnects. Solved with:
1. `C:\pm2-keeper.ps1` — PowerShell loop that calls `pm2 resurrect` every 30s
2. Windows Scheduled Task "PM2 Keeper" — runs keeper on startup with HIGHEST privileges
3. Windows Scheduled Task "PM2 Resurrect" — runs `pm2 resurrect` on startup

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| AMI_HOST | Yes | - | Asterisk AMI host (127.0.0.1 on VM via tunnel) |
| AMI_PORT | No | 5038 | AMI TCP port |
| AMI_USER | Yes | - | AMI username |
| AMI_SECRET | Yes | - | AMI password |
| AMI_RECONNECT_BASE_MS | No | 2000 | Base reconnect delay |
| AMI_RECONNECT_MAX_MS | No | 60000 | Max reconnect delay |
| AMI_PING_INTERVAL_MS | No | 30000 | Keepalive ping interval |
| CRM_BASE_URL | No | - | CRM backend URL |
| TELEPHONY_INGEST_SECRET | Yes | - | Must match Railway backend |
| CRM_TIMEOUT_MS | No | 15000 | HTTP request timeout |
| CRM_RETRY_ATTEMPTS | No | 3 | Max retry attempts |
| CRM_RETRY_BASE_MS | No | 1000 | Base retry delay |
| BUFFER_MAX_SIZE | No | 20 | Batch size threshold |
| BUFFER_FLUSH_INTERVAL_MS | No | 3000 | Time-based flush interval |
| HEALTH_PORT | No | 3100 | Health endpoint port |
| LOG_LEVEL | No | INFO | DEBUG, INFO, WARN, ERROR |

## Firewall & Network

### FreePBX Trusted Zone
The following IPs are trusted in FreePBX firewall (persists through GUI Apply Config):
- 89.150.1.11/32
- 192.168.65.110/32 (VM)
- 5.10.36.36/32
- 46.49.102.171/32 (dev PC)

### Fail2ban
Asterisk server has fail2ban active with 7 jails. Rapid reconnect attempts can trigger bans. If the bridge can't connect:
1. Check if IP is banned: `ssh asterisk "fail2ban-client status"`
2. Unban if needed: `ssh asterisk "fail2ban-client set <jail> unbanip <IP>"`

### AMI User
```
Username: crm_ami
Permissions: read=cdr,reporting,call,agent
Config: /etc/asterisk/manager_custom.conf
```

## Troubleshooting

### Bridge not connecting to AMI
1. Check SSH tunnel is running: `Get-Process ssh` on VM
2. Test tunnel: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5038`
3. If tunnel is down, restart "AMI Tunnel" scheduled task
4. Check Asterisk fail2ban hasn't banned VM IP

### Events not reaching CRM
1. Check `TELEPHONY_INGEST_SECRET` matches Railway env
2. Check `CRM_BASE_URL` is `https://api-crm28.asg.ge`
3. Check health endpoint: `http://192.168.65.110:3100/health`
4. Set `LOG_LEVEL=DEBUG` for verbose output

### High buffer / no flushes
1. CRM backend may be down — check Railway logs
2. Secret mismatch — compare .env with Railway TELEPHONY_INGEST_SECRET
3. Network issue — test HTTPS from VM: `curl https://api-crm28.asg.ge/health`

### Memory leak suspicion
1. Check PM2 memory: `pm2 monit`
2. EventMapper `calls` Map grows with active calls — should shrink on hangup
3. PM2 configured to restart at 256MB (`max_memory_restart`)

## Design Decisions

1. **SSH tunnel instead of direct TCP**: Port 5038 blocked between hosting subnets. SSH (port 22) was the only allowed path.
2. **Idempotency keys**: Each event gets `{linkedId}-{eventType}` key so the CRM backend can safely deduplicate.
3. **Buffer re-queue on failure**: Failed batches go back to the front of the queue to maintain order.
4. **Hold filtering**: MusicOnHold events only emitted for answered calls to avoid queue music noise.
5. **Recording detection**: Multiple sources (VarSet, MixMonitor, CDR) for recording path — emitted as recording_ready on call_end.
