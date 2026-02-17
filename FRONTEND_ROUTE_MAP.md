# Frontend Route Map

Complete frontend route documentation for CRM Platform.

---

## `/app/dashboard`

**Files**: `dashboard/page.tsx`  
**API Calls**: None (static placeholder)  
**Status**: ⚠️ **Placeholder**  
**Notes**: Static UI with hardcoded data. No API integration yet.

---

## `/app/buildings`

**Files**: `buildings/page.tsx`, `buildings/add-building-modal.tsx`  
**API Calls**:
- `GET /v1/buildings` - List buildings
- `POST /v1/admin/buildings` - Create building (via modal)

**Status**: ✅ **Working**  
**Notes**: Full list view with search, pagination. Add building modal functional.

---

## `/app/buildings?building=[id]` (Building Detail Modal)

**Files**: 
- `buildings/[buildingId]/building-detail-content.tsx` - Content component
- `buildings/[buildingId]/building-detail-modal.tsx` - Legacy modal (unused)
- `buildings/[buildingId]/add-client-modal.tsx`, `add-device-modal.tsx`, `edit-building-modal.tsx`

**Modal System**: Rendered via centralized `ModalManager` using URL query params  
**Navigation**: `router.back()` closes modal and returns to previous page

**API Calls**:
- `GET /v1/buildings` - Fetch all buildings, find by coreId
- `GET /v1/buildings/:buildingCoreId/clients` - List clients
- `GET /v1/buildings/:buildingCoreId/assets` - List assets
- `GET /v1/buildings/:buildingId/incidents` - List incidents
- `POST /v1/admin/buildings/:buildingCoreId/clients` - Create client
- `POST /v1/admin/buildings/:buildingCoreId/assets` - Create asset
- `PATCH /v1/admin/buildings/:buildingCoreId` - Update building

**Status**: ✅ **Working**  
**Notes**: Full-size modal with tabbed interface (overview, devices, clients, work-orders, incidents). Shareable URLs.

---

## `/app/clients`

**Files**: `clients/page.tsx`  
**API Calls**:
- `GET /v1/clients` - List all clients

**Status**: ✅ **Working**  
**Notes**: Global client directory with search and pagination. Shows building assignments.

---

## `/app/clients?client=[id]` (Client Detail Modal)

**Files**: 
- `clients/[clientId]/client-detail-content.tsx` - Content component
- `clients/[clientId]/client-detail-modal.tsx` - Legacy modal (unused)
- `clients/[clientId]/page.tsx` - Legacy page (redirects to modal)

**Modal System**: Rendered via centralized `ModalManager` using URL query params  
**Navigation**: `router.back()` closes modal and returns to previous page

**API Calls**:
- `GET /v1/clients` - Fetch all clients, find by coreId
- `GET /v1/clients/:clientId/incidents` - List client incidents
- `POST /v1/incidents` - Report incident (via modal)

**Status**: ✅ **Working**  
**Notes**: Full-size modal with client profile, assigned buildings, and incident history. Shareable URLs.

---

## `/app/incidents`

**Files**: `incidents/page.tsx`, `incidents/report-incident-modal.tsx`, `incidents/incident-detail-content.tsx`  
**API Calls**:
- `GET /v1/incidents` - List incidents (with filters: q, status, priority, buildingId, clientId, page, pageSize)
- `POST /v1/incidents` - Create incident
- `GET /v1/incidents/:id` - Get incident details
- `PATCH /v1/incidents/:id/status` - Update incident status

**Status**: ✅ **Working**  
**Notes**: Full incident management with filtering, reporting, and status updates.

---

## `/app/work-orders`

**Files**: `work-orders/page.tsx`, `work-orders/create-work-order-modal.tsx`  
**API Calls**:
- `GET /v1/work-orders` - List work orders (with pagination/filters)
- `POST /v1/work-orders` - Create work order

**Status**: ✅ **Working**  
**Notes**: List view with search, status filters, pagination, status bar visualization.

---

## `/app/work-orders?workOrder=[id]` (Work Order Detail Modal)

