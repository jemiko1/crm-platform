# CRM Platform - Performance Optimization Implementation Plan

**Created**: 2026-01-15
**Status**: Ready to Execute
**Estimated Timeline**: 4-6 weeks (1 developer) or 2-3 weeks (2 developers)
**Expected Performance Gains**: 70-80% faster page loads, 3-5x faster database queries

---

## 📋 OVERVIEW

This plan provides step-by-step instructions for implementing all performance optimizations identified in `PERFORMANCE_ANALYSIS.md`. Each task is self-contained with clear acceptance criteria.

---

## 🚀 WEEK 1: CRITICAL OPTIMIZATIONS (Immediate Impact)

### Task 1.1: Add Missing Database Indexes (2 hours)
**Priority**: 🔴 CRITICAL
**Impact**: 3-5x faster database queries
**Files**: `backend/crm-backend/prisma/schema.prisma`

**Steps**:
1. Open `prisma/schema.prisma`
2. Add the following indexes:

```prisma
model Incident {
  // ... existing fields ...

  @@index([incidentType])
  @@index([incidentNumber])
}

model WorkOrder {
  // ... existing fields ...

  @@index([type])
  @@index([createdAt])
}

model User {
  // ... existing fields ...

  @@index([email])
  @@index([isActive])
}

model PurchaseOrder {
  // ... existing fields ...

  @@index([orderDate])
}

model StockTransaction {
  // ... existing fields ...

  @@index([productId, createdAt])
}
```

3. Generate migration:
```bash
cd backend/crm-backend
npx prisma migrate dev --name add_performance_indexes
```

4. Apply to database:
```bash
npx prisma migrate deploy
```

**Acceptance Criteria**:
- ✅ Migration created successfully
- ✅ Migration applied without errors
- ✅ Test incidents list query - should be 2-3x faster

---

### Task 1.2: Fix Buildings List N+1 Query (3 hours)
**Priority**: 🔴 CRITICAL
**Impact**: 10x fewer queries, 5x faster response
**Files**: `backend/crm-backend/src/buildings/buildings.service.ts`

**Current Code** (Line 54-78):
```typescript
async list() {
  const buildings = await this.prisma.building.findMany({
    orderBy: { coreId: "asc" },
    include: {
      _count: { select: { clientBuildings: true, assets: true, workOrders: true } },
      assets: { select: { type: true } }, // ❌ N+1
    },
  });

  return buildings.map((b) => {
    const products: Record<string, number> = {};
    for (const a of b.assets) products[a.type] = (products[a.type] ?? 0) + 1;
    // ...
  });
}
```

**Optimized Code**:
```typescript
async list() {
  // Fetch buildings with counts
  const buildings = await this.prisma.building.findMany({
    orderBy: { coreId: "asc" },
    include: {
      _count: { select: { clientBuildings: true, assets: true, workOrders: true } },
    },
  });

  // Fetch asset counts by type per building in single query
  const assetCounts = await this.prisma.asset.groupBy({
    by: ['buildingId', 'type'],
    _count: { type: true },
  });

  // Map counts to buildings
  const countsByBuilding = new Map<string, Record<string, number>>();
  for (const ac of assetCounts) {
    if (!countsByBuilding.has(ac.buildingId)) {
      countsByBuilding.set(ac.buildingId, {});
    }
    countsByBuilding.get(ac.buildingId)![ac.type] = ac._count.type;
  }

  return buildings.map((b) => ({
    coreId: b.coreId,
    name: b.name,
    city: b.city,
    address: b.address,
    clientCount: b._count.clientBuildings,
    workOrderCount: b._count.workOrders,
    products: countsByBuilding.get(b.id) ?? {},
    updatedAt: b.updatedAt,
  }));
}
```

**Steps**:
1. Open `backend/crm-backend/src/buildings/buildings.service.ts`
2. Replace the `list()` method with optimized version above
3. Test the endpoint:
```bash
curl http://localhost:3000/v1/buildings
```

**Acceptance Criteria**:
- ✅ Response returns same data structure
- ✅ Query count reduced from N+1 to 2 queries (check Prisma logs)
- ✅ Response time < 100ms for 50 buildings

---

### Task 1.3: Convert Buildings Page to Server Component (4 hours)
**Priority**: 🔴 CRITICAL
**Impact**: 70% faster initial page load
**Files**: `frontend/crm-frontend/src/app/app/buildings/page.tsx`

