# AI Development Context - CRM Platform

**Purpose**: This document provides essential context for AI development tools working on this codebase.
**Last Updated**: 2026-01-15
**Current State**: Buildings, Clients, and Incidents modules complete with performance optimizations

---

## Quick Start for AI Tools

### Before Making Changes

1. **Read these files first:**
   - `PROJECT_SNAPSHOT.md` - Overall architecture and structure
   - `DEVELOPMENT_GUIDELINES.md` - Coding patterns and best practices
   - `PERFORMANCE_ANALYSIS.md` - Known performance issues and solutions
   - `API_ROUTE_MAP.md` - Backend API endpoint reference
   - `FRONTEND_ROUTE_MAP.md` - Frontend page structure

2. **Key repositories:**
   - Main: `C:\CRM-Platform\`
   - Backend: `C:\CRM-Platform\backend\crm-backend\` (Git submodule)
   - Frontend: `C:\CRM-Platform\frontend\crm-frontend\`

3. **Servers:**
   - Backend: `http://localhost:3000` (NestJS)
   - Frontend: `http://localhost:3002` (Next.js)

---

## Architecture Quick Reference

### Tech Stack
- **Backend**: NestJS + PostgreSQL + Prisma ORM
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS v4
- **Auth**: JWT tokens in httpOnly cookies
- **Ports**: Backend 3000, Frontend 3002

### Key Design Decisions

1. **Dual ID System**:
   - Internal UUID (`id`) for database relations
   - User-facing integer (`coreId`) for API and UI
   - Always use `coreId` in frontend, convert to `id` in backend

2. **RBAC System**:
   - Position-based permissions (Position → RoleGroup → Permissions)
   - Legacy: `User.role` enum + `isSuperAdmin` flag (kept for compatibility)

3. **Modals**:
   - MUST use `createPortal` to `document.body`
   - MUST have `mounted` state check for SSR
   - See `DEVELOPMENT_GUIDELINES.md` for complete pattern

4. **API Client**:
   - ALWAYS use centralized `apiGet/apiPost/apiPatch/apiDelete` from `@/lib/api`
   - NEVER hardcode `http://localhost:3000`

---

## Performance Guidelines (CRITICAL)

### Backend - Avoid N+1 Queries

**❌ NEVER do this:**
```typescript
const items = await this.prisma.item.findMany({
  include: { relatedItems: true }  // Loads all related data
});

return items.map(item => {
  // Counting in application code = N+1
  const count = item.relatedItems.length;
  return { ...item, count };
});
```

**✅ ALWAYS do this:**
```typescript
// Fetch items
const items = await this.prisma.item.findMany({
  include: { _count: { select: { relatedItems: true } } }
});

// Separate aggregation query if needed
const aggregates = await this.prisma.relatedItem.groupBy({
  by: ['itemId', 'type'],
  _count: { type: true },
});

// Map efficiently
const countsMap = new Map();
for (const agg of aggregates) {
  countsMap.set(agg.itemId, agg._count.type);
}

return items.map(item => ({
  ...item,
  count: countsMap.get(item.id) ?? 0,
}));
```

### Frontend - Parallelize API Calls

**❌ NEVER do this:**
```typescript
const buildings = await fetch("/v1/buildings").then(r => r.json());
const assets = await fetch("/v1/assets").then(r => r.json());
const clients = await fetch("/v1/clients").then(r => r.json());
// Sequential = 300ms total
```

**✅ ALWAYS do this:**
```typescript
import { apiGet } from "@/lib/api";

const [buildings, assets, clients] = await Promise.all([
  apiGet<Building[]>("/v1/buildings"),
  apiGet<Asset[]>("/v1/assets"),
  apiGet<Client[]>("/v1/clients"),
]);
// Parallel = 100ms total
```

### Database Indexes

**ALWAYS add indexes for:**
- Foreign keys used in JOINs
- Fields in WHERE clauses
- Fields in ORDER BY
- Search fields
- Common filter combinations (compound indexes)

---

## Common Patterns

### Creating a New Module

1. **Backend** (`backend/crm-backend/src/{module}/`):
   ```
   {module}/
   ├── dto/
   │   ├── create-{entity}.dto.ts
   │   └── update-{entity}.dto.ts
   ├── {module}.controller.ts
   ├── {module}.service.ts
   └── {module}.module.ts
   ```

2. **Frontend** (`frontend/crm-frontend/src/app/app/{module}/`):
   ```
   {module}/
   ├── page.tsx                    (List view - "use client")
   ├── [id]/
   │   └── page.tsx               (Detail view)
   ├── add-{entity}-modal.tsx
   └── edit-{entity}-modal.tsx
   ```

3. **Update routing**:
   - Backend: Add controller to `app.module.ts`
   - Frontend: Add navigation link in `sidebar-nav.tsx`

### Adding a Modal