**Files**: 
- `work-orders/[id]/work-order-detail-modal.tsx` - Full modal component (dynamically loaded)
- `work-orders/[id]/page.tsx` - Legacy page (redirects to modal)
- `work-orders/[id]/edit-work-order-modal.tsx`, `assign-employees-modal.tsx`
- `work-orders/[id]/product-usage-section.tsx`, `deactivated-devices-section.tsx`
- `work-orders/[id]/activity-timeline.tsx` - Activity log component

**Modal System**: Rendered via centralized `ModalManager` using URL query params  
**Navigation**: `router.back()` closes modal and returns to previous page

**API Calls**:
- `GET /v1/work-orders/:id` - Get work order details
- `GET /v1/work-orders/:id/activity` - Get activity log
- `PATCH /v1/work-orders/:id` - Update work order
- `DELETE /v1/work-orders/:id` - Delete work order

**Status**: ✅ **Working**  
**Notes**: Full-size modal with tabbed detail view (Details, Activity, Workflow). Back office monitoring with activity timeline. Shareable URLs.

---

## `/app/tasks` (My Workspace)

**Files**: `tasks/page.tsx`, `tasks-icon.tsx`  
**API Calls**:
- `GET /v1/work-orders/my-tasks` - Get work orders for current employee

**Status**: ✅ **Working**  
**Notes**: 
- Technical employee workspace with task cards
- Open/Closed tabs
- Filters for Head of Technical (Unassigned, In Progress, Waiting Approval)
- Header icon shows incomplete task count

---

## `/app/tasks/[taskId]`

**Files**: `tasks/[taskId]/page.tsx`  
**API Calls**:
- `GET /v1/work-orders/:id` - Get work order details
- `POST /v1/work-orders/:id/assign` - Assign employees
- `PATCH /v1/work-orders/:id/start` - Start work
- `POST /v1/work-orders/:id/products` - Submit products
- `POST /v1/work-orders/:id/deactivated-devices` - Submit deactivated devices
- `POST /v1/work-orders/:id/complete` - Submit for approval
- `POST /v1/work-orders/:id/approve` - Approve (with product modifications)
- `POST /v1/work-orders/:id/cancel` - Cancel
- `GET /v1/inventory/products` - Get products for selection

**Status**: ✅ **Working**  
**Notes**: 
- Full task detail with all workflow actions
- Head of Technical can assign employees, review products, approve/cancel
- Technical employees can start work, submit products/devices, complete

---

## `/app/inventory`

**Files**: `inventory/page.tsx`, `inventory/add-product-modal.tsx`, `inventory/edit-product-modal.tsx`, `inventory/create-purchase-order-modal.tsx`, `inventory/edit-purchase-order-modal.tsx`  
**API Calls**:
- `GET /v1/inventory/products` - List products
- `POST /v1/inventory/products` - Create product
- `GET /v1/inventory/products/:id` - Get product
- `PUT /v1/inventory/products/:id` - Update product
- `DELETE /v1/inventory/products/:id` - Delete product
- `GET /v1/inventory/purchase-orders` - List purchase orders
- `POST /v1/inventory/purchase-orders` - Create purchase order
- `GET /v1/inventory/purchase-orders/:id` - Get purchase order
- `PUT /v1/inventory/purchase-orders/:id` - Update purchase order
- `PUT /v1/inventory/purchase-orders/:id/status` - Update PO status
- `POST /v1/inventory/adjustments` - Create stock adjustment
- `GET /v1/inventory/transactions` - Get transactions
- `GET /v1/inventory/reports/low-stock` - Low stock report
- `GET /v1/inventory/reports/inventory-value` - Inventory value report

**Status**: ✅ **Working**  
**Notes**: Full inventory management with products, purchase orders, adjustments, and reports.

---

## `/app/employees`

**Files**: `employees/page.tsx`, `employees/add-employee-modal.tsx`  
**API Calls**:
- `GET /v1/employees` - List employees (with status/search filters)
- `POST /v1/employees` - Create employee

**Status**: ✅ **Working**  
**Notes**: List view with search and status filtering. Add employee modal functional.

---

## `/app/employees/[employeeId]` (Employee Detail Page)

