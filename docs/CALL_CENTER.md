# Call Center Module - Technical Documentation

## Overview

The Call Center module provides telephony analytics, quality monitoring, and live call management for the CRM platform, integrated with Asterisk PBX via AMI (Manager Interface) and ARI (REST Interface).

**Current status:** Fully integrated. AMI provides real-time events, ARI enables call control, CDR import fills gaps, and OpenAI powers automated quality reviews.

---

## Architecture

```
Asterisk PBX
  ├── AMI (TCP 5038) ──→ AmiClientService ──→ AmiEventMapper ──→ TelephonyIngestionService (DB)
  │                                        └──→ TelephonyStateManager (in-memory)
  │                                             └──→ TelephonyGateway (WebSocket /telephony)
  ├── ARI (HTTP 8088) ──→ AriClientService (call control)
  ├── CDR Database ──→ CdrImportService (scheduled gap-fill)
  └── Recordings ──→ RecordingAccessService (file streaming)

OpenAI API ←── QualityPipelineService (Whisper transcription + GPT scoring)
```

---

## Asterisk AMI Integration

### Connection

The `AmiClientService` maintains a persistent TCP connection to Asterisk AMI with automatic reconnection.

**Configuration (env vars):**
```
AMI_ENABLED=true
AMI_HOST=127.0.0.1
AMI_PORT=5038
AMI_USER=crm
AMI_SECRET=<your-ami-secret>
```

### AMI Event Mapping

The `AmiEventMapperService` translates raw AMI events into our 13 normalized event types:

| AMI Event            | Normalized Event   | Key Fields                              | Idempotency Key Format                          |
|----------------------|--------------------|-----------------------------------------|--------------------------------------------------|
| `Newchannel`         | `call_start`       | linkedId, uniqueId, callerIdNum         | `ami:newchannel:{uniqueid}`                      |
| `DialEnd(ANSWER)`    | `call_answer`      | linkedId, dialstatus                    | `ami:dialend:{uniqueid}:answer`                  |
| `BridgeEnter`        | `call_answer`      | linkedId, bridgeuniqueid                | `ami:bridgeenter:{uniqueid}:{bridgeuniqueid}`    |
| `Hangup`             | `call_end`         | linkedId, cause, cause-txt              | `ami:hangup:{uniqueid}`                          |
| `QueueCallerJoin`    | `queue_enter`      | linkedId, queue, position               | `ami:queuejoin:{uniqueid}:{queue}`               |
| `QueueCallerLeave`   | `queue_leave`      | linkedId, queue                         | `ami:queueleave:{uniqueid}:{queue}`              |
| `AgentConnect`       | `agent_connect`    | linkedId, destchannel, holdtime         | `ami:agentconnect:{uniqueid}:{extension}`        |
| `BlindTransfer`      | `transfer`         | linkedId, transfertargetchannel         | `ami:transfer:{uniqueid}:{timestamp}`            |
| `AttendedTransfer`   | `transfer`         | linkedId, transfertargetchannel         | `ami:transfer:{uniqueid}:{timestamp}`            |
| `MusicOnHoldStart`   | `hold_start`       | linkedId                                | `ami:moh:{uniqueid}:hold_start:{timestamp}`      |
| `MusicOnHoldStop`    | `hold_end`         | linkedId                                | `ami:moh:{uniqueid}:hold_end:{timestamp}`        |
| Custom / CDR         | `recording_ready`  | recordingFile, recordingDuration        | `cdr:rec:{uniqueid}`                             |
| Custom dialplan      | `wrapup_start/end` | linkedId                                | Custom                                           |

**Important:** Only primary channel events are processed (where `uniqueid === linkedid`). Child channel events (e.g., agent-side Newchannel) are filtered out.

### Asterisk Field Mapping

- **linkedId**: Asterisk's `Linkedid` -- correlates all channels in a call. Used as `CallSession.linkedId` (unique).
- **uniqueId**: Asterisk's `Uniqueid` -- identifies a single channel.
- **cause/causeTxt**: Maps to `CallDisposition`:
  - `16` / `NORMAL_CLEARING` → ANSWERED
  - `19` / `NO_ANSWER` → NOANSWER
  - `17` / `USER_BUSY` → BUSY
  - `487` / `ORIGINATOR_CANCEL` → ABANDONED
  - Others → MISSED or FAILED

---

## Real-Time State & WebSocket

### TelephonyStateManager

In-memory store tracking live call center state, updated by AMI events:

- **Active Calls** (`Map<linkedId, ActiveCall>`): state = RINGING | QUEUED | CONNECTED | ON_HOLD
- **Agent States** (`Map<userId, AgentState>`): presence = ON_CALL | RINGING | IDLE | WRAPUP | PAUSED | OFFLINE
- **Queue Snapshots**: computed from active calls (waiting callers, active calls, longest wait)

Hydrated from DB on startup to recover state after server restart.

### WebSocket Gateway

Namespace: `/telephony` (Socket.io, same server as messenger)

**Authentication:** JWT via Bearer token or `access_token` cookie (same as messenger gateway).

**Rooms:**
- `dashboard` -- all connected clients (global live view)
- `queue:{queueId}` -- per-queue subscribers
- `agent:{userId}` -- per-agent notifications

**Events pushed to clients:**

| Event           | Payload                                          | When                     |
|-----------------|--------------------------------------------------|--------------------------|
| `state:snapshot`| Full state (calls, agents, queues)               | On client connect        |
| `call:ringing`  | ActiveCall + caller info                         | New incoming call        |
| `call:answered` | ActiveCall with assigned agent                   | Call picked up           |
| `call:ended`    | linkedId, cause, timestamp                       | Call finished            |
| `call:hold`     | ActiveCall with ON_HOLD/CONNECTED state           | Hold toggled             |
| `queue:updated` | Queue snapshots array                            | Any queue state change   |
| `agent:status`  | AgentState with presence                         | Agent state change       |
| `screen:pop`    | Caller lookup result (client/lead/workorders)    | On incoming call         |

**Client commands:**
- `queue:subscribe` `{ queueId }` -- join queue room
- `queue:unsubscribe` `{ queueId }` -- leave queue room

---

## ARI Call Control

The `AriClientService` provides HTTP-based call control via Asterisk REST Interface.

**Configuration:**
```
ARI_ENABLED=true
ARI_BASE_URL=http://127.0.0.1:8088/ari
ARI_USER=crm
ARI_PASSWORD=<your-ari-password>
```

### Call Control Endpoints (JWT-protected)

| Method | Route                              | Description                                |
|--------|------------------------------------|--------------------------------------------|
| POST   | `/v1/telephony/actions/originate`  | Click-to-call: agent's extension dials out |
| POST   | `/v1/telephony/actions/transfer`   | Blind/attended transfer                    |
| POST   | `/v1/telephony/actions/hangup`     | Hang up active call                        |
| POST   | `/v1/telephony/actions/hold`       | Toggle hold (ARI only)                     |
| POST   | `/v1/telephony/actions/queue-login`| Agent logs into queue (via AMI)            |
| POST   | `/v1/telephony/actions/queue-logout`| Agent logs out of queue (via AMI)         |
| POST   | `/v1/telephony/actions/queue-pause`| Agent pause/unpause in queue (via AMI)     |

Queue membership actions use AMI (QueueAdd/QueueRemove/QueuePause) since ARI doesn't manage queue membership.

---

## Asterisk Sync

The `AsteriskSyncService` automatically synchronizes Asterisk configuration with CRM:

- **Queue Sync**: AMI `QueueStatus` → upsert `TelephonyQueue` records, tag after-hours queues
- **Extension Sync**: AMI `PJSIPShowEndpoints` / `SIPpeers` → match with `TelephonyExtension` records
- Runs on AMI connect + every 5 minutes via `@Cron`

**Configuration:**
```
AFTER_HOURS_QUEUES=nowork    # comma-separated queue names
```

---

## CDR Import (Gap-Fill)

The `CdrImportService` imports call records from Asterisk's CDR database as a safety net for missed AMI events.

- Runs every 5 minutes via `@Cron`
- Queries CDR table for records newer than last import
- Maps CDR → `call_start` + `call_end` + `recording_ready` events
- Idempotency keys prevent duplicates with AMI-ingested events

**Configuration:**
```
CDR_IMPORT_ENABLED=true
CDR_DB_URL=postgresql://asterisk:pass@localhost:5432/asteriskcdrdb
```

---

## Recording Access

**Configuration:**
```
RECORDING_BASE_PATH=/var/spool/asterisk/monitor
```

### Endpoints (JWT-protected)

| Method | Route                                  | Description                  |
|--------|----------------------------------------|------------------------------|
| GET    | `/v1/telephony/recordings/:id`         | Recording metadata           |
| GET    | `/v1/telephony/recordings/:id/audio`   | Stream/redirect audio file   |

If `Recording.url` is set, the audio endpoint redirects. Otherwise it streams from `RECORDING_BASE_PATH + filePath`.

