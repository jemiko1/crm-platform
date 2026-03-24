# TODO_AND_ISSUES.md — Known Issues & Unfinished Work

> **Last Updated**: 2026-03-24

---

## 1. Known Bugs

### Incident Creation Without Client

**Status**: Bug (partial fix applied)
**Severity**: Medium

When creating an incident without selecting a client ("Continue without client"), the backend throws a null constraint violation.

- Frontend correctly omits `clientId` when no client selected
- Backend DTO has `clientId` as `@IsOptional()` and nullable
- Prisma schema has `clientId String?` (nullable)
- **Still failing**: Prisma client may be out of sync, or the service is passing `undefined` instead of omitting the field

**Files**:
- `backend/crm-backend/src/incidents/dto/create-incident.dto.ts`
- `backend/crm-backend/src/incidents/incidents.service.ts`
- `frontend/crm-frontend/src/app/app/incidents/report-incident-modal.tsx`

**Fix**: Investigate whether `clientId: undefined` vs omitting entirely makes a difference in Prisma. Consider using the `connect` pattern instead of direct ID assignment.

### Health Module Not Wired

**Status**: Minor
**Severity**: Low

`src/health/health.module.ts` exists but is not imported in `AppModule`. The `/health` endpoint does not respond.

**Fix**: Import `HealthModule` in `app.module.ts` if health checks are needed.

---

## 2. Incomplete Features

### Dashboard (`/app/dashboard`)

**Status**: Placeholder with hardcoded data
**What exists**: Static UI cards with fake numbers
**What's missing**: No API integration, no real data, no dynamic widgets
**Effort**: Medium — needs backend endpoints for aggregated stats

### Admin Users Page (`/app/admin/users`)

**Status**: Placeholder page
**What's missing**: Full user management UI (list, create, edit, disable)
**Note**: User management partially handled through Employee management (create-user, reset-password)

### Admin Roles Page (`/app/admin/roles`)

**Status**: Read-only list, no actions
**What's missing**: "Add Role" and "View" buttons show alerts (not implemented)
**Note**: Legacy system — deprecated in favor of Positions + RoleGroups. May be removed entirely.

### Admin Employees Page (`/app/admin/employees`)

**Status**: Duplicate of `/app/employees`
**What's missing**: Was intended to be an admin-specific view with different capabilities
**Decision needed**: Merge with main employees page or add admin-specific features

### Assets Page (`/app/assets`)

**Status**: Empty placeholder
**Note**: Assets are accessed via Building detail pages. This standalone page may not be needed.

### WhatsApp Channel (Client Chats)

**Status**: Schema and enum values exist, adapter not implemented
**What exists**: `WHATSAPP` enum value, env variables defined
**What's missing**: `whatsapp.adapter.ts` implementation, webhook endpoint
**Reference**: `docs/CLIENTCHATS.md` has instructions for adding new channels

### Work Order Export

**Status**: Permission exists (`work_orders.export`), no UI
**What's missing**: Export button, file generation (CSV/PDF)

### Reports Export

**Status**: Permission exists (`reports.export`), no UI
**What's missing**: Report generation endpoints, download UI

### Auth Middleware (Frontend)

**Status**: `src/proxy.ts` exists with middleware logic but not connected
**What exists**: Cookie check logic with `config.matcher: ["/app/:path*"]`
**What's missing**: No `middleware.ts` file wiring it into Next.js
**Impact**: Frontend doesn't server-side redirect unauthenticated users. Currently relies on client-side 401 detection.

---

## 3. Planned Features

### Client Intelligence

**Status**: Module exists (`src/client-intelligence/`), partially implemented
**Plan**: AI-powered client profiling using communication history, work orders, and interaction patterns
**Frontend**: `clients/[clientId]/intelligence/` directory has `activity-timeline.tsx`, `intelligence-profile-card.tsx`, `types.ts`

### Web Chat Widget

**Status**: Backend ready, no embeddable widget
**What exists**: Public endpoints for `/start` and `/message`, conversation token auth
**What's missing**: A standalone embeddable JavaScript widget for customer websites
**Reference**: `docs/CLIENTCHATS.md` has an example embed snippet

### Quality Review Rubrics

**Status**: `QualityRubric` model exists in schema
**What's missing**: Admin UI for managing rubrics, integration with AI scoring pipeline

### Call Recording Playback

**Status**: `Recording` model exists, files referenced by path
**What's missing**: Audio playback UI in call detail view, streaming endpoint

### CDR Import UI

**Status**: Backend service exists, controlled by `CDR_IMPORT_ENABLED` env
**What's missing**: Admin UI for triggering manual imports, viewing import status

