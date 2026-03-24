# BUSINESS_LOGIC.md — CRM Business Rules & Logic

> **Application**: CRM28 — a CRM platform for building/property management companies
> **Domain**: Manages buildings, clients (residents), work orders, incidents, sales leads, inventory, telephony, and multi-channel customer communications
> **Last Updated**: 2026-03-24

---

## 1. Work Order Lifecycle

### Statuses

| Status | Description | Who Triggers |
|--------|-------------|--------------|
| **CREATED** | Work order created, not yet assigned | Any authorized user |
| **LINKED_TO_GROUP** | Assigned to employee(s) | Head of Technical / Admin |
| **IN_PROGRESS** | Work actively being done | Assigned technician |
| **COMPLETED** | Work finished and approved | Head of Technical |
| **CANCELED** | Work order canceled | Head of Technical / Admin |

### Status Transitions

```
CREATED → LINKED_TO_GROUP (assign employees)
LINKED_TO_GROUP → IN_PROGRESS (technician starts work)
IN_PROGRESS → COMPLETED (submit for approval → head approves)
IN_PROGRESS → CANCELED (cancel with reason)
CREATED → CANCELED (cancel before assignment)
LINKED_TO_GROUP → CANCELED (cancel after assignment)
```

### Work Order Types

- **INSTALLATION** — New device installation
- **DIAGNOSTIC** — Problem diagnosis
- **RESEARCH** — Technical investigation
- **DEACTIVATE** — Device removal/deactivation
- **REPAIR_CHANGE** — Device repair or replacement
- **ACTIVATE** — Device activation

### Approval Flow

1. Technician submits product usage and deactivated devices
2. Technician clicks "Submit for Approval" (adds optional comment)
3. Head of Technical reviews: can modify product quantities before approval
4. On approval: products are deducted from inventory, stock transactions created
5. On cancel: cancel reason required, no inventory changes

### Sub-Work Orders

Work orders support parent-child relationships. A diagnostic work order can spawn a repair sub-order via "Request Repair" action.

---

## 2. Incident Lifecycle

### Statuses

| Status | Color | Description |
|--------|-------|-------------|
| **CREATED** | Blue | Incident reported |
| **IN_PROGRESS** | Orange | Being investigated |
| **COMPLETED** | Green | Issue resolved |
| **WORK_ORDER_INITIATED** | Purple | Work order created from incident |

### Priorities

| Priority | Color | Description |
|----------|-------|-------------|
| **LOW** | Green | Minor issue, no urgency |
| **MEDIUM** | Yellow | Standard priority |
| **HIGH** | Orange | Requires prompt attention |
| **CRITICAL** | Red | Immediate action required |

### Rules

- Incidents are always linked to a building (required)
- Client is optional (allows anonymous incident reporting)
- Multiple assets/devices can be affected per incident
- `reportedById` tracks which user created the incident
- Incident numbers auto-generated: `INC-YYYY-####`

---

## 3. Sales Lead Pipeline

### Stages (in order)

| # | Code | Name | Terminal? | Description |
|---|------|------|-----------|-------------|
| 1 | `NEW` | New Lead | No | Initial contact, lead just created |
| 2 | `CONTACT` | Contact Made | No | First communication established |
| 3 | `MEETING` | Meeting Scheduled | No | Appointment scheduled |
| 4 | `PROPOSAL` | Proposal Sent | No | Price proposal delivered |
| 5 | `NEGOTIATION` | Negotiation | No | Terms being discussed |
| 6 | `APPROVED` | Approved | No | Waiting for final sign-off |
| 7 | `WON` | Won | Yes | Deal closed successfully |
| 8 | `LOST` | Lost | Yes | Deal lost |

### Lead Statuses

- **ACTIVE** — Lead is in the pipeline
- **WON** — Lead converted to a deal
- **LOST** — Lead was lost (with reason)

### Approval Workflow

