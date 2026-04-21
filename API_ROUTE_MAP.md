# API Route Map

Complete API route documentation for CRM Platform backend.

---

## Buildings Module

**File**: `src/buildings/buildings.controller.ts`  
**Base Route**: `/buildings`  
**Guards**: None (read-only endpoints)

**Endpoints**:
- `GET /buildings` - List all buildings
- `GET /buildings/:coreId` - Get building by coreId

**Notes**: Read-only endpoints. Manual creation handled via `/v1/admin/buildings`

---

## Clients Module

**File**: `src/clients/clients.module.ts`  
**Base Route**: N/A (no controller, service only)

**Endpoints**: None (accessed via other controllers)

**Notes**: Clients accessed via:
- `/v1/buildings/:buildingCoreId/clients` (PublicController)
- `/v1/admin/buildings/:buildingCoreId/clients` (AdminManualController)

---

## Incidents Module

**File**: `src/v1/incidents.controller.ts`  
**Base Route**: `/v1`  
**Guards**: 
- `JwtAuthGuard` (on POST only)
- `PositionPermissionGuard` (on POST only)
- `@RequirePermission('incidents.create')` (on POST only)

**Endpoints**:
- `GET /v1/incidents` - List incidents (query: q, status, priority, buildingId, clientId, page, pageSize)
- `POST /v1/incidents` - Create incident (guarded: JwtAuthGuard, PositionPermissionGuard, requires 'incidents.create')
- `GET /v1/incidents/:id` - Get incident by ID
- `PATCH /v1/incidents/:id/status` - Update incident status
- `GET /v1/clients/:clientId/incidents` - List incidents for a client
- `GET /v1/buildings/:buildingId/incidents` - List incidents for a building

---

## Work Orders Module

**File**: `src/v1/work-orders.controller.ts`  
**Base Route**: `/v1/work-orders`  
**Guards**: `JwtAuthGuard` (all endpoints)

**Endpoints**:
- `POST /v1/work-orders` - Create work order
- `GET /v1/work-orders` - List work orders (query: page, pageSize, status, type, buildingId)
- `GET /v1/work-orders/my-tasks` - Get work orders for current employee (workspace)
- `GET /v1/work-orders/:id` - Get work order by ID
- `PATCH /v1/work-orders/:id` - Update work order
- `DELETE /v1/work-orders/:id` - Delete work order
- `POST /v1/work-orders/:id/assign` - Assign employees to work order
- `PATCH /v1/work-orders/:id/start` - Start work on work order
- `POST /v1/work-orders/:id/products` - Submit product usage
- `POST /v1/work-orders/:id/deactivated-devices` - Submit deactivated devices
- `POST /v1/work-orders/:id/complete` - Submit work for approval
- `POST /v1/work-orders/:id/approve` - Approve work order (with optional product modifications)
- `POST /v1/work-orders/:id/cancel` - Cancel work order
- `POST /v1/work-orders/:id/request-repair` - Request diagnostic → repair conversion
- `GET /v1/work-orders/:id/activity` - Get activity log

**Notes**: 
- Workflow actions (assign, start, approve, cancel) are role-based
- Head of Technical Department can modify products before approval
- Products are deducted from inventory upon approval

---

## Workflow Configuration Module

**File**: `src/v1/workflow.controller.ts`  
**Base Route**: `/v1/workflow`  
**Guards**: `JwtAuthGuard` (all endpoints)

**Endpoints**:
- `GET /v1/workflow/steps` - List all workflow steps with assigned positions
- `GET /v1/workflow/steps/:id` - Get workflow step by ID
- `PATCH /v1/workflow/steps/:id` - Update workflow step
- `POST /v1/workflow/steps/:stepId/positions` - Assign position to step
- `DELETE /v1/workflow/steps/:stepId/positions/:positionId` - Remove position from step
- `PATCH /v1/workflow/steps/:stepId/positions` - Set all positions for step
- `GET /v1/workflow/positions` - List all active positions
- `GET /v1/workflow/steps/:stepKey/employees` - Get employees for workflow step
- `GET /v1/workflow/triggers` - List triggers (query: ?workOrderType=)
- `GET /v1/workflow/triggers/overview` - Triggers grouped by type (query: ?workOrderType=)
- `GET /v1/workflow/triggers/:id` - Get single trigger with actions
- `POST /v1/workflow/triggers` - Create workflow trigger
- `PATCH /v1/workflow/triggers/:id` - Update workflow trigger
- `DELETE /v1/workflow/triggers/:id` - Delete workflow trigger
- `POST /v1/workflow/triggers/:triggerId/actions` - Add action to trigger
- `PATCH /v1/workflow/triggers/actions/:actionId` - Update trigger action
- `DELETE /v1/workflow/triggers/actions/:actionId` - Delete trigger action

