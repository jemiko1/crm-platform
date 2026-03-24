# API_ROUTES.md — Complete API & Routes Map

> **Base URL**: `http://localhost:3000` (dev) / `https://api.crm28.asg.ge` (prod)
> **Auth**: JWT in httpOnly cookie (`access_token`). Most `/v1/*` endpoints require `JwtAuthGuard`.
> **Swagger**: Available at `/api` in development.
> **Last Updated**: 2026-03-24

---

## Authentication (`/auth`)

| Method | Path | Auth | Description | Request | Response | DB Tables |
|--------|------|------|-------------|---------|----------|-----------|
| POST | `/auth/login` | None | Login, sets httpOnly JWT cookie | `{ email, password }` | `{ user, employee, permissions }` | User, Employee |
| GET | `/auth/me` | JWT | Get current user with employee info and permissions | — | `{ id, email, role, isSuperAdmin, employee, permissions[] }` | User, Employee, Position, RoleGroup, Permission |
| POST | `/auth/logout` | None | Clear auth cookie | — | `{ message }` | — |
| POST | `/auth/app-login` | None | Desktop app JWT login (CRM28 Phone) | `{ email, password }` | `{ token, user }` | User |

---

## Buildings (`/v1/buildings`, `/buildings`)

| Method | Path | Auth | Description | Request | Response | DB Tables |
|--------|------|------|-------------|---------|----------|-----------|
| GET | `/v1/buildings` | None | List all buildings | Query: `q`, `page`, `pageSize` | `Building[]` with client/asset counts | Building, ClientBuilding, Asset |
| GET | `/v1/buildings/:buildingCoreId` | None | Get building by coreId | — | `Building` | Building |
| GET | `/v1/buildings/:buildingCoreId/clients` | None | List clients for building | — | `Client[]` | Client, ClientBuilding |
| GET | `/v1/buildings/:buildingCoreId/assets` | None | List assets for building | — | `Asset[]` | Asset |
| POST | `/v1/admin/buildings` | JWT + Admin | Create building manually | `{ name, address, city }` | `Building` | Building, AuditLog |
| PATCH | `/v1/admin/buildings/:buildingCoreId` | JWT + Admin | Update building | `{ name?, address?, city? }` | `Building` | Building, AuditLog |
| POST | `/v1/admin/buildings/:buildingCoreId/clients` | JWT + Admin | Create client for building(s) | `{ firstName, lastName, ..., buildingCoreIds[] }` | `Client` | Client, ClientBuilding, AuditLog |
| POST | `/v1/admin/buildings/:buildingCoreId/assets` | JWT + Admin | Create asset for building | `{ type, name, ip?, status? }` | `Asset` | Asset, AuditLog |

---

## Clients (`/v1/clients`)

| Method | Path | Auth | Description | Request | Response | DB Tables |
|--------|------|------|-------------|---------|----------|-----------|
| GET | `/v1/clients` | None | List all clients (global directory) | Query: `q`, `page`, `pageSize` | `Client[]` with building assignments | Client, ClientBuilding, Building |

---

## Incidents (`/v1/incidents`)

| Method | Path | Auth | Description | Request | Response | DB Tables |
|--------|------|------|-------------|---------|----------|-----------|
| GET | `/v1/incidents` | None | List incidents with filters | Query: `q`, `status`, `priority`, `buildingId`, `clientId`, `page`, `pageSize` | `{ data: Incident[], total, page, pageSize }` | Incident, Building, Client |
| POST | `/v1/incidents` | JWT + `incidents.create` | Create incident | `{ buildingId, clientId?, contactMethod, incidentType, priority, description, assetIds[] }` | `Incident` | Incident, IncidentAsset |
| GET | `/v1/incidents/:id` | None | Get incident by ID | — | `Incident` with building, client, assets | Incident |
| PATCH | `/v1/incidents/:id/status` | JWT | Update incident status | `{ status }` | `Incident` | Incident |
| GET | `/v1/clients/:clientId/incidents` | None | List incidents for a client | — | `Incident[]` | Incident |
| GET | `/v1/buildings/:buildingId/incidents` | None | List incidents for a building | — | `Incident[]` | Incident |

