# AMI Bridge

Middleware service that connects to Asterisk AMI (Manager Interface) and forwards
call events to the CRM backend telephony ingestion API.

## Architecture

```
FreePBX/Asterisk ──AMI TCP:5038──▶ AMI Bridge ──HTTPS POST──▶ Railway CRM Backend
                                   (Windows VM)                POST /v1/telephony/events
```

## Requirements

- Node.js 22 LTS
- Network access to Asterisk AMI (port 5038)
- Network access to Railway backend (HTTPS 443)
- AMI user with read permissions: `cdr,reporting,call,agent`

## Quick Start

### 1. Install Dependencies

```bash
npm install -g pnpm
pnpm install
```

### 2. Configure

```bash
copy .env.example .env
```

Edit `.env` with your actual values:
- `AMI_HOST` / `AMI_PORT` / `AMI_USER` / `AMI_SECRET` — Asterisk AMI credentials
- `CRM_BASE_URL` — Railway backend URL (e.g. `https://crm-backend.up.railway.app`)
- `TELEPHONY_INGEST_SECRET` — must match the value set in Railway backend environment

### 3. Run (Development)

```bash
pnpm dev
```

### 4. Build & Run (Production)

```bash
pnpm build
pnpm start
```

### 5. Run as Background Service (PM2)

```bash
npm install -g pm2
pm2 start dist/main.js --name ami-bridge
pm2 save
pm2 startup
```

## Event Flow

```
Asterisk AMI Event     →  Event Mapper    →  Event Buffer  →  CRM Poster
(Newchannel, Hangup,      (filters,          (batches up       (POST with
 AgentConnect, etc.)       maps to CRM        to 20 events      retry &
                           event format)      or 3 seconds)     auth header)
```

## AMI → CRM Event Mapping

| Asterisk AMI Event    | CRM Event Type  | Key Data                          |
|-----------------------|-----------------|-----------------------------------|
| Newchannel            | call_start      | linkedId, callerIdNum, context    |
| Hangup                | call_end        | cause, causeTxt                   |
| QueueCallerJoin       | queue_enter     | queue name, position              |
| QueueCallerLeave      | queue_leave     | queue name                        |
| AgentConnect          | agent_connect   | extension, queue, holdTime        |
| AgentConnect          | call_answer     | (emitted alongside agent_connect) |
| BlindTransfer         | transfer        | target extension                  |
| AttendedTransfer      | transfer        | target extension                  |
| MusicOnHoldStart      | hold_start      | (only after call answered)        |
| MusicOnHoldStop       | hold_end        | (only after call answered)        |
| VarSet/MixMonitor     | recording_ready | recording file path (on call_end) |

## Features

- **Idempotent**: Each event gets a unique `idempotencyKey` based on `linkedId` + event type
- **Batched**: Events are buffered and sent in batches (configurable size/interval)
- **Resilient**: Auto-reconnects to AMI with exponential backoff
- **Retries**: HTTP POST retries with backoff on failure
- **Recording Detection**: Captures recording paths from VarSet/MixMonitor events
- **Hold Filtering**: Only emits hold events for answered calls (ignores queue music)
- **Status Logging**: Periodic status report every 60 seconds

## Troubleshooting

### Cannot connect to AMI
- Verify AMI is enabled: `grep enabled /etc/asterisk/manager.conf`
- Verify port is open: `telnet <AMI_HOST> 5038` from the VM
- Check firewall rules on the Asterisk server
- Verify AMI user exists: `asterisk -rx "manager show user crm_ami"`

### Events not reaching CRM
- Check `TELEPHONY_INGEST_SECRET` matches between `.env` and Railway
- Check `CRM_BASE_URL` is correct and accessible from VM
- Set `LOG_LEVEL=DEBUG` for verbose output
- Verify with: `curl -X POST <CRM_BASE_URL>/v1/telephony/events -H "x-telephony-secret: <secret>" -H "Content-Type: application/json" -d '{"events":[]}'`

### No call_start events
- Asterisk Newchannel events fire for ALL channels; the bridge only emits
  call_start when `Uniqueid === Linkedid` (first channel in a call)
- Check trunk naming in FreePBX matches expected patterns