**Files**: 
- `employees/[employeeId]/page.tsx` - Main page wrapper
- `employees/[employeeId]/employee-detail-content.tsx` - Content component
- `employees/[employeeId]/edit-employee-modal.tsx` - Edit modal
- `employees/[employeeId]/dismiss-employee-modal.tsx` - Dismiss confirmation
- `employees/[employeeId]/activate-employee-modal.tsx` - Reactivation confirmation
- `employees/[employeeId]/delete-employee-dialog.tsx` - Permanent deletion with delegation
- `employees/[employeeId]/reset-password-modal.tsx` - Password reset
- `employees/[employeeId]/create-user-account-modal.tsx` - Create login account

**API Calls**:
- `GET /v1/employees/:id` - Get employee details
- `PATCH /v1/employees/:id` - Update employee
- `POST /v1/employees/:id/dismiss` - Dismiss employee
- `POST /v1/employees/:id/activate` - Reactivate employee
- `POST /v1/employees/:id/reset-password` - Reset password
- `POST /v1/employees/:id/create-user` - Create user account
- `GET /v1/employees/:id/deletion-constraints` - Check deletion blockers
- `DELETE /v1/employees/:id/hard-delete` - Permanent deletion

**Status**: ✅ **Working**  
**Notes**: 
- Full employee lifecycle management
- Context-aware action buttons based on employee status and permissions
- Employees WITHOUT user accounts: can delete directly
- Employees WITH user accounts: must dismiss first, then can activate or permanently delete
- Permanent deletion shows delegation UI for active items (leads, work orders)

---

## `/app/sales/leads`

**Files**: `sales/leads/page.tsx`  
**API Calls**:
- `GET /v1/sales/leads` - List leads (with pagination/filters)
- `GET /v1/sales/leads/statistics` - Get pipeline statistics
- `GET /v1/sales/config/stages` - Get lead stages

**Status**: ✅ **Working**  
**Notes**: Sales pipeline view with statistics, stage-based filtering, search, and pagination.

---

## `/app/sales/leads/[id]`

**Files**: `sales/leads/[id]/page.tsx`  
**API Calls**:
- `GET /v1/sales/leads/:id` - Get lead details
- `PATCH /v1/sales/leads/:id` - Update lead
- `POST /v1/sales/leads/:id/change-stage` - Change stage
- `POST /v1/sales/leads/:id/submit-for-approval` - Submit for approval
- `POST /v1/sales/leads/:id/approve` - Approve (mark WON)
- `POST /v1/sales/leads/:id/mark-lost` - Mark as lost

**Status**: ✅ **Working**  
**Notes**: Full lead detail with services, pricing, stage history, notes, appointments. Workflow actions based on user role.

---

## `/app/admin`

**Files**: `admin/page.tsx`  
**API Calls**: None  
**Status**: ✅ **Working**  
**Notes**: Dashboard with cards linking to admin sub-sections (Positions, Role Groups, Departments, Roles, Users, System Lists, Workflow Configuration, Sales Pipeline Config).

---

## `/app/admin/workflow`

**Files**: `admin/workflow/page.tsx`  
**API Calls**:
- `GET /v1/workflow/steps` - List workflow steps with assigned positions
- `GET /v1/workflow/positions` - List all positions
- `PATCH /v1/workflow/steps/:id` - Update workflow step
- `PATCH /v1/workflow/steps/:id/positions` - Set positions for step

**Status**: ✅ **Working**  
**Notes**: 
- Configure workflow steps and position assignments
- Activate/deactivate steps
- Assign positions to each workflow step

---

## `/app/admin/positions`

**Files**: `admin/positions/page.tsx`, `admin/positions/add-position-modal.tsx`, `admin/positions/edit-position-modal.tsx`  
**API Calls**:
- `GET /v1/positions` - List positions
- `POST /v1/positions` - Create position
- `GET /v1/positions/:id` - Get position
- `PATCH /v1/positions/:id` - Update position
- `DELETE /v1/positions/:id` - Delete position
- `GET /v1/positions/:id/permissions` - Get position permissions

**Status**: ✅ **Working**  
**Notes**: Full CRUD for positions with role group assignment.

---

## `/app/admin/role-groups`

**Files**: `admin/role-groups/page.tsx`, `admin/role-groups/add-role-group-modal.tsx`, `admin/role-groups/assign-permissions-modal.tsx`  
**API Calls**:
- `GET /v1/role-groups` - List role groups
- `POST /v1/role-groups` - Create role group
- `GET /v1/role-groups/:id` - Get role group
- `PATCH /v1/role-groups/:id` - Update role group
- `DELETE /v1/role-groups/:id` - Delete role group
- `POST /v1/role-groups/:id/permissions` - Assign permissions
- `GET /v1/role-groups/:id/permissions` - Get role group permissions
- `GET /v1/permissions/grouped` - Get all permissions (for assignment modal)