1. Sales employee works the lead through stages
2. At approval stage, employee clicks "Submit for Approval"
3. Lead becomes **locked** (no edits allowed)
4. **Head of Sales** reviews → approves or rejects
5. If approved, **CEO** can also review
6. Approval marks lead as **WON**, records `approvedAt`, `approvedBy`
7. Rejection **unlocks** the lead for further work

### Lead Pricing

- Each lead has services from the sales catalog attached
- Each `LeadService` has `quantity`, `monthlyPrice`, `oneTimePrice`
- Lead totals: `totalOneTimePrice` and `totalMonthlyPrice` (sum of services)
- Proposals snapshot the current service pricing

### Lead Sources

Configurable via admin panel. Default sources include web, referral, phone inquiry, etc.

---

## 4. User Roles and Permissions

### Permission Chain

```
User → Employee → Position → RoleGroup → [Permission, Permission, ...]
```

A user's effective permissions are the union of all permissions in their position's role group, plus any per-employee overrides (GRANT/DENY).

### Superadmin

Users with `isSuperAdmin = true` bypass all permission checks entirely.

### Permission Categories

| Category | Example Permissions |
|----------|-------------------|
| **BUILDINGS** | `buildings.details_read`, `buildings.create`, `buildings.update`, `buildings.delete`, `buildings.menu` |
| **CLIENTS** | `clients.details_read`, `clients.create`, `clients.update`, `clients.delete`, `clients.menu` |
| **INCIDENTS** | `incidents.details_read`, `incidents.create`, `incidents.update`, `incidents.assign`, `incidents.delete`, `incidents.menu` |
| **WORK_ORDERS** | `work_orders.read`, `work_orders.create`, `work_orders.assign`, `work_orders.start`, `work_orders.complete`, `work_orders.approve`, `work_orders.cancel`, `work_orders.delete_keep_inventory`, `work_orders.delete_revert_inventory`, `work_orders.manage_products`, `work_orders.manage_devices`, `work_orders.menu` |
| **INVENTORY** | `inventory.read`, `inventory.create`, `inventory.update`, `inventory.delete`, `inventory.purchase`, `inventory.adjust`, `inventory.menu` |
| **EMPLOYEES** | `employees.read`, `employees.create`, `employees.update`, `employee.dismiss`, `employee.activate`, `employee.reset_password`, `employee.hard_delete`, `employee.create_account`, `employees.menu` |
| **SALES** | `sales.read`, `sales.create`, `leads.read`, `leads.create`, `leads.convert`, `plans.read`, `plans.create`, `sales.menu` |
| **MESSENGER** | `messenger.create_group`, `messenger.manage_groups` |
| **TELEPHONY** | (via admin access) |
| **CLIENT_CHATS** | `client_chats.menu`, `client_chats.reply`, `client_chats.assign`, `client_chats.change_status`, `client_chats.link_client`, `client_chats.manage_canned`, `client_chats.view_analytics`, `client_chats.manage`, `client_chats.delete` |
| **ADMIN** | `admin.access`, `admin.manage_users`, `admin.manage_settings`, `admin.menu` |

### Menu Visibility

Sidebar menu items are controlled by `*.menu` permissions (e.g., `buildings.menu` shows/hides the Buildings link).

### Backend Enforcement

```typescript
@UseGuards(JwtAuthGuard, PositionPermissionGuard)
@RequirePermission('work_orders.approve')
@Post(':id/approve')
async approve(@Param('id') id: string) { ... }
```

### Frontend Enforcement

```typescript
const { hasPermission } = usePermissions();
if (hasPermission('work_orders.approve')) { /* show button */ }
```

---

## 5. Employee Lifecycle

### Statuses

| Status | Description |
|--------|-------------|
| **ACTIVE** | Currently employed |
| **INACTIVE** | Temporarily inactive |
| **ON_LEAVE** | On leave of absence |
| **TERMINATED** | Dismissed / terminated |

### Lifecycle Transitions

