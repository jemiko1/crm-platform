# CRM Platform - Project Snapshot

**Single source of truth for AI tools and developers.** Read this file first to understand the project.

**Last Updated**: 2026-02-17 | **Version**: v1.4.0  
**Stack**: NestJS (Backend) + Next.js App Router (Frontend) + PostgreSQL + Prisma ORM + Socket.IO

---

## 1. Ports & URLs (CRITICAL)

**Backend runs on port 3000. Frontend runs on port 3002. Do NOT use port 4000.**

| Service | URL | Notes |
|---------|-----|-------|
| **Backend** | `http://localhost:3000` | NestJS API (main.ts: `process.env.PORT ?? 3000`) |
| **Frontend** | `http://localhost:3002` | Next.js app (run: `pnpm dev --port 3002`) |
| **API Base** | `http://localhost:3000/v1/*` | All API requests go here |

**Frontend API client** (`frontend/crm-frontend/src/lib/api.ts`):
- `API_BASE` defaults to `http://localhost:3000` (fallback when `NEXT_PUBLIC_API_BASE` is unset)
- Set `NEXT_PUBLIC_API_BASE=http://localhost:3000` in `.env.local` for explicit config
- **Never use port 4000** — the backend does not run on 4000; using it causes API failures

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
| **JWT expiry** | 24 hours (env: `JWT_EXPIRES_IN`) |
| **Cookie maxAge** | 24 hours (matches JWT) |
| **CORS** | `http://localhost:3002` (or frontend URL), credentials: true |

**401 handling**: API client redirects to `/login?expired=1&next=<path>`. Login page shows "Your session has expired. Please sign in again."

**Dismissed Users**: When a dismissed user tries to login, they see "Your account has been dismissed. Please contact your system administrator." instead of "Invalid credentials".

---

## 5. Core Modules

### Buildings & Clients
- Buildings have assets (devices), clients, incidents, work orders
- Modal-based detail views via URL params (`?building=1`)

### Work Orders
- Full workflow: CREATED → LINKED_TO_GROUP → IN_PROGRESS → COMPLETED/CANCELED
- Activity timeline with filtering
- Product usage tracking with inventory integration

### Incidents
- Linked to buildings and optionally clients
- Status lifecycle management

### Inventory
- Products, purchase orders, stock transactions
- Low stock alerts, inventory value reports

### Employees & HR
- **User Account**: Optional - employees can exist without login accounts
- **Lifecycle**: ACTIVE → TERMINATED (dismissal) → Reactivation or Permanent Deletion
- **Permissions**: Derived from Position → RoleGroup → Permissions
- **Employee ID**: Auto-generated (EMP-001, EMP-002...), never reused after deletion

### Instant Messenger (v1.4.0+)
- **Facebook-style messenger**: Real-time chat between employees with Socket.IO WebSockets
- **Chat bubbles**: Bottom-anchored modal chat windows (like Facebook Messenger)
- **Full messenger view**: Slider modal with three-column layout (conversations, chat, employee info)
- **Group chats**: Admin-controlled group creation with permission-based access
- **Message features**: Emoji reactions, delivered/seen status with Facebook-style seen avatars
- **Sound notifications**: Audio alerts for new messages
- **Real-time updates**: WebSocket + REST polling fallback for reliable message delivery
- **Header integration**: Messenger icon, notification bell, search bar, and My Workspace in sticky header

### Sales CRM (v1.2.0+)
- **Leads**: Pipeline management with stages, services, proposals
- **Services Catalog**: Configurable services with pricing
- **Sales Plans**: Monthly/quarterly/annual targets per employee
- **Approval Workflow**: Head of Sales / CEO approval for lead closure

### Departments & Company Structure
- Hierarchical tree view with drag-and-drop reorganization
- Drag to root level supported (set parentId = null)
- Position creation per department
- Employee count popup with position/department transfer

---

## 6. Modal System

**All detail views (building, client, employee, work-order) open as full-size modals.**

| Type | Z-Index | URL Param | Example |
|------|---------|-----------|---------|
| **Detail modals** | 10000 | `?building=1`, `?client=5`, `?employee=id`, `?workOrder=123` | `/app/buildings?building=1` |
| **Action modals** | 50000+ | N/A (inline) | Add/Edit/Delete/Report modals |

**Navigation**:
- **Open**: `router.push('/app/buildings?building=1')` — adds to browser history
- **Close**: `router.back()` — returns to previous page
- Browser back button works naturally

**Files**: `modal-manager.tsx`, `modal-provider.tsx`, `modal-z-index-context.tsx`, `modal-stack-context.tsx`  
**Content components**: `building-detail-content.tsx`, `client-detail-content.tsx`, `employee-detail-content.tsx`, `work-order-detail-modal.tsx`, `full-messenger-content.tsx`

