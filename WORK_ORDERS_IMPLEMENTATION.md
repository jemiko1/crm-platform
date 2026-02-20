# Work Orders Module - Implementation Documentation

**Created**: 2026-01-22  
**Last Updated**: 2026-01-23  
**Status**: Fully Implemented & Production Ready  
**Module**: Work Orders Management System with Dynamic Workflow Configuration

---

## 📋 Overview

The Work Orders module is a comprehensive workflow management system for technical teams visiting buildings for installation, diagnostics, repairs, and other technical services. It separates **back office work orders** (informational/monitoring) from **technical employee workspace** (task management).

---

## 🗄️ Database Schema

### WorkOrder Model

```prisma
model WorkOrder {
  id String @id @default(uuid())
  
  // Core Relations
  buildingId String
  building   Building @relation(fields: [buildingId], references: [id], onDelete: Restrict)
  
  assetId String? // Legacy single asset (backward compat)
  asset   Asset?  @relation(fields: [assetId], references: [id], onDelete: SetNull)
  
  // Sub-order support (for Diagnostic → Repair conversion)
  parentWorkOrderId String?
  parentWorkOrder   WorkOrder?  @relation("WorkOrderSubOrders", fields: [parentWorkOrderId], references: [id], onDelete: SetNull)
  childWorkOrders   WorkOrder[] @relation("WorkOrderSubOrders")
  
  // Type and Status
  type   WorkOrderType
  status WorkOrderStatus @default(CREATED)
  title  String // Auto-generated: "WO-{number} - {Building Name} - {Work Order Type}"
  notes  String? @db.Text // Description field
  
  // Workflow Fields
  contactNumber           String? // Building representative contact
  deadline                DateTime? // Deadline for completion
  amountGel               Decimal?  @db.Decimal(10, 2) // Customer payment (only for INSTALLATION, REPAIR_CHANGE)
  inventoryProcessingType String? // "ASG" or "Building" (only for INSTALLATION, REPAIR_CHANGE)
  
  // Comments from workflow participants
  techEmployeeComment String? @db.Text // Comment from technical employee
  techHeadComment     String? @db.Text // Comment from head of technical department
  cancelReason        String? @db.Text // Reason if canceled
  
  // Workflow Timestamps
  startedAt   DateTime? // When employee pressed "Start"
  completedAt DateTime? // When head approved
  canceledAt  DateTime? // When head canceled
  
  // Relations
  assignments        WorkOrderAssignment[]
  workOrderAssets    WorkOrderAsset[] // Multiple devices support
  productUsages      WorkOrderProductUsage[]
  deactivatedDevices DeactivatedDevice[]
  notifications      WorkOrderNotification[]
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([buildingId])
  @@index([status])
  @@index([type])
  @@index([parentWorkOrderId])
}
```

### WorkOrderType Enum

```prisma
enum WorkOrderType {
  INSTALLATION // ინსტალაცია
  DIAGNOSTIC   // დიაგნოსტიკა
  RESEARCH     // მოკვლევა
  DEACTIVATE   // დემონტაჟი
  REPAIR_CHANGE // შეცვლა
  ACTIVATE     // ჩართვა
}
```

**Note**: These are static types that cannot be modified, renamed, or deleted from the admin panel.

### WorkOrderStatus Enum

```prisma
enum WorkOrderStatus {
  CREATED         // Initial state - new work order
  LINKED_TO_GROUP // Employees assigned
  IN_PROGRESS     // Employee started work
  COMPLETED       // Approved by head
  CANCELED        // Canceled by head
}
```

### Supporting Models

#### WorkOrderAsset (Many-to-Many: WorkOrder ↔ Asset)
```prisma
model WorkOrderAsset {
  workOrderId String
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  
  assetId String
  asset   Asset  @relation(fields: [assetId], references: [id], onDelete: Cascade)
  
  createdAt DateTime @default(now())
  
  @@id([workOrderId, assetId])
  @@index([workOrderId])
  @@index([assetId])
}
```

#### WorkOrderAssignment (Links employees to work orders)
```prisma
model WorkOrderAssignment {
  id String @id @default(uuid())
  
  workOrderId String
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  
  employeeId String
  employee   Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  
  assignedAt DateTime @default(now())
  assignedBy String? // User ID who made the assignment
  
  @@index([workOrderId])
  @@index([employeeId])
}
```

#### WorkOrderNotification (Tracks who should be notified)
```prisma
model WorkOrderNotification {
  id String @id @default(uuid())
  
  workOrderId String
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  
  employeeId String
  employee   Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  
  notifiedAt DateTime? // When notification was sent
  readAt     DateTime? // When employee read notification
  
  createdAt DateTime @default(now())
  
  @@unique([workOrderId, employeeId])
  @@index([workOrderId])
  @@index([employeeId])
  @@index([readAt])
}
```