**Notes**: 
- Admin-only endpoints for configuring workflow steps and automation triggers
- Each step can have multiple positions assigned
- Positions determine who receives tasks at each step
- Triggers fire on status changes, field changes, inactivity, or deadline proximity
- Each trigger can have multiple actions (System Notification, Email, SMS)

---

## Inventory Module

**File**: `src/inventory/inventory.controller.ts`  
**Base Route**: `/v1/inventory`  
**Guards**: `JwtAuthGuard` (all endpoints)

**Endpoints**:
- `POST /v1/inventory/products` - Create product
- `GET /v1/inventory/products` - List products (query: category, lowStock)
- `GET /v1/inventory/products/:id` - Get product by ID
- `PUT /v1/inventory/products/:id` - Update product
- `DELETE /v1/inventory/products/:id` - Delete product
- `POST /v1/inventory/purchase-orders` - Create purchase order
- `GET /v1/inventory/purchase-orders` - List purchase orders (query: status)
- `GET /v1/inventory/purchase-orders/:id` - Get purchase order by ID
- `PUT /v1/inventory/purchase-orders/:id` - Update purchase order
- `PUT /v1/inventory/purchase-orders/:id/status` - Update purchase order status
- `POST /v1/inventory/adjustments` - Create stock adjustment
- `POST /v1/inventory/deduct-for-work-order` - Deduct stock for work order
- `GET /v1/inventory/transactions` - Get transactions (query: productId, limit)
- `GET /v1/inventory/reports/low-stock` - Get low stock report
- `GET /v1/inventory/reports/inventory-value` - Get inventory value report

---

## Employees Module

**File**: `src/employees/employees.controller.ts`  
**Base Route**: `/v1/employees`  
**Guards**: `JwtAuthGuard` (all endpoints), `PositionPermissionGuard` (lifecycle endpoints)

**Endpoints**:
- `POST /v1/employees` - Create employee (optionally with user account)
- `GET /v1/employees` - List employees (query: status, search) - includes login status
- `GET /v1/employees/:id` - Get employee by ID
- `PATCH /v1/employees/:id` - Update employee
- `POST /v1/employees/:id/dismiss` - Dismiss/terminate employee (requires `employee.dismiss`)
- `POST /v1/employees/:id/activate` - Reactivate dismissed employee (requires `employee.activate`)
- `POST /v1/employees/:id/create-user` - Create user account for employee
- `POST /v1/employees/:id/reset-password` - Reset employee password (requires `employee.reset_password`)
- `GET /v1/employees/:id/deletion-constraints` - Check what blocks deletion (requires `employee.hard_delete`)
- `POST /v1/employees/:id/delegate-items` - Delegate active items to another employee
- `DELETE /v1/employees/:id/hard-delete` - Permanently delete employee (requires `employee.hard_delete`)

**Notes**:
- Employees can exist without user accounts (login disabled)
- User accounts derive permissions from Position → RoleGroup
- Dismissal sets status to TERMINATED and deactivates user account
- Hard delete requires delegation of active leads/work orders first
- Historical records preserve cached employee names after deletion

---

## Assets Module

**File**: N/A (no controller, service only)  
**Base Route**: N/A

**Endpoints**: None (accessed via other controllers)

**Notes**: Assets accessed via:
- `/v1/buildings/:buildingCoreId/assets` (PublicController)
- `/v1/admin/buildings/:buildingCoreId/assets` (AdminManualController)

---

## Roles Module

**File**: `src/roles/roles.controller.ts`  
**Base Route**: `/v1/roles`  
**Guards**: `JwtAuthGuard` (all endpoints)

**Endpoints**:
- `POST /v1/roles` - Create role
- `GET /v1/roles` - List all roles
- `GET /v1/roles/:id` - Get role by ID
- `GET /v1/roles/:id/permissions` - Get role permissions
- `PATCH /v1/roles/:id` - Update role
- `POST /v1/roles/:id/permissions` - Assign permissions to role
- `DELETE /v1/roles/:id` - Delete role

---

## Permissions Module

**File**: `src/permissions/permissions.controller.ts`  
**Base Route**: `/v1/permissions`  
**Guards**: `JwtAuthGuard` (all endpoints)

