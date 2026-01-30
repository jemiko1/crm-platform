# CRM Platform - Project Snapshot

<<<<<<< Updated upstream
**Last Updated**: 2026-01-27
**Version**: v1.1.0
**Tech Stack**: NestJS (Backend) + Next.js 15 (Frontend) + PostgreSQL + Prisma
**Status**: Buildings, Clients, Incidents, Work Orders, and Admin modules complete and optimized
**Performance**: Week 1 optimizations complete (4-10x faster)
**Latest Changes**: Work Order Delete Permissions, Product Flow Activity, Inventory Impact Control
=======
**Single source of truth for AI tools and developers.** Read this file first to understand the project.

**Last Updated**: 2026-01-28 | **Version**: v1.2.0  
**Stack**: NestJS (Backend) + Next.js 15 App Router (Frontend) + PostgreSQL + Prisma ORM

---

## 1. Ports & URLs

| Environment | Backend | Frontend | API Base |
|-------------|---------|----------|----------|
| **Production** | `http://localhost:3000` | `http://localhost:3002` | `http://localhost:3000/v1/*` |
| **Dev** | `http://localhost:4000` | `http://localhost:4002` | `http://localhost:4000/v1/*` |

**Frontend API client**: `frontend/crm-frontend/src/lib/api.ts` — `API_BASE` defaults to `http://localhost:4000`; set `NEXT_PUBLIC_API_BASE` for production.
>>>>>>> Stashed changes

---

## 2. Database (Docker PostgreSQL)

**Do not change DB host/port or switch back to Windows Postgres unless explicitly asked.**

| Item | Value |
|------|-------|
| **Container** | `crm-prod-db` |
| **Host port** | 5433 |
| **DATABASE_URL** | `postgresql://postgres:147852asg@localhost:5433/crm_db` |
| **pgAdmin** | host=localhost, port=5433, db=crm_db, user=postgres (client only) |
| **DEV DB** | Deleted/unused |

**Prisma**: Assume DB at `localhost:5433`, schema migrated, data restored. Run migrations against this connection.

---

## 3. Git Workflow

| Branch | Purpose |
|--------|---------|
| **dev** | Daily work |
| **master** | Stable, release-ready |

**Daily**: `git checkout dev && git pull` → work → `git status` → `git add -A` → `git commit -m "<type>(scope): message"` → `git push`

**Commit format**: `feat(scope):`, `fix(scope):`, `refactor(scope):`, `chore(scope):`  
**Releases**: Merge `dev` → `master` via PR when ready.  
**Rollback**: Prefer `git revert <hash>`. Use `git reset --hard` only for local recovery.

---

## 4. Authentication

| Setting | Value |
|---------|-------|
| **Method** | JWT in httpOnly cookie |
| **Cookie name** | `access_token` (env: `COOKIE_NAME`) |
| **JWT expiry** | 30 minutes (env: `JWT_EXPIRES_IN`) |
| **Cookie maxAge** | 7 days |
| **CORS** | `http://localhost:3002` (or frontend URL), credentials: true |

**401 handling**: API client redirects to `/login?expired=1&next=<path>`. Login page shows "Your session has expired. Please sign in again."

---

## 5. Modal System (Detail Popups)

**All detail views (building, client, employee, work-order) open as full-size modals.**

| Type | Z-Index | URL Param | Example |
|------|---------|-----------|---------|
| **Detail modals** | 10000 | `?building=1`, `?client=5`, `?employee=id`, `?workOrder=123` | `/app/buildings?building=1` |
| **Action modals** | 50000+ | N/A (inline) | Add/Edit/Delete/Report modals |

**Navigation**:
- **Open**: `router.push('/app/buildings?building=1')` — adds to browser history
- **Close**: `router.back()` — returns to previous page
- Browser back button works naturally

**Files**: `modal-manager.tsx`, `modal-provider.tsx`, `modal-z-index-context.tsx`  
**Content components**: `building-detail-content.tsx`, `client-detail-content.tsx`, `employee-detail-content.tsx`, `work-order-detail-modal.tsx`