#### WorkOrderProductUsage (Products used in INSTALLATION/REPAIR_CHANGE)
```prisma
model WorkOrderProductUsage {
  id String @id @default(uuid())
  
  workOrderId String
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  
  productId String
  product   InventoryProduct @relation(fields: [productId], references: [id], onDelete: Restrict)
  
  quantity Int
  batchId  String? // For FIFO tracking
  batch    StockBatch? @relation(fields: [batchId], references: [id], onDelete: SetNull)
  
  // Approval tracking
  isApproved Boolean   @default(false)
  approvedBy String? // User ID
  approvedAt DateTime?
  
  // Tech employee filled, head can modify
  filledBy   String? // Employee ID who filled
  modifiedBy String? // Head who modified
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([workOrderId])
  @@index([productId])
  @@index([isApproved])
}
```

#### DeactivatedDevice (Devices from DEACTIVATE work orders)
```prisma
model DeactivatedDevice {
  id String @id @default(uuid())
  
  workOrderId String
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  
  productId String
  product   InventoryProduct @relation(fields: [productId], references: [id], onDelete: Restrict)
  
  quantity Int
  batchId  String? // Original batch
  
  // Working condition check
  isWorkingCondition Boolean   @default(false)
  checkedBy          String? // User ID
  checkedAt          DateTime?
  
  // Transfer to active stock
  transferredToStock Boolean   @default(false)
  transferredBy      String?
  transferredAt      DateTime?
  stockTransactionId String? // Link to StockTransaction when transferred
  
  notes String? @db.Text
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([workOrderId])
  @@index([productId])
  @@index([isWorkingCondition])
  @@index([transferredToStock])
}
```

#### PositionSetting (Configurable positions)
```prisma
model PositionSetting {
  id String @id @default(uuid())
  
  key        String    @unique // e.g., "HEAD_OF_TECHNICAL_DEPARTMENT"
  positionId String? // Position ID for this setting
  position   Position? @relation(fields: [positionId], references: [id], onDelete: SetNull)
  
  value       String? // Additional config value
  description String?
  
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  @@index([key])
  @@index([positionId])
}
```

**Key Setting**: `HEAD_OF_TECHNICAL_DEPARTMENT` - Links to the position that receives new work orders for assignment.

#### WorkOrderActivityLog (Activity Timeline)
```prisma
model WorkOrderActivityLog {
  id String @id @default(uuid())
  
  workOrderId String
  workOrder   WorkOrder @relation(fields: [workOrderId], references: [id], onDelete: Cascade)
  
  employeeId  String?
  employee    Employee? @relation(fields: [employeeId], references: [id], onDelete: SetNull)
  
  action      String   // e.g., "CREATED", "ASSIGNED", "STARTED", "PRODUCTS_SUBMITTED", "APPROVED"
  category    String   // "MAIN" (important events) or "DETAIL" (minor events)
  description String   @db.Text
  metadata    Json?    // Additional data (e.g., assigned employee names)
  
  createdAt DateTime @default(now())
  
  @@index([workOrderId])
  @@index([action])
  @@index([category])
  @@index([createdAt])
}
```

#### WorkflowStep (Workflow Configuration)
```prisma
model WorkflowStep {
  id String @id @default(uuid())

  stepKey         String   @unique // e.g., "ASSIGN_EMPLOYEES", "START_WORK", "FINAL_APPROVAL"
  stepName        String
  description     String?
  stepOrder       Int      @unique // Order of the step in the workflow
  triggerStatus   WorkOrderStatus // The status that triggers this step
  requiredAction  String? // e.g., "ASSIGN", "START", "SUBMIT_PRODUCTS", "APPROVE"
  workOrderTypes  Json? // Array of WorkOrderType enums

  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  assignedPositions WorkflowStepPosition[]
}
```

#### WorkflowStepPosition (Position Assignment to Steps)
```prisma
model WorkflowStepPosition {
  id String @id @default(uuid())

  workflowStepId String
  workflowStep   WorkflowStep @relation(fields: [workflowStepId], references: [id], onDelete: Cascade)

  positionId        String
  position          Position @relation(fields: [positionId], references: [id], onDelete: Cascade)

  isPrimaryAssignee Boolean @default(true)
  notificationType  String  @default("TASK") // "TASK", "NOTIFICATION", "BOTH"

  createdAt DateTime @default(now())

  @@unique([workflowStepId, positionId])
}
```

---

## 🔄 Workflow Stages

### Configurable Workflow Steps

The workflow is now fully configurable via the Admin Panel (`/app/admin/workflow`). **Only Step 1 and Step 5 are configurable** - Steps 2-4 are automatically handled by the employees assigned in Step 1.