---

## Work Orders (`/v1/work-orders`)

**All endpoints require JWT auth.**

| Method | Path | Description | Request | Response | DB Tables |
|--------|------|-------------|---------|----------|-----------|
| POST | `/v1/work-orders` | Create work order | `{ buildingId, assetId?, title, type, notes?, contactNumber?, deadline? }` | `WorkOrder` | WorkOrder |
| GET | `/v1/work-orders` | List work orders | Query: `page`, `pageSize`, `status`, `type`, `buildingId`, `q` | `{ data[], total }` | WorkOrder, Building |
| GET | `/v1/work-orders/my-tasks` | Get current employee's tasks (workspace) | Query: `status`, `tab` | `WorkOrder[]` | WorkOrder, WorkOrderAssignment |
| GET | `/v1/work-orders/:id` | Get work order detail | — | `WorkOrder` with all relations | WorkOrder, Building, Asset, assignments, products |
| PATCH | `/v1/work-orders/:id` | Update work order fields | `{ title?, notes?, contactNumber?, deadline? }` | `WorkOrder` | WorkOrder |
| DELETE | `/v1/work-orders/:id` | Delete work order | Query: `revertInventory=true/false` | `{ message }` | WorkOrder, StockTransaction, InventoryProduct |
| POST | `/v1/work-orders/:id/assign` | Assign employees | `{ employeeIds[] }` | `WorkOrder` | WorkOrderAssignment |
| PATCH | `/v1/work-orders/:id/start` | Start work | — | `WorkOrder` | WorkOrder |
| POST | `/v1/work-orders/:id/products` | Submit product usage | `{ products: [{ productId, quantity, batchId? }] }` | — | WorkOrderProductUsage |
| POST | `/v1/work-orders/:id/deactivated-devices` | Submit deactivated devices | `{ devices: [{ productId, quantity, isWorkingCondition }] }` | — | DeactivatedDevice |
| POST | `/v1/work-orders/:id/complete` | Submit for approval | `{ techEmployeeComment? }` | `WorkOrder` | WorkOrder |
| POST | `/v1/work-orders/:id/approve` | Approve work order | `{ techHeadComment?, products? }` | `WorkOrder` | WorkOrder, InventoryProduct, StockTransaction |
| POST | `/v1/work-orders/:id/cancel` | Cancel work order | `{ cancelReason? }` | `WorkOrder` | WorkOrder |
| POST | `/v1/work-orders/:id/request-repair` | Diagnostic → repair conversion | `{ notes? }` | `WorkOrder` (child) | WorkOrder |
| GET | `/v1/work-orders/:id/activity` | Get activity log | Query: `category?` | `WorkOrderActivityLog[]` | WorkOrderActivityLog |
| GET | `/v1/work-orders/:id/inventory-impact` | Check inventory impact before delete | — | `{ hasImpact, products[], transactions[] }` | WorkOrderProductUsage, StockTransaction |

---

## Employees (`/v1/employees`)

**All endpoints require JWT auth.**

| Method | Path | Description | Request | Response | DB Tables |
|--------|------|-------------|---------|----------|-----------|
| POST | `/v1/employees` | Create employee (optionally with user) | `{ firstName, lastName, email, positionId?, ..., createUser?, password? }` | `Employee` | Employee, User? |
| GET | `/v1/employees` | List employees | Query: `status`, `search`, `page`, `pageSize` | `Employee[]` with login status | Employee, User |
| GET | `/v1/employees/:id` | Get employee detail | — | `Employee` with position, department, user | Employee |
| PATCH | `/v1/employees/:id` | Update employee | Partial `Employee` fields | `Employee` | Employee |
| POST | `/v1/employees/:id/dismiss` | Dismiss/terminate employee | — | `Employee` | Employee, User |
| POST | `/v1/employees/:id/activate` | Reactivate dismissed employee | — | `Employee` | Employee, User |
| POST | `/v1/employees/:id/create-user` | Create login account | `{ email, password, positionId }` | `User` | User, Employee |
| POST | `/v1/employees/:id/reset-password` | Reset password | `{ newPassword }` | `{ message }` | User |
| GET | `/v1/employees/:id/deletion-constraints` | Check what blocks deletion | — | `{ canDelete, activeLeads, openWorkOrders }` | Lead, WorkOrder |
| POST | `/v1/employees/:id/delegate-items` | Transfer items before deletion | `{ delegateToEmployeeId }` | `{ message }` | Lead, WorkOrder |
| DELETE | `/v1/employees/:id/hard-delete` | Permanently delete | `{ delegateToEmployeeId? }` | `{ message }` | Employee, User |

