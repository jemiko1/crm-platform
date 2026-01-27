# CRM Platform - Complete Session Summary

**Last Updated**: 2026-01-27  
**Version**: v1.1.0
**Status**: ✅ All features complete and committed

---

## ARCHITECTURE OVERVIEW

**Stack**: NestJS (Backend) + Next.js 15 App Router (Frontend) + PostgreSQL + Prisma ORM  
**Auth**: JWT cookies (httpOnly, sameSite: 'lax', secure in prod)  
**RBAC**: Position-based (User -> Employee -> Position -> RoleGroup -> Permissions)  
**API Base**: `http://localhost:3000/v1/*`  
**Frontend Base**: `http://localhost:3002/app/*`

---

## KEY FEATURES IMPLEMENTED

### 1. TERMINOLOGY STANDARDIZATION (v1.0.0)
**Change**: Renamed "Products" to "Devices" in Buildings context  
**Rationale**: Clear distinction between building assets (devices) and inventory items (products)  
**Files Updated**:
- `frontend/crm-frontend/src/app/app/buildings/[buildingId]/page.tsx` - Tab renamed, all references updated
- `frontend/crm-frontend/src/app/app/buildings/[buildingId]/add-device-modal.tsx` - Renamed from add-product-modal
- `frontend/crm-frontend/src/app/app/buildings/page.tsx` - Table header and links updated
- `frontend/crm-frontend/src/app/app/incidents/report-incident-modal.tsx` - Device selection labels

**Changes**:
- Tab name: "Products" → "Devices"
- Modal: "AddProductModal" → "AddDeviceModal"
- Field labels: "Product Type" → "Device Type", "Name" → "Device Name", "Status" → "Device Status"
- Variables: `productCounts` → `deviceCounts`, `showAddProductModal` → `showAddDeviceModal`
- URL parameter: `tab=products` → `tab=devices`
- Incident modal: "Select Products" → "Select Devices", "Products Affected" → "Devices Affected"

### 2. WORK ORDER DELETE PERMISSIONS (v1.1.0)
**Feature**: Granular permissions for work order deletion with inventory control  
**Permissions Added**:
- `work_orders.delete` - Basic delete (no inventory impact)
- `work_orders.delete_keep_inventory` - Delete and keep inventory changes
- `work_orders.delete_revert_inventory` - Delete and return products to stock

**Backend Changes**:
- `seed-permissions.ts` - Added 2 new work order delete permissions
- `work-orders.controller.ts` - New `/inventory-impact` endpoint, `revertInventory` query param
- `work-orders.service.ts` - `getInventoryImpact()`, `revertInventoryChanges()` methods
- `work-order-activity.service.ts` - `PRODUCTS_APPROVED` action, product flow filtering

**Frontend Changes**:
- `work-order-detail-modal.tsx` - Permission-based delete options with locked states
- `page.tsx` - Same permission logic for direct page view
- `activity-timeline.tsx` - Product flow filter, detailed product metadata display

**UI Features**:
- Inventory impact summary (products, transactions, devices affected)
- Two delete options: "Delete & Revert All" vs "Delete & Keep Data"
- Locked option display when permission missing
- Warning message for missing permissions

**Files**:
- `backend/crm-backend/prisma/seed-permissions.ts`
- `backend/crm-backend/src/v1/work-orders.controller.ts`
- `backend/crm-backend/src/work-orders/work-orders.service.ts`
- `backend/crm-backend/src/work-orders/work-order-activity.service.ts`
- `frontend/crm-frontend/src/app/app/work-orders/[id]/work-order-detail-modal.tsx`
- `frontend/crm-frontend/src/app/app/work-orders/[id]/page.tsx`
- `frontend/crm-frontend/src/app/app/work-orders/[id]/activity-timeline.tsx`