| Step | Key | Trigger Status | Configurable | Default Position | Description |
|------|-----|----------------|--------------|------------------|-------------|
| 1 | `ASSIGN_EMPLOYEES` | CREATED | ✅ **Yes** | Head of Technical Department | Assign employees to the work order |
| 2 | `START_WORK` | LINKED_TO_GROUP | ❌ No | Technical Employee | Start work on the order (handled by assigned employees) |
| 3 | `SUBMIT_PRODUCTS` | IN_PROGRESS | ❌ No | Technical Employee | Submit products used (handled by assigned employees) |
| 4 | `SUBMIT_DEVICES` | IN_PROGRESS | ❌ No | Technical Employee | Submit deactivated devices (handled by assigned employees) |
| 5 | `SUBMIT_COMPLETION` | IN_PROGRESS | ❌ No | Technical Employee | Submit work for review (handled by assigned employees) |
| 6 | `FINAL_APPROVAL` | IN_PROGRESS | ✅ **Yes** | Head of Technical Department | Review and approve/cancel |

**Note**: Steps 2-4 are not shown in the admin panel as they are automatically handled by employees assigned in Step 1. Only Step 1 (who assigns employees) and Step 5 (who approves) are configurable.

### 1. CREATED (Initial State)
- **Who sees it**: Positions assigned to Step 1 (`ASSIGN_EMPLOYEES`) in workflow configuration (via notifications)
- **Actions available**:
  - Step 1 positions: Assign employees (in workspace `/app/tasks/[taskId]`)
  - Back office: View, Edit, Delete (read-only for technical employees)
- **Configuration**: Admin can change which positions receive new work orders via `/app/admin/workflow` → Step 1

### 2. LINKED_TO_GROUP (Employees Assigned)
- **Who sees it**: Assigned technical employees AND Step 1 positions (in workspace)
- **Actions available**:
  - Assigned employees: Start work
  - Step 1 positions: View assignments, monitor progress (tasks remain visible)

### 3. IN_PROGRESS (Work Started)
- **Who sees it**: Assigned technical employees, Step 1 positions (monitoring), Step 5 positions (for approval)
- **Actions available**:
  - Assigned employees:
    - Submit product usage (INSTALLATION, REPAIR_CHANGE)
    - Submit deactivated devices (DEACTIVATE)
    - Request repair classification (DIAGNOSTIC)
    - Submit completion with comment (creates notification for Step 5 positions)
  - Step 5 positions (Final Approval): 
    - Review products/devices
    - **Edit, delete, or add products** before approval
    - Approve or cancel with comments
- **Configuration**: Admin can change which positions handle final approval via `/app/admin/workflow` → Step 5

### 4. COMPLETED (Approved)
- **Final state**: Work order completed, products deducted from stock
- **Who sees it**: Everyone (read-only)
- **Activity**: Logged in activity timeline

### 5. CANCELED (Canceled)
- **Final state**: Work order canceled with reason
- **Who sees it**: Everyone (read-only)
- **Activity**: Logged in activity timeline

---

## 📝 Work Order Types & Required Fields

### INSTALLATION / REPAIR_CHANGE
**Required Fields:**
- Building
- Devices (multiple)
- Contact Number
- Deadline
- Description
- Amount (GEL)
- Inventory Processing Type ([ASG] or [Building])
- Employees To be notified

**Workflow Features:**
- Product usage tracking
- Stock deduction upon approval

### DIAGNOSTIC / RESEARCH / DEACTIVATE / ACTIVATE
**Required Fields:**
- Building
- Devices (multiple)
- Contact Number
- Deadline
- Description
- Employees To be notified

**Workflow Features:**
- **DIAGNOSTIC**: Can request conversion to REPAIR_CHANGE (creates sub-order)
- **DEACTIVATE**: Deactivated devices tracking
- **RESEARCH / ACTIVATE**: No product usage

---

## 🔌 Backend API Endpoints

### Work Orders Controller (`/v1/work-orders`)

#### GET `/v1/work-orders`
- **Description**: List all work orders (paginated, filtered)
- **Query Params**: `page`, `pageSize`, `status`, `type`, `buildingId`
- **Access**: Back office employees
- **Returns**: `{ data: WorkOrder[], meta: PaginationMeta }`

#### GET `/v1/work-orders/:id`
- **Description**: Get work order details
- **Access**: All authenticated users (permission-based data visibility)
- **Returns**: `WorkOrderDetail` with all relations

#### POST `/v1/work-orders`
- **Description**: Create new work order
- **Body**: `CreateWorkOrderDto`
- **Access**: Back office employees
- **Auto-actions**:
  - Generates title if not provided: `"WO-{maxNumber+1} - {Building Name} - {Work Order Type}"`
  - Creates notifications for Head of Technical Department employees
- **Returns**: Created work order

