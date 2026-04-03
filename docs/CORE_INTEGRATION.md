# Core System → CRM Integration

## Overview

CRM28 syncs data **one-way** from a legacy core system (Java/Hibernate, MySQL) into the CRM (NestJS, PostgreSQL). The core system manages the company's main operations — buildings, clients, devices, billing. The CRM adds modern UI, work orders, incidents, telephony, and chat.

```
Local Network (VPN)                              Production VM (192.168.65.110) ��� planned VM migration
┌─────────────────────────────────────┐         ┌──────────────────────────┐
│                                     │         │                          │
│  Core MySQL (192.168.65.97:3306)    │         │  CRM Backend (NestJS)    │
│  Database: tttt                     │         │  localhost:3000        │
│  User: asg_tablau (READ-ONLY)       │         │                          │
│  ⛔ NEVER WRITE TO THIS DATABASE    │         │  ┌────────────────────��  │
│       ▲                             │         │  │ Webhook Receiver   │  │
│       │ SELECT only                 │  HTTPS  │  │ /v1/integrations/  │  │
│       │ READ UNCOMMITTED            │         │  │ core/webhook       │  │
│       │ single connection           │         │  └────────┬───────────┘  │
│  ┌────┴──────���──────────────┐       │         │           │              │
│  │  Core Sync Bridge        ├──────────────────► CoreSyncService      │  │
│  │  Node.js + PM2           │       │         │  (upsert logic)       │  │
│  │  192.168.65.110          │       │         │           │              │
│  │                          │       │         │  ┌────────▼───────────┐  │
│  │  Delta poll: every 5 min │       │         │  │ CRM PostgreSQL     │  │
│  │  Count check: hourly     │       │         │  │ (VM / Docker dev) │  │
│  │  Gap repair: 3 AM        │       │         │  └────────────────────┘  │
│  └──────────────────────────┘       │         │                          │
└─────────────────────────────────────┘         └──────────────────────────┘
```

### ⛔ ABSOLUTE RULE: Core MySQL is READ-ONLY

The core database at `192.168.65.97:3306` must **NEVER** be written to. This is enforced at multiple levels:
1. MySQL user `asg_tablau` has read-only grants
2. Bridge code validates every query — blocks INSERT/UPDATE/DELETE/ALTER/DROP/CREATE/TRUNCATE
3. All connections use `READ UNCOMMITTED` isolation (zero locking)
4. Connection pool limited to 1 connection, 10-second timeout
5. No `FOR UPDATE` or `LOCK IN SHARE MODE` — ever

---

## Sync Layers

| Layer | Schedule | What | DB Load | Code |
|---|---|---|---|---|
| **Delta Poll** | Every 5 min, 24/7 | `WHERE lastModifiedDate > checkpoint` | 5 tiny indexed queries | `delta-poller.ts` |
| **Count Verification** | Every hour | `SELECT COUNT(*)` per entity | 3 queries, <5ms | `count-verifier.ts` |
| **Gap Repair** | 3 AM nightly | Fix mismatches found during day | Only if gaps exist | `gap-repairer.ts` |
| **Bulk Load** | Once, manual | Load all existing data | Batched with pauses | `bulk-loader.ts` |

### How Data Flows

1. **Bridge** reads from core MySQL (SELECT only)
2. Bridge posts HTTPS webhook to CRM backend: `POST /v1/integrations/core/webhook`
3. Webhook authenticated via `x-core-secret` header (HMAC shared secret)
4. `CoreSyncService` upserts data into CRM PostgreSQL
5. Each event is deduplicated by `eventId` in the `SyncEvent` table

---

## Entity Field Mappings

### Manual vs Synced Records

There is no `source` field. Instead:
- `coreId IS NOT NULL` → synced from core system
- `coreId IS NULL` → manually created in CRM
- Sync only touches records with a `coreId`

### 1. Building

**Core table**: `company` (lowercase, Java/Hibernate convention)

| Core Column | Type | CRM Field | Type | Notes |
|---|---|---|---|---|
| `id` | int | `coreId` | Int? @unique | Primary link |
| `companyName` | varchar | `name` | String | Required |
| `address` | varchar | `address` | String? | |
| `mobileNumber` | varchar | `phone` | String? | |
| `email` | varchar | `email` | String? | |
| `numberOfAppartments` | int | `numberOfApartments` | Int? | Note: core has typo "Appartments" |
| `disableCrons` | bit(1) | `disableCrons` | Boolean | MySQL bit(1) → Buffer in mysql2, must check `Buffer.isBuffer()` |
| *(derived)* | | `isActive` | Boolean | `!disableCrons` — if crons disabled, building is inactive |
| `assignedBranchId` | int | `branchId` | Int? | Core branch reference |
| `creationDate` | datetime | `coreCreatedAt` | DateTime? | |
| `lastModifiedDate` | datetime | `coreUpdatedAt` | DateTime? | Used for delta polling checkpoint |