---

## Inventory (`/v1/inventory`)

**All endpoints require JWT auth.**

| Method | Path | Description | Request | Response | DB Tables |
|--------|------|-------------|---------|----------|-----------|
| POST | `/v1/inventory/products` | Create product | `{ sku, name, category, unit, lowStockThreshold }` | `InventoryProduct` | InventoryProduct |
| GET | `/v1/inventory/products` | List products | Query: `category`, `lowStock` | `InventoryProduct[]` | InventoryProduct |
| GET | `/v1/inventory/products/:id` | Get product | — | `InventoryProduct` with batches | InventoryProduct, StockBatch |
| PUT | `/v1/inventory/products/:id` | Update product | Full `InventoryProduct` fields | `InventoryProduct` | InventoryProduct |
| DELETE | `/v1/inventory/products/:id` | Delete product | — | — | InventoryProduct |
| POST | `/v1/inventory/purchase-orders` | Create PO | `{ supplierName, items[] }` | `PurchaseOrder` | PurchaseOrder, PurchaseOrderItem |
| GET | `/v1/inventory/purchase-orders` | List POs | Query: `status` | `PurchaseOrder[]` | PurchaseOrder |
| GET | `/v1/inventory/purchase-orders/:id` | Get PO detail | — | `PurchaseOrder` with items | PurchaseOrder, PurchaseOrderItem |
| PUT | `/v1/inventory/purchase-orders/:id` | Update PO | Full PO fields + items | `PurchaseOrder` | PurchaseOrder, PurchaseOrderItem |
| PUT | `/v1/inventory/purchase-orders/:id/status` | Update PO status | `{ status }` | `PurchaseOrder` | PurchaseOrder, StockBatch, InventoryProduct |
| POST | `/v1/inventory/adjustments` | Stock adjustment | `{ productId, type, quantity, notes }` | `StockTransaction` | StockTransaction, InventoryProduct |
| POST | `/v1/inventory/deduct-for-work-order` | Deduct stock for WO | `{ productId, quantity, workOrderId }` | `StockTransaction` | StockTransaction, InventoryProduct |
| GET | `/v1/inventory/transactions` | Get transactions | Query: `productId`, `limit` | `StockTransaction[]` | StockTransaction |
| GET | `/v1/inventory/reports/low-stock` | Low stock report | — | Products below threshold | InventoryProduct |
| GET | `/v1/inventory/reports/inventory-value` | Inventory value report | — | Total value by category | InventoryProduct, StockBatch |

---

## Sales (`/v1/sales`)

**All endpoints require JWT auth.**

### Leads