**Current Structure**:
```
page.tsx (Client Component)
├── "use client"
├── useState, useEffect
└── fetch in client
```

**Target Structure**:
```
page.tsx (Server Component)
├── async function
├── fetch with cache
└── <BuildingsClient> component
```

**Implementation**:

**Step 1**: Create new file `frontend/crm-frontend/src/app/app/buildings/buildings-client.tsx`:
```tsx
"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

const AddBuildingModal = dynamic(() => import("./add-building-modal"), {
  loading: () => <div>Loading...</div>,
});

interface Building {
  coreId: number;
  name: string;
  city: string | null;
  address: string | null;
  clientCount: number;
  workOrderCount: number;
  products: Record<string, number>;
  updatedAt: Date;
}

interface Props {
  initialBuildings: Building[];
}

export default function BuildingsClient({ initialBuildings }: Props) {
  const [q, setQ] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [buildings, setBuildings] = useState(initialBuildings);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return buildings
      .filter((b) => {
        if (!query) return true;
        const hay = [b.coreId, b.name, b.city, b.address]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [buildings, q]);

  const handleBuildingAdded = (newBuilding: Building) => {
    setBuildings((prev) => [newBuilding, ...prev]);
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Buildings</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage your building portfolio ({buildings.length} total)
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Add Building
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search buildings..."
          className="w-full rounded-2xl border border-zinc-300 bg-white px-4 py-2.5 pr-10 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {/* Buildings Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((building) => (
          <Link
            key={building.coreId}
            href={`/app/buildings/${building.coreId}`}
            className="group relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition-all hover:border-emerald-500 hover:shadow-lg"
          >
            <div className="mb-4">
              <div className="text-xs font-medium text-zinc-500">
                Building #{building.coreId}
              </div>
              <h3 className="mt-1 text-lg font-semibold text-zinc-900 group-hover:text-emerald-600">
                {building.name}
              </h3>
              {building.city && (
                <p className="mt-1 text-sm text-zinc-600">{building.city}</p>
              )}
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Clients</span>
                <span className="font-medium text-zinc-900">{building.clientCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-600">Work Orders</span>
                <span className="font-medium text-zinc-900">{building.workOrderCount}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Modal */}
      {showAddModal && (
        <AddBuildingModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleBuildingAdded}
        />
      )}
    </div>
  );
}
```

**Step 2**: Update `frontend/crm-frontend/src/app/app/buildings/page.tsx`:
```tsx
import BuildingsClient from "./buildings-client";

interface Building {
  coreId: number;
  name: string;
  city: string | null;
  address: string | null;
  clientCount: number;
  workOrderCount: number;
  products: Record<string, number>;
  updatedAt: Date;
}

async function getBuildings(): Promise<Building[]> {
  const res = await fetch("http://localhost:3000/v1/buildings", {
    credentials: "include",
    next: { revalidate: 300 }, // Cache for 5 minutes
  });

  if (!res.ok) {
    throw new Error("Failed to fetch buildings");
  }

  return res.json();
}

export default async function BuildingsPage() {
  const buildings = await getBuildings();

  return <BuildingsClient initialBuildings={buildings} />;
}
```

**Step 3**: Create error and loading boundaries:

Create `frontend/crm-frontend/src/app/app/buildings/loading.tsx`:
```tsx
export default function Loading() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-emerald-600 border-r-transparent"></div>
        <p className="mt-4 text-sm text-zinc-600">Loading buildings...</p>
      </div>
    </div>
  );
}
```

Create `frontend/crm-frontend/src/app/app/buildings/error.tsx`:
```tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-zinc-900">Something went wrong!</h2>
        <p className="mt-2 text-sm text-zinc-600">{error.message}</p>
        <button
          onClick={reset}
          className="mt-4 rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
```

**Acceptance Criteria**:
- ✅ Page loads with data on first render (no loading spinner)
- ✅ View source shows building data in HTML
- ✅ Lighthouse Performance score increases by 20+ points
- ✅ Search and modal still work correctly

---

### Task 1.4: Fix Building Detail Page Sequential API Calls (2 hours)
**Priority**: 🔴 CRITICAL
**Impact**: 4x faster page load
**Files**: `frontend/crm-frontend/src/app/app/buildings/[buildingId]/page.tsx`