**NOT synced**: `identificationCode` (not needed per business decision)

### 2. Client

**Core table**: `client` (lowercase)

| Core Column | Type | CRM Field | Type | Notes |
|---|---|---|---|---|
| `id` | int | `coreId` | Int? @unique | Primary link |
| `firstName` | varchar | `firstName` | String? | |
| `lastName` | varchar | `lastName` | String? | |
| `documentID` | varchar | `idNumber` | String? | Georgian personal ID |
| `mobileNumber` | varchar | `primaryPhone` | String? | |
| `secondaryMobileNumber` | varchar | `secondaryPhone` | String? | |
| `email` | varchar | `email` | String? | |
| `creationDate` | datetime | `coreCreatedAt` | DateTime? | |
| `lastModifiedDate` | datetime | `coreUpdatedAt` | DateTime? | Delta polling checkpoint |

**NOT synced**: `state` (not needed per business decision)

### 3. Apartment (Client-Building Link)

**Core table**: `savingaccount` WHERE `AccountType = 'CURRENT_ACCOUNT'`

| Core Column | Type | CRM Field | Type | Notes |
|---|---|---|---|---|
| `ID` | int | `apartmentCoreId` | Int? | SavingAccount row ID |
| `clientID` | int | → `clientId` (UUID) | String | Looked up via Client.coreId |
| `assignedToBuildingID` | int | → `buildingId` (UUID) | String | Looked up via Building.coreId |
| `apartmentNumber` | varchar | `apartmentNumber` | String? | |
| `entranceNumber` | varchar | `entranceNumber` | String? | |
| `floorNumber` | varchar | `floorNumber` | String? | |
| `paymentID` | varchar | `paymentId` | String? | Unique per apartment |
| `consolidatedBalance` | decimal | `balance` | Float? | Can be negative |

**⚠️ IMPORTANT**: Uses `assignedToBuildingID` to link apartments to buildings, **NOT** `companyID` (which is NULL for CURRENT_ACCOUNT rows).

**CRM unique constraint**: `@@unique([clientId, buildingId, apartmentCoreId])`

### 4. Device (Lift, Door, Intercom)

**Core table**: `savingaccount` WHERE `AccountType IN ('LIFT', 'DOOR', 'INTERCOM')`

| Core Column | Type | CRM Field | Type | Notes |
|---|---|---|---|---|
| `ID` | int | `coreId` | Int? @unique | |
| `NAME` | varchar | `name` | String | |
| `AccountType` | varchar | `type` | String | LIFT, DOOR, or INTERCOM |
| `productID` | int | `productId` | String? | Stored as string in CRM |
| `ip` | varchar | `ip` | String? | |
| `port` | varchar | `port` | String? | Core stores as varchar (e.g., "Int: 4370 Ext: 4375") |
| `assignedToBuildingID` | int | `assignedBuildingCoreId` | Int? | Links to Building |
| `CREATIONDATE` | datetime | `coreCreatedAt` | DateTime? | Note: ALL CAPS in core |
| `lastModifiedDate` | datetime | `coreUpdatedAt` | DateTime? | Delta polling checkpoint |

### 5. Smart GSM Gate

**Core table**: `smartgsmgate` (no underscore)

| Core Column | Type | CRM Field | Type | Notes |
|---|---|---|---|---|
| `ID` | int | `coreId` | Int? @unique | **Offset by +10,000,000** to avoid collision with savingaccount IDs |
| `name` | varchar | `name` | String | |
| *(hardcoded)* | | `type` | String | Always `"SMART_GSM_GATE"` |
| `companyID` | int | `assignedBuildingCoreId` | Int? | Links to Building, **only syncs WHERE companyID IS NOT NULL** (43/1972 have non-null) |
| `smartGSMGateNumber1` | varchar | `door1` | String? | |
| `smartGSMGateNumber2` | varchar | `door2` | String? | |
| `smartGSMGateNumber3` | varchar | `door3` | String? | |

**⚠️ No timestamp columns** — this table cannot be delta-polled. Only synced during bulk load. Changes require manual re-sync or full reload.

### 6. Building Contact

**Core table**: `contactperson` (no underscore)

| Core Column | Type | CRM Field | Type | Notes |
|---|---|---|---|---|
| `id` | int | `coreId` | Int @unique | |
| `name` | varchar | `name` | String | |
| `type` | int | `type` | String | Numeric code from core (0, 1, 2, etc.) |
| `description` | varchar | `description` | String? | Often contains phone numbers in text |
| `companyID` | int | → `buildingId` (UUID) | String | Looked up via Building.coreId |
| `contactClientID` | int | → `clientId` (UUID) | String? | Optional link to Client |

