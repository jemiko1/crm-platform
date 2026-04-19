# RBAC admin UI verification

Scope: can Jemiko manage role-group permissions on Monday morning using only the CRM admin UI, without a developer touching `seed-*.ts`? Read-only audit against master at commit `dc0f02a`. File paths use forward slashes from repo root.

## Verdict (top of file)

- **Permission catalog**: **COMPLETE**. All call-center, call-logs, call-recordings, missed-calls, client-chats, client-chats-config, telephony, and menu-visibility keys exist in `seed-permissions.ts` with correct resource / action / category. No misspellings, no duplicates, no missing entries relative to the brief.
- **Admin UI**: **FUNCTIONAL with caveats**. `/app/admin/role-groups` supports full create / edit / delete / assign-permissions via modals. `/app/admin/positions` supports full CRUD. `/app/admin/employees` supports position change via the edit-employee modal. One UX smell in the assign-permissions modal (submit button is outside the `<form>` tag but works via `onClick`) and one unused route: `/app/admin/permissions` does not exist as a page; the permission catalog is read-only and exposed only through the assign-permissions modal on the role-group page. `/app/admin/roles` (Legacy) is a dead view with `alert("coming soon")` on all actions but is labeled "Legacy" and Jemiko can ignore it.
- **Permission cache invalidation**: **STALE ON FRONTEND, SOUND ON BACKEND**. Backend `PositionPermissionGuard` does a fresh DB query per request — no server cache. Frontend `usePermissions()` caches the current user's effective permissions in a module-level variable that only clears on logout. This means a user whose role-group is edited while they are logged in will not see the change until they log out and back in. For Monday this is OK because Jemiko will assign permissions BEFORE operators log in; but operators who log in before 09:00 and whose permissions are changed mid-shift will see stale UI until a logout/login.
- **Audit trail**: **MISSING**. `role-groups.service.ts`, `positions.service.ts`, and the permission-assignment endpoint do not call `AuditService.log()`. The `AuditEntity` Prisma enum has no `ROLE_GROUP`, `POSITION`, or `PERMISSION_ASSIGNMENT` values. Changes to role-group / position / employee-position are not traceable after the fact. If Jemiko misconfigures something in production, we have no log of who changed what when.

---

## 1. Permission catalog

Reference: `backend/crm-backend/prisma/seed-permissions.ts` (306 lines, 99+ permissions across 10 categories).

### Call Center (CALL_CENTER category) — COMPLETE

| Resource | Action | Seeded | File:line |
|---|---|---|---|
| call_center | menu | YES | seed-permissions.ts:175 |
| call_center | reports | YES | seed-permissions.ts:176 |
| call_center | live | YES | seed-permissions.ts:177 |
| call_center | quality | YES | seed-permissions.ts:178 |
| call_center | statistics | YES | seed-permissions.ts:179 |
| call_logs | own | YES | seed-permissions.ts:180 |
| call_logs | department | YES | seed-permissions.ts:181 |
| call_logs | department_tree | YES | seed-permissions.ts:182 |
| call_logs | all | YES | seed-permissions.ts:183 |
| call_recordings | own | YES | seed-permissions.ts:184 |
| call_recordings | department | YES | seed-permissions.ts:185 |
| call_recordings | department_tree | YES | seed-permissions.ts:186 |
| call_recordings | all | YES | seed-permissions.ts:187 |

### Telephony + Missed Calls (TELEPHONY category) — COMPLETE

| Resource | Action | Seeded | File:line |
|---|---|---|---|
| telephony | call | YES | seed-permissions.ts:154 |
| telephony | manage | YES | seed-permissions.ts:155 |
| telephony | menu | YES | seed-permissions.ts:156 |
| missed_calls | access | YES | seed-permissions.ts:159 |
| missed_calls | manage | YES | seed-permissions.ts:160 |

### Client Chats (CLIENT_CHATS category) — COMPLETE