### 3. PERMISSIONS RESTORATION (v1.0.0)
**Issue**: Permissions list was empty after database migration  
**Solution**: Ran `seed-permissions.ts` script to restore all 63 permissions  
**Permissions Restored**:
- Buildings: read, create, update, delete
- Clients: read, create, update, delete
- Incidents: read, create, update, assign, delete
- Work Orders: read, create, update, delete, delete_keep_inventory, delete_revert_inventory, assign, start, complete, approve, cancel, manage_products, manage_devices, request_repair, view_activity, view_workflow, view_sensitive, manage_workflow, manage
- Inventory: read, create, update, delete, purchase, adjust
- Employees: read, create, update, delete, assign
- Departments, Roles, Permissions: full CRUD
- Reports: view, export
- Admin: access, manage_users, manage_settings

**Script**: `backend/crm-backend/prisma/seed-permissions.ts`  
**Command**: `npx tsx prisma/seed-permissions.ts`

### 3. LIST ITEMS MANAGEMENT (v1.0.0)
**Feature**: Admin panel for managing dropdown values dynamically  
**Location**: `/app/admin/list-items`  
**Backend**: System Lists API (`/v1/system-lists/*`)  
**Frontend Hook**: `useListItems(categoryCode)` in `src/hooks/useListItems.ts`

**Categories Available**:
- User-Editable: `ASSET_TYPE`, `CONTACT_METHOD`, `INCIDENT_TYPE`, `INCIDENT_PRIORITY`, `PRODUCT_CATEGORY`, `PRODUCT_UNIT`, `WORK_ORDER_TYPE`
- System-Managed: `WORK_ORDER_STATUS`, `INCIDENT_STATUS`, `DEVICE_STATUS`, `PURCHASE_ORDER_STATUS`, `STOCK_TRANSACTION_TYPE`

**Features**:
- Create, edit, delete list items
- Set default values
- Sort order management
- Color/icon support for statuses/priorities
- Deactivation (hide without deleting)

**Files**:
- `frontend/crm-frontend/src/app/app/admin/list-items/page.tsx` - Category list
- `frontend/crm-frontend/src/app/app/admin/list-items/[categoryId]/page.tsx` - Item management
- `frontend/crm-frontend/src/app/app/admin/list-items/[categoryId]/delete-item-modal.tsx` - Delete with reassignment
- `backend/crm-backend/src/system-lists/*` - Backend API

### 4. MODAL/POPUP SYSTEM
**Pattern**: All modals use `createPortal` from `react-dom` to `document.body`  
**Requirements**: `mounted` state check, `z-[9999]`, fixed positioning, backdrop  
**Files**: `frontend/crm-frontend/src/app/modal-dialog.tsx` (reference)  
**Status**: ✅ All modals properly centered and portal-rendered

### 5. EMPLOYEE MANAGEMENT
**Schema Changes**:
- Added: `extensionNumber` (String?), `birthday` (DateTime?)
- Removed: `hireDate`, `exitDate`
- Made optional: `jobTitle` (auto-generated from `position.name`)

**Frontend Changes**:
- Add/Edit forms: Extension number field, birthday picker, removed hire/dismiss dates
- Table: Extension number column (highlighted, `tel:` link), Position name instead of jobTitle
- Employee ID: Hidden in add form, read-only in edit form (auto-generated backend)
- Dependent dropdowns: Department -> Position (only positions from selected department)

**Backend Changes**:
- `employees.service.ts`: Auto-generate `jobTitle` from `position.name` if missing
- DTOs updated: `create-employee.dto.ts`, `update-employee.dto.ts`
- Migration: `20260115012554_update_employee_fields`

### 6. DEPARTMENT MANAGEMENT
**UI**: Two-pane layout (hierarchy tree left, details right) + modern org chart visualization  
**Features**: Expand/collapse, select node highlights, create/edit/delete modals  
**Tree View**: Shows employee counts (direct + via positions)  
**Org Chart**: Modern hierarchy visualization with connecting lines  
**Backend**: Auto-generate `code` from `name` (uppercase, underscores, unique with _2/_3 suffix)  
**Validation**: `headId` must be unique (one head per department)  
**Files**: `frontend/crm-frontend/src/app/app/admin/departments/page.tsx`

