# Quick Start Prompt for New Cursor Chat Sessions

Copy and paste this template when starting a new chat in Cursor to provide context:

---

## Basic Template

```
I'm working on a CRM Platform project. Here's the current state:

**Project Overview:**
- Stack: NestJS (Backend) + Next.js 15 App Router (Frontend) + PostgreSQL + Prisma ORM
- Dev Environment: Backend on port 4000, Frontend on port 4002
- Authentication: JWT cookies (httpOnly, sameSite: 'lax')
- RBAC: Position-based permissions system (User → Employee → Position → RoleGroup → Permissions)

**Current Architecture:**
- Centralized modal management system with history-based navigation
- All detail pages (buildings, clients, employees, work-orders) open as full-size modals
- Z-index: Detail modals (10000), Action modals (50000+)
- URL-based modal state: ?building=1, ?client=5, ?employee=abc, ?workOrder=123
- Navigation: router.back() for closing modals

**Key Files:**
- Modal System: `frontend/crm-frontend/src/app/app/modal-manager.tsx`
- API Client: `frontend/crm-frontend/src/lib/api.ts` (update API_BASE for dev env)
- Documentation: `SESSION_SUMMARY.md`, `FRONTEND_ROUTE_MAP.md`, `DEVELOPMENT_GUIDELINES.md`, `PROJECT_SNAPSHOT.md`

**Current Goal:**
[Describe what you want to work on - e.g., "Add new feature X", "Fix bug Y", "Optimize Z"]

**Known Issues:**
[Any known problems or limitations]

Please help me [your specific task].
```

---

## Detailed Template (For Complex Tasks)

```
I'm working on a CRM Platform project. Here's the comprehensive context:

**Project Overview:**
- **Stack**: NestJS (Backend) + Next.js 15 App Router (Frontend) + PostgreSQL + Prisma ORM
- **Dev Environment**: 
  - Backend: http://localhost:4000
  - Frontend: http://localhost:4002
  - Database: Separate dev database
- **Production Environment**:
  - Backend: http://localhost:3000
  - Frontend: http://localhost:3002
- **Authentication**: JWT tokens in httpOnly cookies (sameSite: 'lax', secure in prod)
- **RBAC**: Position-based (User → Employee → Position → RoleGroup → Permissions)

**Current Architecture (v1.2.0):**
- **Modal System**: Centralized ModalManager in app layout
  - Detail modals: Buildings, Clients, Employees, Work Orders
  - History-based navigation: router.back() closes modals
  - Z-index: Detail modals (10000), Action modals (50000+)
  - URL format: /app/[route]?[type]=[id] (e.g., ?building=1, ?client=5)
  - Shareable URLs for each modal state
- **API Client**: Centralized in `lib/api.ts` with automatic cookie handling
- **Permissions**: usePermissions hook + PermissionButton/PermissionGuard components

**Key Documentation:**
- `SESSION_SUMMARY.md` - Complete feature list and version history
- `FRONTEND_ROUTE_MAP.md` - All routes and API endpoints
- `DEVELOPMENT_GUIDELINES.md` - Coding standards and patterns
- `PROJECT_SNAPSHOT.md` - Project structure and architecture
- `API_ROUTE_MAP.md` - Backend API documentation

**Key Files:**
- Backend: `backend/crm-backend/src/main.ts`, `app.module.ts`, `prisma/schema.prisma`
- Frontend: 
  - Modal: `frontend/crm-frontend/src/app/app/modal-manager.tsx`
  - API: `frontend/crm-frontend/src/lib/api.ts`
  - Layout: `frontend/crm-frontend/src/app/app/layout.tsx`
  - Hooks: `frontend/crm-frontend/src/hooks/useListItems.ts`

**Current Goal:**
[Describe your specific task in detail]

**Context/Background:**
[Any relevant context about why you're working on this]

**Known Issues:**
[Any known problems, limitations, or edge cases]

**Expected Outcome:**
[What you want to achieve]

Please help me [your specific request].
```

---

## Quick Reference Template (Minimal)

```
CRM Platform (NestJS + Next.js 15 + PostgreSQL)

**Dev**: Backend 4000, Frontend 4002
**Current**: Centralized modal system, history-based navigation
**Goal**: [Your task]

See: SESSION_SUMMARY.md, FRONTEND_ROUTE_MAP.md, DEVELOPMENT_GUIDELINES.md
```

---

## Tips for Using This Template

1. **Copy the appropriate template** based on task complexity
2. **Fill in the bracketed sections** with your specific information
3. **Reference specific files** if you're working on a particular feature
4. **Mention any relevant context** from previous sessions
5. **Include error messages** if troubleshooting

---

## Common Tasks & Context

### Adding a New Feature
```
**Current Goal:** Add [feature name] to [module]
**Context:** [Why this feature is needed]
**Expected Outcome:** [What should happen]
```

### Fixing a Bug
```
**Current Goal:** Fix [bug description]
**Context:** [When/where the bug occurs]
**Error/Issue:** [Error message or unexpected behavior]
**Expected Behavior:** [What should happen]
```

### Optimizing Performance
```
**Current Goal:** Optimize [component/page/API]
**Context:** [Current performance issue]
**Metrics:** [Current vs target performance]
**Expected Outcome:** [Performance improvement goal]
```

### Refactoring Code
```
**Current Goal:** Refactor [component/module]
**Context:** [Why refactoring is needed]
**Current Issues:** [Problems with current implementation]
**Expected Outcome:** [Improved structure/performance]
```

---

**Last Updated**: 2026-01-28