1. Use modal pattern from `DEVELOPMENT_GUIDELINES.md`
2. Import with `dynamic` for lazy loading:
   ```typescript
   const AddModal = dynamic(() => import("./add-modal"), {
     loading: () => <div>Loading...</div>,
     ssr: false,
   });
   ```
3. Support context presets (e.g., `presetBuilding`, `lockBuilding`)

### Context-Aware Features

When creating from a specific context (e.g., incident from building page):
1. Pass preset data via props
2. Use lock flag to skip selection step
3. Auto-fill form data in `useEffect`

Example:
```typescript
<CreateModal
  presetParent={parent}
  lockParent={true}
  onSuccess={() => refreshList()}
/>
```

---

## Performance Checklist

Before committing, verify:

- [ ] ✅ No N+1 queries (check Prisma logs)
- [ ] ✅ Independent queries use `Promise.all`
- [ ] ✅ Database indexes on filtered/sorted fields
- [ ] ✅ API calls use `apiGet/apiPost/apiPatch/apiDelete`
- [ ] ✅ Parallel frontend API calls where applicable
- [ ] ✅ Appropriate caching (`revalidate` vs `no-store`)
- [ ] ✅ List components use `React.memo()`
- [ ] ✅ Modals lazy loaded with `dynamic`
- [ ] ✅ Heavy filtering moved to backend with debounce
- [ ] ✅ No hardcoded `http://localhost:3000`

---

## Known Issues & Gotchas

1. **Dual ID System**: Always use `coreId` in frontend/API, `id` internally
2. **Cookie Auth**: Always include `credentials: "include"` (handled by `apiGet`)
3. **Prisma Types**: Run `npx prisma generate` after schema changes
4. **Next.js Cache**: Clear `.next` folder if seeing stale code
5. **Git Submodule**: Backend is a submodule, update separately

---

## Testing Workflow

1. **Backend**:
   ```bash
   cd backend/crm-backend
   npm run start:dev
   ```

2. **Frontend**:
   ```bash
   cd frontend/crm-frontend
   npm run dev
   ```

3. **Database**:
   ```bash
   cd backend/crm-backend
   npx prisma migrate dev
   npx prisma studio  # Visual DB editor
   ```

---

## Performance Optimization Status

**Completed (2026-01-15):**
- ✅ Buildings N+1 query → groupBy aggregation (10x faster)
- ✅ Parallel API calls in building detail (4x faster)
- ✅ Centralized API client implementation
- ✅ Database indexes added (migration pending)
- ✅ TypeScript errors fixed

**Pending (See `OPTIMIZATION_IMPLEMENTATION_PLAN.md`):**
- ⏳ Convert pages to Server Components
- ⏳ Replace remaining hardcoded URLs
- ⏳ Add React memoization to list components
- ⏳ Implement backend filtering with debounce
- ⏳ Add virtual scrolling for large lists

**Deferred (End of Project):**
- ⏸️ Apply database migration for indexes

---

## Reference Implementations

**Best Examples to Follow:**

**Backend:**
- `backend/crm-backend/src/buildings/buildings.service.ts`
  → groupBy aggregation, avoiding N+1
- `backend/crm-backend/src/work-orders/work-orders.service.ts`
  → parallel validation with Promise.all

**Frontend:**
- `frontend/crm-frontend/src/app/app/buildings/[buildingId]/page.tsx`
  → parallel API calls, centralized API client
- `frontend/crm-frontend/src/app/app/incidents/report-incident-modal.tsx`
  → context-aware modal with presets
- `frontend/crm-frontend/src/lib/api.ts`
  → centralized API client pattern

---

## Git Workflow

```bash
# Frontend changes
cd frontend/crm-frontend
git add .
git commit -m "feat: description"
git push origin master

# Backend changes (submodule)
cd backend/crm-backend
git add .
git commit -m "feat: description"
git push origin master

# Update main repo reference
cd ../..
git add backend/crm-backend
git commit -m "Update backend submodule reference"
git push origin master
```

---

## Emergency Troubleshooting

### Backend won't start
```bash
cd backend/crm-backend
rm -rf node_modules dist
npm install
npx prisma generate
npm run build
npm run start:dev
```

### Frontend won't compile
```bash
cd frontend/crm-frontend
rm -rf .next node_modules
npm install
npm run dev
```

### Database issues
```bash
cd backend/crm-backend
npx prisma migrate reset --force  # WARNING: Deletes all data
npx prisma migrate dev
npx prisma db seed  # If seed files exist
```

---

## Contact Points

- **Architecture Questions**: See `PROJECT_SNAPSHOT.md`
- **Coding Patterns**: See `DEVELOPMENT_GUIDELINES.md`
- **Performance Issues**: See `PERFORMANCE_ANALYSIS.md`
- **API Routes**: See `API_ROUTE_MAP.md`
- **Frontend Routes**: See `FRONTEND_ROUTE_MAP.md`

---

**Remember**: This codebase prioritizes performance and maintainability. Follow the patterns, avoid anti-patterns, and document new conventions as you discover them.

Good luck! 🚀