| Resource | Action | Seeded | File:line |
|---|---|---|---|
| client_chats | menu | YES | seed-permissions.ts:190 |
| client_chats | reply | YES | seed-permissions.ts:191 |
| client_chats | assign | YES | seed-permissions.ts:192 |
| client_chats | change_status | YES | seed-permissions.ts:193 |
| client_chats | link_client | YES | seed-permissions.ts:194 |
| client_chats | send_media | YES | seed-permissions.ts:195 |
| client_chats | send_template | YES | seed-permissions.ts:196 |
| client_chats | use_canned | YES | seed-permissions.ts:197 |
| client_chats | manage_canned | YES | seed-permissions.ts:198 |
| client_chats | view_analytics | YES | seed-permissions.ts:199 |
| client_chats | manage | YES | seed-permissions.ts:200 |
| client_chats | delete | YES | seed-permissions.ts:201 |
| client_chats_config | access | YES | seed-permissions.ts:202 |

### Other in-scope

Menu visibility (buildings/clients/incidents/assets/work_orders/sales/inventory/employees/admin) — all present at seed-permissions.ts:138–147. `admin.access`, `admin.manage_users`, `admin.manage_settings` — present at lines 102–105.

### Deprecated / cleanup list

`seed-permissions.ts:245–269` deletes legacy hyphenated keys (`work-orders.*`, `role-groups.*`) and obsolete `buildings.read`, `clients.read`, `incidents.read`, and old work-order action names on every seed run. The deletion also removes any `RoleGroupPermission` rows pointing to those deleted permissions. This cleanup is idempotent and safe.

### Verdict on catalog

**No gaps, no misspellings, no duplicates.** Every permission Jemiko needs to grant on Monday is present in the catalog. The gap is NOT in the catalog — it is in the seeded RoleGroup → Permission assignments (P0-A from phase1-rbac.md).

---

## 2. Admin UI pages

### `/app/admin/role-groups` (`frontend/crm-frontend/src/app/app/admin/role-groups/page.tsx`)

**Status: FUNCTIONAL.**

What it does:
- Lists all role groups in a table: name, description, active/inactive badge, permission count with first-3 preview chips, position count (hover-tooltip shows which positions use this group).
- "Add Role Group" button → `AddRoleGroupModal`: name + description + isActive. Code auto-generated server-side. After create, the modal closes and Jemiko must click "Permissions" to assign perms (the Add modal explicitly notes: "After creating the role group, you can assign permissions to it"). No combined create+assign flow; two-step is intentional.
- "Edit" button → `EditRoleGroupModal`: edit name, description, isActive. Code is read-only. Shows which positions currently use this group. Does NOT allow editing permissions from this modal — that's a separate flow. OK.
- "Permissions" button → `AssignPermissionsModal`: two-column grid of permission categories with Select-All per category, full-text search, per-permission checkbox. Selecting permissions and clicking "Save Permissions" POSTs to `/v1/role-groups/:id/permissions` with the full list, which REPLACES existing permissions (not additive). Shows selected count in footer.
- "Delete" button → `DeleteRoleGroupDialog`: blocks deletion if any Position uses the group, forces Jemiko to pick a replacement from the dropdown. Then `DELETE /v1/role-groups/:id` with `{ replacementRoleGroupId }` in body. Confirmation is "Reassign & Delete" or "Delete Role Group" depending on usage.

Gating: page is wrapped in `<PermissionGuard permission="admin.access">`. Backend API `/v1/role-groups` is guarded by `JwtAuthGuard + AdminOnlyGuard` (`user.role === 'ADMIN'`). Jemiko as superadmin with `role=ADMIN` passes both.