| Method | Path | Description | Request | Response | DB Tables |
|--------|------|-------------|---------|----------|-----------|
| POST | `/v1/sales/leads` | Create lead | `{ name, primaryPhone, city, address, stageId, ... }` | `Lead` | Lead, LeadActivity |
| GET | `/v1/sales/leads` | List leads | Query: `status`, `stageId`, `responsibleEmployeeId`, `page`, `pageSize` | `{ data[], total }` | Lead, LeadStage |
| GET | `/v1/sales/leads/statistics` | Pipeline statistics | — | Stage counts, conversion rates | Lead |
| GET | `/v1/sales/leads/:id` | Get lead detail | — | `Lead` with all relations | Lead + all sub-resources |
| PATCH | `/v1/sales/leads/:id` | Update lead | Partial fields | `Lead` | Lead, LeadActivity |
| POST | `/v1/sales/leads/:id/change-stage` | Change pipeline stage | `{ stageId, reason? }` | `Lead` | Lead, LeadStageHistory, LeadActivity |
| POST | `/v1/sales/leads/:id/submit-for-approval` | Submit for approval | `{ notes? }` | `Lead` (locked) | Lead |
| POST | `/v1/sales/leads/:id/approve` | Approve (mark WON) | `{ notes? }` | `Lead` (WON) | Lead, LeadActivity |
| POST | `/v1/sales/leads/:id/reject` | Reject/unlock | `{ reason? }` | `Lead` (unlocked) | Lead |
| POST | `/v1/sales/leads/:id/mark-lost` | Mark as lost | `{ lostReason }` | `Lead` (LOST) | Lead, LeadActivity |

### Lead Sub-resources

| Method | Path | Description | DB Tables |
|--------|------|-------------|-----------|
| GET | `/v1/sales/leads/:id/services` | List lead services | LeadService, SalesService |
| POST | `/v1/sales/leads/:id/services` | Add service to lead | LeadService |
| POST | `/v1/sales/leads/:id/notes` | Add note | LeadNote |
| POST | `/v1/sales/leads/:id/reminders` | Add reminder | LeadReminder |
| POST | `/v1/sales/leads/:id/appointments` | Schedule appointment | LeadAppointment |

### Services & Config

| Method | Path | Description | DB Tables |
|--------|------|-------------|-----------|
| GET | `/v1/sales/services` | List services catalog | SalesService |
| GET | `/v1/sales/services/categories` | List service categories | SalesServiceCategory |
| POST | `/v1/sales/services` | Create service | SalesService |
| PATCH | `/v1/sales/services/:id` | Update service | SalesService |
| GET | `/v1/sales/config/stages` | List lead stages | LeadStage |
| GET | `/v1/sales/config/sources` | List lead sources | LeadSource |
| GET | `/v1/sales/config/pipeline-positions` | Get pipeline position assignments | SalesPipelineConfig, Position |
| PATCH | `/v1/sales/config/pipeline-positions/:key` | Update pipeline positions | SalesPipelineConfigPosition |
| GET | `/v1/sales/config/pipeline-permissions` | Get pipeline permissions | SalesPipelinePermission |
| PATCH | `/v1/sales/config/pipeline-permissions/:key` | Update pipeline permissions | SalesPipelinePermissionPosition |

### Sales Plans

| Method | Path | Description | DB Tables |
|--------|------|-------------|-----------|
| GET | `/v1/sales/plans` | List sales plans | SalesPlan |
| POST | `/v1/sales/plans` | Create plan | SalesPlan, SalesPlanTarget |
| GET | `/v1/sales/plans/:id` | Get plan detail | SalesPlan, SalesPlanTarget |
| PATCH | `/v1/sales/plans/:id` | Update plan | SalesPlan |

---

## Messenger (`/v1/messenger`)

**All REST endpoints require JWT auth.**