```
(new) → ACTIVE (create employee)
ACTIVE → TERMINATED (dismiss)
TERMINATED → ACTIVE (reactivate)
TERMINATED → (deleted) (permanent deletion)
ACTIVE without user → (deleted) (direct deletion if no user account)
```

### Rules

- Employees can exist **without** a User (login) account
- Employee IDs (EMP-001, EMP-002...) are **never reused** after deletion
- Dismissal deactivates the linked User account (cannot login)
- Reactivation re-enables the User account
- Permanent deletion requires delegating active leads and open work orders to another employee
- Historical records (activity logs, notes) preserve cached employee names after deletion via `onDelete: SetNull`

---

## 6. Notification Rules

### Workflow Triggers

Automated notifications fire on:
- **Status changes**: Work order status transitions
- **Field changes**: Specific field values change
- **Inactivity**: Work order inactive for X time
- **Deadline proximity**: Approaching deadline

### Notification Types

| Type | Channel | Description |
|------|---------|-------------|
| **SYSTEM_NOTIFICATION** | In-app | Work order notification badges, task assignments |
| **EMAIL** | SMTP | Email via configured SMTP server |
| **SMS** | sender.ge API | SMS with rate limiting (per-minute, per-hour, per-day, per-recipient cooldown) |

### Trigger Actions

Each trigger can have multiple actions. Actions specify:
- `targetType`: Who receives (specific positions, assigned employees)
- `templateCode`: Which notification template to use
- `customSubject` / `customBody`: Override template content

### Work Order Notifications

- Assigned employees receive task notifications
- Notifications tracked via `WorkOrderNotification` (notifiedAt, readAt)
- Header badge shows unread notification count

---

## 7. Automations

### Currently Built

| Automation | Description |
|------------|-------------|
| **Work Order Assignment** | When WO status changes to LINKED_TO_GROUP, assigned positions receive tasks |
| **Workflow Triggers** | Configurable automation firing on status/field changes, inactivity, deadlines |
| **Employee ID Generation** | Auto-increment EMP-### IDs, never reused |
| **Code Generation** | Department, Position, RoleGroup codes auto-generated from names |
| **Incident Numbering** | Auto-generated INC-YYYY-#### format |
| **Lead Numbering** | Auto-increment lead numbers |
| **Client Matching** | Auto-match chat participants to CRM clients by phone/email |
| **Chat Assignment** | Configurable assignment strategies: `manual` or `round_robin` |
| **Chat Escalation** | Auto-escalate if first response timeout exceeded; auto-reassign after inactivity |
| **Chat Queue Scheduling** | Weekly schedule defining which agents handle chats per day |

---

## 8. Search and Filtering

### Backend Search

Most list endpoints support `q` parameter for full-text search across relevant fields. Search uses SQL `ILIKE` patterns.

### Filtering Patterns

| Entity | Available Filters |
|--------|-------------------|
| Buildings | `q` (name, address, city) |
| Clients | `q` (name, phone, idNumber) |
| Incidents | `q`, `status`, `priority`, `buildingId`, `clientId` |
| Work Orders | `q`, `status`, `type`, `buildingId` |
| Employees | `status`, `search` (name, email, employeeId) |
| Sales Leads | `status`, `stageId`, `responsibleEmployeeId` |
| Call Logs | Queue, date range, disposition, agent |
| Client Chats | Channel type, status (LIVE/CLOSED), assigned agent |

### Pagination

All list endpoints use page-based pagination:
- `page` (1-indexed)
- `pageSize` (default varies, typically 20-50)
- Response includes `total` count

Messenger uses **cursor-based** pagination for conversations and messages.

---

## 9. Import/Export

### Currently Implemented

| Feature | Status |
|---------|--------|
| **CDR Import** | Call detail records imported from Asterisk PostgreSQL database (safety net for missed AMI events) |
| **Core Integration Sync** | Webhook-based sync of buildings, clients, assets from external core system |
| **Work Order Export** | `work_orders.export` permission exists but UI not built |
| **Report Export** | `reports.export` permission exists but UI not built |

### Core Integration