#### PATCH `/v1/work-orders/:id`
- **Description**: Update work order
- **Body**: `UpdateWorkOrderDto`
- **Access**: Back office employees (not technical employees)

#### DELETE `/v1/work-orders/:id`
- **Description**: Delete work order
- **Access**: Back office employees (not technical employees)

#### GET `/v1/work-orders/my-tasks`
- **Description**: Get work orders for current employee (workspace)
- **Access**: All employees
- **Returns**:
  - Assigned work orders (for all employees)
  - Notified work orders in CREATED status (for Head of Technical Department only)
- **Returns**: `{ data: WorkOrderTask[], meta: PaginationMeta }`

#### POST `/v1/work-orders/:id/assign`
- **Description**: Assign employees to work order
- **Body**: `{ employeeIds: string[] }`
- **Access**: Head of Technical Department (in workspace)
- **Actions**:
  - Creates `WorkOrderAssignment` records
  - Updates status to `LINKED_TO_GROUP`
  - Creates notifications for assigned employees

#### PATCH `/v1/work-orders/:id/start`
- **Description**: Start work (employee begins work)
- **Access**: Assigned technical employees
- **Actions**:
  - Updates status to `IN_PROGRESS`
  - Sets `startedAt` timestamp
  - Notifies Head of Technical Department

#### POST `/v1/work-orders/:id/products`
- **Description**: Submit product usage
- **Body**: `ProductUsageDto[]`
- **Access**: Assigned technical employees (IN_PROGRESS status)
- **Allowed Types**: INSTALLATION, REPAIR_CHANGE
- **Actions**: Creates `WorkOrderProductUsage` records (pending approval)

#### POST `/v1/work-orders/:id/deactivated-devices`
- **Description**: Submit deactivated devices
- **Body**: `DeactivatedDeviceDto[]`
- **Access**: Assigned technical employees (IN_PROGRESS status)
- **Allowed Types**: DEACTIVATE only
- **Actions**: Creates `DeactivatedDevice` records

#### POST `/v1/work-orders/:id/request-repair`
- **Description**: Request Diagnostic → Repair conversion
- **Body**: `RequestRepairDto`
- **Access**: Assigned technical employees (DIAGNOSTIC, IN_PROGRESS)
- **Actions**: Creates sub-order with type REPAIR_CHANGE

#### POST `/v1/work-orders/:id/complete`
- **Description**: Submit work for approval (with completion comment)
- **Body**: `{ comment: string }`
- **Access**: Assigned technical employees (IN_PROGRESS)
- **Actions**: Sets `techEmployeeComment`, status remains IN_PROGRESS (pending approval)

#### PATCH `/v1/work-orders/:id/approve`
- **Description**: Approve completed work order
- **Body**: `{ comment?: string }`
- **Access**: Head of Technical Department
- **Actions**:
  - Updates status to `COMPLETED`
  - Sets `completedAt` timestamp
  - Sets `techHeadComment`
  - Deducts approved products from stock (INSTALLATION, REPAIR_CHANGE)
  - Creates `StockTransaction` records

#### PATCH `/v1/work-orders/:id/cancel`
- **Description**: Cancel work order
- **Body**: `{ cancelReason: string, comment?: string }`
- **Access**: Head of Technical Department
- **Actions**:
  - Updates status to `CANCELED`
  - Sets `canceledAt` timestamp
  - Sets `cancelReason` and `techHeadComment`
  - Logs activity

#### GET `/v1/work-orders/:id/activity`
- **Description**: Get activity log for work order
- **Query Params**: `includeDetails` (boolean) - include detailed events
- **Access**: All authenticated users
- **Returns**: `WorkOrderActivityLog[]`

### Workflow Controller (`/v1/workflow`)

#### GET `/v1/workflow/steps`
- **Description**: Get all workflow steps with assigned positions
- **Access**: Admin
- **Returns**: `WorkflowStep[]` with `assignedPositions`

#### GET `/v1/workflow/steps/:id`
- **Description**: Get single workflow step
- **Access**: Admin
- **Returns**: `WorkflowStep` with `assignedPositions`

#### PATCH `/v1/workflow/steps/:id`
- **Description**: Update workflow step
- **Body**: `UpdateWorkflowStepDto`
- **Access**: Admin

#### PATCH `/v1/workflow/steps/:id/positions`
- **Description**: Set positions for workflow step
- **Body**: `{ positionIds: string[] }`
- **Access**: Admin
- **Actions**: Replaces all position assignments for the step

#### GET `/v1/workflow/positions`
- **Description**: Get all active positions
- **Access**: Admin
- **Returns**: `Position[]`

---

## 🎨 Frontend Components

### Pages

#### `/app/work-orders` - Work Orders Directory (Back Office)
- **Purpose**: Back office work order management
- **Features**:
  - List all work orders (paginated, searchable, filterable)
  - Status bar visualization (like incidents module)
  - Create new work orders
  - View work order details