**Action modals** (Add Client, Create Work Order, Report Incident, etc.): Use `z-[50000]` so they appear above detail modals.

---

## 7. UI Rules (MANDATORY)

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

## 8. Key Files

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
| Messenger context | `frontend/crm-frontend/src/app/app/messenger/messenger-context.tsx` |
| Messenger gateway | `backend/crm-backend/src/messenger/messenger.gateway.ts` |
| Messenger controller | `backend/crm-backend/src/messenger/messenger.controller.ts` |
| App header | `frontend/crm-frontend/src/app/app/app-header.tsx` |

---

## 9. Quick Start

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

## 10. Frontend Routes (Summary)

| Route | Type | Notes |
|-------|------|-------|
| `/app/dashboard` | Page | Placeholder |
| `/app/buildings` | List | Buildings list |
| `/app/buildings?building=1` | Modal | Building detail |
| `/app/clients` | List | Clients list |
| `/app/clients?client=5` | Modal | Client detail |
| `/app/employees` | List | Employees list with login status indicator |
| `/app/employees/[id]` | Page | Employee detail with lifecycle actions |
| `/app/work-orders` | List | Work orders list |
| `/app/work-orders?workOrder=123` | Modal | Work order detail |
| `/app/incidents` | Page | Incidents with filters |
| `/app/inventory` | Page | Products, purchase orders |
| `/app/tasks` | Page | My workspace |
| `/app/sales/leads` | List | Sales leads pipeline |
| `/app/sales/leads/[id]` | Page | Lead detail |
| `/app/admin/*` | Pages | Positions, role groups, departments, list items, workflow, sales config |

---

## 11. API Endpoints (Summary)

| Prefix | Purpose |
|--------|---------|
| `POST /auth/login` | Login, sets cookie |
| `GET /auth/me` | Current user + permissions |
| `POST /auth/logout` | Clear cookie |
| `GET /v1/buildings` | List buildings |
| `GET /v1/clients` | List clients |
| `GET /v1/employees` | List employees |
| `POST /v1/employees/:id/activate` | Reactivate dismissed employee |
| `DELETE /v1/employees/:id/hard-delete` | Permanently delete employee |
| `GET /v1/incidents` | List incidents (filters) |
| `POST /v1/incidents` | Create incident |
| `GET /v1/work-orders` | List work orders |
| `GET /v1/work-orders/:id` | Work order detail |
| `GET /v1/work-orders/:id/activity` | Activity log |
| `GET /v1/sales/leads` | List sales leads |
| `POST /v1/sales/leads` | Create lead |
| `GET /v1/sales/services` | Sales services catalog |
| `GET /v1/messenger/me` | Current employee for messenger |
| `GET /v1/messenger/conversations` | List conversations |
| `POST /v1/messenger/conversations` | Create conversation |
| `GET /v1/messenger/conversations/:id/messages` | List messages |
| `POST /v1/messenger/conversations/:id/messages` | Send message |
| `POST /v1/messenger/messages/:id/reactions` | Toggle emoji reaction |
| `GET /v1/messenger/unread-count` | Unread message count |
| `GET /v1/system-lists/*` | Dynamic dropdown values |
| `GET /v1/positions`, `role-groups`, `departments` | Admin CRUD |

All `/v1/*` endpoints (except public reads) require `JwtAuthGuard`. Many use `@RequirePermission('resource.action')`.

---

## 12. RBAC

**Chain**: User → Employee → Position → RoleGroup → Permissions

- **Backend**: `PositionPermissionGuard`, `@RequirePermission('resource.action')`
- **Frontend**: `usePermissions` hook, `PermissionButton`, `PermissionGuard`
- **Superadmin**: `user.isSuperAdmin` bypasses permission checks

**Employee-specific permissions**:
- `employee.dismiss` - Dismiss/terminate employees
- `employee.activate` - Reactivate dismissed employees
- `employee.reset_password` - Reset employee passwords
- `employee.hard_delete` - Permanently delete employees

**Messenger-specific permissions**:
- `messenger.create_group` - Create group conversations

---

## 13. Repository Structure