The external "core system" pushes changes via webhooks to `/v1/core-integration/*`. Events are deduplicated via `SyncEvent` table (idempotency inbox pattern).

---

## 10. Dashboard Metrics

### Call Center KPIs

| Metric | Calculation |
|--------|------------|
| **Total Calls** | Count of CallSession records in period |
| **Answered Calls** | CallSession where disposition = ANSWERED |
| **Missed Calls** | MissedCall count by reason (OUT_OF_HOURS, ABANDONED, NO_ANSWER) |
| **Average Wait Time** | Mean of CallMetrics.waitSeconds |
| **Average Talk Time** | Mean of CallMetrics.talkSeconds |
| **SLA %** | Percentage where CallMetrics.isSlaMet = true |
| **Abandon Rate** | Abandoned / (Answered + Abandoned) |
| **Per-Agent Stats** | Calls per agent, avg talk time, avg hold time |
| **Per-Queue Stats** | Calls per queue, wait times, abandon rates |

### Sales Dashboard

| Metric | Calculation |
|--------|------------|
| **Pipeline by Stage** | Count of active leads per stage |
| **Conversion Rate** | WON leads / total leads |
| **Revenue Pipeline** | Sum of totalOneTimePrice + totalMonthlyPrice for active leads |
| **Plan Achievement** | achievedRevenue / targetRevenue per sales plan |

### Inventory Reports

| Report | Calculation |
|--------|------------|
| **Low Stock** | Products where currentStock < lowStockThreshold |
| **Inventory Value** | Sum of (remainingQuantity × purchasePrice) per batch |

---

## 11. External Integrations

| Integration | Direction | Description |
|-------------|-----------|-------------|
| **Asterisk PBX** | Bidirectional | AMI events IN, originate calls OUT |
| **AMI Bridge** | Inbound | Relays real-time call events from Asterisk to CRM |
| **CRM28 Phone (Electron)** | Bidirectional | SIP.js WebRTC calls, JWT auth, caller ID lookup |
| **Viber Bot** | Bidirectional | Receive/send messages via Viber Bot API |
| **Facebook Messenger** | Bidirectional | Receive/send via Facebook Graph API |
| **Telegram Bot** | Bidirectional | Receive/send via Telegram Bot API |
| **WhatsApp Business** | Planned | WhatsApp Cloud API integration |
| **Core System** | Inbound | Webhook sync of buildings, clients, assets |
| **OpenAI (Whisper + GPT)** | Outbound | Call transcription and quality scoring |
| **sender.ge** | Outbound | SMS sending (Georgian provider) |
| **SMTP/IMAP** | Bidirectional | Email send (SMTP) and receive (IMAP) |
| **Web Chat Widget** | Inbound | Embeddable JS widget for website visitors |

---

## 12. Multi-Channel Chat (Unified Inbox)

### Channel Architecture

Each channel implements the `ChannelAdapter` interface:
- `verifyWebhook()` — Validate incoming webhook signatures
- `parseInbound()` — Normalize raw payload into `ParsedInboundMessage`
- `sendMessage()` — Send reply via channel's API

### Conversation Flow

1. External user sends message via channel
2. Webhook hits public controller → adapter parses it
3. Core service upserts participant and conversation
4. Message saved with idempotency (unique `externalMessageId`)
5. Auto-matching attempts to link participant to CRM client
6. Agent sees conversation in unified inbox
7. Agent replies → adapter sends via channel API → message saved as OUT

### Assignment Strategies

- **Manual** — Admin manually assigns conversations to agents
- **Round Robin** — Auto-assigns to next available agent in rotation
- **Queue Schedule** — Weekly schedule defines which agents are active per day of week
- **Queue Override** — Date-specific overrides for holidays/special coverage

### Escalation Rules

- **First Response Timeout** — If no agent responds within X minutes, escalate
- **Reassign After Inactivity** — If assigned agent is inactive for X minutes, reassign
- **Manager Notification** — Optionally notify manager on escalation events