- **Access**: Back office employees
- **Components**:
  - `WorkOrdersPage` - Main listing page
  - `CreateWorkOrderModal` - Create work order modal

#### `/app/work-orders/[id]` - Work Order Detail (Back Office)
- **Purpose**: View work order details (informational/monitoring)
- **Features**:
  - Display all work order fields
  - **Activity Timeline** - Shows all workflow events with timestamps
  - Product usage (read-only for technical employees)
  - Deactivated devices (read-only for technical employees)
  - **Workflow Tab** (Admin only): Debug view showing notifications, assignments, sub-orders
- **Access**: All authenticated users
- **Tabs**:
  - **Details**: Work order information
  - **Activity**: Timeline of all events (Main events highlighted, detailed events toggleable)
  - **Workflow** (Admin): Debug information
- **Permissions**:
  - Technical employees: Read-only, sensitive data (amountGel) hidden
  - Back office: Full access (Edit, Delete)
- **Components**:
  - `WorkOrderDetailPage` - Detail view
  - `ActivityTimeline` - Activity log display
  - `ProductUsageSection` - Product usage display/management
  - `DeactivatedDevicesSection` - Deactivated devices display/management
  - `WorkflowTab` - Admin debug view

#### `/app/tasks` - My Workspace (Technical Employees)
- **Purpose**: Technical employee task management
- **Features**:
  - **Open Tasks Tab**: Active tasks requiring action
  - **Closed Tasks Tab**: Completed and canceled tasks
  - View assigned tasks
  - View notified tasks (Head of Technical Department)
  - **Filters for Head of Technical**:
    - All Tasks
    - Unassigned Tasks (CREATED status)
    - In Progress Tasks (LINKED_TO_GROUP, IN_PROGRESS)
    - Waiting Approval Tasks (IN_PROGRESS with techEmployeeComment)
  - Click task card to open detailed view
- **Access**: All employees (shows relevant tasks based on role)
- **Components**:
  - `TasksPage` - Main workspace page with tabs
  - `TaskCard` - Individual task card with status badge

#### `/app/tasks/[taskId]` - Task Detail (Technical Employees)
- **Purpose**: Detailed task view with all workflow actions
- **Features**:
  - Full task information display
  - **Head of Technical Department**:
    - Assign employees directly (CREATED status)
    - Review products submitted by tech employees
    - **Edit, delete, or add products** before approval
    - Approve or cancel with comments
  - **Technical Employee**:
    - Start work button
    - Submit products (INSTALLATION, REPAIR_CHANGE)
    - Submit deactivated devices (DEACTIVATE)
    - Request repair classification (DIAGNOSTIC)
    - Submit completion with comment
- **Access**: Employees assigned to or notified about the task
- **Components**:
  - `TaskDetailPage` - Full task management page
  - `AssignEmployeesModal` - Employee assignment modal
  - `AddProductModal` - Add product from inventory modal

#### `/app/admin/workflow` - Workflow Configuration (Admin Only)
- **Description**: Configure which positions receive tasks at Step 1 (Assign Employees) and Step 5 (Final Approval)
- **Features**:
  - View Step 1 and Step 5 workflow steps
  - Edit which positions are assigned to each step
  - Enable/disable steps
  - Steps 2-4 are hidden (automatically handled by assigned employees)
- **Access**: Admin permissions required
- **Purpose**: Configure workflow steps and position assignments
- **Features**:
  - View all workflow steps
  - Edit positions assigned to each step
  - Activate/deactivate workflow steps
  - See which work order types each step applies to
- **Access**: Admin only
- **Components**:
  - `WorkflowConfigurationPage` - Main configuration page

### Components

#### `CreateWorkOrderModal`
- **Location**: `frontend/crm-frontend/src/app/app/work-orders/create-work-order-modal.tsx`
- **Features**:
  - Visual type selection cards (6 static types with icons)
  - Two-column responsive layout
  - Conditional fields based on type
  - Building search with results dropdown
  - Multiple device selection with checkboxes
  - Employee notification selection with tags
  - Auto-generates title if not provided
  - Confirmation dialog to prevent data loss
  - Modern, professional design

#### `AssignEmployeesModal`
- **Location**: `frontend/crm-frontend/src/app/app/work-orders/[id]/assign-employees-modal.tsx`
- **Features**:
  - Searchable employee list
  - Multi-select checkboxes
  - Filters out already assigned employees
- **Usage**: Workspace only (not in work order detail page)

#### `ProductUsageSection`
- **Location**: `frontend/crm-frontend/src/app/app/work-orders/[id]/product-usage-section.tsx`
- **Features**:
  - Submit product usage (technicians)
  - Review/approve product usage (Head of Technical Department)
  - Product selection with stock availability
  - Batch selection (FIFO)
