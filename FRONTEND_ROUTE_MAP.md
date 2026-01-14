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

## `/app/buildings/[buildingId]`

**Files**: `buildings/[buildingId]/page.tsx`, `buildings/[buildingId]/add-client-modal.tsx`, `buildings/[buildingId]/add-product-modal.tsx`, `buildings/[buildingId]/edit-building-modal.tsx`  
**API Calls**:
- `GET /v1/buildings/:buildingCoreId` - Get building details
- `GET /v1/buildings/:buildingCoreId/clients` - List clients
- `GET /v1/buildings/:buildingCoreId/assets` - List assets
- `GET /v1/buildings/:buildingId/incidents` - List incidents
- `POST /v1/admin/buildings/:buildingCoreId/clients` - Create client
- `POST /v1/admin/buildings/:buildingCoreId/assets` - Create asset
- `PATCH /v1/admin/buildings/:buildingCoreId` - Update building

**Status**: ✅ **Working**  
**Notes**: Tabbed interface (overview, products, clients, work-orders, incidents). All CRUD operations functional.

---

## `/app/clients`

**Files**: `clients/page.tsx`  
**API Calls**:
- `GET /v1/clients` - List all clients

**Status**: ✅ **Working**  
**Notes**: Global client directory with search and pagination. Shows building assignments.

---

## `/app/clients/[clientId]`

**Files**: `clients/[clientId]/page.tsx`  
**API Calls**:
- `GET /v1/clients/:clientId/incidents` - List client incidents
- `POST /v1/incidents` - Report incident (via modal)

**Status**: ✅ **Working**  
**Notes**: Client detail view with incidents list. Report incident modal integrated.

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

**Files**: `work-orders/page.tsx`  
**API Calls**:
- `GET /v1/work-orders` - List work orders (with pagination/filters)

**Status**: ✅ **Working**  
**Notes**: List view with search, status filters, pagination.

---

## `/app/work-orders/[id]`

**Files**: `work-orders/[id]/page.tsx`, `work-orders/[id]/edit-work-order-modal.tsx`  
**API Calls**:
- `GET /v1/work-orders/:id` - Get work order details
- `PATCH /v1/work-orders/:id` - Update work order
- `DELETE /v1/work-orders/:id` - Delete work order

**Status**: ✅ **Working**  
**Notes**: Detail view with edit and delete functionality.

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

## `/app/employees/[employeeId]`

**Files**: `employees/[employeeId]/page.tsx`, `employees/[employeeId]/edit-employee-modal.tsx`  
**API Calls**:
- `GET /v1/employees/:id` - Get employee details
- `PATCH /v1/employees/:id` - Update employee

**Status**: ✅ **Working**  
**Notes**: Tabbed detail view (Personal, Employment, Permissions, Work Orders). Edit modal functional.

---

## `/app/admin`

**Files**: `admin/page.tsx`  
**API Calls**: None  
**Status**: ✅ **Working**  
**Notes**: Dashboard with cards linking to admin sub-sections (Positions, Role Groups, Departments, Roles, Users).

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

**Files**: `admin/departments/page.tsx`  
**API Calls**:
- `GET /v1/departments` - List departments
- `GET /v1/departments/hierarchy` - Get department hierarchy

**Status**: ⚠️ **Partial**  
**Notes**: Read-only list and tree views. "Add Department" button shows alert (not implemented).

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

## Summary

**Total Routes**: 20  
**Working**: 12 routes (Buildings, Clients, Incidents, Work Orders, Inventory, Employees, Admin Panel, Positions, Role Groups)  
**Partial**: 4 routes (Dashboard - static UI, Departments - read-only, Roles - read-only, Admin Employees - duplicate)  
**Placeholder**: 4 routes (Users, Assets, empty directories)

**Key Patterns**:
- Most routes use `apiGet`, `apiPost`, `apiPatch`, `apiDelete` from `@/lib/api`
- Some routes use direct `fetch()` calls (buildings, clients pages)
- Modals use `createPortal` for proper centering
- Permission checks implemented via `usePermissions` hook (reverted in recent changes)