---

## 4. Technical Debt

### Direct `fetch()` in Some Frontend Pages

**Issue**: Some pages (buildings, clients) use raw `fetch()` instead of the centralized `apiGet`/`apiPost` from `@/lib/api`
**Impact**: Inconsistent error handling, no automatic 401 redirect
**Fix**: Replace with `apiGet` / `apiPost` calls

### `nest-cli.json` Missing

**Issue**: No `nest-cli.json` configuration file in backend
**Impact**: Relies on default Nest CLI behavior, may cause issues with custom build paths
**Fix**: Add explicit `nest-cli.json` with compiler options

### Duplicate Employee Routes

**Issue**: `/app/employees` and `/app/admin/employees` serve similar purposes
**Impact**: User confusion, maintenance burden
**Fix**: Consolidate into a single page with role-based feature toggling

### Legacy Role System

**Issue**: `Role`, `RolePermission`, `DepartmentRole` models still exist alongside the newer Position-based RBAC
**Impact**: Schema bloat, potential confusion for developers
**Fix**: Remove legacy role models once migration is complete and no code references them

### `forbidNonWhitelisted` Disabled

**Issue**: ValidationPipe has `whitelist: true` but `forbidNonWhitelisted` is OFF
**Reason**: Allows `@Query('param')` to coexist with `@Query() DTO` pattern
**Impact**: Unknown request body properties are silently stripped instead of rejected
**Trade-off**: Intentional — prevents breaking when frontend sends extra fields

### Large Prisma Schema

**Issue**: Single `schema.prisma` file with 2125 lines
**Impact**: Hard to navigate, slow to parse
**Fix**: Consider splitting into multiple schema files using Prisma's `prismaSchemaFolder` preview feature

### Build Output in Git Status

**Issue**: `backend/crm-backend/dist/` files showing as untracked in git
**Impact**: Clutters `git status`, risk of accidentally committing build output
**Fix**: Ensure `dist/` is in `.gitignore`

---

## 5. Performance Concerns

### Frontend Bundle Size

**Concern**: No code splitting for modals — all modal components may be in initial bundle
**Recommendation**: Use `next/dynamic` with `ssr: false` for modal components
**Reference**: `DEVELOPMENT_GUIDELINES.md` has the pattern documented but not consistently applied

### Building List Page

**Concern**: Loads all buildings at once, asset counts computed client-side
**Optimization**: Backend now uses `groupBy` for asset counts, but pagination could be improved for very large datasets

### Messenger Polling Fallback

**Concern**: 3-second REST polling interval as WebSocket fallback
**Impact**: Up to 3-second message delay when WebSocket is down, increased server load
**Mitigation**: WebSocket is primary; polling only activates on WS failure

### No Database Connection Pooling Configuration

**Concern**: Prisma uses `@prisma/adapter-pg` with a `pg.Pool` but pool size not explicitly configured
**Recommendation**: Set `max` connections on the Pool, especially for production

---

## 6. Security Concerns

### `.env` File in Workspace

**Concern**: `backend/crm-backend/.env` contains real credentials (DB password, JWT secret)
**Status**: `.env` is gitignored but exists in the workspace
**Action**: Rotate any credentials that may have been exposed. Verify `.gitignore` coverage.

### SIP Passwords in Database

**Concern**: `TelephonyExtension.sipPassword` stored as plaintext in DB
**Impact**: Anyone with DB access can read SIP credentials
**Recommendation**: Encrypt at rest or use Asterisk-side authentication only

### No Rate Limiting on Auth Endpoints

**Concern**: Global throttler (60 req/min) applies to all endpoints including login
**Impact**: 60 login attempts per minute per IP may be too permissive for brute force protection
**Recommendation**: Add stricter throttling specifically on `POST /auth/login`

### CORS Configuration

**Concern**: CORS origins loaded from `getCorsOrigins()` function
**Action**: Verify production CORS is restricted to `crm28.asg.ge` and not wildcard

### No CSRF Protection

**Concern**: Using cookie-based auth without CSRF tokens
**Mitigation**: `sameSite: 'lax'` on cookies provides partial protection
**Recommendation**: Consider adding CSRF tokens for state-changing requests

### Webhook Endpoint Security

**Concern**: Public webhook endpoints (`/public/clientchats/webhook/*`) have channel-specific guards but are publicly accessible
**Mitigation**: Each channel adapter implements signature verification (Viber auth token, Facebook app secret hash, Telegram secret token)
**Note**: Telephony events protected by `TELEPHONY_INGEST_SECRET` header