**Endpoints**:
- `GET /v1/permissions` - List all permissions
- `GET /v1/permissions/grouped` - Get permissions grouped by category
- `GET /v1/permissions/resource/:resource` - Get permissions by resource
- `GET /v1/permissions/:id` - Get permission by ID
- `GET /v1/permissions/me/effective` - Get current user's effective permissions (legacy)
- `GET /v1/permissions/my-effective-permissions` - Get current user's effective permissions

---

## Positions Module

**File**: `src/positions/positions.controller.ts`  
**Base Route**: `/v1/positions`  
**Guards**: `JwtAuthGuard`, `AdminOnlyGuard` (all endpoints)

**Endpoints**:
- `POST /v1/positions` - Create position
- `GET /v1/positions` - List all positions
- `GET /v1/positions/:id` - Get position by ID
- `GET /v1/positions/code/:code` - Get position by code
- `PATCH /v1/positions/:id` - Update position
- `DELETE /v1/positions/:id` - Delete position
- `GET /v1/positions/:id/permissions` - Get position permissions

---

## Role Groups Module

**File**: `src/role-groups/role-groups.controller.ts`  
**Base Route**: `/v1/role-groups`  
**Guards**: `JwtAuthGuard`, `AdminOnlyGuard` (all endpoints)

**Endpoints**:
- `POST /v1/role-groups` - Create role group
- `GET /v1/role-groups` - List all role groups
- `GET /v1/role-groups/:id` - Get role group by ID
- `PATCH /v1/role-groups/:id` - Update role group
- `DELETE /v1/role-groups/:id` - Delete role group
- `POST /v1/role-groups/:id/permissions` - Assign permissions to role group
- `GET /v1/role-groups/:id/permissions` - Get role group permissions

---

## Departments Module

**File**: `src/departments/departments.controller.ts`  
**Base Route**: `/v1/departments`  
**Guards**: `JwtAuthGuard` (all endpoints)

**Endpoints**:
- `POST /v1/departments` - Create department
- `GET /v1/departments` - List all departments
- `GET /v1/departments/hierarchy` - Get department hierarchy
- `GET /v1/departments/:id` - Get department by ID
- `PATCH /v1/departments/:id` - Update department
- `DELETE /v1/departments/:id` - Delete department

---

## V1 Module - Public Endpoints

**File**: `src/v1/public.controller.ts`  
**Base Route**: `/v1`  
**Guards**: None (public endpoints)

**Endpoints**:
- `GET /v1/buildings` - List all buildings
- `GET /v1/buildings/:buildingCoreId` - Get building by coreId
- `GET /v1/buildings/:buildingCoreId/clients` - List clients for a building
- `GET /v1/buildings/:buildingCoreId/assets` - List assets for a building
- `GET /v1/clients` - List all clients (global directory)

---

## V1 Module - Admin Manual Endpoints

**File**: `src/v1/admin-manual.controller.ts`  
**Base Route**: `/v1/admin`  
**Guards**: `JwtAuthGuard`, `FeatureFlagGuard`, `AdminOnlyGuard` (all endpoints)

**Endpoints**:
- `POST /v1/admin/buildings` - Create building (manual, with audit)
- `PATCH /v1/admin/buildings/:buildingCoreId` - Update building (with audit)
- `POST /v1/admin/buildings/:buildingCoreId/clients` - Create client for building(s) (with audit)
- `POST /v1/admin/buildings/:buildingCoreId/assets` - Create asset for building (with audit)

**Notes**: All endpoints log audit trails. Client creation supports multiple buildings via `buildingCoreIds` in body.

---

## Authentication Module

**File**: `src/auth/auth.controller.ts`  
**Base Route**: `/auth`  
**Guards**: `JwtAuthGuard` (on `/me` and `/device-token` endpoints)

**Endpoints**:
- `POST /auth/login` - Login (sets httpOnly cookie)
- `POST /auth/app-login` - Native/app login (returns `{ accessToken, user, telephonyExtension }` in JSON body; softphone initial credential fetch)
- `POST /auth/device-token` - Create short-lived device handshake token (guarded: JwtAuthGuard)
- `POST /auth/exchange-token` - Exchange device handshake token for JWT + softphone bootstrap
- `GET /auth/me` - Get current user with employee info and permissions (guarded: JwtAuthGuard). **Does NOT include `sipPassword` on `telephonyExtension` (audit/P0-B).** Softphone must call `GET /v1/telephony/sip-credentials` for that.
- `POST /auth/logout` - Logout (clears cookie)