| Method | Path | Description | DB Tables |
|--------|------|-------------|-----------|
| GET | `/v1/messenger/me` | Get current employee ID | Employee |
| GET | `/v1/messenger/conversations` | List conversations (cursor-based) | Conversation, ConversationParticipant |
| POST | `/v1/messenger/conversations` | Create conversation (direct/group) | Conversation, ConversationParticipant |
| GET | `/v1/messenger/conversations/:id` | Get conversation details | Conversation |
| PATCH | `/v1/messenger/conversations/:id` | Update conversation (name) | Conversation |
| POST | `/v1/messenger/conversations/:id/participants` | Add participants | ConversationParticipant |
| DELETE | `/v1/messenger/conversations/:id/participants/:employeeId` | Remove participant | ConversationParticipant |
| POST | `/v1/messenger/conversations/:id/read` | Mark as read | ConversationParticipant |
| POST | `/v1/messenger/conversations/:id/mute` | Mute/unmute | ConversationParticipant |
| POST | `/v1/messenger/conversations/:id/archive` | Archive/unarchive | ConversationParticipant |
| GET | `/v1/messenger/conversations/:id/messages` | List messages (cursor-based) | Message |
| POST | `/v1/messenger/conversations/:id/messages` | Send message (+ WebSocket broadcast) | Message |
| PATCH | `/v1/messenger/messages/:id` | Edit message | Message |
| DELETE | `/v1/messenger/messages/:id` | Delete message | Message |
| POST | `/v1/messenger/messages/:id/reactions` | Toggle emoji reaction | MessageReaction |
| GET | `/v1/messenger/messages/:id/reactions` | Get reactions | MessageReaction |
| GET | `/v1/messenger/conversations/:id/read-status` | Read receipts | ConversationParticipant |
| GET | `/v1/messenger/permissions` | Messenger permissions | Permission |
| GET | `/v1/messenger/search/employees` | Search employees | Employee |
| GET | `/v1/messenger/search/messages` | Search messages | Message |
| GET | `/v1/messenger/unread-count` | Total unread count | ConversationParticipant, Message |

### WebSocket Gateway (`/messenger` namespace)

| Event | Direction | Description |
|-------|-----------|-------------|
| `conversation:join` | Client → Server | Join conversation room |
| `conversation:leave` | Client → Server | Leave conversation room |
| `message:send` | Client → Server | Send message via WS |
| `typing` | Client ↔ Server | Typing indicator |
| `message:read` | Client → Server | Mark messages read |
| `message:react` | Client → Server | Toggle reaction |
| `online:check` | Client → Server | Check online status |
| `message:new` | Server → Client | New message broadcast |
| `conversation:updated` | Server → Client | Conversation metadata change |
| `message:read` | Server → Client | Read receipt broadcast |
| `message:reaction` | Server → Client | Reaction change broadcast |

---

## Telephony (`/v1/telephony`)

| Method | Path | Auth | Description | DB Tables |
|--------|------|------|-------------|-----------|
| POST | `/v1/telephony/events` | Secret header | Ingest call events from AMI Bridge | CallEvent, CallSession, CallLeg, CallMetrics |
| GET | `/v1/telephony/calls` | JWT | Call history with filters/pagination | CallSession |
| GET | `/v1/telephony/lookup?phone=` | JWT | Caller ID lookup | Client, Employee |
| GET | `/v1/telephony/stats/overview` | JWT | Aggregated call KPIs | CallSession, CallMetrics |
| GET | `/v1/telephony/queues/live` | JWT | Real-time queue state | TelephonyQueue |
| GET | `/v1/telephony/agents/live` | JWT | Real-time agent presence | TelephonyExtension, User |
| POST | `/v1/telephony/actions/originate` | JWT | Click-to-call | via AMI |
| GET | `/v1/telephony/extensions` | JWT | List telephony extensions | TelephonyExtension |
| POST | `/v1/telephony/extensions` | JWT + Admin | Create extension | TelephonyExtension |
| PATCH | `/v1/telephony/extensions/:id` | JWT + Admin | Update extension | TelephonyExtension |

### WebSocket Gateway (`/telephony` namespace)

Real-time call events, queue state, and agent presence updates broadcast to connected clients.

---

## Client Chats — Public (No Auth)

| Method | Path | Description | DB Tables |
|--------|------|-------------|-----------|
| POST | `/public/clientchats/start` | Start web chat session | ClientChatConversation, ClientChatParticipant |
| POST | `/public/clientchats/message` | Send web chat message (X-Conversation-Token header) | ClientChatMessage |
| POST | `/public/clientchats/webhook/viber` | Viber inbound webhook | ClientChatMessage, ClientChatParticipant |
| GET | `/public/clientchats/webhook/facebook` | Facebook verification endpoint | — |
| POST | `/public/clientchats/webhook/facebook` | Facebook inbound webhook | ClientChatMessage, ClientChatParticipant |
| POST | `/public/clientchats/webhook/telegram` | Telegram inbound webhook | ClientChatMessage, ClientChatParticipant |

## Client Chats — Agent (JWT Required)