**⚠️ No timestamp columns** �� cannot be delta-polled, like gates.
**⚠️ Missing fields**: `contactperson` has NO `mobileNumber`, `email`, or `documentID` columns despite what you might expect.

---

## Core MySQL Schema Notes

The core system uses Java/Hibernate conventions:

- **Table names are lowercase, no underscores**: `savingaccount` (not `saving_account`), `smartgsmgate` (not `smart_gsm_gate`), `contactperson` (not `contact_person`)
- **Column names are MIXED CASE**: `ID`, `NAME`, `CREATIONDATE`, `AccountType`, `assignedToBuildingID`, `clientID`
- **`bit(1)` columns** return as `Buffer` in mysql2 — always check `Buffer.isBuffer(val) ? val[0] === 1 : Boolean(val)`
- **`port`** in savingaccount is `varchar`, not integer — stores strings like `"Int: 4370 Ext: 4375"`
- **Gate ID offset**: Smart GSM Gate IDs are offset by `+10,000,000` in CRM to avoid collision with savingaccount IDs. If savingaccount IDs ever exceed 10M, this needs revisiting.

---

## Bridge Infrastructure

### Location
- **VM**: `192.168.65.110` (Windows Server, same network as core MySQL)
- **SSH**: `ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110`
- **Path**: `C:\core-sync-bridge\`
- **Process Manager**: PM2 (`pm2 start ecosystem.config.js`)
- **VPN Required**: Yes (OpenVPN TAP adapter)

### Bridge Files (`core-sync-bridge/src/`)

| File | Purpose |
|---|---|
| `config.ts` | Environment variable loader with validation |
| `mysql-client.ts` | READ-ONLY MySQL pool (1 conn, READ UNCOMMITTED) |
| `crm-poster.ts` | Webhook poster with retry + exponential backoff |
| `checkpoint.ts` | JSON file-based polling checkpoint persistence |
| `logger.ts` | Structured logger with levels |
| `main.ts` | Entry point — starts polling loops |
| `delta-poller.ts` | Every 5 min: query changed records, post webhooks |
| `count-verifier.ts` | Hourly: compare counts, log mismatches |
| `gap-repairer.ts` | 3 AM: fix mismatches from count verifier |
| `bulk-loader.ts` | One-time full data load (batched, with pauses) |
| `resync-client.ts` | Utility: re-sync single client by coreId |

### Bridge .env Configuration

```env
# Core MySQL (READ-ONLY!)
CORE_MYSQL_HOST=192.168.65.97
CORE_MYSQL_PORT=3306
CORE_MYSQL_USER=asg_tablau
CORE_MYSQL_PASSWORD=<password>
CORE_MYSQL_DATABASE=tttt

# CRM Backend
CRM_WEBHOOK_URL=http://127.0.0.1:3000/v1/integrations/core/webhook
CRM_WEBHOOK_SECRET=<must-match-CORE_WEBHOOK_SECRET-on-VM-backend>

# Polling
POLL_INTERVAL_MINUTES=5
COUNT_CHECK_INTERVAL_MINUTES=60
NIGHTLY_REPAIR_HOUR=3
LOG_LEVEL=INFO
```

### Common Bridge Commands

```powershell
# On the VM (SSH first):
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110

# Bulk load single building (test):
cd C:\core-sync-bridge
npx tsx src/bulk-loader.ts --building 20

# Bulk load all buildings:
npx tsx src/bulk-loader.ts

# Re-sync single client:
npx tsx src/resync-client.ts 288