**Action modals** (Add Client, Create Work Order, Report Incident, etc.): Use `z-[50000]` so they appear above detail modals.

---

## 6. UI Rules (MANDATORY)

### Dynamic Lists (CRITICAL)
**NEVER hardcode dropdown values.** Always use `useListItems(categoryCode)` from `@/hooks/useListItems`.

**User-editable**: `ASSET_TYPE`, `CONTACT_METHOD`, `INCIDENT_TYPE`, `INCIDENT_PRIORITY`, `PRODUCT_CATEGORY`, `PRODUCT_UNIT`, `WORK_ORDER_TYPE`  
**System-managed**: `WORK_ORDER_STATUS`, `INCIDENT_STATUS`, `DEVICE_STATUS`, `PURCHASE_ORDER_STATUS`, `STOCK_TRANSACTION_TYPE`

### API Client
**NEVER use raw `fetch` with hardcoded URLs.** Always use `apiGet`, `apiPost`, `apiPatch`, `apiDelete` from `@/lib/api`.

### Terminology
- **Devices** = Building assets (elevators, intercoms, etc.)
- **Products** = Inventory items (routers, sensors, etc.)

### Modal Implementation
- Use `createPortal(modalContent, document.body)` for proper centering
- Check `mounted` state before rendering (SSR compatibility)
- Detail modals: z-index 10000. Action modals: z-index 50000+

---

## 7. Key Files

| Purpose | Path |
|---------|------|
| API client | `frontend/crm-frontend/src/lib/api.ts` |
| Modal manager | `frontend/crm-frontend/src/app/app/modal-manager.tsx` |
| Dynamic lists hook | `frontend/crm-frontend/src/hooks/useListItems.ts` |
| Permissions hook | `frontend/crm-frontend/src/lib/use-permissions.ts` |
| Reusable modal | `frontend/crm-frontend/src/app/modal-dialog.tsx` |
| Backend entry | `backend/crm-backend/src/main.ts` |
| Auth controller | `backend/crm-backend/src/auth/auth.controller.ts` |
| Prisma schema | `backend/crm-backend/prisma/schema.prisma` |
| Permissions seed | `backend/crm-backend/prisma/seed-permissions.ts` |

---

## 8. Quick Start

```bash
# Backend (port 3000)
cd backend/crm-backend
npm run start:dev

# Frontend (port 3002)
cd frontend/crm-frontend
pnpm dev --port 3002
```

**Restore permissions**: `cd backend/crm-backend && npx tsx prisma/seed-permissions.ts`  
**Run migrations**: `cd backend/crm-backend && npx prisma migrate dev`

---

## 9. Frontend Routes (Summary)

| Route | Type | Notes |
|-------|------|-------|
| `/app/dashboard` | Page | Placeholder |
| `/app/buildings` | List | Buildings list |
| `/app/buildings?building=1` | Modal | Building detail |
| `/app/clients` | List | Clients list |
| `/app/clients?client=5` | Modal | Client detail |
| `/app/employees` | List | Employees list |
| `/app/employees?employee=id` | Modal | Employee detail |
| `/app/work-orders` | List | Work orders list |
| `/app/work-orders?workOrder=123` | Modal | Work order detail |
| `/app/incidents` | Page | Incidents with filters |
| `/app/inventory` | Page | Products, purchase orders |
| `/app/tasks` | Page | My workspace |
| `/app/admin/*` | Pages | Positions, role groups, departments, list items, workflow |

---

## 10. API Endpoints (Summary)

| Prefix | Purpose |
|--------|---------|
| `POST /auth/login` | Login, sets cookie |
| `GET /auth/me` | Current user + permissions |
| `POST /auth/logout` | Clear cookie |
| `GET /v1/buildings` | List buildings |
| `GET /v1/clients` | List clients |
| `GET /v1/employees` | List employees |
| `GET /v1/incidents` | List incidents (filters) |
| `POST /v1/incidents` | Create incident |
| `GET /v1/work-orders` | List work orders |
| `GET /v1/work-orders/:id` | Work order detail |
| `GET /v1/work-orders/:id/activity` | Activity log |
| `GET /v1/system-lists/*` | Dynamic dropdown values |
| `GET /v1/positions`, `role-groups`, `departments` | Admin CRUD |

