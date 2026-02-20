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
- `PATCH /v1/workflow/steps/:id/positions` - Set positions for workflow step
- `GET /v1/workflow/positions` - List all active positions

**Notes**: 
- Admin-only endpoints for configuring workflow steps
- Each step can have multiple positions assigned
- Positions determine who receives tasks at each step

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
**Guards**: `JwtAuthGuard` (on `/me` endpoint only)

**Endpoints**:
- `POST /auth/login` - Login (sets httpOnly cookie)
- `GET /auth/me` - Get current user with employee info and permissions (guarded: JwtAuthGuard)
- `POST /auth/logout` - Logout (clears cookie)

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

## Summary

**Total Controllers**: 19  
**Guarded Routes**: Most routes under `/v1/*` require `JwtAuthGuard`  
**Admin-Only Routes**: Positions, Role Groups, Admin Manual, Workflow Configuration, Notifications  
**Permission-Protected**: 
- `POST /v1/incidents` (requires `incidents.create` permission)
- Work Orders endpoints have granular permissions (assign, start, approve, cancel, etc.)
- `POST /v1/messenger/conversations` with type GROUP (requires `messenger.create_group`)  
**Public Routes**: `/v1/buildings/*`, `/v1/clients` (read-only via PublicController)  
**WebSocket**: Messenger gateway at `/messenger` namespace (Socket.IO)