### 7. POSITION MANAGEMENT
**Code Generation**: Auto-generate from `name` (backend), not editable  
**Department Link**: Positions belong to departments (`departmentId` field)  
**Delete Protection**: Cannot delete if active employees assigned, requires reassignment  
**UI Changes**: Removed code column from table, code read-only in edit modal  
**Delete Dialog**: Shows active employees, offers reassignment dropdown  
**Files**:
- `frontend/crm-frontend/src/app/app/admin/positions/*`
- `backend/crm-backend/src/positions/*`
- Migration: `20260114232520_add_position_department`

### 8. ROLE GROUP MANAGEMENT
**Code Generation**: Auto-generate from `name` (backend), not editable  
**Delete Protection**: Cannot delete if positions use it, requires reassignment  
**UI Changes**: Removed code column, code read-only in edit modal  
**Permissions Modal**: 2-column grid, search box, compact layout  
**Delete Dialog**: Shows positions using role group, offers reassignment  
**Files**:
- `frontend/crm-frontend/src/app/app/admin/role-groups/*`
- `backend/crm-backend/src/role-groups/*`

### 9. INCIDENT MANAGEMENT
**Created By Field**: Populated from `req.user.id` (JWT auth), returns employee name  
**Table UI**: Separated "Created On" and "Created By" columns  
**Status Progress Bar**: Visual progress indicator showing all stages, highlights current  
**Column Order**: Incident #, Status, Devices Affected, Building, Client, Created On, Priority, Created By, Actions  
**Employee Link**: Created By name clickable, opens employee detail page  
**Created By Display**: Green badge with icon, modern styling  
**Files**:
- `frontend/crm-frontend/src/app/app/incidents/page.tsx`
- `backend/crm-backend/src/incidents/incidents.service.ts`
- `backend/crm-backend/src/v1/incidents.controller.ts`

### 10. BUILDING DETAIL PAGE - DEVICES TAB
**Feature**: "Devices" tab (formerly "Products") showing building assets  
**Modal**: "Add Device" button opens `AddDeviceModal`  
**Features**: Filter by device type, offline status, grouped by type  
**Files**: `frontend/crm-frontend/src/app/app/buildings/[buildingId]/page.tsx`

---

## BACKEND PATTERNS

### CODE AUTO-GENERATION
**Pattern**: Generate unique codes from names (uppercase, underscores, append _2/_3 if exists)  
**Used In**: Departments, Positions, Role Groups  
**Implementation**: `generateCode()` and `findUniqueCode()` helper methods in services  
**DTOs**: `code` field removed from create DTOs, not patchable in update DTOs

### SAFE DELETION WITH REASSIGNMENT
**Pattern**: Check for active relationships before deletion, require reassignment  
**Used In**: Positions (check employees), Role Groups (check positions), List Items (check usage)  
**Implementation**: `remove()` method checks count, throws if > 0, accepts `replacementId` in body  
**Frontend**: Delete dialogs show active relationships, offer reassignment dropdown

### DEPENDENT DROPDOWNS
**Pattern**: Filter options based on parent selection  
**Example**: Department -> Position (only positions from selected department)  
**Implementation**: `useMemo` to filter options based on parent value  
**Files**: `frontend/crm-frontend/src/app/app/employees/add-employee-modal.tsx`

### AUTHENTICATION FLOW
**JWT Strategy**: Extracts user ID from token, attaches to `req.user`  
**Guards**: `JwtAuthGuard` (validates token), `PositionPermissionGuard` (checks permissions)  
**Decorator**: `@RequirePermission('resource.action')` for endpoint protection  
**User Context**: `req.user.id` available in controllers, passed to services

### DYNAMIC LIST ITEMS
**Pattern**: All dropdowns fetch from System Lists API, never hardcode  
**Backend**: `SystemListsService` with categories and items  
**Frontend**: `useListItems(categoryCode)` hook  
**Categories**: Defined in `DEVELOPMENT_GUIDELINES.md`

---

## FRONTEND PATTERNS