---

## OpenAI Quality Pipeline

Automated call quality scoring using OpenAI Whisper (transcription) and GPT (scoring).

**Configuration:**
```
QUALITY_AI_ENABLED=true
OPENAI_API_KEY=sk-...
QUALITY_AI_MODEL=gpt-4o
QUALITY_AI_CRON=0 */2 * * * *
```

### Pipeline Flow

1. `@Cron` polls for `QualityReview` with `status=PENDING` (up to 5 at a time)
2. For each review:
   - Set `status=PROCESSING`
   - Fetch associated `Recording` file
   - Call Whisper API for transcription
   - Load active `QualityRubric` criteria
   - Call GPT with transcript + rubrics → structured JSON response
   - Parse: `score` (0-100), `summary`, `flags`, `tags`
   - Update `QualityReview` with results, set `status=DONE`
3. On error: retry up to 3 times, then mark `status=FAILED`

### Quality Reviews Auto-Creation

When a `recording_ready` event arrives for an answered call with > 30s talk time, a `QualityReview` is automatically created with `status=PENDING`.

---

## Callback Rules

When a call ends with a non-ANSWERED disposition, the system classifies the reason and optionally creates a callback request.

**After-hours detection:** Asterisk handles after-hours routing by sending calls to a dedicated queue (e.g. `nowork`). The CRM detects after-hours calls by checking the queue's `isAfterHoursQueue` flag -- it does NOT compute local timezone schedules.

```
call_end (non-ANSWERED)
  │
  ├─ disposition == ABANDONED
  │   → MissedCall (reason=ABANDONED) + CallbackRequest (status=PENDING)
  │
  ├─ queue.isAfterHoursQueue == true
  │   → MissedCall (reason=OUT_OF_HOURS) + CallbackRequest (status=PENDING)
  │
  └─ disposition == NOANSWER / MISSED / other
      → MissedCall (reason=NO_ANSWER), callback optional
```

### Callback Lifecycle

```
PENDING → ATTEMPTING → DONE / FAILED / CANCELED
```

---

## Worktime Logic (Reporting Only)

> **Important:** Worktime config is NOT used for callback scheduling or after-hours detection.
> Asterisk owns after-hours routing. CRM uses the queue's `isAfterHoursQueue` flag instead.

Each `TelephonyQueue` can optionally have a `worktimeConfig` JSON field for reporting.

---

## Live Monitoring

### REST Endpoints (JWT-protected)
- `GET /v1/telephony/queues/live` -- real-time queue state (from AMI), falls back to DB if AMI disconnected
- `GET /v1/telephony/agents/live` -- real-time agent presence, falls back to DB

When AMI is connected, responses have `_disclaimer: null`. When disconnected, a disclaimer is included.

---

## API Endpoints Summary

### Ingestion (secret-protected)
- `POST /v1/telephony/events` -- batch ingest events

### Calls & Lookup (JWT-protected)
- `GET /v1/telephony/calls` -- paginated call listing with filters
- `GET /v1/telephony/lookup?phone=...` -- caller identification pop-up
- `GET /v1/telephony/callbacks` -- callback queue

### Analytics (JWT-protected)
- `GET /v1/telephony/stats/overview` -- aggregated KPIs with comparison
- `GET /v1/telephony/stats/agents` -- per-agent KPIs
- `GET /v1/telephony/stats/queues` -- per-queue KPIs

### Live Monitoring (JWT-protected)
- `GET /v1/telephony/queues/live` -- real-time queue state
- `GET /v1/telephony/agents/live` -- real-time agent presence

### Call Control (JWT-protected)
- `POST /v1/telephony/actions/originate` -- click-to-call
- `POST /v1/telephony/actions/transfer` -- transfer call
- `POST /v1/telephony/actions/hangup` -- hang up call
- `POST /v1/telephony/actions/hold` -- toggle hold
- `POST /v1/telephony/actions/queue-login` -- agent queue login
- `POST /v1/telephony/actions/queue-logout` -- agent queue logout
- `POST /v1/telephony/actions/queue-pause` -- agent pause/unpause

### Recordings (JWT-protected)
- `GET /v1/telephony/recordings/:id` -- recording metadata
- `GET /v1/telephony/recordings/:id/audio` -- stream audio

### Quality Reviews (JWT-protected)
- `GET /v1/telephony/quality/reviews` -- paginated reviews
- `GET /v1/telephony/quality/reviews/:id` -- single review detail
- `PATCH /v1/telephony/quality/reviews/:id` -- update score/summary
- `GET /v1/telephony/quality/rubrics` -- list scoring criteria
- `POST /v1/telephony/quality/rubrics` -- create/update criteria

