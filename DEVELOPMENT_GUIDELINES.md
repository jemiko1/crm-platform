# CRM Platform - Development Guidelines

This document contains guidelines and best practices for developing features in the CRM Platform. Follow these patterns to ensure consistency and maintainability.

---

## Table of Contents

1. [Dynamic List Items (Dropdowns/Enums)](#dynamic-list-items-dropdownsenums)
2. [Modal/Popup Implementation](#modalpopup-implementation)
3. [Future Guidelines](#future-guidelines)

---

## Dynamic List Items (Dropdowns/Enums)

### Overview

**CRITICAL:** All dropdown values, categories, and enum-like lists MUST be fetched dynamically from the SystemLists API. **NEVER hardcode dropdown options** as this prevents administrators from managing values without code deployments.

### ❌ INCORRECT - Hardcoded Lists (DO NOT DO THIS)

```tsx
// BAD - Hardcoded values
const CATEGORIES = [
  { value: "ROUTER", label: "Router" },
  { value: "CONTROLLER", label: "Controller" },
];

<select>
  {CATEGORIES.map((cat) => (
    <option key={cat.value} value={cat.value}>
      {cat.label}
    </option>
  ))}
</select>
```

### ✅ CORRECT - Dynamic Lists (ALWAYS DO THIS)

```tsx
"use client";

import { useListItems } from "@/hooks/useListItems";

export default function YourComponent() {
  // Fetch dynamic list items by category code
  const { items: categories, loading } = useListItems("PRODUCT_CATEGORY");

  return (
    <select disabled={loading}>
      {loading ? (
        <option>Loading...</option>
      ) : (
        categories.map((cat) => (
          <option key={cat.id} value={cat.value}>
            {cat.displayName}
          </option>
        ))
      )}
    </select>
  );
}
```

### Available List Categories

Use these exact category codes with `useListItems()`:

#### User-Editable Lists (Admins can modify)
- `ASSET_TYPE` - Building asset/product types (ELEVATOR, INTERCOM, etc.)
- `CONTACT_METHOD` - How incidents are reported (PHONE, EMAIL, etc.)
- `INCIDENT_TYPE` - Types of incidents (Hardware Failure, etc.)
- `INCIDENT_PRIORITY` - Incident severity (LOW, MEDIUM, HIGH, CRITICAL) - includes colors
- `PRODUCT_CATEGORY` - Inventory categories (ROUTER, SENSOR, etc.)
- `PRODUCT_UNIT` - Measurement units (PIECE, METER, KG, etc.)
- `WORK_ORDER_TYPE` - Work order categories (INSTALL, REPAIR, etc.)

#### System-Managed Lists (Read-only for admins)
- `WORK_ORDER_STATUS` - Work order lifecycle states - includes colors
- `INCIDENT_STATUS` - Incident lifecycle states - includes colors
- `DEVICE_STATUS` - Asset monitoring status - includes colors
- `PURCHASE_ORDER_STATUS` - Purchase order states - includes colors
- `STOCK_TRANSACTION_TYPE` - Inventory transaction types

### useListItems Hook API

```tsx
import { useListItems } from "@/hooks/useListItems";

const {
  items,        // ListItem[] - Filtered active items, sorted by sortOrder
  loading,      // boolean - Loading state
  error,        // string | null - Error message
  refresh,      // () => Promise<void> - Manually refresh the list
} = useListItems(categoryCode, fetchOnMount);

// ListItem type:
type ListItem = {
  id: string;
  value: string;          // Backend value (e.g., "ELEVATOR")
  displayName: string;    // UI label (e.g., "Elevator")
  isActive: boolean;      // Always true (inactive items filtered out)
  isDefault: boolean;     // True if this is the default selection
  sortOrder: number;      // Display order
  colorHex?: string;      // Optional color (for priorities/statuses)
  icon?: string;          // Optional icon/emoji
};
```

### Using Colors (Priorities/Statuses)

For items with colors (priorities, statuses), use the `colorHex` field:

```tsx
const { items: priorities } = useListItems("INCIDENT_PRIORITY");

<div className="grid grid-cols-4 gap-2">
  {priorities.map((priority) => (
    <button
      key={priority.id}
      style={{
        backgroundColor: `${priority.colorHex}20`,  // 20% opacity
        borderColor: priority.colorHex,
        color: priority.colorHex,
      }}
    >
      {priority.displayName}
    </button>
  ))}
</div>
```

### Setting Default Values

```tsx
useEffect(() => {
  if (!loading && items.length > 0) {
    const defaultItem = items.find((i) => i.isDefault) || items[0];
    setFormData((prev) => ({ ...prev, fieldName: defaultItem.value }));
  }
}, [loading, items]);
```

### When Creating New Forms

**ALWAYS check if the form uses ANY dropdown/enum values:**

1. Identify all dropdown fields
2. Check if there's a corresponding SystemList category (see list above)
3. Use `useListItems()` to fetch the values
4. If creating a NEW type of dropdown:
   - Add the category to SystemLists via migration
   - Seed initial values
   - Update this documentation
   - Use the hook in your component

### Adding New List Categories

If you need to create a new dropdown category:

1. **Update Prisma Schema:**
```prisma
// No schema changes needed - use existing SystemListCategory/SystemListItem
```

2. **Create Seed Data:** (in `prisma/seed-system-lists.ts`)
```typescript
{
  code: 'YOUR_CATEGORY',
  name: 'Your Category Name',
  description: 'Description of what this is for',
  tableName: 'YourModel',  // Which database table uses this
  fieldName: 'yourField',   // Which field in that table
  isUserEditable: true,     // Can admins edit this?
  sortOrder: 10,
  items: [
    { value: 'VALUE_1', displayName: 'Value 1', sortOrder: 1, isDefault: true },
    { value: 'VALUE_2', displayName: 'Value 2', sortOrder: 2 },
  ],
}
```

3. **Run Migration & Seed:**
```bash
cd backend/crm-backend
npx prisma migrate dev --name add_your_category
npx ts-node prisma/seed-system-lists.ts
```

4. **Update This Documentation:** Add your category code to the list above.

5. **Use in Components:**
```tsx
const { items } = useListItems("YOUR_CATEGORY");
```

### Benefits

✅ **No Code Deployments** - Admins modify values via UI
✅ **Consistent Naming** - Changes reflect everywhere instantly
✅ **No Duplicates** - Single source of truth
✅ **Sortable** - Admins control display order
✅ **Deactivation** - Hide without deleting historical data
✅ **Default Values** - Auto-select preferred options
✅ **Colors/Icons** - Visual indicators for priorities/statuses

---

## Modal/Popup Implementation

### Overview

All modals and popups in the CRM Platform must be properly centered in the viewport and rendered using React's `createPortal` to avoid positioning issues caused by parent container styles (overflow, transforms, etc.).

### ✅ Correct Implementation Pattern

**Always use this pattern for new modals:**

```tsx
"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";

export default function YourModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // CRITICAL: Mount check for client-side rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // CRITICAL: Return null if not mounted or not open
  if (!open || !mounted) return null;

  // CRITICAL: Wrap modal content in a variable
  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Modal Title
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Optional subtitle
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
                aria-label="Close"
              >
                {/* Close icon */}
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Your form/content here */}
          </div>
        </div>
      </div>
    </div>
  );

  // CRITICAL: Use createPortal to render to document.body
  return createPortal(modalContent, document.body);
}
```

### Key Requirements

1. **Import `createPortal`**: Always import from `react-dom`
   ```tsx
   import { createPortal } from "react-dom";
   ```

2. **Mounted State**: Always include a `mounted` state check
   ```tsx
   const [mounted, setMounted] = useState(false);
   
   useEffect(() => {
     setMounted(true);
   }, []);
   ```

3. **Early Return**: Check both `open` and `mounted` before rendering
   ```tsx
   if (!open || !mounted) return null;
   ```

4. **Portal Structure**: Use this exact structure:
   - Outer container: `fixed inset-0 z-[9999] flex items-center justify-center p-4`
   - Backdrop: `fixed inset-0 bg-black/40 backdrop-blur-sm`
   - Modal wrapper: `relative w-full max-w-{size} max-h-[90vh] overflow-y-auto`
   - Modal content: `w-full max-w-{size} overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200`

5. **Z-Index**: Use `z-[9999]` for the modal container to ensure it's above all other content

6. **Max Width Options**: 
   - Small: `max-w-lg` (512px)
   - Medium: `max-w-2xl` (672px)
   - Large: `max-w-4xl` (896px)

7. **Max Height**: Always use `max-h-[90vh]` to prevent overflow on small screens

8. **Scrollable Content**: Use `overflow-y-auto` on the modal wrapper for long content

9. **Final Return**: Always use `createPortal` to render to `document.body`
   ```tsx
   return createPortal(modalContent, document.body);
   ```

### ❌ Common Mistakes to Avoid

1. **Don't render modals inline** - Always use `createPortal`
2. **Don't forget the `mounted` check** - Required for SSR compatibility
3. **Don't use fragments (`<>`)** - Wrap in a single `div` for the portal
4. **Don't use relative positioning on parent** - Portal to `document.body` avoids this
5. **Don't skip the backdrop** - Always include a clickable backdrop to close
6. **Don't forget `stopPropagation`** - Prevent clicks inside modal from closing it

### Reference Implementation

See these correctly implemented modals for reference:
- `frontend/crm-frontend/src/app/modal-dialog.tsx` - Reusable modal component
- `frontend/crm-frontend/src/app/app/incidents/report-incident-modal.tsx` - Complex multi-step modal
- `frontend/crm-frontend/src/app/app/buildings/add-building-modal.tsx` - Simple form modal
- `frontend/crm-frontend/src/app/app/employees/add-employee-modal.tsx` - Form with dropdowns

### When to Use `ModalDialog` Component

For simple modals with just content, consider using the existing `ModalDialog` component:

```tsx
import ModalDialog from "../../modal-dialog";

<ModalDialog
  open={showModal}
  onClose={() => setShowModal(false)}
  title="Modal Title"
  maxWidth="2xl"
>
  {/* Your content here */}
</ModalDialog>
```

Use custom modal implementation when you need:
- Multi-step forms
- Complex layouts
- Custom header/footer behavior
- Special animations

---

## Known Issues & TODO

### Incident Creation Without Client (2025-01-15)

**Status**: ⚠️ **IN PROGRESS - NEEDS FIX**

**Issue**: When creating an incident without selecting a client (using "Continue without client" option), the backend throws a null constraint violation error.

**Error**: `Null constraint violation on the (not available)` in `incidents.service.ts:234`

**Attempted Fixes**:
1. Made `clientId` nullable in Prisma schema ✅
2. Updated DTO to make `clientId` optional with `@IsOptional()` ✅
3. Added conditional `clientId` inclusion in service (only include if client exists) ⚠️ **Still failing**

**Current State**:
- Frontend: Correctly omits `clientId` from payload when no client selected
- Backend DTO: `clientId` is optional and nullable
- Backend Service: Conditionally includes `clientId` only when client exists
- Database Schema: `clientId` is nullable (`String?`)

**Next Steps**:
- Investigate Prisma client generation - ensure schema changes are reflected
- Check database migration status - verify `clientId` column is actually nullable
- Test with explicit `null` vs omitting field entirely
- Consider using Prisma's `connect` pattern instead of direct `clientId` assignment

**Related Files**:
- `backend/crm-backend/src/incidents/dto/create-incident.dto.ts`
- `backend/crm-backend/src/incidents/incidents.service.ts`
- `backend/crm-backend/prisma/schema.prisma`
- `frontend/crm-frontend/src/app/app/incidents/report-incident-modal.tsx`

---

## Performance Optimization Guidelines

### Overview

This section provides performance best practices learned from optimizing the CRM Platform. Follow these patterns to ensure optimal performance as you build new features.

---

### Backend Performance (NestJS + Prisma)

#### 1. **Avoid N+1 Query Problems**

**❌ BAD - N+1 Query:**
```typescript
// Loads all related data into memory, then counts in application
const buildings = await this.prisma.building.findMany({
  include: {
    assets: { select: { type: true } }, // Loads ALL assets
  },
});

return buildings.map((b) => {
  // Counting in application code
  const products: Record<string, number> = {};
  for (const a of b.assets) products[a.type] = (products[a.type] ?? 0) + 1;
  return { ...b, products };
});
```

**✅ GOOD - Optimized with groupBy:**
```typescript
// Fetch buildings
const buildings = await this.prisma.building.findMany({
  include: {
    _count: { select: { clientBuildings: true, assets: true } },
  },
});

// Single aggregation query
const assetCounts = await this.prisma.asset.groupBy({
  by: ['buildingId', 'type'],
  _count: { type: true },
});

// Map to buildings (O(1) lookup)
const countsByBuilding = new Map<string, Record<string, number>>();
for (const ac of assetCounts) {
  if (!countsByBuilding.has(ac.buildingId)) {
    countsByBuilding.set(ac.buildingId, {});
  }
  countsByBuilding.get(ac.buildingId)![ac.type] = ac._count.type;
}

return buildings.map((b) => ({
  ...b,
  products: countsByBuilding.get(b.id) ?? {},
}));
```

**Impact**: 10x fewer queries, 5-10x faster response time.

---

#### 2. **Use Parallel Queries for Independent Data**

**❌ BAD - Sequential Queries:**
```typescript
// Each query waits for previous to complete
const building = await this.prisma.building.findUnique({ where: { id } });
const asset = await this.prisma.asset.findUnique({ where: { id: assetId } });
const client = await this.prisma.client.findUnique({ where: { id: clientId } });
```

**✅ GOOD - Parallel Queries:**
```typescript
// All queries execute simultaneously
const [building, asset, client] = await Promise.all([
  this.prisma.building.findUnique({ where: { id } }),
  this.prisma.asset.findUnique({ where: { id: assetId } }),
  this.prisma.client.findUnique({ where: { id: clientId } }),
]);
```

**Impact**: 3x faster when queries take 100ms each (300ms → 100ms).

---

#### 3. **Add Database Indexes for Frequently Queried Fields**

**Always add indexes for:**
- Foreign keys used in JOINs
- Fields used in WHERE clauses
- Fields used in ORDER BY
- Unique identifiers beyond the primary key
- Compound indexes for common query patterns

**Example:**
```prisma
model Incident {
  // ... fields ...

  @@index([buildingId])       // Foreign key
  @@index([clientId])         // Foreign key
  @@index([status])           // WHERE filter
  @@index([priority])         // WHERE filter
  @@index([createdAt])        // ORDER BY
  @@index([incidentNumber])   // Search field
  @@index([incidentType])     // Filter field
}

model StockTransaction {
  // ... fields ...

  @@index([productId, createdAt])  // Compound index for common query
}
```

**Impact**: 3-5x faster queries on large datasets.

---

#### 4. **Use Select to Limit Data Transfer**

**❌ BAD - Fetches entire objects:**
```typescript
const incidents = await this.prisma.incident.findMany({
  include: {
    building: true,  // All building fields
    client: true,    // All client fields
  },
});
```

**✅ GOOD - Only fetch needed fields:**
```typescript
const incidents = await this.prisma.incident.findMany({
  select: {
    id: true,
    incidentNumber: true,
    status: true,
    building: {
      select: { coreId: true, name: true },  // Only needed fields
    },
    client: {
      select: { coreId: true, firstName: true, lastName: true },
    },
  },
});
```

**Impact**: Reduces data transfer, faster JSON serialization.

---

### Frontend Performance (Next.js 14)

#### 1. **Use Centralized API Client**

**❌ BAD - Hardcoded URLs:**
```typescript
const res = await fetch("http://localhost:3000/v1/buildings", {
  credentials: "include",
  cache: "no-store",
});
if (!res.ok) throw new Error("Failed");
const data = await res.json();
```

**✅ GOOD - Centralized Client:**
```typescript
import { apiGet } from "@/lib/api";

const data = await apiGet<Building[]>("/v1/buildings", {
  cache: "no-store",
});
```

**Benefits:**
- Single source of truth for API base URL
- Consistent error handling via `ApiError` class
- Easier to add authentication, retry logic, interceptors
- Better TypeScript support

---

#### 2. **Parallelize Independent API Calls**

**❌ BAD - Sequential Fetches (Waterfall):**
```typescript
const buildings = await fetch("/v1/buildings").then(r => r.json());
const assets = await fetch("/v1/assets").then(r => r.json());
const clients = await fetch("/v1/clients").then(r => r.json());
const incidents = await fetch("/v1/incidents").then(r => r.json());
// Total: 400ms (4 × 100ms)
```

**✅ GOOD - Parallel Fetches:**
```typescript
const [buildings, assets, clients, incidents] = await Promise.all([
  apiGet<Building[]>("/v1/buildings"),
  apiGet<Asset[]>("/v1/assets"),
  apiGet<Client[]>("/v1/clients"),
  apiGet<Incident[]>("/v1/incidents"),
]);
// Total: 100ms (all execute simultaneously)
```

**Impact**: 4x faster page load.

---

#### 3. **Implement Proper Caching Strategy**

**❌ BAD - No caching:**
```typescript
fetch(url, {
  cache: "no-store",  // Refetches on every navigation
});
```

**✅ GOOD - Strategic caching:**
```typescript
// Static data (buildings, products) - cache for 5 minutes
apiGet("/v1/buildings", {
  next: { revalidate: 300 },
});

// Dynamic data (incidents, work orders) - cache for 1 minute
apiGet("/v1/incidents", {
  next: { revalidate: 60 },
});

// Real-time data - no cache
apiGet("/v1/live-feed", {
  cache: "no-store",
});
```

**Impact**: 90% reduction in unnecessary network requests.

---

#### 4. **Use React Memoization**

**❌ BAD - Re-renders on every parent render:**
```typescript
function BuildingCard({ building, onClick }) {
  return (
    <div onClick={() => onClick(building.id)}>
      {building.name}
    </div>
  );
}
```

**✅ GOOD - Memoized component:**
```typescript
import { memo, useCallback } from "react";

const BuildingCard = memo(function BuildingCard({ building, onNavigate }) {
  const handleClick = useCallback(() => {
    onNavigate(building.id);
  }, [building.id, onNavigate]);

  return (
    <div onClick={handleClick}>
      {building.name}
    </div>
  );
});

// In parent component
const handleNavigate = useCallback((id: number) => {
  router.push(`/buildings/${id}`);
}, [router]);
```

**Impact**: 50% fewer re-renders in large lists.

---

#### 5. **Lazy Load Modal Components**

**❌ BAD - All modals in initial bundle:**
```typescript
import AddBuildingModal from "./add-building-modal";
import EditBuildingModal from "./edit-building-modal";
import DeleteBuildingModal from "./delete-building-modal";
```

**✅ GOOD - Load modals on demand:**
```typescript
import dynamic from "next/dynamic";

const AddBuildingModal = dynamic(() => import("./add-building-modal"), {
  loading: () => <div>Loading...</div>,
  ssr: false,  // Modals don't need SSR
});
```

**Impact**: 30-40% smaller initial bundle size.

---

#### 6. **Move Heavy Filtering to Backend**

**❌ BAD - Filter 1000 items on every keystroke:**
```typescript
const filtered = useMemo(() => {
  const query = searchQuery.trim().toLowerCase();
  return incidents.filter((inc) => {
    const searchText = [
      inc.incidentNumber,
      inc.clientName,
      inc.description,
      // ... 10 more fields
    ].join(" ").toLowerCase();
    return searchText.includes(query);
  });
}, [incidents, searchQuery]);  // Runs on every keystroke
```

**✅ GOOD - Debounced backend search:**
```typescript
import { useDebounce } from "@/hooks/use-debounce";

const debouncedSearch = useDebounce(searchQuery, 300);

useEffect(() => {
  const params = new URLSearchParams({
    q: debouncedSearch,
    status: statusFilter,
    page: String(page),
  });

  apiGet(`/v1/incidents?${params}`);
}, [debouncedSearch, statusFilter, page]);

// Backend handles filtering with database indexes
```

**Impact**: Instant search on large datasets.

---

### Context-Aware Modal Patterns

#### Pre-filling Modal Forms from Context

When opening modals from specific contexts (e.g., creating an incident from a building page), pre-fill and lock relevant fields:

**✅ GOOD - Context-aware modal:**
```typescript
// In building detail page
<ReportIncidentModal
  open={showModal}
  onClose={() => setShowModal(false)}
  onSuccess={handleSuccess}
  presetBuilding={building}  // Pre-fill building
  lockBuilding={true}        // Lock building selection
/>

// In incident modal
export default function ReportIncidentModal({
  presetBuilding,
  lockBuilding,
}: {
  presetBuilding?: Building;
  lockBuilding?: boolean;
}) {
  useEffect(() => {
    if (!open) return;

    // Skip building step if locked
    setStep(lockBuilding ? 2 : 1);

    if (lockBuilding && presetBuilding) {
      setSelectedBuilding(presetBuilding);
      setFormData((prev) => ({
        ...prev,
        buildingId: presetBuilding.coreId
      }));
    }
  }, [open, lockBuilding, presetBuilding]);
}
```

**Benefits:**
- Better UX (fewer steps)
- Prevents user errors
- Maintains context awareness

---

### Performance Testing Checklist

Before committing new features, verify:

- [ ] No N+1 queries (check Prisma query logs)
- [ ] Independent queries run in parallel
- [ ] Proper database indexes on filtered/sorted fields
- [ ] API calls use centralized client
- [ ] Parallel frontend API calls where possible
- [ ] Appropriate caching strategy
- [ ] Large lists use memoization
- [ ] Modals are lazy loaded
- [ ] Heavy operations debounced
- [ ] No hardcoded API URLs

---

### Reference Implementations

**Optimized Backend Services:**
- `backend/crm-backend/src/buildings/buildings.service.ts` - groupBy aggregation
- `backend/crm-backend/src/work-orders/work-orders.service.ts` - parallel validation

**Optimized Frontend Pages:**
- `frontend/crm-frontend/src/app/app/buildings/[buildingId]/page.tsx` - parallel API calls
- `frontend/crm-frontend/src/app/app/buildings/page.tsx` - centralized API client

**Context-Aware Modals:**
- `frontend/crm-frontend/src/app/app/incidents/report-incident-modal.tsx` - preset support

---

### Performance Documentation

For detailed optimization plans and analysis:
- `PERFORMANCE_ANALYSIS.md` - Complete audit with metrics
- `OPTIMIZATION_IMPLEMENTATION_PLAN.md` - Week-by-week implementation guide

---

## Permission Checks

### Work Order Delete Permissions

The system implements granular delete permissions for work orders with inventory control:

**Available Permissions:**
- `work_orders.delete` - Basic delete (for work orders without inventory impact)
- `work_orders.delete_keep_inventory` - Delete work order, keep inventory changes intact
- `work_orders.delete_revert_inventory` - Delete work order, return products to stock

**Frontend Implementation:**

```tsx
import { usePermissions } from "@/lib/use-permissions";

function WorkOrderActions() {
  const { hasPermission } = usePermissions();
  const currentUser = /* get from context */;
  
  // Permission checks - superadmin always has access
  const canDeleteKeepInventory = currentUser?.isSuperAdmin || hasPermission("work_orders.delete_keep_inventory");
  const canDeleteRevertInventory = currentUser?.isSuperAdmin || hasPermission("work_orders.delete_revert_inventory");
  const canDeleteAny = canDeleteKeepInventory || canDeleteRevertInventory;
  
  // Show delete button only if user has any delete permission
  {canDeleteAny && (
    <button onClick={handleDelete}>Delete</button>
  )}
  
  // In delete dialog, conditionally show options
  {canDeleteRevertInventory ? (
    <button onClick={() => performDelete(true)}>Delete & Revert</button>
  ) : (
    <div className="locked">No permission to revert inventory</div>
  )}
  
  {canDeleteKeepInventory ? (
    <button onClick={() => performDelete(false)}>Delete & Keep</button>
  ) : (
    <div className="locked">No permission to keep inventory</div>
  )}
}
```

**Backend Permission Seed:**

```typescript
// In seed-permissions.ts
{ resource: "work_orders", action: "delete_keep_inventory", category: PermissionCategory.WORK_ORDERS, description: "Delete work orders and keep inventory changes" },
{ resource: "work_orders", action: "delete_revert_inventory", category: PermissionCategory.WORK_ORDERS, description: "Delete work orders and revert inventory" },
```

**API Endpoints:**
- `GET /v1/work-orders/:id/inventory-impact` - Check if work order has inventory impact
- `DELETE /v1/work-orders/:id?revertInventory=true|false` - Delete with inventory control

---

## Future Guidelines

This section will be expanded with additional development guidelines as needed:

- [ ] Form Validation Patterns
- [ ] Error Handling Patterns
- [x] Permission Checks (see above)
- [ ] Database Migration Guidelines
- [ ] Testing Patterns
- [ ] Component Organization
- [ ] Styling Conventions

---

## Notes

- Always test modals on different screen sizes
- Ensure modals are accessible (keyboard navigation, focus management)
- Consider mobile responsiveness when setting max-widths
- Test with long content to ensure scrolling works correctly
- When adding new permissions, run `npx tsx prisma/seed-permissions.ts` to seed them
- Always check both frontend and backend for permission enforcement

---

**Last Updated**: 2026-01-27
**Maintained By**: Development Team
