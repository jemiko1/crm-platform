# CRM Platform - Complete Session Summary

**Last Updated**: 2025-01-15  
**Status**: Incident creation without client - IN PROGRESS (needs fix)

---

## ARCHITECTURE OVERVIEW

**Stack**: NestJS (Backend) + Next.js 15 App Router (Frontend) + PostgreSQL + Prisma ORM  
**Auth**: JWT cookies (httpOnly, sameSite: 'lax', secure in prod)  
**RBAC**: Position-based (User -> Employee -> Position -> RoleGroup -> Permissions)  
**API Base**: `http://localhost:3000/v1/*`  
**Frontend Base**: `http://localhost:3002/app/*`

---

## KEY FEATURES IMPLEMENTED

### 1. MODAL/POPUP SYSTEM
**Pattern**: All modals use `createPortal` from `react-dom` to `document.body`  
**Requirements**: `mounted` state check, `z-[9999]`, fixed positioning, backdrop  
**Files**: `frontend/crm-frontend/src/app/modal-dialog.tsx` (reference)  
**Fixed**: Report incident, add building, add client, add role group, add position, add employee  
**Status**: ✅ All modals properly centered and portal-rendered

### 2. EMPLOYEE MANAGEMENT
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

**Files**:
- `frontend/crm-frontend/src/app/app/employees/*`
- `backend/crm-backend/src/employees/*`

### 3. DEPARTMENT MANAGEMENT
**UI**: Two-pane layout (hierarchy tree left, details right) + modern org chart visualization  
**Features**: Expand/collapse, select node highlights, create/edit/delete modals  
**Tree View**: Shows employee counts (direct + via positions)  
**Org Chart**: Modern hierarchy visualization with connecting lines  
**Backend**: Auto-generate `code` from `name` (uppercase, underscores, unique with _2/_3 suffix)  
**Validation**: `headId` must be unique (one head per department)  
**Files**: `frontend/crm-frontend/src/app/app/admin/departments/page.tsx`

### 4. POSITION MANAGEMENT
**Code Generation**: Auto-generate from `name` (backend), not editable  
**Department Link**: Positions belong to departments (`departmentId` field)  
**Delete Protection**: Cannot delete if active employees assigned, requires reassignment  
**UI Changes**: Removed code column from table, code read-only in edit modal  
**Delete Dialog**: Shows active employees, offers reassignment dropdown  
**Files**:
- `frontend/crm-frontend/src/app/app/admin/positions/*`
- `backend/crm-backend/src/positions/*`
- Migration: `20260114232520_add_position_department`

### 5. ROLE GROUP MANAGEMENT
**Code Generation**: Auto-generate from `name` (backend), not editable  
**Delete Protection**: Cannot delete if positions use it, requires reassignment  
**UI Changes**: Removed code column, code read-only in edit modal  
**Permissions Modal**: 2-column grid, search box, compact layout  
**Delete Dialog**: Shows positions using role group, offers reassignment  
**Files**:
- `frontend/crm-frontend/src/app/app/admin/role-groups/*`
- `backend/crm-backend/src/role-groups/*`

### 6. INCIDENT MANAGEMENT
**Created By Field**: Populated from `req.user.id` (JWT auth), returns employee name  
**Table UI**: Separated "Created On" and "Created By" columns  
**Status Progress Bar**: Visual progress indicator showing all stages, highlights current  
**Column Order**: Incident #, Status, Products Affected, Building, Client, Created On, Priority, Created By, Actions  
**Employee Link**: Created By name clickable, opens employee detail page  
**Created By Display**: Green badge with icon, modern styling  
**Files**:
- `frontend/crm-frontend/src/app/app/incidents/page.tsx`
- `backend/crm-backend/src/incidents/incidents.service.ts`
- `backend/crm-backend/src/v1/incidents.controller.ts`

