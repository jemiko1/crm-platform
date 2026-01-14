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
- `GET /v1/work-orders` - List work orders (with pagination/filters)
- `GET /v1/work-orders/:id` - Get work order by ID
- `PATCH /v1/work-orders/:id` - Update work order
- `DELETE /v1/work-orders/:id` - Delete work order

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
**Guards**: `JwtAuthGuard` (all endpoints)

**Endpoints**:
- `POST /v1/employees` - Create employee
- `GET /v1/employees` - List employees (query: status, search)
- `GET /v1/employees/:id` - Get employee by ID
- `PATCH /v1/employees/:id` - Update employee
- `DELETE /v1/employees/:id` - Delete employee

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

## Summary

**Total Controllers**: 14  
**Guarded Routes**: Most routes under `/v1/*` require `JwtAuthGuard`  
**Admin-Only Routes**: Positions, Role Groups, Admin Manual endpoints  
**Permission-Protected**: `POST /v1/incidents` (requires `incidents.create` permission)  
**Public Routes**: `/v1/buildings/*`, `/v1/clients` (read-only via PublicController)
