# Core Integration — Sync Foundation

## Overview

This module provides a webhook-based integration layer so the external **core system** can keep Buildings, Clients, and Assets (devices) in sync with the CRM platform.

**Source of truth**: The core system owns entity data. CRM is a downstream consumer. When the core pushes an event, CRM upserts the corresponding record.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CORE_INTEGRATION_ENABLED` | No | Set to `true` to signal that the real core system is connected. Triggers warnings on local ID generation. Default: `false`. |
| `CORE_WEBHOOK_SECRET` | Yes (for webhook) | Shared secret that the core system sends in the `X-Core-Secret` header. Webhook requests without a valid secret are rejected with 403. |

## Endpoints

### POST `/v1/integrations/core/webhook`

Receives events from the core system. Authenticated via `X-Core-Secret` header (no JWT needed).

### GET `/v1/integrations/core/status`

Returns sync health for the last 24 hours. Requires JWT authentication.

### GET `/v1/integrations/core/events?status=FAILED&limit=50`

Lists recent sync events filtered by status. Requires JWT authentication. Payload field is excluded to avoid leaking sensitive data.

## Event Format

Every webhook request is a single JSON object:

```json
{
  "eventId": "evt_unique_id_from_core",
  "eventType": "building.upsert",
  "payload": { ... }
}
```

### Supported Event Types

#### `building.upsert`

Creates or updates a building by `coreId`.

```json
{
  "eventId": "evt-b-001",
  "eventType": "building.upsert",
  "payload": {
    "coreId": 42,
    "name": "Sunrise Towers",
    "address": "10 Main St",
    "city": "Tbilisi",
    "coreCreatedAt": "2025-06-15T10:00:00Z",
    "coreUpdatedAt": "2026-02-20T14:30:00Z"
  }
}
```

#### `client.upsert`

Creates or updates a client. Optionally syncs building links (many-to-many).

```json
{
  "eventId": "evt-c-001",
  "eventType": "client.upsert",
  "payload": {
    "coreId": 100,
    "firstName": "Nika",
    "lastName": "Beridze",
    "idNumber": "01010101010",
    "paymentId": "PAY-100",
    "primaryPhone": "+995599111222",
    "secondaryPhone": "+995555000111",
    "buildingCoreIds": [42, 43],
    "coreCreatedAt": "2025-06-15T10:00:00Z",
    "coreUpdatedAt": "2026-02-20T14:30:00Z"
  }
}
```

When `buildingCoreIds` is provided, the service replaces the client's current building links to match the provided list (adds missing, removes extra).

#### `asset.upsert`

Creates or updates an asset (device). Reassigns to a different building if `assignedBuildingCoreId` changes.

```json
{
  "eventId": "evt-a-001",
  "eventType": "asset.upsert",
  "payload": {
    "coreId": 500,
    "name": "Main Elevator",
    "type": "ELEVATOR",
    "ip": "10.0.0.10",
    "status": "ONLINE",
    "assignedBuildingCoreId": 42,
    "coreCreatedAt": "2025-06-15T10:00:00Z",
    "coreUpdatedAt": "2026-02-20T14:30:00Z"
  }
}
```

#### `*.deactivate`

Soft-deletes a building, client, or asset (`isActive=false`, `deletedAt=now`). Existing work orders and incidents linked to it are preserved.

```json
{
  "eventId": "evt-d-001",
  "eventType": "building.deactivate",
  "payload": {
    "coreId": 42
  }
}
```

Works the same for `client.deactivate` and `asset.deactivate`.

## Idempotency

Every event is recorded in the `SyncEvent` table before processing.

- If an `eventId` has already been received, the webhook returns `200 { "status": "already_processed" }` without reprocessing.
- On success, the event is marked `PROCESSED` with a timestamp.
- On failure, the event is marked `FAILED` with the error message, and the webhook returns `500`.

This means the core system can safely retry failed deliveries using the same `eventId`.

## Soft-Delete Policy

Deactivation events set `isActive = false` and `deletedAt = <timestamp>`. Records are never hard-deleted by the sync layer. This preserves referential integrity for work orders, incidents, and other linked records.

An upsert event on a previously deactivated entity will re-activate it (`isActive = true`, `deletedAt = null`).

## Manual Creation vs Core Sync

The existing admin-manual endpoints (`POST /v1/admin/buildings`, etc.) remain active and use `IdGeneratorService` to create local `coreId` values.

When `CORE_INTEGRATION_ENABLED=true`:
- `IdGeneratorService` emits a warning log on every call, since locally-generated IDs may collide with real core IDs.
- Before connecting the real core, **seed `ExternalIdCounter.nextId`** for each entity above the core system's current maximum ID to avoid collisions.
- Prefer disabling manual creation (`FEATURE_MANUAL_CREATE=false`) once the core webhook is active.

## Testing the Webhook Locally

```bash
# 1. Set the secret in your .env:
#    CORE_WEBHOOK_SECRET=my-dev-secret

# 2. Start the backend:
#    cd backend/crm-backend && pnpm start:dev

# 3. Send a building upsert:
curl -X POST http://localhost:3000/v1/integrations/core/webhook \
  -H "Content-Type: application/json" \
  -H "X-Core-Secret: my-dev-secret" \
  -d '{
    "eventId": "test-001",
    "eventType": "building.upsert",
    "payload": {
      "coreId": 9999,
      "name": "Test Building",
      "city": "Tbilisi"
    }
  }'

# 4. Check sync status (requires JWT cookie):
curl http://localhost:3000/v1/integrations/core/status \
  -H "Cookie: access_token=<your-jwt>"

# 5. Check failed events:
curl "http://localhost:3000/v1/integrations/core/events?status=FAILED&limit=10" \
  -H "Cookie: access_token=<your-jwt>"
```

## Architecture Diagram

```
Core System
    │
    ▼  POST /v1/integrations/core/webhook  (X-Core-Secret)
┌──────────────────────────┐
│  CoreIntegrationController│
│  - idempotency check      │
│  - record SyncEvent       │
│  - delegate to service    │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│     CoreSyncService       │
│  - upsertBuilding         │
│  - upsertClient           │
│    └─ syncClientBuildings │
│  - upsertAsset            │
│  - deactivate             │
└──────────┬───────────────┘
           ▼
┌──────────────────────────┐
│    Prisma / PostgreSQL    │
│  Building, Client, Asset  │
│  ClientBuilding, SyncEvent│
└──────────────────────────┘
```