### 7. INCIDENT CREATION WITHOUT CLIENT (IN PROGRESS)
**Requirement**: Allow creating incidents without assigning a client  
**Schema**: `clientId` made nullable (`String?`) in `Incident` model  
**Migration**: `20260115020000_make_incident_clientid_nullable` (deleted, needs re-creation)  
**Frontend**: "Continue without client" button on step 2, omits `clientId` from payload  
**Backend DTO**: `clientId` optional with `@IsOptional()`, `@ValidateIf` for conditional validation  
**Backend Service**: Conditionally includes `clientId` only if client exists  
**Current Error**: `Null constraint violation` when creating without client  
**Status**: ⚠️ **NEEDS FIX** - Prisma client may need regeneration, or database migration not applied  
**Files**:
- `frontend/crm-frontend/src/app/app/incidents/report-incident-modal.tsx`
- `backend/crm-backend/src/incidents/dto/create-incident.dto.ts`
- `backend/crm-backend/src/incidents/incidents.service.ts`
- `backend/crm-backend/prisma/schema.prisma`

### 8. BUILDING DETAIL PAGE - INCIDENT CREATION
**Feature**: "Report Incident" button in Incidents tab  
**Behavior**: Pre-fills building, locks building selection  
**Implementation**: `presetBuilding` and `lockBuilding` props to `ReportIncidentModal`  
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
**Used In**: Positions (check employees), Role Groups (check positions)  
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

### STATE MANAGEMENT
**Pattern**: `useState` for local state, `useEffect` for data fetching  
**Memoization**: `useMemo` for filtered lists, computed values  
**Loading States**: Separate `loading` state for async operations

### ROUTING
**App Router**: Next.js 15 App Router with `app/` directory  
**Dynamic Routes**: `[id]`, `[buildingId]`, `[employeeId]` folders  
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
10. `20260114212338_add_position_based_rbac_system` - RBAC system (had BOM character issue, fixed)
11. `20260114232520_add_position_department` - Position-Department link
12. `20260115012554_update_employee_fields` - Employee field updates
13. `20260115020000_make_incident_clientid_nullable` - **DELETED** (needs re-creation)

---

## KNOWN ISSUES

### 1. INCIDENT CREATION WITHOUT CLIENT
**Error**: `Null constraint violation` when `clientId` is omitted  
**Attempted**: Schema nullable, DTO optional, conditional inclusion in service  
**Next Steps**: Verify migration applied, regenerate Prisma client, test with explicit null vs omit

### 2. BOM CHARACTER IN MIGRATIONS
**Issue**: Migration files sometimes have BOM character causing SQL syntax errors  
**Fix**: Strip BOM using `Get-Content ... | Set-Content -Encoding utf8`  
**Affected**: `20260114212338_add_position_based_rbac_system`, `20260114232520_add_position_department`

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
- `prisma/schema.prisma` - Database schema
- `prisma/migrations/*` - Database migrations

### FRONTEND
- `src/app/app/layout.tsx` - Main app layout
- `src/app/app/incidents/*` - Incident pages, modals
- `src/app/app/employees/*` - Employee pages, modals
- `src/app/app/admin/departments/*` - Department management
- `src/app/app/admin/positions/*` - Position management
- `src/app/app/admin/role-groups/*` - Role group management
- `src/app/app/buildings/*` - Building pages
- `src/app/modal-dialog.tsx` - Reusable modal component
- `src/lib/api.ts` - API client utilities

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

---

## GIT COMMITS

Recent commits (2025-01-15):
- `docs: Add known issue documentation for incident creation without client`
- `Update backend submodule reference`
- `WIP: Incident creation without client - partial implementation (needs fix)`
- `Update departments UI to show employees via position relationships`
- `feat(frontend): Update modals, add RBAC admin pages, and permission components`

---

## NEXT STEPS (TODO)

1. **Fix incident creation without client**: Investigate Prisma client, verify migration, test null vs omit
2. **Re-create migration**: `20260115020000_make_incident_clientid_nullable` was deleted
3. **Test all modals**: Verify all use `createPortal` pattern
4. **Document API patterns**: Add to DEVELOPMENT_GUIDELINES.md
5. **Add error handling patterns**: Document in DEVELOPMENT_GUIDELINES.md

---

**END OF SESSION SUMMARY**