All `/v1/*` endpoints (except public reads) require `JwtAuthGuard`. Many use `@RequirePermission('resource.action')`.

---

## 11. RBAC

**Chain**: User → Employee → Position → RoleGroup → Permissions

- **Backend**: `PositionPermissionGuard`, `@RequirePermission('resource.action')`
- **Frontend**: `usePermissions` hook, `PermissionButton`, `PermissionGuard`
- **Superadmin**: `user.isSuperAdmin` bypasses permission checks

---

## 12. Repository Structure

```
backend/crm-backend/
├── prisma/ (schema, migrations, seed-permissions.ts)
├── src/
│   ├── main.ts, app.module.ts
│   ├── auth/ (login, JWT, cookie)
│   ├── v1/ (incidents, work-orders, workflow)
│   ├── buildings, clients, incidents, work-orders, inventory, employees
│   ├── positions, role-groups, departments, system-lists
│   └── prisma/ (PrismaService)

frontend/crm-frontend/
├── src/
│   ├── app/
│   │   ├── app/ (layout, modal-manager, modal-provider)
│   │   │   ├── buildings, clients, employees, work-orders, incidents, inventory
│   │   │   ├── tasks, admin, assets
│   │   │   └── modal-z-index-context.tsx
│   │   ├── login/, modal-dialog.tsx
│   ├── hooks/ (useListItems.ts)
│   └── lib/ (api.ts, use-permissions.ts)
```

---

## 13. Critical Rules Checklist

<<<<<<< Updated upstream
### Backend

#### `backend/crm-backend/src/main.ts`
**Purpose**: Application entry point, NestJS bootstrap  
**Key Exports**: None (bootstrap function)  
**Features**:
- Cookie parser setup
- CORS configuration (localhost:3002)
- Global exception filter
- Global validation pipe
- Swagger API docs at `/api`
- Server listens on port 3000

#### `backend/crm-backend/src/app.module.ts`
**Purpose**: Root module, imports all feature modules  
**Key Exports**: `AppModule`  
**Imports**:
- Infrastructure: `PrismaModule`, `AuthModule`
- Core: `IdGeneratorModule`, `AuditModule`
- Domain: `BuildingsModule`, `ClientsModule`, `AssetsModule`, `IncidentsModule`, `WorkOrdersModule`, `InventoryModule`
- HR: `EmployeesModule`, `DepartmentsModule`, `RolesModule`, `PermissionsModule`
- RBAC: `PositionsModule`, `RoleGroupsModule`
- API: `V1Module`

#### `backend/crm-backend/src/auth/auth.module.ts`
**Purpose**: Authentication module configuration  
**Key Exports**: `AuthModule`  
**Imports**: `PrismaModule`, `PassportModule`, `PermissionsModule`, `JwtModule`  
**Providers**: `AuthService`, `JwtStrategy`  
**Controllers**: `AuthController`

#### `backend/crm-backend/src/auth/auth.controller.ts`
**Purpose**: Authentication endpoints  
**Routes**:
- `POST /auth/login` - Login with email/password, sets httpOnly cookie
- `GET /auth/me` - Get current user with employee info, position, department, permissions
- `POST /auth/logout` - Clear auth cookie

#### `backend/crm-backend/prisma/schema.prisma`
**Purpose**: Database schema definition  
**Key Models**:
- **Core**: `Building`, `Client`, `Asset`, `WorkOrder`, `Incident`
- **Auth**: `User` (with `isSuperAdmin` flag, legacy `role` enum)
- **HR**: `Employee`, `Department`, `Role`, `Permission`
- **RBAC**: `Position`, `RoleGroup`, `RoleGroupPermission`
- **Relations**: `ClientBuilding` (many-to-many), `WorkOrderAssignment`
- **Enums**: `UserRole`, `EmployeeStatus`, `WorkOrderType`, `WorkOrderStatus`, `AssetType`, `DeviceStatus`

