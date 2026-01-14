# CRM Platform - Project Snapshot

**Last Updated**: 2025-01-15  
**Tech Stack**: NestJS (Backend) + Next.js 15 (Frontend) + PostgreSQL + Prisma

---

## Repository Structure

### Backend Tree (depth 4)
```
backend/crm-backend/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   ├── seed.ts
│   ├── seed-rbac.ts
│   └── seed-permissions.ts
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── jwt.strategy.ts
│   │   └── jwt-auth.guard.ts
│   ├── buildings/
│   ├── clients/
│   ├── incidents/
│   ├── work-orders/
│   ├── inventory/
│   ├── employees/
│   ├── departments/
│   ├── roles/
│   ├── permissions/
│   ├── positions/
│   ├── role-groups/
│   ├── assets/
│   ├── audit/
│   ├── common/
│   │   ├── guards/
│   │   ├── decorators/
│   │   └── filters/
│   ├── prisma/
│   │   ├── prisma.module.ts
│   │   └── prisma.service.ts
│   └── v1/
│       ├── v1.module.ts
│       ├── incidents.controller.ts
│       └── work-orders.controller.ts
└── dist/
```

### Frontend Tree (depth 4)
```
frontend/crm-frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx (root)
│   │   ├── page.tsx (landing)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── app/
│   │   │   ├── layout.tsx (app shell)
│   │   │   ├── sidebar-nav.tsx
│   │   │   ├── profile-menu.tsx
│   │   │   ├── dashboard/
│   │   │   ├── buildings/
│   │   │   ├── clients/
│   │   │   ├── incidents/
│   │   │   ├── work-orders/
│   │   │   ├── inventory/
│   │   │   ├── employees/
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── positions/
│   │   │   │   ├── role-groups/
│   │   │   │   └── departments/
│   │   │   └── assets/
│   │   └── modal-dialog.tsx
│   └── lib/
│       ├── api.ts
│       ├── use-permissions.ts
│       ├── permission-button.tsx
│       └── permission-guard.tsx
└── public/
```

---

## Key Files

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

---

## Architecture Overview

### Backend Architecture
- **Framework**: NestJS (modular architecture)
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: JWT tokens in httpOnly cookies
- **API Versioning**: `/v1/*` prefix via `V1Module`
- **RBAC**: Position-based permissions (Position → RoleGroup → Permissions)
- **Legacy Support**: `User.role` enum + `isSuperAdmin` flag for backward compatibility

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

---

## Development Guidelines

See `DEVELOPMENT_GUIDELINES.md` for:
- Modal/Popup implementation patterns
- Future guidelines (to be added)