**Status**: ✅ **Working**  
**Notes**: Full CRUD for role groups with permission assignment interface.

---

## `/app/admin/departments`

**Files**: 
- `admin/departments/page.tsx` - Main page with tree/split views
- `admin/departments/add-department-modal.tsx` - Add department
- `admin/departments/edit-department-modal.tsx` - Edit department
- `admin/departments/employee-popup.tsx` - Employee management popup

**API Calls**:
- `GET /v1/departments` - List departments
- `GET /v1/departments/hierarchy` - Get department hierarchy
- `GET /v1/employees` - List employees
- `GET /v1/positions` - List positions
- `POST /v1/departments` - Create department
- `PATCH /v1/departments/:id` - Update department (including drag-drop to change parent)
- `POST /v1/positions` - Create position (via Add Position button)
- `PATCH /v1/employees/:id` - Update employee position/department

**Status**: ✅ **Working**  
**Notes**: 
- Tree view and org chart view with drag-and-drop reorganization
- Drag to root level supported (sets parentId to null)
- Department details panel with Add Sub-department and Add Position buttons
- Clickable employee count opens popup for position assignment and department transfer
- Transfer requires selecting a position from the new department

---

## `/app/admin/sales-config`

**Files**: `admin/sales-config/page.tsx`  
**API Calls**:
- `GET /v1/sales/config/stages` - List lead stages
- `GET /v1/sales/config/sources` - List lead sources
- `GET /v1/sales/config/pipeline-positions` - Get position assignments
- `GET /v1/sales/config/pipeline-permissions` - Get permission assignments
- `GET /v1/positions` - List all positions
- `PATCH /v1/sales/config/pipeline-positions/:key` - Update position assignment
- `PATCH /v1/sales/config/pipeline-permissions/:key` - Update permission assignment

**Status**: ✅ **Working**  
**Notes**: 
- Configure sales pipeline stages and sources
- Assign multiple positions to pipeline roles (e.g., who can approve leads)
- Configure pipeline permissions per step

---

## `/app/admin/roles`

**Files**: `admin/roles/page.tsx`  
**API Calls**:
- `GET /v1/roles` - List roles

**Status**: ⚠️ **Partial**  
**Notes**: Read-only list view. "Add Role" and "View" buttons show alerts (not implemented). Legacy roles system (deprecated in favor of Positions).

---

## `/app/admin/users`

**Files**: `admin/users/page.tsx`  
**API Calls**: None  
**Status**: ⚠️ **Placeholder**  
**Notes**: Basic placeholder page.

---

## `/app/admin/employees`

**Files**: `admin/employees/page.tsx`, `admin/employees/add-employee-modal.tsx`  
**API Calls**: (Same as `/app/employees`)  
**Status**: ⚠️ **Partial**  
**Notes**: Duplicate of main employees page. May be intended for admin-specific view.

---

## `/app/assets`

**Files**: `assets/page.tsx`  
**API Calls**: None  
**Status**: ⚠️ **Placeholder**  
**Notes**: Empty file (assets accessed via building detail pages).

---

## `/app/departments`

**Files**: `departments/` (empty directory)  
**API Calls**: None  
**Status**: ⚠️ **Placeholder**  
**Notes**: Empty directory (departments managed via `/app/admin/departments`).

---

## `/app/roles`

**Files**: `roles/` (empty directory)  
**API Calls**: None  
**Status**: ⚠️ **Placeholder**  
**Notes**: Empty directory (legacy roles, deprecated).

---

## Messenger (Global Component - not a route)