## Telephony SIP Credentials (Softphone)

**File**: `src/telephony/controllers/telephony-sip-credentials.controller.ts`  
**Base Route**: `/v1/telephony/sip-credentials`  
**Guards**: `JwtAuthGuard + PositionPermissionGuard` (`softphone.handshake` permission)

**Endpoints**:
- `GET /v1/telephony/sip-credentials` - Returns the current user's own SIP credentials `{ extension, sipUsername, sipPassword, sipServer, displayName }`. Every call logged with userId/ip/ua. 404 if no active extension.

**Note (PR #249):** This is the ONLY endpoint that returns `sipPassword`. `/auth/me` and `/auth/app-login` explicitly strip this field. The softphone holds it in memory only — never persists to disk.

---

## Telephony Actions (Call Control)

**File**: `src/telephony/controllers/telephony-actions.controller.ts`  
**Base Route**: `/v1/telephony/actions`  
**Guards**: `JwtAuthGuard + PositionPermissionGuard` (`telephony.call` permission on all endpoints)

**Endpoints** (web-UI call control — these hit ARI/AMI on Asterisk, separate from the softphone's local SIP.js controls):
- `POST /v1/telephony/actions/originate` - Start outbound call from the user's extension. Body: `{ number, callerId? }`. Uses ARI if enabled, falls back to AMI Originate.
- `POST /v1/telephony/actions/transfer` - Transfer active channel. Body: `{ channel, extension }`.
- `POST /v1/telephony/actions/answer` - Answer ringing channel.
- `POST /v1/telephony/actions/hangup` - Hangup channel. Body: `{ channel }`.
- `POST /v1/telephony/actions/hold` - Put channel on hold (server-side with MOH).
- `POST /v1/telephony/actions/unhold` - Resume held channel.
- `POST /v1/telephony/actions/park` - Park channel for retrieval.

**Notes:**
- Operators and managers both need `telephony.call`. Missing this permission = 403 on hangup/transfer/hold from the web UI during an active call (the softphone's local controls still work).
- `/originate` requires a `TelephonyExtension` row linked to the calling user; returns 400 if missing.

---

## Missed Calls

**File**: `src/telephony/controllers/missed-calls.controller.ts`  
**Base Route**: `/v1/telephony/missed-calls`  
**Guards**: `JwtAuthGuard + PositionPermissionGuard`

**Endpoints**:
- `GET /v1/telephony/missed-calls` - List missed calls. Permission: `missed_calls.access`. Query params:
    - `status` - filter by `MissedCallStatus` (NEW / CLAIMED / ATTEMPTED / HANDLED / IGNORED / EXPIRED). Default: actionable statuses.
    - `queueId` - filter by specific Asterisk queue.
    - `reason` - **(added PR #278)** filter by `MissedCallReason` (`OUT_OF_HOURS` / `ABANDONED` / `NO_ANSWER`). Unknown values silently ignored.
    - `myClaimsOnly=true` - scope to `claimedByUserId = currentUser`.
    - `page`, `pageSize` (max 100).
- `PATCH /v1/telephony/missed-calls/:id/claim` - Claim ownership of a missed call. Permission: `missed_calls.manage`.
- `PATCH /v1/telephony/missed-calls/:id/attempt` - Log a call-back attempt. Permission: `missed_calls.manage`.
- `PATCH /v1/telephony/missed-calls/:id/resolve` - Mark resolved. Permission: `missed_calls.manage`.
- `PATCH /v1/telephony/missed-calls/:id/ignore` - Mark as ignored / non-actionable. Permission: `missed_calls.manage`.

**Notes:**
- `auto-resolve` runs when a subsequent answered CallSession has the same caller number; see `MissedCallsService.autoResolveByPhone()`. Only triggers for numbers ≥ 9 digits (shorter numbers are internal extensions).
- `reason=OUT_OF_HOURS` is set by `classifyMissedReason()` when `CallSession.queue.isAfterHoursQueue=true`. Queue 40 (non-working-hours queue) has this flag set as of PR #278. Per CLAUDE.md Silent Override Risk #18, `isAfterHoursQueue` is DB-authoritative — env var `AFTER_HOURS_QUEUES` only bootstraps new queues on CREATE.

---

## Agent Presence (Socket.IO)

**File**: `src/telephony/realtime/telephony.gateway.ts` + `src/telephony/services/agent-presence.service.ts` (PR #260)  
**Namespace**: `/telephony`  
**Guards**: `WsJwtGuard` (JWT via cookie)

**Events emitted to clients:**
- `agent.stale` - Agent's Socket.IO connection has been silent > N minutes. Emitted in real-time; previously required a 1-minute cron poll. Managers' live dashboards subscribe to flip presence indicators.
- `agent.presence` - General presence change (online / offline / on-call / after-call).
- `call.started`, `call.ended`, `call.transferred` - Call lifecycle events.

**Note:** All telephony Socket.IO clients use exponential backoff + jittered retry on disconnect (PR #261, #262). Prevents reconnect storms during deploy windows.

---

## Operator Breaks

**File**: `src/telephony/controllers/operator-break.controller.ts` (break-feature-backend PR)  
**Base Route**: `/v1/telephony/breaks`  
**Guards**: `JwtAuthGuard` on all; `PositionPermissionGuard` with `call_center.manage` on the manager endpoints.

Operator break lifecycle: softphone button → unregister SIP → countdown modal → resume. Backend tracks sessions for logging + manager visibility. No manager force-end (per business decision).

**Operator endpoints (caller's own break):**
- `POST /v1/telephony/breaks/start` - Start a break for the current user. Validates: user has an active `TelephonyExtension`; not currently on an active call (checked against `TelephonyStateManager` presence `ON_CALL`/`RINGING`); no existing active break. Returns `{ id, startedAt, extension }`. Errors: 400 (no extension / on-call), 409 (already on break).
- `POST /v1/telephony/breaks/end` - End the current user's active break. Idempotent — returns `null` if no active break. Returns `{ id, startedAt, endedAt, durationSec }`.
- `GET /v1/telephony/breaks/my-current` - Get the current user's active break (or `null`). Used by the softphone to restore the countdown after reload.

**Manager endpoints:**
- `GET /v1/telephony/breaks/current` - All currently-active breaks across operators. Permission: `call_center.manage`. Returns `[{ id, userId, userName, extension, startedAt, elapsedSec }]`.
- `GET /v1/telephony/breaks/history` - Paginated history of finished sessions. Permission: `call_center.manage`. Query params:
    - `userId` - filter to one operator
    - `from`, `to` - ISO 8601 date range (filters on `startedAt`)
    - `includeAutoEnded=false` - excludes system-ended rows (default: include)
    - `page`, `pageSize` (max 200)

**Auto-close cron:** every 30 min, `OperatorBreakService.autoCloseStaleBreaks()` closes any active session that:
1. Started earlier today AND now is past `COMPANY_WORK_END_HOUR` (default 19) — `autoEndReason='company_hours_end'`
2. Started more than 12h ago — `autoEndReason='max_duration_exceeded'` (defensive cap)

Both paths set `isAutoEnded=true` and stale-guard the update with `WHERE endedAt IS NULL` (race-safe against operator-initiated end during the scan).

**Socket events** (emitted to managers on `/telephony`): planned for manager UI PR — NOT yet emitted from this backend-only PR.

---

## Operator DND (Do Not Disturb)

**File**: `src/telephony/controllers/operator-dnd.controller.ts` (dnd-feature-backend PR)  
**Base Route**: `/v1/telephony/dnd`  
**Guards**: `JwtAuthGuard` only. All endpoints are operator-own (use the JWT-derived userId).

Semantically distinct from Break:
- **Break** = fully offline (softphone unregisters; no calls at all)
- **DND** = only queue dispatch blocked; softphone stays registered; direct extension-to-extension calls still ring; outbound dialing works normally

Implemented via AMI `QueuePause` with no `Queue` field (pauses across all queues the extension is a member of). State is managed by Asterisk + cached in `TelephonyStateManager` from AMI events — no DB column.

**Endpoints:**
- `POST /v1/telephony/dnd/enable` - Enable DND. Validates user has an active `TelephonyExtension`, sends AMI `QueuePause` with `Paused=true` across all queues. Returns `{ enabled: true, extension }`. Errors: 400 (no extension).
- `POST /v1/telephony/dnd/disable` - Disable DND. Same AMI path with `Paused=false`. Idempotent. Returns `{ enabled: false, extension }`.
- `GET /v1/telephony/dnd/my-state` - Reads the in-memory state cache (updated by AMI QueuePause events). Returns `{ enabled: boolean, extension: string | null }`. Pure in-memory — does not hit AMI or DB.

**Auto-disable on logout:** `POST /auth/logout` has a best-effort hook that verifies the JWT cookie manually (since logout is `@noAuth`), extracts the user id, and calls `OperatorDndService.disableSilently()`. Any failure (missing cookie, invalid JWT, AMI down) is swallowed — the cookie clear always proceeds.

**Manager visibility:** DND state surfaces as `agent.presence: 'PAUSED'` in the existing `call_center.live` live-monitor — no DND-specific manager endpoints needed.

---

## Client Chats Queue Management (Manager)

**File**: `src/clientchats/controllers/clientchats-manager.controller.ts`  
**Base Route**: `/v1/clientchats/queue`  
**Guards**: `JwtAuthGuard + PositionPermissionGuard`, `client_chats.manage`

**Key endpoints** (selective — full list in controller):
- `GET /v1/clientchats/queue/today` - Active operators on today's schedule + open chat counts
- `GET /v1/clientchats/queue/schedule` - Weekly operator schedule
- `PUT /v1/clientchats/queue/schedule/:dayOfWeek` - Set operators for a weekday
- `PUT /v1/clientchats/queue/override` - Per-date override
- `DELETE /v1/clientchats/queue/override/:date` - Remove override
- `GET /v1/clientchats/queue/escalation-config` - Current SLA thresholds
- `PUT /v1/clientchats/queue/escalation-config` - Update SLA thresholds. Body (all fields optional):
    - `firstResponseTimeoutMins` - warn after this many minutes with no first reply (default 5)
    - `reassignAfterMins` - auto-unassign after this many minutes (default 10)
    - `postReplyTimeoutMins` - **(PR #276)** warn when customer's latest msg older than this (operator silent after first reply; default 10)
    - `postReplyReassignAfterMins` - **(PR #276)** auto-unassign when post-reply silence exceeds this (default 20)
    - `notifyManagerOnEscalation` - emit `escalation:warning` / `escalation:reassign` sockets (default true)
    - Validation: all thresholds are non-negative integers ≤ 1440 (24h). 0 disables that side. `reassign` must be ≥ `warn` when both updated together. 400 with field-specific error message on invalid input.
- `GET /v1/clientchats/queue/escalation-events` - Recent escalation log (query: `limit`)
- `GET /v1/clientchats/queue/live-status` - Live operator status + KPIs
- `DELETE /v1/clientchats/queue/conversations/:id` - Hard-delete a conversation chain. Permission: `client_chats.delete` (or superadmin).
- `POST /v1/clientchats/queue/conversations/:id/pause-operator` - Pause the assigned operator on this conversation only
- `POST /v1/clientchats/queue/conversations/:id/unpause-operator` - Resume
- `POST /v1/clientchats/queue/conversations/:id/approve-reopen` - Reopen. Body: `{ keepOperator?: boolean }`. Clears `firstResponseAt + joinedAt` on reopen (PR #275 A3 fix).

**Event types emitted to managers** (Socket.IO `/ws/clientchats`):
- `escalation:warning` — carries `type: 'TIMEOUT_WARNING'` (first-response) or `type: 'POST_REPLY_TIMEOUT_WARNING'` (post-reply silence; PR #276)
- `escalation:reassign` — carries `type: 'AUTO_UNASSIGN'` (first-response; renamed from AUTO_REASSIGN in PR #275) or `type: 'POST_REPLY_AUTO_UNASSIGN'` (PR #276)

---

## Sales Module

**Files**: 
- `src/sales/leads/leads.controller.ts`
- `src/sales/config/sales-config.controller.ts`

**Base Routes**: `/v1/sales/*`  
**Guards**: `JwtAuthGuard` (all endpoints)

### Leads Endpoints
- `POST /v1/sales/leads` - Create lead
- `GET /v1/sales/leads` - List leads (query: status, stageId, responsibleEmployeeId, page, pageSize)
- `GET /v1/sales/leads/statistics` - Get lead statistics
- `GET /v1/sales/leads/:id` - Get lead by ID
- `PATCH /v1/sales/leads/:id` - Update lead
- `POST /v1/sales/leads/:id/change-stage` - Change lead stage
- `POST /v1/sales/leads/:id/submit-for-approval` - Submit for approval
- `POST /v1/sales/leads/:id/approve` - Approve lead (mark as WON)
- `POST /v1/sales/leads/:id/reject` - Reject/unlock lead
- `POST /v1/sales/leads/:id/mark-lost` - Mark lead as lost

### Services Endpoints
- `GET /v1/sales/services` - List sales services
- `GET /v1/sales/services/categories` - List service categories
- `POST /v1/sales/services` - Create service
- `PATCH /v1/sales/services/:id` - Update service

### Lead Sub-resources
- `GET /v1/sales/leads/:id/services` - Get lead services
- `POST /v1/sales/leads/:id/services` - Add service to lead
- `POST /v1/sales/leads/:id/notes` - Add note
- `POST /v1/sales/leads/:id/reminders` - Add reminder
- `POST /v1/sales/leads/:id/appointments` - Add appointment

### Configuration Endpoints
- `GET /v1/sales/config/stages` - List lead stages
- `GET /v1/sales/config/sources` - List lead sources
- `GET /v1/sales/config/pipeline-positions` - Get pipeline position assignments
- `PATCH /v1/sales/config/pipeline-positions/:key` - Update pipeline position assignment
- `GET /v1/sales/config/pipeline-permissions` - Get pipeline permission assignments
- `PATCH /v1/sales/config/pipeline-permissions/:key` - Update pipeline permission assignment

### Sales Plans Endpoints
- `GET /v1/sales/plans` - List sales plans
- `POST /v1/sales/plans` - Create sales plan
- `GET /v1/sales/plans/:id` - Get sales plan
- `PATCH /v1/sales/plans/:id` - Update sales plan

**Notes**:
- Lead pipeline with configurable stages (NEW, CONTACT, MEETING, PROPOSAL, NEGOTIATION, APPROVED, WON, LOST)
- Approval workflow: sales employee → Head of Sales → CEO
- Services catalog with monthly/one-time pricing
- Position-based access control for pipeline actions

---

## Messenger Module

**File**: `src/messenger/messenger.controller.ts`  
**Base Route**: `/v1/messenger`  
**Guards**: `JwtAuthGuard` (all endpoints)

**REST Endpoints**:
- `GET /v1/messenger/me` - Get current employee ID for messenger
- `GET /v1/messenger/conversations` - List conversations (query: type, cursor, limit)
- `POST /v1/messenger/conversations` - Create conversation (direct or group)
- `GET /v1/messenger/conversations/:id` - Get conversation details
- `PATCH /v1/messenger/conversations/:id` - Update conversation (name, etc.)
- `POST /v1/messenger/conversations/:id/participants` - Add participants to group
- `DELETE /v1/messenger/conversations/:id/participants/:employeeId` - Remove participant
- `POST /v1/messenger/conversations/:id/read` - Mark conversation as read
- `POST /v1/messenger/conversations/:id/mute` - Mute/unmute conversation
- `POST /v1/messenger/conversations/:id/archive` - Archive/unarchive conversation
- `GET /v1/messenger/conversations/:id/messages` - List messages (query: cursor, limit, after)
- `POST /v1/messenger/conversations/:id/messages` - Send message (broadcasts via WebSocket)
- `PATCH /v1/messenger/messages/:id` - Edit message
- `DELETE /v1/messenger/messages/:id` - Delete message
- `POST /v1/messenger/messages/:id/reactions` - Toggle emoji reaction
- `GET /v1/messenger/messages/:id/reactions` - Get message reactions
- `GET /v1/messenger/conversations/:id/read-status` - Get read status for conversation
- `GET /v1/messenger/permissions` - Get messenger permissions for current user
- `GET /v1/messenger/search/employees` - Search employees (query: q)
- `GET /v1/messenger/search/messages` - Search messages (query: q, conversationId)
- `GET /v1/messenger/unread-count` - Get total unread message count

**WebSocket Gateway** (`messenger.gateway.ts`):
- **Namespace**: `/messenger`
- **Auth**: JWT cookie-based authentication on connection
- `conversation:join` - Join a conversation room
- `conversation:leave` - Leave a conversation room
- `message:send` - Send message via WebSocket
- `typing` - Typing indicator broadcast
- `message:read` - Mark messages as read (broadcasts to participants)
- `message:react` - Toggle emoji reaction (broadcasts to conversation)
- `online:check` - Check online status

**Emitted Events**:
- `message:new` - New message received (to employee rooms + conversation room)
- `conversation:updated` - Conversation metadata updated
- `message:read` - Read receipt broadcast
- `message:reaction` - Reaction toggle broadcast
- `typing` - Typing indicator

**Notes**:
- Messages sent via REST are broadcast to all participants via WebSocket gateway
- Each employee auto-joins a personal room (`employee:{id}`) on connection
- Cursor-based pagination for conversations and messages
- `messenger.create_group` permission required for group creation

---

## 19. NotificationsController

**Base**: `/v1/admin/notifications`  
**Guards**: `JwtAuthGuard`, `AdminOnlyGuard`  
**Source**: `src/v1/notifications.controller.ts`

### Email Configuration
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/v1/admin/notifications/email-config` | Get SMTP/IMAP config (passwords masked) |
| PUT | `/v1/admin/notifications/email-config` | Upsert email config |
| POST | `/v1/admin/notifications/email-config/test` | Test SMTP and IMAP connections |

### SMS Configuration
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/v1/admin/notifications/sms-config` | Get SMS provider config (token masked) |
| PUT | `/v1/admin/notifications/sms-config` | Upsert SMS config |
| POST | `/v1/admin/notifications/sms-config/test` | Send test SMS (body: `{ testNumber }`) |

### Notification Templates
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/v1/admin/notifications/templates` | List all templates |
| POST | `/v1/admin/notifications/templates` | Create template |
| PATCH | `/v1/admin/notifications/templates/:id` | Update template |
| DELETE | `/v1/admin/notifications/templates/:id` | Delete template |

### Send & Logs
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/v1/admin/notifications/send` | Send email/SMS to selected employees |
| GET | `/v1/admin/notifications/logs` | Paginated notification logs (`?page=&limit=&type=`) |

---

## Bug Reports (Beta Testing)

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/v1/bug-reports` | Create bug report (multipart: `video` file + `data` JSON string). Auth required. Triggers async AI analysis + GitHub issue creation. |
| GET | `/v1/bug-reports` | List all bug reports (paginated: `?page=&pageSize=`). Auth required. |
| GET | `/v1/bug-reports/:id` | Get single bug report with all captured data. Auth required. |
| GET | `/v1/bug-reports/:id/video` | Stream recorded video file. Auth required. |
| PATCH | `/v1/bug-reports/:id/status` | Update bug report status (body: `{ status }`). Auth required. |
| DELETE | `/v1/bug-reports/:id` | Delete bug report and associated video file. Auth required. Returns 204. |
| POST | `/v1/bug-reports/:id/retry-github` | Retry failed GitHub issue creation. Requires AI analysis to be complete. Auth required. |

**Env vars**: `ANTHROPIC_API_KEY` (Claude AI), `GITHUB_TOKEN` (GitHub API), `GITHUB_OWNER`, `GITHUB_REPO`, `BUG_REPORT_VIDEO_DIR`

---

## Call Reports Module

**File**: `src/call-reports/call-reports.controller.ts`  
**Base Route**: `/v1/call-reports`  
**Guards**: `JwtAuthGuard` (all endpoints), `PositionPermissionGuard` + `@RequirePermission('call_center.reports')` (all endpoints)

**Endpoints**:
- `POST /v1/call-reports` - Create call report (linked 1:1 to CallSession)
- `PATCH /v1/call-reports/:id` - Update call report (owner or superadmin)
- `GET /v1/call-reports/my-drafts` - Get current user's draft reports
- `GET /v1/call-reports/payment-lookup?q=` - Payment ID typeahead search (ClientBuilding)
- `GET /v1/call-reports/:id` - Get single report with relations
- `GET /v1/call-reports` - List reports with filters (query: status, buildingId, operatorId, categoryCode, dateFrom, dateTo, page, pageSize)

**Notes**:
- All endpoints require `call_center.reports` permission
- List endpoint uses `DataScopeService` to restrict visibility based on call_logs scope permissions (own/department/department_tree/all)
- Reports are linked 1:1 to CallSession; can reference caller client, subject client, building, clientBuilding, and category labels
- `DataScopeService` (`src/common/utils/data-scope.ts`) is a reusable utility that resolves permission scopes for any resource

---

## Summary

**Total Controllers**: 21  
**Guarded Routes**: Most routes under `/v1/*` require `JwtAuthGuard`  
**Admin-Only Routes**: Positions, Role Groups, Admin Manual, Workflow Configuration, Notifications  
**Permission-Protected**: 
- `POST /v1/incidents` (requires `incidents.create` permission)
- Work Orders endpoints have granular permissions (assign, start, approve, cancel, etc.)
- `POST /v1/messenger/conversations` with type GROUP (requires `messenger.create_group`)
- All `/v1/call-reports/*` endpoints (requires `call_center.reports`)  
**Public Routes**: `/v1/buildings/*`, `/v1/clients` (read-only via PublicController)  
**WebSocket**: Messenger gateway at `/messenger` namespace (Socket.IO)