### Frontend

#### `frontend/crm-frontend/src/app/layout.tsx`
**Purpose**: Root layout, global styles and fonts  
**Exports**: `RootLayout` component, `metadata`  
**Features**: Geist fonts, global CSS, HTML structure

#### `frontend/crm-frontend/src/app/app/layout.tsx`
**Purpose**: App shell layout (sidebar + topbar)  
**Exports**: `AppLayout` component  
**Features**:
- Fixed left sidebar with navigation
- Top bar with workspace info and profile menu
- Gradient background
- Content container with backdrop blur

#### `frontend/crm-frontend/src/lib/api.ts`
**Purpose**: Centralized API client with cookie-based auth  
**Key Exports**:
- `apiGet<T>(path, init?)` - GET request
- `apiPost<T>(path, body, init?)` - POST request
- `apiPatch<T>(path, body, init?)` - PATCH request
- `apiPut<T>(path, body, init?)` - PUT request
- `apiDelete<T>(path, init?)` - DELETE request
- `ApiError` class
- `API_BASE` constant (defaults to `http://localhost:3000`)

**Features**:
- Automatic cookie handling (`credentials: "include"`)
- Error parsing and `ApiError` throwing
- JSON content-type headers
- Type-safe responses

#### Middleware
**Status**: No middleware file found in `frontend/crm-frontend/src`
=======
- [ ] Never hardcode dropdowns — use `useListItems(categoryCode)`
- [ ] Never use raw fetch — use `apiGet`, `apiPost`, etc. from `@/lib/api`
- [ ] Modals: `createPortal` to `document.body`, z-index 10000 (detail) or 50000 (action)
- [ ] Terminology: Devices (building assets) vs Products (inventory)
- [ ] Work on `dev` branch; merge to `master` for releases
- [ ] Do not change DB host/port without explicit request
- [ ] Commit format: `feat(scope): message` or `fix(scope): message`
>>>>>>> Stashed changes

---

## 14. Other Documentation

For deeper detail, see:
- `DEVELOPMENT_GUIDELINES.md` — Dynamic lists, modal patterns, performance
- `API_ROUTE_MAP.md` — Full API endpoint list
- `FRONTEND_ROUTE_MAP.md` — Full frontend route list
- `SESSION_SUMMARY.md` — Feature history, migrations

<<<<<<< Updated upstream
### Frontend Architecture
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **State**: React hooks (useState, useEffect)
- **API**: Centralized client in `lib/api.ts`
- **Auth**: Cookie-based (automatic via `credentials: "include"`)
- **Permissions**: `usePermissions` hook + `PermissionButton`/`PermissionGuard` components

### Key Patterns
- **Modal Implementation**: All modals use `createPortal` to `document.body` for proper centering
- **Permission Checks**: Backend `PositionPermissionGuard` + frontend `usePermissions` hook
- **Error Handling**: Global exception filter + `ApiError` class
- **Validation**: `class-validator` DTOs with global validation pipe
- **API Client**: Centralized `apiGet/apiPost/apiPatch/apiDelete` from `lib/api.ts`
- **Performance**: N+1 queries eliminated, parallel API calls, strategic caching

### Recent Updates (v1.1.0 - 2026-01-27)

**Work Order Delete Permissions:**
- ✅ Added granular delete permissions for inventory control
- ✅ `work_orders.delete_keep_inventory` - Delete work order, keep inventory changes
- ✅ `work_orders.delete_revert_inventory` - Delete work order, revert products to stock
- ✅ Permission-based UI: Shows locked options when user lacks specific permissions
- ✅ Inventory impact check before deletion (shows affected products, transactions, devices)

**Product Flow Activity:**
- ✅ New "Product Flow" activity type in work order timeline
- ✅ Filter activities by: All, Main Events, Product Flow
- ✅ Detailed product modification logging (added, modified, removed)
- ✅ `PRODUCTS_APPROVED` activity action with metadata