| Method | Path | Description | DB Tables |
|--------|------|-------------|-----------|
| GET | `/v1/clientchats/conversations` | List conversations (inbox) | ClientChatConversation |
| GET | `/v1/clientchats/conversations/:id` | Get conversation | ClientChatConversation |
| GET | `/v1/clientchats/conversations/:id/messages` | Get messages | ClientChatMessage |
| POST | `/v1/clientchats/conversations/:id/reply` | Send reply | ClientChatMessage (via adapter) |
| PATCH | `/v1/clientchats/conversations/:id/assign` | Assign agent | ClientChatConversation |
| PATCH | `/v1/clientchats/conversations/:id/status` | Change status (LIVE/CLOSED) | ClientChatConversation |
| POST | `/v1/clientchats/conversations/:id/link-client` | Link CRM client | ClientChatConversation |
| POST | `/v1/clientchats/conversations/:id/unlink-client` | Unlink CRM client | ClientChatConversation |

## Client Chats — Admin/Observability

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/clientchats/status` | JWT | Module health status |
| GET | `/v1/clientchats/webhook-failures` | JWT | Recent webhook failures |

---

## Admin Endpoints

### Permissions (`/v1/permissions`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/permissions` | List all permissions |
| GET | `/v1/permissions/grouped` | Permissions grouped by category |
| GET | `/v1/permissions/my-effective-permissions` | Current user's effective permissions |

### Positions (`/v1/positions`) — JWT + Admin

| Method | Path | Description |
|--------|------|-------------|
| POST/GET/PATCH/DELETE | `/v1/positions[/:id]` | Full CRUD |
| GET | `/v1/positions/code/:code` | Get by code |
| GET | `/v1/positions/:id/permissions` | Position permissions |

### Role Groups (`/v1/role-groups`) — JWT + Admin

| Method | Path | Description |
|--------|------|-------------|
| POST/GET/PATCH/DELETE | `/v1/role-groups[/:id]` | Full CRUD |
| POST | `/v1/role-groups/:id/permissions` | Assign permissions |
| GET | `/v1/role-groups/:id/permissions` | Get permissions |

### Departments (`/v1/departments`) — JWT

| Method | Path | Description |
|--------|------|-------------|
| POST/GET/PATCH/DELETE | `/v1/departments[/:id]` | Full CRUD |
| GET | `/v1/departments/hierarchy` | Full hierarchy tree |

### System Lists (`/v1/system-lists`) — JWT

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/system-lists/categories` | List all categories |
| GET | `/v1/system-lists/categories/code/:code` | Get category with items |
| POST/PATCH/DELETE | `/v1/system-lists/items[/:id]` | Item CRUD |

### Workflow (`/v1/workflow`) — JWT

| Method | Path | Description |
|--------|------|-------------|
| GET/PATCH | `/v1/workflow/steps[/:id]` | Workflow step management |
| POST/PATCH/DELETE | `/v1/workflow/steps/:stepId/positions[/:positionId]` | Position assignments |
| GET/POST/PATCH/DELETE | `/v1/workflow/triggers[/:id]` | Trigger CRUD |
| POST/PATCH/DELETE | `/v1/workflow/triggers/:triggerId/actions[/:actionId]` | Trigger action management |

### Notifications (`/v1/admin/notifications`) — JWT + Admin

| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/v1/admin/notifications/email-config` | Email SMTP/IMAP config |
| POST | `/v1/admin/notifications/email-config/test` | Test email connection |
| GET/PUT | `/v1/admin/notifications/sms-config` | SMS provider config |
| POST | `/v1/admin/notifications/sms-config/test` | Test SMS |
| GET/POST/PATCH/DELETE | `/v1/admin/notifications/templates[/:id]` | Notification templates |
| POST | `/v1/admin/notifications/send` | Send notification |
| GET | `/v1/admin/notifications/logs` | Notification history |

### Roles (`/v1/roles`) — JWT (Legacy)

| Method | Path | Description |
|--------|------|-------------|
| Full CRUD | `/v1/roles[/:id]` | Legacy role management |