**Current Code** (Lines 143-175):
```tsx
// ❌ Sequential - 400ms total
const buildingsRes = await fetch("http://localhost:3000/v1/buildings", ...);
const assetsRes = await fetch(`http://localhost:3000/v1/buildings/${buildingId}/assets`, ...);
const clientsRes = await fetch(`http://localhost:3000/v1/buildings/${buildingId}/clients`, ...);
const incidentsRes = await fetch(`http://localhost:3000/v1/buildings/${buildingId}/incidents`, ...);
```

**Optimized Code**:
```tsx
// ✅ Parallel - 100ms total
const [buildingsData, assetsData, clientsData, incidentsData] = await Promise.all([
  fetch("http://localhost:3000/v1/buildings", {
    credentials: "include",
    next: { revalidate: 300 },
  }).then(r => r.json()),
  fetch(`http://localhost:3000/v1/buildings/${buildingId}/assets`, {
    credentials: "include",
    next: { revalidate: 60 },
  }).then(r => r.json()),
  fetch(`http://localhost:3000/v1/buildings/${buildingId}/clients`, {
    credentials: "include",
    next: { revalidate: 60 },
  }).then(r => r.json()),
  fetch(`http://localhost:3000/v1/buildings/${buildingId}/incidents?page=1&pageSize=10`, {
    credentials: "include",
    cache: "no-store", // Incidents change frequently
  }).then(r => r.json()),
]);
```

**Steps**:
1. Open `frontend/crm-frontend/src/app/app/buildings/[buildingId]/page.tsx`
2. Find the useEffect block with 4 sequential fetches (around line 143-175)
3. Replace with the parallel Promise.all version above
4. Test the page load time in DevTools Network tab

**Acceptance Criteria**:
- ✅ All 4 requests fire simultaneously (check Network tab)
- ✅ Page load time reduced by 50-75%
- ✅ All data displays correctly

---

### Task 1.5: Replace Hardcoded API URLs with Centralized Client (3 hours)
**Priority**: 🔴 CRITICAL
**Impact**: Better error handling, easier maintenance
**Files**: 21 files across frontend

**Implementation Strategy**:

**Step 1**: Update `lib/api.ts` to support caching:
```typescript
export async function apiGet<T>(
  path: string,
  init?: RequestInit & { next?: { revalidate?: number } }
): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    credentials: "include",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(error.message || "API request failed", res.status, error);
  }

  return res.json();
}
```

**Step 2**: Replace hardcoded URLs in priority order:

1. **Buildings pages**:
```tsx
// BEFORE
const res = await fetch("http://localhost:3000/v1/buildings", ...);

// AFTER
import { apiGet } from "@/lib/api";
const buildings = await apiGet<Building[]>("/v1/buildings", {
  next: { revalidate: 300 },
});
```

2. **Incidents pages**:
```tsx
// BEFORE
const res = await fetch(`http://localhost:3000/v1/incidents?...`, ...);

// AFTER
const incidents = await apiGet<IncidentResponse>(`/v1/incidents?${params}`, {
  next: { revalidate: 60 },
});
```

3. **All modal components** (use existing apiPost, apiPatch):
```tsx
// Example: AddBuildingModal
await apiPost("/v1/admin/buildings", {
  name: formData.name,
  city: formData.city,
  address: formData.address,
});
```

**Files to Update** (in order):
1. ✅ `app/buildings/page.tsx`
2. ✅ `app/buildings/[buildingId]/page.tsx`
3. ✅ `app/clients/page.tsx`
4. ✅ `app/incidents/page.tsx`
5. ✅ `app/inventory/page.tsx`
6. ✅ `app/work-orders/page.tsx`
7. ✅ All modal files (15 files)

**Acceptance Criteria**:
- ✅ All pages use apiGet/apiPost/apiPatch/apiDelete
- ✅ No hardcoded "http://localhost:3000" found in codebase
- ✅ All pages work correctly
- ✅ Error messages are consistent

---

## 🟡 WEEK 2: HIGH PRIORITY OPTIMIZATIONS

### Task 2.1: Lazy Load Modal Components (2 hours)
**Priority**: 🟡 HIGH
**Impact**: 30-40% smaller initial bundle
**Files**: All page components with modals

**Implementation**:

```tsx
// BEFORE
import AddBuildingModal from "./add-building-modal";

