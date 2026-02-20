# Call Center Module - Technical Documentation

## Overview

The Call Center module provides a foundation for telephony analytics and quality monitoring, designed to integrate with Asterisk PBX. It processes call events, computes KPIs, manages missed-call callbacks, and supports quality review workflows.

**Current status:** Data/analytics platform ready. Asterisk AMI/ARI integration is not yet connected -- the ingestion API accepts events in the expected format so integration is plug-in.

---

## Event Types & Asterisk Mapping

| Event Type        | Asterisk Source         | Key Fields                                    | Description                          |
|-------------------|-------------------------|-----------------------------------------------|--------------------------------------|
| `call_start`      | AMI `Newchannel`        | linkedId, uniqueId, callerIdNum, context       | New call initiated                   |
| `call_answer`     | AMI `Answer`            | linkedId, channel                              | Call answered by party               |
| `call_end`        | AMI `Hangup`            | linkedId, cause, causeTxt                      | Call ended                           |
| `queue_enter`     | AMI `QueueCallerJoin`   | linkedId, queue, position                      | Caller enters queue                  |
| `queue_leave`     | AMI `QueueCallerLeave`  | linkedId, queue, position                      | Caller leaves queue                  |
| `agent_connect`   | AMI `AgentConnect`      | linkedId, extension, holdTime, queue           | Agent picks up queued call           |
| `transfer`        | AMI `BlindTransfer`     | linkedId, extension                            | Call transferred to another agent    |
| `hold_start`      | AMI `MusicOnHoldStart`  | linkedId                                       | Call placed on hold                  |
| `hold_end`        | AMI `MusicOnHoldStop`   | linkedId                                       | Call resumed from hold               |
| `recording_ready` | CDR / custom webhook    | linkedId, recordingFile, recordingDuration      | Recording file available             |
| `wrapup_start`    | Custom agent event      | linkedId                                       | Agent begins after-call work         |
| `wrapup_end`      | Custom agent event      | linkedId                                       | Agent finishes after-call work       |

### Asterisk Field Mapping

- **linkedId**: Asterisk's `Linkedid` -- correlates all channels in a call. Used as `CallSession.linkedId` (unique).
- **uniqueId**: Asterisk's `Uniqueid` -- identifies a single channel. Stored as `CallSession.uniqueId`.
- **cause/causeTxt**: Maps to `CallDisposition`:
  - `16` / `NORMAL_CLEARING` → ANSWERED
  - `19` / `NO_ANSWER` → NOANSWER
  - `17` / `USER_BUSY` → BUSY
  - `487` / `ORIGINATOR_CANCEL` → ABANDONED
  - Others → MISSED or FAILED

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

### After-Hours Queue Setup

1. In Asterisk, configure out-of-hours routing to a queue named e.g. `nowork`
2. In CRM, create a `TelephonyQueue` row with `name='nowork'` and `isAfterHoursQueue=true`
3. When calls arrive in that queue, they are automatically classified as OUT_OF_HOURS

### Callback Lifecycle

```
PENDING → ATTEMPTING → DONE / FAILED / CANCELED
```

- **PENDING**: Awaiting agent pickup
- **ATTEMPTING**: Agent is calling back (attemptsCount incremented)
- **DONE**: Callback completed successfully
- **FAILED**: All attempts exhausted
- **CANCELED**: Manually cancelled by supervisor

---

## Worktime Logic (Reporting Only)

> **Important:** Worktime config is NOT used for callback scheduling or after-hours detection.
> Asterisk owns after-hours routing. CRM uses the queue's `isAfterHoursQueue` flag instead.
> The worktime config below is available for optional reporting use (e.g. "calls outside configured hours" reports).

Each `TelephonyQueue` can optionally have a `worktimeConfig` JSON field:

```json
{
  "timezone": "Asia/Tbilisi",
  "windows": [
    { "day": 1, "start": "09:00", "end": "18:00" },
    { "day": 2, "start": "09:00", "end": "18:00" },
    { "day": 3, "start": "09:00", "end": "18:00" },
    { "day": 4, "start": "09:00", "end": "18:00" },
    { "day": 5, "start": "09:00", "end": "18:00" }
  ]
}
```

- `day`: 0=Sunday, 1=Monday, ..., 6=Saturday
- `start`/`end`: 24-hour format, `end` is exclusive
- `timezone`: IANA timezone name

If no `worktimeConfig` is set, the queue is considered "always open".

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

3. (Optional) Create a test queue:
   ```sql
   INSERT INTO "TelephonyQueue" (id, name, strategy, "isActive", "createdAt", "updatedAt")
   VALUES (gen_random_uuid(), 'support', 'RRMEMORY', true, now(), now());
   ```

4. Run the replay script:
   ```bash
   npx ts-node src/telephony/fixtures/replay-events.ts
   ```

5. Verify data:
   - Check `CallSession` table for 3 sessions
   - Check `CallMetrics` for computed metrics
   - Check `MissedCall` for the abandoned call (sample-002)
   - Check `QualityReview` for auto-created reviews (sample-001, sample-003)

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
| Occupancy Proxy | total handle time / shift duration | Requires shift data (stub) |

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

## API Endpoints

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
- `GET /v1/telephony/queues/live` -- best-effort queue state
- `GET /v1/telephony/agents/live` -- best-effort agent presence

### Quality Reviews (JWT-protected)
- `GET /v1/telephony/quality/reviews` -- paginated reviews
- `GET /v1/telephony/quality/reviews/:id` -- single review detail
- `PATCH /v1/telephony/quality/reviews/:id` -- update score/summary
- `GET /v1/telephony/quality/rubrics` -- list scoring criteria
- `POST /v1/telephony/quality/rubrics` -- create/update criteria

---

## Future Integration Plan (AMI/ARI/CDR)

### Phase 1: CDR Import (Batch)
- Create a scheduled job that reads Asterisk CDR records (CSV or DB)
- Map CDR fields to `call_start` + `call_end` events
- Post through the existing ingestion API

### Phase 2: AMI Real-Time Events
- Add an AMI client service (`@nestjs/schedule` or standalone process)
- Connect to Asterisk Manager Interface
- Map AMI events to telephony event types in real-time
- Replace "best-effort" live monitoring with real-time data

### Phase 3: ARI Integration
- Use ARI for call control (auto-answer, transfer, recording triggers)
- Enable agent presence management
- Support click-to-call from CRM UI

### What Changes When Asterisk Comes Online
1. The replay script is replaced by live AMI/ARI event flow
2. `TelephonyExtension` records are populated from Asterisk config
3. `TelephonyQueue` records mirror Asterisk queue configuration
4. Live monitoring endpoints become real-time (remove disclaimers)
5. Recording URLs point to actual Asterisk recording storage
6. Quality review pipeline can trigger real AI transcription/scoring