### MODAL IMPLEMENTATION
**Required**: `createPortal`, `mounted` state, early return if not mounted/open  
**Structure**: Fixed container -> backdrop -> modal wrapper -> content  
**Z-Index**: `z-[9999]` for modals  
**Reference**: `frontend/crm-frontend/src/app/modal-dialog.tsx`

### API CLIENT
**File**: `frontend/crm-frontend/src/lib/api.ts`  
**Methods**: `apiGet`, `apiPost`, `apiPatch`, `apiDelete`  
**Features**: Automatic credentials, error handling, JSON parsing  
**DELETE with Body**: `apiDelete` accepts optional `body` parameter for reassignment

### DYNAMIC LISTS HOOK
**File**: `frontend/crm-frontend/src/hooks/useListItems.ts`  
**Usage**: `const { items, loading, error, refresh } = useListItems(categoryCode)`  
**Features**: Automatic caching, loading states, error handling  
**CRITICAL**: Always use this hook, never hardcode dropdown values

### STATE MANAGEMENT
**Pattern**: `useState` for local state, `useEffect` for data fetching  
**Memoization**: `useMemo` for filtered lists, computed values  
**Loading States**: Separate `loading` state for async operations

### ROUTING
**App Router**: Next.js 15 App Router with `app/` directory  
**Dynamic Routes**: `[id]`, `[buildingId]`, `[employeeId]`, `[categoryId]` folders  
**Layouts**: Shared layouts in `app/app/layout.tsx`

---

## DATABASE SCHEMA KEY POINTS

### RELATIONSHIPS
- **User** -> **Employee** (1:1, optional)
- **Employee** -> **Position** (many:1, required)
- **Position** -> **Department** (many:1, required)
- **Position** -> **RoleGroup** (many:1, required)
- **RoleGroup** -> **Permission** (many:many via join table)
- **Client** <-> **Building** (many:many via `ClientBuilding`)
- **Incident** -> **Building** (many:1, required)
- **Incident** -> **Client** (many:1, optional/nullable)
- **Incident** -> **User** (many:1, optional, via `reportedById`)
- **SystemListCategory** -> **SystemListItem** (1:many)

### NULLABLE FIELDS
- `Incident.clientId`: Nullable (allows incidents without client)
- `Employee.extensionNumber`: Optional
- `Employee.birthday`: Optional
- `Employee.jobTitle`: Optional (auto-generated from position)