// AFTER
import dynamic from "next/dynamic";

const AddBuildingModal = dynamic(() => import("./add-building-modal"), {
  loading: () => <div className="text-sm text-zinc-600">Loading...</div>,
  ssr: false, // Modals don't need SSR
});
```

**Files to Update**:
1. `app/buildings/page.tsx`
2. `app/buildings/[buildingId]/page.tsx` (3 modals)
3. `app/incidents/page.tsx`
4. `app/inventory/page.tsx` (4 modals)
5. `app/employees/page.tsx`
6. `app/admin/positions/page.tsx` (2 modals)
7. `app/admin/role-groups/page.tsx` (2 modals)

**Acceptance Criteria**:
- ✅ Modals load on-demand (check Network tab - should load only when opened)
- ✅ Bundle size reduced by 30%+ (run `npm run build` and compare)
- ✅ Modal functionality unchanged

---

### Task 2.2: Fix WorkOrder Service Sequential Lookups (2 hours)
**Priority**: 🟡 HIGH
**Impact**: 2x faster work order creation
**Files**: `backend/crm-backend/src/work-orders/work-orders.service.ts`

**Current Code** (Lines 17-39):
```typescript
async create(dto: CreateWorkOrderDto) {
  // ❌ Sequential
  const buildingId = await this.buildings.internalId(dto.buildingId);

  let assetId: string | null = null;
  if (dto.assetId) {
    assetId = await this.assets.internalId(dto.assetId);
    const asset = await this.prisma.asset.findUnique({ ... });
  }
}
```

**Optimized Code**:
```typescript
async create(dto: CreateWorkOrderDto) {
  // ✅ Parallel validation
  const [building, asset] = await Promise.all([
    this.prisma.building.findUnique({
      where: { coreId: dto.buildingId },
      select: { id: true },
    }),
    dto.assetId
      ? this.prisma.asset.findUnique({
          where: { coreId: dto.assetId },
          select: { id: true, buildingId: true },
        })
      : null,
  ]);

  if (!building) {
    throw new NotFoundException(`Building with coreId ${dto.buildingId} not found`);
  }

  if (dto.assetId && (!asset || asset.buildingId !== building.id)) {
    throw new BadRequestException("Asset not found or doesn't belong to building");
  }

  return this.prisma.workOrder.create({
    data: {
      buildingId: building.id,
      assetId: asset?.id ?? null,
      type: dto.type,
      status: "NEW",
      title: dto.title,
      notes: dto.notes ?? null,
    },
    include: {
      building: { select: { coreId: true, name: true } },
      asset: { select: { coreId: true, name: true, type: true } },
    },
  });
}
```

**Steps**:
1. Open `backend/crm-backend/src/work-orders/work-orders.service.ts`
2. Replace `create()` method
3. Test work order creation endpoint
4. Remove the now-unused `buildingId` and `assetId` helper methods from BuildingsService and AssetsService (optional)

**Acceptance Criteria**:
- ✅ Work order creation still validates correctly
- ✅ Query count reduced from 3-4 to 1-2
- ✅ Response time improved by 50%+

---

### Task 2.3: Optimize Incidents N+1 Query (3 hours)
**Priority**: 🟡 HIGH
**Impact**: 5x faster incidents list
**Files**: `backend/crm-backend/src/incidents/incidents.service.ts`

**Current Code** (Lines 51-76):
```typescript
this.prisma.incident.findMany({
  where,
  include: {
    building: true,
    client: true,
    reportedBy: {
      include: {
        employee: { ... }, // ❌ Deep nesting
      },
    },
    incidentAssets: { include: { asset: true } }, // ❌ N+1
  },
})
```

**Optimized Code**:
```typescript
this.prisma.incident.findMany({
  where,
  select: {
    id: true,
    incidentNumber: true,
    status: true,
    priority: true,
    incidentType: true,
    contactMethod: true,
    description: true,
    createdAt: true,
    updatedAt: true,
    building: {
      select: {
        coreId: true,
        name: true,
      },
    },
    client: {
      select: {
        coreId: true,
        firstName: true,
        lastName: true,
      },
    },
    reportedBy: {
      select: {
        email: true,
        employee: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    },
    incidentAssets: {
      select: {
        asset: {
          select: {
            name: true,
          },
        },
      },
    },
  },
})
```

**Benefits**:
- Only selects needed fields (reduces data transfer)
- Flatter structure (less nested queries)
- Prisma can better optimize the SQL

**Acceptance Criteria**:
- ✅ Same response structure
- ✅ Query time reduced by 50%+
- ✅ Check Prisma logs - should see optimized SELECT statements

---

### Task 2.4: Add React Memoization to List Components (3 hours)
**Priority**: 🟡 HIGH
**Impact**: 50% fewer re-renders
**Files**: List item components across frontend

**Pattern to Apply**:

```tsx
// BEFORE
function BuildingCard({ building }) {
  return (
    <div onClick={() => navigate(`/buildings/${building.id}`)}>
      {/* ... */}
    </div>
  );
}

// AFTER
import { memo, useCallback } from "react";

const BuildingCard = memo(function BuildingCard({ building, onNavigate }) {
  const handleClick = useCallback(() => {
    onNavigate(building.id);
  }, [building.id, onNavigate]);

  return (
    <div onClick={handleClick}>
      {/* ... */}
    </div>
  );
});

// In parent component
const handleNavigate = useCallback((id: number) => {
  router.push(`/buildings/${id}`);
}, [router]);
```

**Components to Memoize**:
1. Building list items
2. Client list items
3. Incident list items
4. Work order list items
5. Inventory product items
6. Employee list items

**Acceptance Criteria**:
- ✅ Use React DevTools Profiler to verify fewer re-renders
- ✅ Search/filter actions don't re-render unaffected items
- ✅ Functionality unchanged

---

### Task 2.5: Convert Remaining Pages to Server Components (4 hours)
**Priority**: 🟡 HIGH
**Impact**: Consistent performance across all pages

**Pages to Convert**:
1. ✅ `app/clients/page.tsx`
2. ✅ `app/incidents/page.tsx`
3. ✅ `app/work-orders/page.tsx`
4. ✅ `app/inventory/page.tsx`
5. ✅ `app/employees/page.tsx`

Follow the same pattern as Task 1.3 for each page:
- Create `{page}-client.tsx` for interactive parts
- Make `page.tsx` an async Server Component
- Add `loading.tsx` and `error.tsx`
- Implement proper caching strategy

**Acceptance Criteria**:
- ✅ All list pages are Server Components
- ✅ All pages have loading/error boundaries
- ✅ Lighthouse Performance 90+ on all pages

---

## 🟢 WEEK 3: MEDIUM PRIORITY OPTIMIZATIONS

### Task 3.1: Move Filtering to Backend (4 hours)
**Priority**: 🟢 MEDIUM
**Impact**: Instant search on large datasets

Implement backend search with debouncing for:
1. Incidents search (text fields)
2. Buildings search (name, city)
3. Clients search (name, phone)
4. Employees search (name, email)

**Implementation**: See PERFORMANCE_ANALYSIS.md section 5 for details.

---

### Task 3.2: Add Pagination to Clients Endpoint (2 hours)
**Priority**: 🟢 MEDIUM
**Impact**: Scalability for 1000+ clients

Update `backend/crm-backend/src/clients/clients.service.ts:71-110` to add pagination parameters.

---

### Task 3.3: Optimize Inventory FIFO Batch Operations (4 hours)
**Priority**: 🟢 MEDIUM
**Impact**: 10x faster stock deductions

Refactor `backend/crm-backend/src/inventory/inventory.service.ts:356-428` to use batch operations.

---

### Task 3.4: Add Bundle Analyzer (1 hour)
**Priority**: 🟢 MEDIUM
**Impact**: Visibility into bundle size

```bash
npm install --save-dev @next/bundle-analyzer
```

Update `next.config.ts`:
```typescript
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // existing config
});
```

---

### Task 3.5: Add Performance Monitoring (2 hours)
**Priority**: 🟢 MEDIUM
**Impact**: Track improvements

Create `frontend/crm-frontend/src/lib/performance.ts`:
```typescript
export function reportWebVitals(metric: any) {
  console.log(metric);
  // Send to analytics service (e.g., Vercel Analytics, Google Analytics)
}
```

---

## 🔵 WEEK 4: LOW PRIORITY (Polish)

### Task 4.1: Virtual Scrolling for Large Lists (3 hours)
Use `@tanstack/react-virtual` for inventory products, incidents lists.

### Task 4.2: Configure Prisma Connection Pooling (1 hour)
Update DATABASE_URL with connection limits.

### Task 4.3: Add Prefetching for Common Routes (2 hours)
Use Next.js `<Link prefetch>` for navigation.

### Task 4.4: Implement Request Deduplication (2 hours)
Use SWR or React Query for client-side caching.

---

## 📊 TESTING & VALIDATION

After each week, run these tests:

### Performance Tests
```bash
# Frontend
npm run build
npm run analyze