### WebSocket (JWT-authenticated)
- Namespace: `/telephony`
- See "Real-Time State & WebSocket" section above

---

## KPI Definitions

### Volume KPIs

| KPI | Formula | Source |
|-----|---------|--------|
| Total Calls | COUNT(CallSession) in period | CallSession.startAt |
| Answered | COUNT WHERE disposition = ANSWERED | CallSession.disposition |
| Missed | COUNT WHERE disposition IN (MISSED, NOANSWER) | CallSession.disposition |
| Abandoned | COUNT WHERE disposition = ABANDONED | CallSession.disposition |
| Callbacks Created | COUNT(CallbackRequest) in period | CallbackRequest.createdAt |
| Callbacks Completed | COUNT WHERE status = DONE | CallbackRequest.status |

### Speed KPIs

| KPI | Formula | Source |
|-----|---------|--------|
| Avg Answer Time | AVG(waitSeconds) WHERE disposition = ANSWERED | CallMetrics.waitSeconds |
| Median Answer Time | PERCENTILE_CONT(0.5) of waitSeconds | CallMetrics.waitSeconds |
| P90 Answer Time | PERCENTILE_CONT(0.9) of waitSeconds | CallMetrics.waitSeconds |
| Avg Abandon Wait | AVG(abandonsAfterSeconds) WHERE disposition = ABANDONED | CallMetrics.abandonsAfterSeconds |

### Quality KPIs

| KPI | Formula | Source |
|-----|---------|--------|
| Avg Talk Time | AVG(talkSeconds) WHERE answered | CallMetrics.talkSeconds |
| Avg Hold Time | AVG(holdSeconds) WHERE answered | CallMetrics.holdSeconds |
| Avg Wrapup Time | AVG(wrapupSeconds) WHERE answered | CallMetrics.wrapupSeconds |
| Transfer Rate | SUM(transfersCount) / answered count | CallMetrics.transfersCount |

### Service Level KPIs

| KPI | Formula | Source |
|-----|---------|--------|
| SLA Met % | (COUNT isSlaMet=true / total with SLA data) * 100 | CallMetrics.isSlaMet |
| Longest Wait | MAX(waitSeconds) WHERE answered | CallMetrics.waitSeconds |
| Peak Hours | Hourly histogram of call volume | CallSession.startAt |

### Agent KPIs

| KPI | Formula | Source |
|-----|---------|--------|
| Answer Rate | answered / total per agent | CallSession grouped by assignedUserId |
| Missed Rate | missed / total per agent | CallSession grouped by assignedUserId |
| Avg Handle Time | AVG(talk + hold + wrapup) per agent | CallMetrics |
| After-Call Work | AVG(wrapupSeconds) per agent | CallMetrics.wrapupSeconds |
| Occupancy Proxy | total handle time / shift duration | Requires shift data |

---

## Index Rationale

| Index | Purpose |
|-------|---------|
| `CallSession(startAt)` | Time-range queries for all analytics |
| `CallSession(queueId)` | Filter by queue |
| `CallSession(assignedUserId)` | Filter by agent |
| `CallSession(disposition)` | Filter by call outcome |
| `CallSession(callerNumber)` | Caller lookup / phone search |
| `CallSession(queueId, startAt)` | Composite for queue + time range analytics |
| `CallSession(assignedUserId, startAt)` | Composite for agent + time range analytics |
| `CallEvent(idempotencyKey)` UNIQUE | Duplicate event detection |
| `CallEvent(eventType)` | Filter events by type |
| `MissedCall(status)` | Callback queue filtering |
| `MissedCall(detectedAt)` | Time-range missed call reports |
| `CallbackRequest(status)` | Callback queue filtering |
| `CallbackRequest(scheduledAt)` | Scheduled callback ordering |
| `QualityReview(status)` | Review queue filtering |
| `QualityReview(score)` | Score-based filtering |

---

## Replaying Sample Events Locally

1. Start the backend:
   ```bash
   cd backend/crm-backend
   pnpm start:dev
   ```

2. Set the ingest secret in `.env`:
   ```
   TELEPHONY_INGEST_SECRET=test-telephony-secret
   ```

3. Run the replay script:
   ```bash
   npx ts-node src/telephony/fixtures/replay-events.ts
   ```

The replay script is useful for development/testing. In production, events flow automatically from AMI.