# Start continuous sync (PM2):
pm2 start ecosystem.config.js
pm2 logs core-sync-bridge
pm2 status
```

---

## CRM Backend Webhook Handler

### Endpoint
`POST /v1/integrations/core/webhook`

### Authentication
- Header: `x-core-secret` must match `CORE_WEBHOOK_SECRET` env var
- Guard: `CoreWebhookGuard` (timing-safe comparison)
- Rate limiting: Skipped via `@SkipThrottle()`

### Event Types
| Event Type | Handler | Description |
|---|---|---|
| `building.upsert` | `upsertBuilding()` | Create/update building |
| `client.upsert` | `upsertClient()` | Create/update client + apartment links |
| `asset.upsert` | `upsertAsset()` | Create/update device |
| `contact.upsert` | `upsertContact()` | Create/update building contact |
| `building.deactivate` | `deactivate("building")` | Soft-delete building |
| `client.deactivate` | `deactivate("client")` | Soft-delete client |
| `asset.deactivate` | `deactivate("asset")` | Soft-delete device |
| `contact.deactivate` | `deactivateContact()` | Deactivate contact |

### Diagnostic Endpoints (JWT + `core_integration.view` permission)
| Endpoint | Description |
|---|---|
| `GET /v1/integrations/core/status` | Last 24h event counts, last processed/failed |
| `GET /v1/integrations/core/events?status=FAILED&limit=20` | Recent sync events |
| `GET /v1/integrations/core/checkpoints` | Polling checkpoints per entity |
| `GET /v1/integrations/core/health` | Entity counts, sync health status |

### Event Deduplication
Every webhook carries a UUID `eventId`. The backend stores it in `SyncEvent` table and rejects duplicates.

---

## Prisma Models (Sync-Related)

### New Models
- **`BuildingContact`** — building contacts from `contactperson`. FK to Building (cascade) and Client (optional).
- **`SyncCheckpoint`** — polling checkpoint per entity type.
- **`SyncEvent`** — audit log for every webhook event (RECEIVED → PROCESSED/FAILED).

### Modified Models
- **Building**: Added `phone`, `email`, `numberOfApartments`, `disableCrons`, `branchId`. Made `coreId` nullable.
- **Client**: Added `email`. Made `coreId` nullable.
- **Asset**: Added `port` (String), `productId`, `assignedBuildingCoreId`, `door1`, `door2`, `door3`. Made `coreId` nullable.
- **ClientBuilding**: Changed from composite PK `[clientId, buildingId]` to UUID PK `id`. Added `apartmentCoreId`, `apartmentNumber`, `entranceNumber`, `floorNumber`, `paymentId`, `balance`. Unique constraint: `[clientId, buildingId, apartmentCoreId]`.

---

## Troubleshooting

### Production Deploy Crash (Prisma Migration Failed)

If VM deploy fails with `P3009 — migrate found failed migrations`:

1. SSH to VM and check what failed:
   ```powershell
   C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm -c "SELECT migration_name, logs FROM _prisma_migrations WHERE finished_at IS NULL;"
   ```

2. Mark the migration as applied:
   ```powershell
   cd C:\crm\backend\crm-backend
   npx prisma migrate resolve --applied <migration_name>
   ```

3. Re-run the deploy: `pm2 restart crm-backend`

For **staging** (Railway), use `railway` CLI with `--environment dev`.

### Bridge Can't Connect to MySQL
- Verify VPN is connected (OpenVPN TAP adapter)
- MySQL user `asg_tablau` is only allowed from `192.168.65.110` — bridge MUST run on the VM
- Check: `ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "cd C:\core-sync-bridge; npx tsx -e \"require('./src/mysql-client').testConnection().then(console.log)\""`

### Webhook Returns 429
- The CRM has a global rate limiter (60 req/60s per IP)
- The webhook endpoint has `@SkipThrottle()` — if you're still getting 429, check that the decorator is applied
- The bulk loader spaces requests naturally; delta poller sends <20 per cycle

### Data Mismatch After Sync
- Check `SyncEvent` table: `GET /v1/integrations/core/events?status=FAILED`
- Re-sync specific entities:
  - Single building: `npx tsx src/bulk-loader.ts --building <id>`
  - Single client: `npx tsx src/resync-client.ts <clientCoreId>`
  - Full reload: `npx tsx src/bulk-loader.ts` (off-hours only)

---

## Planned Improvements

### ~~Railway → VM Migration~~ ✅ COMPLETED (April 2026)
CRM backend moved from Railway to VM 192.168.65.110. Benefits realized:
- Same-network access to core MySQL (no internet roundtrip)
- Lower latency for webhook processing (bridge → backend is localhost)
- No Railway hosting fees
- Direct database access without public proxy

### Sync Health Monitoring
Currently planned:
- Sync health agent that monitors webhook success rates
- Alerting when sync failures exceed threshold
- Auto-retry failed events
- Dashboard widget showing sync status

### Missing Delta Polling
`smartgsmgate` and `contactperson` tables have no timestamp columns, so they can't be delta-polled. Options:
- Request timestamp columns from core system team
- Periodic full reload of these tables (e.g., weekly)
- Hash-based change detection (compare row hashes)

---

## Sync Statistics (Building 20 Test)

| Entity | Count | Time |
|---|---|---|
| Building | 1 | <1s |
| Clients | 94 | ~8s |
| Apartment links | 94 | (included in client sync) |
| Devices | 5 (2 DOOR + 3 LIFT) | ~2s |
| Smart GSM Gates | 0 | <1s |
| Building Contacts | 3 | <1s |
| **Total webhooks** | **103** | **12s** |

Full bulk load estimate: ~1,277 buildings × 12s ≈ 4-5 hours (with batch pauses).