```
backend/crm-backend/
├── prisma/ (schema, migrations, seed-*.ts scripts)
├── src/
│   ├── main.ts, app.module.ts
│   ├── auth/ (login, JWT, cookie)
│   ├── v1/ (incidents, work-orders, workflow)
│   ├── buildings, clients, incidents, work-orders, inventory, employees
│   ├── positions, role-groups, departments, system-lists
│   ├── sales/ (leads, config, services)
│   ├── messenger/ (controller, service, gateway, module)
│   └── prisma/ (PrismaService)

frontend/crm-frontend/
├── src/
│   ├── app/
│   │   ├── app/ (layout, modal-manager, modal-provider)
│   │   │   ├── buildings, clients, employees, work-orders, incidents, inventory
│   │   │   ├── tasks, admin, assets
│   │   │   ├── sales/ (leads, services, plans)
│   │   │   ├── messenger/ (chat bubbles, full messenger, context, types)
│   │   │   ├── app-header.tsx, header-search.tsx, header-messenger-icon.tsx, header-notifications.tsx
│   │   │   └── modal-z-index-context.tsx
│   │   ├── login/, modal-dialog.tsx
│   ├── hooks/ (useListItems.ts)
│   └── lib/ (api.ts, use-permissions.ts)
```

---

## 14. Critical Rules Checklist

- [ ] Never hardcode dropdowns — use `useListItems(categoryCode)`
- [ ] Never use raw fetch — use `apiGet`, `apiPost`, etc. from `@/lib/api`
- [ ] Modals: `createPortal` to `document.body`, z-index 10000 (detail) or 50000 (action)
- [ ] Terminology: Devices (building assets) vs Products (inventory)
- [ ] Work on `dev` branch; merge to `master` for releases
- [ ] Do not change DB host/port without explicit request
- [ ] Commit format: `feat(scope): message` or `fix(scope): message`
- [ ] Employee IDs are never reused after deletion

---

## 15. Recent Updates

### Instant Messenger & Header Redesign (v1.4.0 - 2026-02-17)

#### Messenger
- ✅ Facebook-style instant messenger with real-time WebSocket communication (Socket.IO)
- ✅ Chat bubble windows anchored to bottom of screen (open multiple simultaneously)
- ✅ Full messenger slider modal with three-column layout (conversations | chat | employee info)
- ✅ Group chat creation with admin permissions (`messenger.create_group`)
- ✅ Emoji reactions on messages with reaction counts and participant display
- ✅ Message status indicators: sent (single tick), delivered (double tick), seen (Facebook-style profile avatars)
- ✅ Sound notifications for new messages (`notification.wav`)
- ✅ Real-time message delivery via WebSocket + REST polling fallback (3s interval)
- ✅ Message search, conversation filters (All, Groups, Unread)
- ✅ Typing indicators with debounce
- ✅ Cursor-based pagination for conversations and messages
- ✅ MessageBus architecture for decoupled message delivery with deduplication

#### Header Redesign
- ✅ Sticky header with floating shadow effect (Facebook-style)
- ✅ CRM28 branding in top-left corner aligned above sidebar
- ✅ Pill-shaped search bar, circular messenger/notification icons
- ✅ Compact circular profile avatar button
- ✅ My Workspace with task count badge

#### Database Schema
- ✅ New models: Conversation, ConversationParticipant, Message, MessageAttachment, MessageReaction
- ✅ Enums: ConversationType, MessageType, ParticipantRole

### Previous Updates (v1.3.0 - 2026-01-30)

### Employee Lifecycle Management
- ✅ Dismiss/terminate employees (soft delete with status change)
- ✅ Reactivate dismissed employees
- ✅ Permanent deletion with delegation for active items
- ✅ User account creation optional during employee creation
- ✅ Password reset functionality with permissions
- ✅ Login account indicator in employee list
- ✅ Employee ID counter (IDs never reused)

### Department & Company Structure
- ✅ Drag-and-drop to root level (parentId = null)
- ✅ Add Position button in department details
- ✅ Clickable employee count with popup
- ✅ Position assignment and department transfer in popup
- ✅ Department editing modal

### Sales CRM Module (v1.2.0)
- ✅ Lead pipeline with configurable stages
- ✅ Services catalog with pricing
- ✅ Lead services with quantities
- ✅ Sales plan targets (monthly/quarterly/annual)
- ✅ Multi-position assignment for pipeline roles
- ✅ Approval workflow for lead closure

### Schema Changes (v1.3.0)
- ✅ `responsibleEmployeeId` nullable on Lead (with cached name)
- ✅ `createdById` nullable on Lead-related tables (with cached names)
- ✅ `onDelete: SetNull` for employee references in historical records
- ✅ Employee ID counter in ExternalIdCounter table

---

## 16. Other Documentation

For deeper detail, see:
- `DEVELOPMENT_GUIDELINES.md` — Dynamic lists, modal patterns, performance, employee management
- `API_ROUTE_MAP.md` — Full API endpoint list
- `FRONTEND_ROUTE_MAP.md` — Full frontend route list
- `SESSION_SUMMARY.md` — Feature history, migrations

**This file (PROJECT_SNAPSHOT.md) is the primary reference.** Use it first; refer to others only when needed.
