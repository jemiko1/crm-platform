# Bridge Monitor Dashboard

## Overview

The Bridge Monitor is a lightweight web dashboard that runs on VM 192.168.65.110 alongside the AMI Bridge and Core Sync Bridge. It provides real-time status monitoring, log viewing, and process control for both bridges.

**Dashboard URL**: `http://192.168.65.110:3200`
**Location**: `bridge-monitor/` (source), `C:\bridge-monitor\` (deployed on VM)
**Port**: 3200 (configurable via `MONITOR_PORT`)

## Features

- Real-time status cards for both bridges (AMI + Core Sync)
- PM2 process info: status, PID, uptime, restarts, memory, CPU
- Health endpoint data: AMI connection, active calls, sync stats
- Restart / Stop / Start buttons for each bridge
- Log viewer with tabs for stdout and stderr of each bridge
- Auto-refresh: status every 5 seconds, logs every 10 seconds
- Dark theme UI

## Architecture

```
Browser ──HTTP──▶ Bridge Monitor (:3200)
                      │
                      ├── PM2 (pm2 jlist) ── process info
                      ├── AMI Bridge health (:3100/health) ── AMI stats
                      └── Core Sync health (:3101/health) ── sync stats
```

The monitor is a plain Node.js HTTP server (no dependencies) that:
1. Queries PM2 via `pm2 jlist` for process status
2. Queries health endpoints of both bridges via HTTP
3. Reads log files directly from disk
4. Serves a single-page HTML dashboard

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Dashboard HTML page |
| GET | `/api/status` | Combined PM2 + health data for both bridges |
| POST | `/api/action` | Control bridge: `{bridge, action}` |
| GET | `/api/logs?bridge=X&type=Y` | Tail logs (type: out or error) |

### POST /api/action
```json
{
  "bridge": "ami-bridge" | "core-sync-bridge",
  "action": "restart" | "stop" | "start"
}
```

### GET /api/status Response
```json
{
  "timestamp": "2026-04-01T...",
  "bridges": {
    "ami-bridge": {
      "pm2": { "status": "online", "pid": 8632, "uptime": ..., "restarts": 0, "memory": ..., "cpu": ... },
      "health": { "service": "ami-bridge", "status": "healthy", "ami": {...}, "buffer": {...}, "poster": {...} }
    },
    "core-sync-bridge": {
      "pm2": { ... },
      "health": { ... }
    }
  }
}
```

## Dashboard UI

### Status Cards
Each bridge shows:
- **Status badge**: green (online), yellow (degraded), red (stopped)
- **PM2 data**: PID, uptime, restarts, memory, CPU
- **Health data**: connection state, active calls, buffer size, sync counts
- **Action buttons**: Restart, Stop, Start

### Log Viewer
- Four tabs: AMI Logs, AMI Errors, Core Sync Logs, Core Sync Errors
- Color-coded lines: ERROR (red), WARN (yellow), INFO (green)
- Shows last 100 lines per log file
- Auto-scrolls to bottom

## Deployment

Part of `deploy-bridges.ps1 -Component monitor`. Files deployed:
- `server.js` — dashboard server
- `dashboard.html` — single-page UI
- `package.json` — metadata (no dependencies)
- `ecosystem.config.js` — PM2 config

## Log File Paths (on VM)

| Bridge | Log | Path |
|--------|-----|------|
| AMI Bridge | stdout | `C:\ami-bridge\logs\out.log` |
| AMI Bridge | stderr | `C:\ami-bridge\logs\error.log` |
| Core Sync | stdout | `C:\core-sync-bridge\logs\out.log` |
| Core Sync | stderr | `C:\core-sync-bridge\logs\error.log` |

## Security Notes

- The dashboard has **no authentication** — it is only accessible within the VPN network
- The `/api/action` endpoint can restart/stop services — restrict network access
- CORS is set to `*` for local development convenience
- No secrets are exposed in the dashboard or API responses

## PM2 Configuration

```javascript
{
  name: "bridge-monitor",
  script: "server.js",
  instances: 1,
  autorestart: true,
  max_restarts: 10,
  restart_delay: 5000,
  max_memory_restart: "128M"
}
```