**Work Order Enhancements:**
- ✅ Modern styled delete confirmation dialogs with inventory impact details
- ✅ Revert inventory changes functionality (returns products to stock)
- ✅ Stock transaction reversal with proper balance tracking
- ✅ Deactivated device transfer status reset

### Previous Updates (v1.0.0 - 2026-01-15)

**Terminology Changes:**
- ✅ Renamed "Products" to "Devices" in Buildings context for clarity
- ✅ Updated all UI labels, modals, and components
- ✅ Separated terminology: "Devices" (building assets) vs "Products" (inventory items)

**Permissions System:**
- ✅ Restored permissions database (63 permissions seeded)
- ✅ Permissions list now visible in Admin panel
- ✅ All CRUD permissions for Buildings, Clients, Incidents, Work Orders, Inventory, Employees, etc.

**List Items Management:**
- ✅ Admin panel for managing dropdown values dynamically
- ✅ System Lists API integration (`/v1/system-lists/*`)
- ✅ `useListItems` hook for frontend consumption
- ✅ Categories: ASSET_TYPE, DEVICE_STATUS, INCIDENT_TYPE, INCIDENT_PRIORITY, etc.
- ✅ Support for default values, sorting, colors, and deactivation

**Performance Optimizations (2026-01-15):**

**Backend (NestJS + Prisma):**
- ✅ Buildings N+1 query fixed with `groupBy` (10x fewer queries)
- ✅ Parallel validation in WorkOrder service (2x faster)
- ✅ Database indexes added for Incident, WorkOrder, User, PurchaseOrder, StockTransaction
- ✅ TypeScript errors fixed for optional client handling

**Frontend (Next.js 15):**
- ✅ Parallel API calls with `Promise.all` (4x faster page loads)
- ✅ Centralized API client implementation
- ✅ Strategic caching strategy (no-store vs revalidate)
- ✅ Context-aware modals with preset/lock support

**Metrics Achieved:**
- Buildings API: 5-10x faster response time
- Building detail page: 4x faster load time (400ms → 100ms)
- Query count reduced: N+1 → 2 queries for building lists
- Better error handling with typed ApiError class

**Documentation:**
- `PERFORMANCE_ANALYSIS.md` - Complete audit with 12 frontend + 8 backend issues
- `OPTIMIZATION_IMPLEMENTATION_PLAN.md` - 4-week step-by-step optimization guide
- `DEVELOPMENT_GUIDELINES.md` - Performance patterns and best practices
- `LIST_ITEMS_MANAGEMENT_DESIGN.md` - System Lists architecture

---

## Development Guidelines

See `DEVELOPMENT_GUIDELINES.md` for:
- **Dynamic List Items** - NEVER hardcode dropdowns, use `useListItems` hook
- **Modal/Popup implementation patterns** - Always use `createPortal` to `document.body`
- **Performance optimization guidelines**
  - Backend: Avoiding N+1 queries, parallel queries, database indexes
  - Frontend: API client, parallel fetching, caching, memoization, lazy loading
  - Context-aware modal patterns
- **Terminology**: Use "Devices" for building assets, "Products" for inventory items
- Performance testing checklist
- Reference implementations

## Key Technology Patterns

### Dynamic Lists (CRITICAL)
- **NEVER hardcode dropdown values** - Always use `useListItems(categoryCode)` hook
- Available categories: `ASSET_TYPE`, `DEVICE_STATUS`, `INCIDENT_TYPE`, `INCIDENT_PRIORITY`, etc.
- See `DEVELOPMENT_GUIDELINES.md` for complete list and usage patterns

### API Client
- Always use centralized `apiGet`, `apiPost`, `apiPatch`, `apiDelete` from `lib/api.ts`
- Automatic cookie handling, error parsing, type-safe responses

### Modals
- Must use `createPortal` to `document.body` for proper centering
- Require `mounted` state check for SSR compatibility
- Use `z-[9999]` for modal container
=======
**This file (PROJECT_SNAPSHOT.md) is the primary reference.** Use it first; refer to others only when needed.
>>>>>>> Stashed changes