**Files**:
- `messenger/messenger-context.tsx` - Global React Context with Socket.IO client, state management, MessageBus
- `messenger/types.ts` - TypeScript interfaces (Conversation, Message, Participant, MessageReaction, etc.)
- `messenger/chat-bubble.tsx` - Bottom-anchored chat window (Facebook-style)
- `messenger/chat-bubble-container.tsx` - Container managing multiple open chat bubbles
- `messenger/full-messenger-content.tsx` - Three-column full messenger view (conversations | chat | employee info)
- `messenger/messenger-modal-bridge.tsx` - Bridge between messenger events and modal stack system
- `messenger/messenger-dropdown.tsx` - Header dropdown showing recent conversations
- `messenger/conversation-list.tsx` - Conversation list with filters (All, Groups, Unread)
- `messenger/conversation-item.tsx` - Individual conversation row component
- `messenger/message-list.tsx` - Message list with polling, status tracking, auto-scroll
- `messenger/message-item.tsx` - Message bubble with reactions, status icons, seen avatars
- `messenger/message-input.tsx` - Message input with emoji picker and typing indicator
- `messenger/employee-info-panel.tsx` - Right-side employee card in full messenger
- `messenger/create-group-dialog.tsx` - Group creation dialog (permission-gated)
- `messenger/typing-indicator.tsx` - Animated typing indicator

**Header Components**:
- `app-header.tsx` - Sticky header with CRM28 branding, search, workspace, icons, profile
- `header-messenger-icon.tsx` - Messenger icon with unread badge and dropdown
- `header-notifications.tsx` - Notification bell with unread badge and dropdown
- `header-search.tsx` - Pill-shaped search bar with Ctrl+K shortcut
- `profile-menu.tsx` - Circular avatar button with dropdown menu

**API Calls**:
- `GET /v1/messenger/me` - Get current employee ID
- `GET /v1/messenger/conversations` - List conversations
- `POST /v1/messenger/conversations` - Create conversation
- `GET /v1/messenger/conversations/:id/messages` - List messages (cursor-based)
- `POST /v1/messenger/conversations/:id/messages` - Send message
- `POST /v1/messenger/conversations/:id/read` - Mark as read
- `POST /v1/messenger/messages/:id/reactions` - Toggle reaction
- `GET /v1/messenger/unread-count` - Unread count
- `GET /v1/messenger/search/employees` - Employee search
- `GET /v1/messenger/permissions` - Messenger permissions
- WebSocket: `/messenger` namespace (Socket.IO)

**Status**: ✅ **Working**  
**Notes**:
- Not a page route; rendered globally in `layout.tsx` via `MessengerProvider`, `ChatBubbleContainer`, `MessengerModalBridge`
- Full messenger opens as slider modal via `ModalManager` (type: `"messenger"`)
- Chat bubbles are fixed-position windows at bottom-right
- Real-time via WebSocket with REST polling fallback (3s)
- Sound notifications via `notification.wav`

---

## Summary

**Total Routes**: 28  
**Working**: 21 routes (Buildings, Clients, Incidents, Work Orders, Work Order Detail, Tasks, Task Detail, Inventory, Employees, Employee Detail, Admin Panel, Positions, Role Groups, Departments, Workflow Configuration, Sales Leads, Lead Detail, Sales Config)  
**Partial**: 3 routes (Dashboard - static UI, Roles - read-only, Admin Employees - duplicate)  
**Placeholder**: 4 routes (Users, Assets, empty directories)  
**Global Components**: Messenger (chat bubbles + full messenger modal + header integration)

**Key Patterns**:
- Most routes use `apiGet`, `apiPost`, `apiPatch`, `apiDelete` from `@/lib/api`
- Some routes use direct `fetch()` calls (buildings, clients pages)
- Permission checks implemented via `usePermissions` hook
- Work Orders separated into back-office monitoring and employee workspace
- Task detail page handles all workflow actions for technical employees
- Activity timeline shows workflow events on work order detail page
- Messenger uses `MessengerContext` for global state and `MessageBusContext` for decoupled message delivery

**Modal System (v1.2.0+)**:
- Centralized `ModalManager` in app layout renders all detail modals
- URL query params control modal state: `?building=1`, `?client=5`, `?employee=abc`, `?workOrder=123`
- Messenger modal type: `"messenger"` (opened via event bridge, not URL params)
- History-based navigation: `router.back()` closes modals
- Z-index architecture: detail modals at 10000, action modals at 50000+
- All detail views open as full-size, shareable popups
- Files: `modal-manager.tsx`, `modal-provider.tsx`, `modal-z-index-context.tsx`, `modal-stack-context.tsx`