- **Access**: Hidden for technical employees in work order detail (should use workspace)

#### `DeactivatedDevicesSection`
- **Location**: `frontend/crm-frontend/src/app/app/work-orders/[id]/deactivated-devices-section.tsx`
- **Features**:
  - Submit deactivated devices (technicians)
  - Review deactivated devices (Head of Technical Department)
- **Access**: Hidden for technical employees in work order detail (should use workspace)

#### `TasksIcon` (Header Component)
- **Location**: `frontend/crm-frontend/src/app/app/tasks-icon.tsx`
- **Features**:
  - Shows in header for all employees
  - Displays badge with incomplete task count
  - Links to `/app/tasks`
  - Auto-refreshes every 30 seconds

---

## 🔐 Permission & Access Control

### Work Orders vs Workspace Separation

#### Work Orders (Back Office - Informational)
- **Purpose**: Monitoring and information
- **Access**: Back office employees
- **Technical Employees**: Read-only, sensitive data hidden
- **Features**: View only, no workflow actions

#### Workspace (Technical Employees - Task Management)
- **Purpose**: Active task management
- **Access**: All employees (see relevant tasks)
- **Features**: All workflow actions (assign, start, submit, complete, approve)

### Granular Permissions

| Permission | Description |
|------------|-------------|
| `work_orders.view` | View work orders |
| `work_orders.create` | Create new work orders |
| `work_orders.edit` | Edit work orders |
| `work_orders.delete` | Delete work orders |
| `work_orders.assign` | Assign employees to work orders |
| `work_orders.start` | Start work on work orders |
| `work_orders.complete` | Submit completion for work orders |
| `work_orders.approve` | Approve/finalize work orders |
| `work_orders.cancel` | Cancel work orders |
| `work_orders.manage_products` | Add/edit/remove products in work orders |
| `work_orders.manage_devices` | Manage deactivated devices |
| `work_orders.request_repair` | Request diagnostic → repair conversion |
| `work_orders.view_activity` | View activity timeline |
| `work_orders.view_workflow` | View workflow debug tab (admin) |
| `work_orders.view_sensitive` | View sensitive data (amountGel) |
| `work_orders.manage_workflow` | Configure workflow steps |

### Data Visibility

- **amountGel**: Only visible to users with `work_orders.view_sensitive` permission
- **Product Usage**: Hidden for technical employees in work order detail (use workspace)
- **Deactivated Devices**: Hidden for technical employees in work order detail (use workspace)
- **Edit/Delete Buttons**: Hidden for technical employees
- **Workflow Tab**: Only visible to users with `work_orders.view_workflow` permission
- **Activity Timeline**: Visible to users with `work_orders.view_activity` permission

---

## 🔔 Notification System

### Automatic Notifications

When a work order is created:
1. System finds workflow step `ASSIGN_EMPLOYEES` and its assigned positions
2. Finds all active employees with those positions
3. Creates `WorkOrderNotification` records for each employee
4. These employees see the work order in their workspace (`/app/tasks`)

### Notification Flow

1. **Creation**: Work order created → Notifications created for Head of Technical Department
2. **Assignment**: Head assigns employees → Notifications created for assigned employees
3. **Status Changes**: Notifications sent when work starts, completes, etc.

---

## 📊 Activity Timeline

### Event Categories

| Category | Description | Examples |
|----------|-------------|----------|
| `MAIN` | Important workflow events | Created, Assigned, Started, Approved, Canceled |
| `DETAIL` | Minor/informational events | Viewed, Products modified, Comment added |

### Logged Events

| Action | Category | Description |
|--------|----------|-------------|
| `CREATED` | MAIN | Work order created |
| `VIEWED` | DETAIL | Employee viewed work order |
| `ASSIGNED` | MAIN | Employees assigned to work order |
| `STATUS_CHANGED` | MAIN | Status changed (e.g., CREATED → LINKED_TO_GROUP) |
| `STARTED` | MAIN | Work started by technical employee |
| `PRODUCTS_SUBMITTED` | MAIN | Products submitted by tech employee |
| `PRODUCTS_MODIFIED` | DETAIL | Products modified by head of technical |
| `DEVICES_SUBMITTED` | MAIN | Deactivated devices submitted |
| `COMMENT_ADDED` | DETAIL | Comment added by employee |
| `SUBMITTED_FOR_APPROVAL` | MAIN | Tech employee submitted for approval |
| `APPROVED` | MAIN | Work order approved by head |
| `CANCELED` | MAIN | Work order canceled by head |
| `REPAIR_REQUESTED` | MAIN | Repair classification requested |

### Timeline Display

- **Default View**: Shows only `MAIN` events
- **Show All**: Toggle to include `DETAIL` events
- **Format**: Chronological order with timestamps and employee names

---

## 📦 Inventory Integration