### AUTO-GENERATED FIELDS
- `Department.code`: Auto-generated from name
- `Position.code`: Auto-generated from name
- `RoleGroup.code`: Auto-generated from name
- `Employee.employeeId`: Auto-generated (sequential)
- `Incident.incidentNumber`: Auto-generated (format: INC-YYYY-####)

---

## MIGRATIONS

1. `20260108110912_init_core` - Initial core schema
2. `20260109074517_add_users_auth` - User authentication
3. `20260109110448_add_user_roles` - User roles
4. `20260109112146_add_user_roles` - User roles (duplicate?)
5. `20260110011000_core_ids_clients_assets` - Core IDs for clients/assets
6. `20260110015506_audit_logs` - Audit logging
7. `20260112153813_add_incidents` - Incident model
8. `20260112213805_client_building_many_to_many` - Client-Building relationship
9. `20260113131633_add_inventory_system` - Inventory system
10. `20260114212338_add_position_based_rbac_system` - RBAC system
11. `20260114232520_add_position_department` - Position-Department link
12. `20260115012554_update_employee_fields` - Employee field updates
13. `20260115140847_add_system_lists` - System Lists for dynamic dropdowns

---

## GIT COMMITS & VERSIONING

**Current Version**: v1.0.0  
**Latest Commit**: `7e0c3a8` - "feat: Rename Products to Devices in Buildings context and restore permissions"

**Recent Commits**:
- `7e0c3a8` - feat: Rename Products to Devices in Buildings context and restore permissions
- `b3239b5` - docs: Add comprehensive performance optimization guidelines
- `421a38e` - feat: Add Report Incident button in building detail view
- `7803cf1` - perf(frontend): Parallelize API calls and use centralized API client
- `f6141a3` - docs: Add comprehensive session summary and documentation index

---

## FILE STRUCTURE KEY FILES

### BACKEND
- `src/main.ts` - App bootstrap, CORS, validation pipe, Swagger
- `src/app.module.ts` - Root module, imports all feature modules
- `src/auth/*` - JWT authentication, guards, strategy
- `src/v1/*` - Versioned API controllers
- `src/incidents/*` - Incident service, DTOs
- `src/employees/*` - Employee service, DTOs
- `src/positions/*` - Position service, DTOs, delete DTO
- `src/role-groups/*` - Role group service, DTOs, delete DTO
- `src/departments/*` - Department service, DTOs
- `src/system-lists/*` - System Lists API for dynamic dropdowns
- `prisma/schema.prisma` - Database schema
- `prisma/migrations/*` - Database migrations
- `prisma/seed-permissions.ts` - Permissions seed script

### FRONTEND
- `src/app/app/layout.tsx` - Main app layout
- `src/app/app/incidents/*` - Incident pages, modals
- `src/app/app/employees/*` - Employee pages, modals
- `src/app/app/admin/departments/*` - Department management
- `src/app/app/admin/positions/*` - Position management
- `src/app/app/admin/role-groups/*` - Role group management
- `src/app/app/admin/list-items/*` - List Items Management
- `src/app/app/buildings/*` - Building pages (Devices tab)
- `src/app/modal-dialog.tsx` - Reusable modal component
- `src/lib/api.ts` - API client utilities
- `src/hooks/useListItems.ts` - Dynamic lists hook

---

## VALIDATION PATTERNS

### DTO VALIDATION
- `@IsOptional()` - Field can be omitted
- `@ValidateIf()` - Conditional validation
- `@IsInt()`, `@Min(1)` - Number validation
- `@IsEnum()` - Enum validation
- `@IsString()` - String validation
- `@IsArray()` - Array validation

### VALIDATION PIPE
- `whitelist: true` - Strip unknown properties
- `forbidNonWhitelisted: true` - Reject unknown properties (requires decorators)
- `transform: true` - Auto-transform types

---

## COMMON ERRORS & FIXES

1. **Modal not centered**: Use `createPortal` to `document.body`
2. **TypeScript overwrite errors**: Exclude `dist` folder in `tsconfig.json`
3. **Migration BOM errors**: Strip BOM character from SQL files
4. **Prisma client out of sync**: Run `npx prisma generate` after schema changes
5. **Validation errors on optional fields**: Use `@IsOptional()` and conditional validation
6. **Null constraint violations**: Use `null` not `undefined`, or omit field entirely
7. **Hardcoded dropdowns**: Always use `useListItems(categoryCode)` hook
8. **Permissions empty**: Run `npx tsx prisma/seed-permissions.ts` to restore

---

## TECHNOLOGY GUIDELINES SUMMARY

### CRITICAL RULES
1. **NEVER hardcode dropdown values** - Always use `useListItems(categoryCode)`
2. **Always use `createPortal`** for modals to `document.body`
3. **Use centralized API client** - `apiGet`, `apiPost`, etc. from `lib/api.ts`
4. **Terminology**: "Devices" for building assets, "Products" for inventory items
5. **Auto-generate codes** - Never allow manual code entry for Departments, Positions, Role Groups

### PERFORMANCE PATTERNS
- Use `Promise.all` for parallel API calls
- Implement proper caching strategies (no-store vs revalidate)
- Avoid N+1 queries in backend (use `include` or `groupBy`)
- Use `useMemo` for expensive computations
- Lazy load heavy components

### SECURITY PATTERNS
- JWT tokens in httpOnly cookies
- Permission checks on both frontend and backend
- Use `@RequirePermission` decorator for protected endpoints
- Validate all inputs with DTOs

---

## NEXT STEPS (TODO)

1. ✅ **Devices terminology** - Complete
2. ✅ **Permissions restoration** - Complete
3. ✅ **List Items Management** - Complete
4. **Continue feature development** - Ready for next session

---

**END OF SESSION SUMMARY**