# Lighthouse audit
npx lighthouse http://localhost:3002/app/buildings --view

# Backend
# Check Prisma query logs
```

### Functional Tests
- ✅ All CRUD operations work
- ✅ Authentication works
- ✅ Permissions enforced
- ✅ No console errors

### Performance Benchmarks
| Metric | Before | Target | Actual |
|--------|--------|--------|--------|
| Buildings page load | 2.5s | 0.8s | ___ |
| Incidents query (100 items) | 500ms | 100ms | ___ |
| Database queries per request | 15+ | 3-5 | ___ |
| Lighthouse Performance | 65 | 90+ | ___ |
| Bundle size | 800KB | 500KB | ___ |

---

## 🛠️ DAILY WORKFLOW

### Starting Tomorrow's Session

1. **Pull latest changes**:
```bash
git pull origin master
cd backend/crm-backend && git pull origin master && cd ../..
```

2. **Review plan**:
```bash
# Open this file
code OPTIMIZATION_IMPLEMENTATION_PLAN.md
```

3. **Pick next task**: Start with Week 1, Task 1.1

4. **Implementation cycle**:
- Read task description
- Make changes
- Test locally
- Commit with descriptive message
- Move to next task

5. **End of day**:
- Commit all changes
- Update this file with checkmarks ✅
- Push to repository

---

## 📝 COMMIT MESSAGE CONVENTIONS

Use clear, descriptive commit messages:

```bash
# Good examples
git commit -m "perf(db): Add indexes for incident and work order queries"
git commit -m "perf(frontend): Convert buildings page to server component"
git commit -m "refactor(buildings): Fix N+1 query in list endpoint"
git commit -m "feat(inventory): Optimize FIFO batch operations"