### Product Usage (INSTALLATION, REPAIR_CHANGE)

1. **Technician submits**: Creates `WorkOrderProductUsage` records (pending approval)
2. **Head reviews**: Can modify quantities/products
3. **Head approves**: 
   - Marks `isApproved = true`
   - Deducts from stock via `InventoryService.deductStockForWorkOrder()`
   - Creates `StockTransaction` records

### Deactivated Devices (DEACTIVATE)

1. **Technician submits**: Creates `DeactivatedDevice` records
2. **Head reviews**: Can mark as working condition
3. **Transfer to stock**:
   - Mark as working condition
   - Transfer to active stock
   - Creates `StockTransaction` with type `RETURN_IN`
   - Updates `InventoryProduct.currentStock`

**Note**: Deactivated devices go to a separate tab in inventory (`/app/inventory?tab=deactivated-devices`) before being transferred to active stock.

---

## 🔧 Key Service Methods

### `WorkOrdersService`

#### `create(dto: CreateWorkOrderDto, createdByUserId?: string)`
- Resolves building and assets by coreId
- Generates title if not provided
- Finds Head of Technical Department employees
- Creates work order with notifications
- Returns created work order with relations

#### `getWorkOrdersForEmployee(employeeId: string)`
- Gets assigned work orders
- If Head of Technical Department: Also gets notified work orders (CREATED status)
- Returns combined list

#### `assignEmployees(workOrderId: string, employeeIds: string[], assignedBy: string)`
- Creates `WorkOrderAssignment` records
- Updates status to `LINKED_TO_GROUP`
- Creates notifications for assigned employees

#### `startWork(workOrderId: string, employeeId: string)`
- Verifies employee is assigned
- Updates status to `IN_PROGRESS`
- Sets `startedAt` timestamp

#### `submitProductUsage(workOrderId: string, employeeId: string, productUsages: ProductUsageDto[])`
- Verifies employee is assigned and status is IN_PROGRESS
- Creates `WorkOrderProductUsage` records (pending approval)

#### `submitDeactivatedDevices(workOrderId: string, employeeId: string, devices: DeactivatedDeviceDto[])`
- Verifies employee is assigned, status is IN_PROGRESS, type is DEACTIVATE
- Creates `DeactivatedDevice` records

#### `approveWorkOrder(workOrderId: string, headUserId: string, productUsages?: ProductUsageDto[], comment?: string, cancelReason?: string)`
- Updates status to COMPLETED or CANCELED
- Deducts approved products from stock
- Creates stock transactions

---

## 🎯 Workflow Summary

### For Back Office (Work Orders Page)
1. Create work order → System automatically notifies Head of Technical Department
2. View work orders → Monitor status and activity
3. Edit/Delete → Manage work orders (not available to technical employees)

### For Head of Technical Department (Workspace)
1. See new work orders → In workspace (`/app/tasks`)
2. Assign employees → Creates assignments, updates status to LINKED_TO_GROUP
3. Assigned employees see task → In their workspace
4. Review completed work → Approve or cancel with comments

### For Technical Employees (Workspace)
1. See assigned tasks → In workspace (`/app/tasks`)
2. Start work → Updates status to IN_PROGRESS
3. Submit products/devices → Based on work order type
4. Complete work → Submit with comment, pending approval
5. Head approves → Status becomes COMPLETED, products deducted

---

## 🐛 Known Issues & Solutions

### Issue: Tasks not showing for Head of Technical Department
**Solution**: 
1. Ensure `PositionSetting` with key `"HEAD_OF_TECHNICAL_DEPARTMENT"` exists
2. Ensure `positionId` is linked to the correct position
3. Run backfill script: `npx ts-node src/scripts/backfill-work-order-notifications.ts`

### Issue: Work order numbering duplicates after deletion
**Solution**: Fixed - now uses max number from existing titles, not count

### Issue: Prisma query not filtering correctly
**Solution**: Fixed - fetch notifications first, then work orders separately

---

## 📁 File Structure

### Backend
```
backend/crm-backend/src/work-orders/
├── work-orders.service.ts              # Main service logic
├── work-orders-notifications.service.ts # Notification handling
├── work-orders-activity.service.ts     # Activity logging
├── work-orders.module.ts               # Module definition
├── dto/
│   ├── create-work-order.dto.ts        # Create DTO
│   ├── update-work-order.dto.ts        # Update DTO
│   ├── product-usage.dto.ts            # Product usage DTO
│   ├── deactivated-device.dto.ts       # Deactivated device DTO
│   ├── assign-employees.dto.ts         # Assign employees DTO
│   └── request-repair.dto.ts           # Request repair conversion DTO
└── ...

backend/crm-backend/src/workflow/
├── workflow.service.ts                 # Workflow configuration service
├── workflow.module.ts                  # Workflow module
└── workflow.dto.ts                     # Workflow DTOs

backend/crm-backend/src/v1/
├── work-orders.controller.ts           # Work order API endpoints
└── workflow.controller.ts              # Workflow configuration endpoints

backend/crm-backend/prisma/
├── schema.prisma                       # Database schema
├── seed-position-settings.ts           # Seed PositionSetting
├── seed-workflow-steps.ts              # Seed workflow steps
├── seed-permissions.ts                 # Seed permissions (updated)
└── migrations/
    └── 20260122154853_update_work_orders_workflow/
        └── migration.sql               # Migration SQL
```