UX smells (non-blocking):
- In `AssignPermissionsModal`, the submit button is rendered in a footer `<div>` OUTSIDE the `<form>` element (lines 259–290). The button has both `type="submit"` and `onClick={handleSubmit}`, so the click path works, but pressing Enter inside the search box will not submit; this is probably desirable here (Enter shouldn't save). Not a functional bug.
- No "undo last change" on the permissions modal — if Jemiko misclicks and saves, the only recovery is to re-assign the correct list.
- No visual diff between current-state and proposed-state — Jemiko has to remember which perms were checked before she started editing.
- No confirmation dialog before saving permissions. Given the replace-all semantics on the server, a single misclick on Select-All could grant an entire category.

### `/app/admin/positions` (`frontend/crm-frontend/src/app/app/admin/positions/page.tsx`)

**Status: FUNCTIONAL.**

What it does:
- Lists all positions: name, role group name+code, department, level, employee count (hover-tooltip shows active employees), permission count (sourced from `position.roleGroup._count.permissions`), active/inactive badge.
- "Add Position" → `AddPositionModal`: name, description, level, roleGroupId (dropdown), departmentId (dropdown). Code auto-generated. Creates via POST `/v1/positions`.
- "Edit" → `EditPositionModal`: edit name (English + Georgian), description, level, roleGroupId, departmentId, isActive. Code is read-only. Shows list of employees who currently hold this position, for awareness. PATCH `/v1/positions/:id`.
- "Delete" → `DeletePositionDialog`: blocks deletion if any Employee uses the position; forces replacement-position pick. DELETE `/v1/positions/:id`.

Gating: page is wrapped in `<PermissionGuard permission="admin.access">`. Backend uses `JwtAuthGuard + AdminOnlyGuard` — same as role-groups.

Critical capability for Monday: **Changing a Position's `roleGroupId` via Edit modal atomically reassigns every employee holding that position to the new role group's permissions** (because permissions flow Employee → Position → RoleGroup → Permissions, with no per-employee cached copy). This is the fastest way for Jemiko to give the entire "Call Center Operator" position a new permission set: edit the CALL_CENTER role group's permissions ONE time, and all operator employees inherit the change on their next request.

UX smells (non-blocking):
- No warning when changing `roleGroupId` about the effect on currently-assigned employees. The modal shows "Employees Using This Position" but says "Changing the name will not affect these employees" — which is literally true, but it conceals the fact that changing the `roleGroupId` will affect every listed employee's effective permissions.
- Position-department validation: if the Position has a non-null `departmentId` and the Employee has a different department, backend rejects with 400 ("Position does not belong to the employee's department"). OK but Jemiko needs to know this — it limits her flexibility.

### `/app/admin/employees` and `/app/employees/:id`

**Status: FUNCTIONAL.**

- `/app/admin/employees/page.tsx` shows the employee list with Search + Status filter. No inline position-change button; click "View" to land on `/app/employees?employee=<id>` which opens the detail modal.
- Edit-employee modal (`src/app/app/employees/[employeeId]/edit-employee-modal.tsx`) has a `positionId` dropdown (`availablePositions` filtered by selected department). Submit PATCHes `/v1/employees/:id` with `{ positionId }`.
- Backend validates: if positionId provided, Position.departmentId must match Employee.departmentId (unless position is global, i.e. departmentId=null). See `employees.service.ts:367–392`.
- No cache invalidation step on the backend after position change — but there is no backend cache to invalidate. Next request from the target user will recompute permissions fresh via `PositionPermissionGuard` DB read.

Gating: both pages wrapped in `<PermissionGuard permission="admin.access">`. Backend uses standard Position RBAC — likely `employees.update` or similar (already granted to admin via isSuperAdmin bypass).

### `/app/admin/permissions` — DOES NOT EXIST

No standalone page for managing the permission catalog. This is **correct by design**: permissions are a developer-owned catalog defined in `seed-permissions.ts` and catalog rows are read-only from the app. The catalog is exposed to Jemiko only inside the role-group's AssignPermissions modal (fetched from `GET /v1/permissions`). She cannot create new permissions, and she shouldn't need to — every Monday-required permission is already seeded.

This matches the backend: `permissions.controller.ts` has only GET endpoints (findAll, grouped, by-resource, by-id, me-effective). No POST / PATCH / DELETE. OK.

### `/app/admin/roles` — legacy, broken, labeled as such

The Legacy Roles page (linked from admin panel as "Legacy Roles - Legacy role system (deprecated - use Positions instead)") uses `alert("coming soon")` for the Add/View/Edit buttons. Does not perform any actual role CRUD. Jemiko should not use this page. It does not block Monday but is a footgun: if Jemiko lands here and tries to edit a role, she sees an alert, which is confusing. Recommend removing this nav entry or gating it behind a dev-only flag before Monday — but not a blocker.

---

## 3. Backend endpoints

### `backend/crm-backend/src/role-groups/role-groups.controller.ts`

| Method | Route | Guard chain | Purpose |
|---|---|---|---|
| POST | `/v1/role-groups` | JwtAuthGuard + AdminOnlyGuard | create |
| GET | `/v1/role-groups` | same | list with positions, permissions, counts |
| GET | `/v1/role-groups/:id` | same | detail |
| PATCH | `/v1/role-groups/:id` | same | update name/desc/isActive (code NOT patchable — stripped in service:129) |
| DELETE | `/v1/role-groups/:id` | same | delete with optional replacement |
| POST | `/v1/role-groups/:id/permissions` | same | replace all perms |
| GET | `/v1/role-groups/:id/permissions` | same | list perms |

CRUD is complete. Permission assignment uses REPLACE semantics (`roleGroupPermission.deleteMany` then `createMany` in `role-groups.service.ts:149–160` and `226–237`). This is what the UI needs.

Gate: `AdminOnlyGuard` checks `user.role === 'ADMIN'` (NOT `isSuperAdmin`). Jemiko as both should be fine. But note the subtle mismatch documented in §6: a user with `isSuperAdmin=true, role=USER` cannot access these endpoints — they'd get 403 from `AdminOnlyGuard` before ever hitting `PositionPermissionGuard`'s superadmin bypass.

### `backend/crm-backend/src/permissions/permissions.controller.ts`

GET-only controller. Endpoints: `/v1/permissions` (list), `/grouped` (by category), `/resource/:res`, `/me/effective`, `/my-effective-permissions`, `/:id`. Gated by `JwtAuthGuard` only — any authenticated user can read the permission catalog. OK, this is needed by the role-group assign modal.

**Observation**: `getCurrentUserPermissions()` (`permissions.service.ts:165–224`) has a fallback when `allPermissions.length === 0` that returns a hardcoded list of ~25 permission keys for admin/superadmin users. This fallback can never actually fire in production because `seed-permissions.ts` always seeds 99+ permissions. Dead code but harmless.

### `backend/crm-backend/src/positions/positions.controller.ts`

Full CRUD. Same `AdminOnlyGuard` gating. Also exposes `/v1/positions/:id/permissions` (permissions inherited from the position's roleGroup), `/department/:departmentId/available` (with department inheritance rules), `/global` (no-department positions).

### `backend/crm-backend/src/employees/employees.service.ts` — update with positionId

Handles the position-change flow per §4. Validates position exists, validates position-department consistency, updates `jobTitle` to the Position.name when positionId changes. Does not need to do any cache invalidation because there is no server-side permissions cache.

### Summary

All three admin-UI backend dependencies (role-groups, permissions, positions) expose the CRUD Jemiko needs. No missing endpoints. The permission catalog is read-only (`GET /v1/permissions`) — correct, since permissions are developer-owned.

---

## 4. Permission recompute on position change

### What happens when an admin changes an employee's position

1. Admin opens `/app/employees?employee=<id>`, clicks Edit, changes Position dropdown, saves.
2. Frontend PATCHes `/v1/employees/<id>` with `{ positionId }`.
3. Backend `EmployeesService.update()` updates the `Employee.positionId` column and writes `jobTitle = position.name`. Single `prisma.employee.update({ where: { id }, data: {...} })` call (service:413–435).
4. **Backend has no cache to invalidate.** `PositionPermissionGuard` hits DB on every authenticated request via a fresh `prisma.employee.findUnique({ where: { userId }, include: { position: { roleGroup: { permissions } } } })`. So the NEXT authenticated HTTP request from the target user sees the new permissions.
5. **Frontend has a module-level cache.** `src/lib/use-permissions.ts:6` — `permissionsCache: string[] | null = null`. Only populated on first `usePermissions()` hook mount per page load, only cleared by `clearPermissionsCache()`. The only call sites that clear the cache are `logout-button.tsx:18` and `profile-menu.tsx:184` (which also calls logout).

### Consequence for Monday

- If Jemiko reassigns an operator's position WHILE the operator is logged in, the operator's sidebar and `<PermissionGuard>` checks will keep showing the OLD permissions until the operator logs out and back in. Backend-side authorization is fresh, so API calls will succeed/fail per the new role-group; but the UI won't render buttons for permissions the user "just got".
- If Jemiko edits the CALL_CENTER role-group's permission list WHILE operators are logged in, same story: backend sees new perms immediately, frontend UI keeps old perms until next login.
- **Practical mitigation**: tell Jemiko to assign all permissions BEFORE operators log in on Monday. If a post-launch adjustment is needed, she should ask the operator to log out and log back in.

### Alternative — force refresh

There is no backend-pushed permission-change notification today (no socket event on `/permissions:changed`). Adding one is straightforward (emit to the target `user:<id>` room from the role-group PATCH service, frontend `usePermissions` subscribes and calls `clearPermissionsCache()` + refetch) but out of scope for Monday.

### auth logout

`auth.controller.ts:297–303`: logout clears the cookie only (single `res.clearCookie`). It does NOT invalidate the frontend cache — that happens client-side in `logout-button.tsx`. It also does not revoke the JWT, because JWTs aren't tracked server-side. A stolen JWT would remain valid for its remaining lifetime. Known separate issue (P2-2).

### Verdict

Backend cache: **SOUND** (no cache at all → fresh on every request).
Frontend cache: **STALE UNTIL LOGOUT**. Works for pre-launch config; a documented operational step (ask user to log out / back in) handles mid-shift changes.

---

## 5. Jemiko's Monday setup checklist

Assumptions: VM production DB has been seeded via `seed:all` (which includes `seed-rbac.ts`), so role groups `CALL_CENTER` and `MANAGEMENT` exist but with the wrong (partial) permissions per phase1-rbac §A. Positions `Call Center Operator (CALL_CENTER)` and `Manager (MANAGER)` exist and point to those role groups. Jemiko's account has `role=ADMIN` and `isSuperAdmin=true`.

### Setup A — Call Center Operator role group

Goal: every employee with Position=Call Center Operator can open the Call Center sidebar, see their own call logs, listen to their own recordings, manage missed calls, reply in client chats with media and canned responses, and originate/receive calls from the softphone.

1. Log in at `https://crm28.asg.ge/login` with your superadmin email + password.
2. Navigate to `https://crm28.asg.ge/app/admin/role-groups` (from sidebar: Admin Panel → Role Groups).
3. Find the row named "Call Center" (code: `CALL_CENTER`, description: "Call center staff - incident creation and client lookup").
   - If it does NOT exist: click "Add Role Group", fill name="Call Center", description="Call center operators - calls + chats + incidents", Active=checked, click "Create Role Group".
4. Click the "Permissions" button (teal) on the "Call Center" row.
5. The Assign Permissions modal opens with categories in a 2-column grid. For each category, either check the box next to each permission listed below or use the category's "Select All" shortcut where it covers everything you need.
6. Check EXACTLY these 18 permissions (use the search box to find them fast — search "call" to see call-center, call-logs, call-recordings at once):

   Call Center category:
   - `call_center.menu`
   - `call_center.reports`

   Call Logs (CALL_CENTER category):
   - `call_logs.own`

   Call Recordings (CALL_CENTER category):
   - `call_recordings.own`

   Missed Calls (TELEPHONY category):
   - `missed_calls.access`
   - `missed_calls.manage`

   Client Chats (CLIENT_CHATS category):
   - `client_chats.menu`
   - `client_chats.reply`
   - `client_chats.change_status`
   - `client_chats.link_client`
   - `client_chats.send_media`
   - `client_chats.send_template`
   - `client_chats.use_canned`

   Telephony:
   - `telephony.call`
   - `telephony.menu`

   Incidents (keep existing):
   - `incidents.details_read`
   - `incidents.create`
   - `incidents.update`

   Plus the buildings + clients read that operators already need (likely already checked from the seeded state):
   - `buildings.details_read`
   - `clients.details_read`
   - `work_orders.read` (note: underscore, NOT `work-orders.read`)

7. Note the selected count at the bottom should be ~20. Click "Save Permissions".
8. Wait for the green success feedback. The modal closes.
9. Verify on the page: the "Permissions" column for Call Center row now shows "20 permissions" (or similar).

### Setup B — Management (manager tier) role group

Goal: every employee with Position=Manager can view the entire call center (live monitor, stats, quality), see department-tree scoped call logs and recordings, manage chats across all operators, access chat analytics and config.

1. Still in `/app/admin/role-groups`, find the row named "Management" (code: `MANAGEMENT`).
2. Click "Permissions" on that row.
3. Clear any outdated hyphenated entries if they appear (they won't — deprecated ones are deleted on every seed run per seed-permissions.ts:245–269).
4. Check EXACTLY these permissions:

   Call Center (all 5):
   - `call_center.menu`, `call_center.reports`, `call_center.live`, `call_center.quality`, `call_center.statistics`

   Call Logs:
   - `call_logs.department_tree` (NOT `call_logs.all` — that's for Jemiko only)

   Call Recordings:
   - `call_recordings.department_tree`

   Missed Calls:
   - `missed_calls.access`, `missed_calls.manage`

   Client Chats (manager tier):
   - `client_chats.menu`, `client_chats.reply`, `client_chats.assign`, `client_chats.change_status`, `client_chats.link_client`, `client_chats.send_media`, `client_chats.send_template`, `client_chats.use_canned`, `client_chats.manage_canned`, `client_chats.view_analytics`, `client_chats.manage`, `client_chats.delete`
   - `client_chats_config.access` (to reach `/app/admin/client-chats-config`)

   Telephony:
   - `telephony.call`, `telephony.menu`, `telephony.manage`

   Plus the baseline manager items (likely already seeded):
   - `buildings.details_read`, `buildings.update`
   - `clients.details_read`, `clients.update`
   - `incidents.details_read`, `incidents.update`, `incidents.assign`, `incidents.create`
   - `work_orders.read`, `work_orders.update`, `work_orders.assign`
   - `inventory.read`
   - `employees.read`
   - `reports.view`, `reports.export` (note: `view`, NOT `read` — seed-permissions.ts:99 defines `reports.view`, seed-rbac.ts:132 currently has the wrong `reports.read` key which silently drops)
   - `admin.access`
   - `departments.read`

   Selected count should be ~45 permissions.

5. Click "Save Permissions".
6. Verify "Permissions" count on the Management row.

### Verify — log in as a test operator / manager

1. Create a test operator employee if you don't have one: `/app/admin/employees` → "Add Employee" → fill in required fields, set Position = "Call Center Operator", save. This creates both the Employee record and a User account (if you used the "Create user account" option).
2. Log OUT of your superadmin session (profile menu top-right → Logout).
3. Log IN with the test operator's credentials.
4. Check the left sidebar: you should see both "Client Chats" and "Call Center" as entries.
5. Click "Call Center" — the Overview tab should render (or the first tab you have permission for). Reports, Logs, Missed tabs should be reachable.
6. Click "Client Chats" — inbox should load. The reply input is visible; you can assign, status-change, link client, send media via the paperclip, use canned responses.
7. Verify /app/call-center/live returns "Insufficient Permissions" for an operator (correct — live is manager-only).
8. Log OUT. Log IN as a test manager. Verify /app/call-center/live, /app/call-center/quality, /app/call-center/statistics, /app/call-center/reports all render. Client Chats manager controls (delete, queue configuration) appear.
9. If anything is missing, go back to Jemiko's superadmin session and re-check the role-group permissions — the UI does not refresh mid-session.

---

## 6. Self-lockout recovery

**Risk**: Jemiko clicks "Permissions" on the "Full Access" role-group (her own), deselects things, saves. What happens?

Short answer: **she cannot lock herself out.** Three independent defenses:

1. **SuperAdmin bypass in `PositionPermissionGuard`.** `position-permission.guard.ts:84` — if `dbUser.isSuperAdmin` is true, return true without checking any permissions. Jemiko's user record has `isSuperAdmin=true` (set by `seed-rbac.ts:359` for every ADMIN user). So even if she removes every permission from her RoleGroup, backend API calls that go through `PositionPermissionGuard` still pass.

2. **Admin-only endpoints ignore RoleGroup permissions.** `/v1/role-groups/*`, `/v1/positions/*`, and employees-management endpoints are guarded by `AdminOnlyGuard` (`admin-only.guard.ts:10` — `user.role === 'ADMIN'`). This guard reads `role` from the JWT payload, which was set from `User.role` at login time. Changing the RoleGroup permissions does NOT change User.role. So admin UI stays accessible even if her RoleGroup is emptied.

3. **Frontend `PermissionGuard` respects superadmin.** `frontend/crm-frontend/src/lib/permission-guard.tsx` reads from the `usePermissions()` cache, which is seeded from `/v1/permissions/my-effective-permissions`. For a superadmin, `permissions.service.ts:175` returns ALL permissions in the catalog (since `isSuperAdmin=true` triggers the `allPermissions.map(...)` short-circuit). So the UI never hides admin controls from Jemiko regardless of RoleGroup state.

**What CAN Jemiko break irrecoverably via the UI?**
- Delete her own User account: there is no `/app/admin/users/:id` delete button wired that I can see, and `DELETE /v1/employee/hard_delete` requires the employee be fully disconnected from active records. Low risk.
- Unset her `isSuperAdmin` flag: the Users / Admin UI does not expose a control for `isSuperAdmin` (grep'd the frontend, no input named `isSuperAdmin`). The only way to toggle it off is direct DB edit or the `backend/crm-backend/prisma/set-admin-superadmin.ts` script. Safe.
- Delete the "Full Access" role group: the delete dialog forces a replacement-role-group pick before proceeding. If the replacement lacks `admin.access`, Jemiko would lose the admin panel menu entry — but `isSuperAdmin` still lets her hit `/v1/role-groups/*` endpoints and the frontend `PermissionGuard` still renders the admin panel because superadmin has all perms. She could recover by navigating to `/app/admin/role-groups` directly.
- Delete the "System Administrator" position (code ADMIN): same dialog forces a replacement. If she picks one that lacks admin.access, same recovery — isSuperAdmin protects her.
- Change her own Employee.positionId to something without permissions: `isSuperAdmin` bypasses. Safe.

**Net: there is an admin bypass that keeps Jemiko safe even after a misclick. The bypass is `User.isSuperAdmin=true`, NOT `User.role=ADMIN`. Both are set by `seed-rbac.ts`. She does not need a second emergency account on Monday.**

**Corner case worth flagging**: if Jemiko's DB user record is ever edited to set `role='USER'` while keeping `isSuperAdmin=true`, she would be locked out of the role-groups / positions admin UI because `AdminOnlyGuard` checks `role` not `isSuperAdmin`. This is an inconsistency between the two guards — not a Monday issue since her seeded state has both flags true, but worth noting for future cleanup.

---

## 7. Audit trail

### Current state

**NO audit logging on any RBAC change.**

- `backend/crm-backend/src/role-groups/role-groups.service.ts` — 246 lines, zero `AuditService` imports, zero `.log()` calls. Creating, updating, deleting a role group, and replacing its permissions, all happen silently.
- `backend/crm-backend/src/positions/positions.service.ts` — same. No audit for position create/update/delete.
- `backend/crm-backend/src/employees/employees.service.ts` — mutations do NOT call `AuditService` on positionId / roleGroup changes (confirmed by `grep audit` returning nothing relevant in this file).
- `prisma/schema.prisma:1912–1923` — `AuditEntity` enum has only: `BUILDING, CLIENT, ASSET, WORK_ORDER, USER, INCIDENT, LEAD, SALES_SERVICE, SALES_PLAN, CALL_SESSION`. No `ROLE_GROUP`, `POSITION`, or `PERMISSION_ASSIGNMENT` values. Even if code added `AuditService.log(...)`, the schema wouldn't accept these entity names without a migration.

Currently the only entries in AuditLog come from `v1/admin-manual.controller.ts` (manual admin operations on buildings/clients/etc.) and the buildings/clients/work-orders domain services.

### What this means on Monday

If Jemiko changes a permission and an operator complains "I can't do X anymore" (or "I can do Y that I shouldn't be able to do"), there is NO record of:
- Who made the RoleGroup change.
- When it was made.
- What the previous state was.
- Whether a position was reassigned to a different role group.
- Whether an employee was moved to a different position.

The only forensics path is to compare the live DB snapshot against the last backup — and we don't have a verified backup cadence for RBAC tables specifically.

### Recommended fix (post-Monday, not a launch blocker)

1. Prisma migration: extend `AuditEntity` enum with `ROLE_GROUP`, `POSITION`, `EMPLOYEE_POSITION_ASSIGNMENT`, `PERMISSION_ASSIGNMENT`. (Safe because new enum values and no USE-in-same-transaction constraint issue here.)
2. `AuditService` type update: extend the `AuditEntity` union in `audit.service.ts:5` accordingly.
3. Call `audit.log({ action, entity, entityKey, req, payload })` at the end of each mutating method in role-groups.service, positions.service, and employees.service (for positionId changes). `payload` should include the before/after permission IDs so we can diff.
4. Add an `/app/admin/audit-log` read-only view filtered by entity = `ROLE_GROUP | POSITION | PERMISSION_ASSIGNMENT` so Jemiko can see her own change history.

Scope is roughly half a day of work. Punt to post-launch.

---

## Any fixes needed before Monday (separate from Phase 4 P0/P1 list)

1. **P0-A FIX (already on Phase 4 plan)**: seed-rbac.ts assigns wrong permission strings. Rather than re-seeding, Jemiko can fix this in the admin UI using §5. No developer action required. If she prefers the deploy to handle it, the fix in `seed-rbac.ts` is mechanical (lines 125–148).

2. **Confirm Jemiko's account has `isSuperAdmin=true` AND `role=ADMIN`**: run once on the VM DB before Monday:
   ```sql
   SELECT id, email, role, "isSuperAdmin" FROM "User" WHERE email = '<jemiko-email>';
   ```
   If `isSuperAdmin` is false or `role != 'ADMIN'`, run `pnpm tsx prisma/set-admin-superadmin.ts` with her email as argument (see `backend/crm-backend/prisma/set-admin-superadmin.ts`). This is the safest pre-flight check and takes 30 seconds.

3. **Remove or hide the Legacy Roles admin entry** (cosmetic / footgun): `frontend/crm-frontend/src/app/app/admin/page.tsx:69–74` lists "Legacy Roles" with broken `alert("coming soon")` buttons on the target page. Jemiko may click through, get confused, and waste time. Option A: delete the admin-panel nav entry. Option B: add `@Deprecated` label, gray-out the card, wrap in `process.env.NODE_ENV === 'development'` check. Trivial, 10-line PR.

4. **Add a "confirm save" on the AssignPermissions modal** (defensive UX): the modal has no "Are you sure?" dialog before replacing the entire permission set. If Jemiko clicks Select-All on the wrong category, one click can grant every permission in that category. Ideal: show a diff (added / removed perms) and require explicit confirmation for any removal. Low-priority, 2-hour PR.

5. **Docs note for Jemiko**: after changing a role group's permissions, users currently logged in must log OUT and back IN to see the new permission set reflected in the UI. Backend API calls use the new set immediately; only the sidebar, PermissionGuard-gated pages, and button visibility are stale.

6. **Socket-push permission invalidation** (post-launch nice-to-have): emit `permissions:changed` on the `user:<id>` room from `role-groups.service.update()`, `role-groups.service.assignPermissions()`, `positions.service.update()`, and `employees.service.update()` when positionId changes. Frontend `usePermissions` subscribes and refetches. Closes the stale-UI gap mid-shift. 1-day PR, no Monday gate.

7. **AuditLog for RBAC changes** (separate section 7 above): post-launch, ~4–6 hours of work, low risk. Before Monday is OK because we expect Jemiko to make changes during a pre-launch window with a short audit period, and she is the only person with the admin role. Post-launch, when more admins are added, this becomes more important.

---

## Cross-check against Phase 1 findings

| Phase 1 item | Covered here |
|---|---|
| P0-A (RoleGroup permission gap) | §5 Monday checklist (manual fix via UI). UI functional — Jemiko doesn't need the seed fix merged before Monday. |
| Front-end cache staleness | §4 Permission recompute. Documented, mitigation = pre-launch config. |
| No audit trail on RBAC | §7. Punt. |
| AdminOnlyGuard vs isSuperAdmin mismatch | §6. Annotated as corner case. |

The short answer to the original brief: **yes, Jemiko can manage role-group permissions entirely from the CRM admin UI**. She does not need a developer, a seed script, or direct DB access on Monday. The catalog is complete, the role-groups UI is functional, the positions and employees UIs let her wire positions and move employees between them, and her superadmin bypass protects her from self-lockout. The three caveats — stale frontend cache until logout, no audit trail, and one dead "Legacy Roles" nav entry — are operational, not blocking.