# Bad examples
git commit -m "fix stuff"
git commit -m "updates"
```

---

## 🚨 TROUBLESHOOTING

### If migration fails:
```bash
npx prisma migrate reset
npx prisma migrate dev
```

### If build fails:
```bash
rm -rf .next
npm run build
```

### If Prisma client out of sync:
```bash
npx prisma generate
```

---

## 📞 QUESTIONS TO ASK ME TOMORROW

When you start working tomorrow, ask me:

1. "Should I start with Week 1, Task 1.1 (database indexes)?"
2. "Do you want me to commit after each task, or batch commits?"
3. "Should I run the full test suite after each change, or at the end of each week?"
4. "Are there any specific pages you want me to prioritize?"

---

## ✅ PROGRESS TRACKER

### Week 1: CRITICAL
- [ ] Task 1.1: Add Database Indexes
- [ ] Task 1.2: Fix Buildings N+1 Query
- [ ] Task 1.3: Convert Buildings to Server Component
- [ ] Task 1.4: Parallelize Building Detail Fetches
- [ ] Task 1.5: Replace Hardcoded URLs

### Week 2: HIGH
- [ ] Task 2.1: Lazy Load Modals
- [ ] Task 2.2: Fix WorkOrder Sequential Lookups
- [ ] Task 2.3: Optimize Incidents Query
- [ ] Task 2.4: Add React Memoization
- [ ] Task 2.5: Convert Remaining Pages

### Week 3: MEDIUM
- [ ] Task 3.1: Backend Search/Filtering
- [ ] Task 3.2: Clients Pagination
- [ ] Task 3.3: Inventory FIFO Optimization
- [ ] Task 3.4: Bundle Analyzer
- [ ] Task 3.5: Performance Monitoring

### Week 4: LOW
- [ ] Task 4.1: Virtual Scrolling
- [ ] Task 4.2: Connection Pooling
- [ ] Task 4.3: Route Prefetching
- [ ] Task 4.4: Request Deduplication

---

**Ready to start optimizing tomorrow! 🚀**

Get a good rest tonight. Tomorrow we'll make this CRM platform blazing fast! ⚡