### Frontend
```
frontend/crm-frontend/src/app/app/
├── work-orders/
│   ├── page.tsx                        # Work orders listing (back office)
│   ├── create-work-order-modal.tsx     # Create modal
│   └── [id]/
│       ├── page.tsx                    # Work order detail (back office)
│       ├── edit-work-order-modal.tsx
│       ├── assign-employees-modal.tsx
│       ├── product-usage-section.tsx
│       └── deactivated-devices-section.tsx
├── tasks/
│   ├── page.tsx                        # Workspace with tabs/filters
│   └── [taskId]/
│       └── page.tsx                    # Task detail page
├── admin/
│   ├── page.tsx                        # Admin panel (updated with workflow link)
│   └── workflow/
│       └── page.tsx                    # Workflow configuration page
├── tasks-icon.tsx                      # Header icon component
└── layout.tsx                          # App layout (includes tasks icon)
```

---

## 🔍 Debugging Tools

### Diagnostic Scripts

#### `check-head-of-tech.ts`
- Checks PositionSetting configuration
- Lists employees with Head of Technical Department position
- Shows recent work orders and notifications
- Verifies specific employee setup

**Usage**: `npx ts-node src/scripts/check-head-of-tech.ts`

#### `backfill-work-order-notifications.ts`
- Backfills notifications for existing work orders
- Creates notifications for Head of Technical Department employees
- Useful when PositionSetting was created after work orders

**Usage**: `npx ts-node src/scripts/backfill-work-order-notifications.ts`

---

## 📊 Workflow Tab (Admin Debug View)

**Location**: Work Order Detail Page → "Workflow" tab (Admin only)

**Shows**:
- Workflow state (status, timestamps)
- Notifications (who was notified, read status)
- Assignments (who is assigned)
- Parent work order (if sub-order)
- Sub-orders (if any)
- Workflow summary (step-by-step overview)

**Purpose**: Debugging and testing workflow during development

---

## 🚀 Implemented Features (v2)

1. ✅ **Task Detail View in Workspace**: Full task detail page (`/app/tasks/[taskId]`) with all workflow actions
2. ✅ **Workflow History**: Detailed activity log with timeline display
3. ✅ **Dynamic Workflow Configuration**: Admin panel to configure Step 1 (Assign Employees) and Step 5 (Final Approval) positions
4. ✅ **Product Management**: Step 5 positions can edit, delete, add products before approval
5. ✅ **Task Filters**: Unassigned, In Progress, Waiting Approval filters for workflow managers
6. ✅ **Open/Closed Tabs**: Separate tabs for active and completed tasks in workspace
7. ✅ **Visual Improvements**: Modern, professional create work order modal with improved UX

## 🚀 Future Enhancements

1. **Real-time Notifications**: WebSocket/push notifications for new tasks
2. **Bulk Operations**: Assign multiple work orders at once
3. **Mobile Support**: Optimize workspace for mobile devices
4. **Email Notifications**: Send email when tasks are assigned
5. **SMS Notifications**: Send SMS for urgent tasks
6. **Calendar Integration**: Show deadlines in calendar view
7. **Reporting Dashboard**: Work order completion rates, average time, etc.
8. **Recurring Work Orders**: Schedule regular maintenance tasks

---

## 📝 Notes

- Work order titles are auto-generated if not provided
- Title format: `"WO-{maxNumber+1} - {Building Name} - {Work Order Type}"`
- Work order numbering uses max number from existing titles (not count), so deletions don't affect numbering
- Technical employees work in workspace (`/app/tasks`), not in work order detail pages
- Back office employees use work orders page (`/app/work-orders`) for monitoring
- Sensitive data (amountGel) is hidden from technical employees
- All workflow actions happen in workspace task detail (`/app/tasks/[taskId]`)
- Activity timeline shows all workflow events for monitoring purposes
- Workflow Step 1 (Assign Employees) and Step 5 (Final Approval) positions are configurable via admin panel
- Steps 2-4 are automatically handled by employees assigned in Step 1
- Step 5 positions can modify products before final approval
- Products are deducted from inventory only after Step 5 position approves
- Work order creation modal has been visually improved with modern, professional design.

---

**Last Updated**: 2026-01-23
