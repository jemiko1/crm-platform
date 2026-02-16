# Modal Stack Architecture (Bitrix24-Style Side Panels)

This document describes the **entity detail modal stack** system used in the CRM Platform. This is the side-panel slider system for viewing entity details (buildings, clients, employees, work orders, incidents). It is distinct from **action modals** (centered dialogs for add/edit/delete forms), which are documented in `DEVELOPMENT_GUIDELINES.md`.

---

## Table of Contents

1. [Overview](#overview)
2. [Two Types of Modals](#two-types-of-modals)
3. [Architecture](#architecture)
4. [Key Files](#key-files)
5. [How to Open a Detail Modal](#how-to-open-a-detail-modal)
6. [How to Add a New Entity Type](#how-to-add-a-new-entity-type)
7. [Stack Behavior](#stack-behavior)
8. [URL Synchronization](#url-synchronization)
9. [Data Refresh Without Page Reload](#data-refresh-without-page-reload)
10. [Z-Index Layering](#z-index-layering)
11. [Common Mistakes to Avoid](#common-mistakes-to-avoid)

---

## Overview

The modal stack implements a **LIFO (Last-In, First-Out) stack** of side-panel sliders, inspired by Bitrix24's `BX.SidePanel`. Key behaviors:

- **Stacking**: Opening a new entity pushes a slider on top of the current one. Multiple sliders are visible simultaneously with cascading depth.
- **Bring-to-front**: Opening an entity that already exists in the stack moves it to the top (no duplicates).
- **Close reveals previous**: Closing the top slider reveals the one beneath it instantly, with no page refresh.
- **URL sync**: The URL always reflects the topmost modal (e.g., `?building=1`), making links shareable. Browser Back closes the top modal smoothly.

---

## Two Types of Modals

| Feature | Detail Modals (Side Panels) | Action Modals (Centered Dialogs) |
|---|---|---|
| **Purpose** | View entity details | Add/Edit/Delete forms |
| **Visual** | Full-height slider from the right | Centered dialog with backdrop |
| **Stacking** | LIFO stack, multiple visible | Z-index stacking via `ModalZIndexProvider` |
| **State** | Managed by `ModalStackProvider` | Managed by local component state (`useState`) |
| **Z-Index range** | `10000` – `10100` | `50000+` |
| **URL** | Updates URL query params | Does not affect URL |
| **How to open** | `openModal("building", "123")` | `setShowModal(true)` |
| **Key file** | `modal-stack-context.tsx` | `modal-z-index-context.tsx` |

**Rule**: Detail modals use the stack. Action modals use local state + `useActionModalZIndex()`. Never mix these patterns.

---

## Architecture

```
AppLayout (layout.tsx)
└── ModalStackWrapper (modal-provider.tsx)
    ├── ModalStackProvider (modal-stack-context.tsx)
    │   Holds: stack state, openModal(), closeModal(), history sync
    │
    ├── ModalZIndexProvider (modal-z-index-context.tsx)
    │   Holds: z-index allocation for action modals (50000+)
    │
    ├── {children}  ← Page content (list pages, detail pages)
    │   Can call: useModalContext().openModal("building", "1")
    │
    └── <Suspense>
        └── ModalManager (modal-manager.tsx)
            Reads stack from context, renders all modals simultaneously
            Handles URL ↔ stack synchronization via useSearchParams
```

### Data Flow

```
User clicks row → openModal("building", "1")
                      │
                      ▼
        ModalStackProvider pushes {type:"building", id:"1"} onto stack
                      │
                      ├── Updates URL via history.pushState → /app/buildings?building=1
                      │
                      └── React re-renders → ModalManager maps over stack
                                              → renders BuildingModal at z-index 10000
                                              
User clicks incident inside building → openModal("incident", "abc")
                      │
                      ▼
        Stack becomes: [{building,"1"}, {incident,"abc"}]
                      │
                      ├── URL → /app/buildings?incident=abc
                      │
                      └── ModalManager renders:
                            BuildingModal  z:10000 (dimmed, offset left)
                            IncidentModal  z:10010 (topmost, full opacity)

User clicks Close (or browser Back)
                      │
                      ▼
        Stack pops → [{building,"1"}]
                      │
                      ├── URL → /app/buildings?building=1
                      │
                      └── BuildingModal is now topmost (full opacity, no offset)
```

---

## Key Files

| File | Role |
|---|---|
| `src/app/app/modal-stack-context.tsx` | **Stack state + context provider.** Holds the `StackEntry[]`, `openModal`, `closeModal`, `closeAllModals`, popstate listener, `history.pushState` sync. This is the source of truth. |
| `src/app/app/modal-manager.tsx` | **Renderer + URL sync.** Reads stack from context, renders all modal components. Uses `useSearchParams` to initialize from URL on first load and respond to external URL changes. Exports `useModalContext` (re-exported from stack context). |
| `src/app/app/modal-provider.tsx` | **Composition root.** `ModalStackWrapper` wraps the entire layout with `ModalStackProvider` + `ModalZIndexProvider` + the `ModalManager` inside Suspense. |
| `src/app/app/layout.tsx` | Uses `ModalStackWrapper` to wrap all page content and the modal renderer. |
| `src/app/app/modal-z-index-context.tsx` | Z-index management for **action modals** only (50000+). Not related to the detail modal stack. |

---

## How to Open a Detail Modal

### From a list page or any component inside `/app/*`

```tsx
import { useModalContext } from "../modal-manager";

function MyComponent() {
  const { openModal } = useModalContext();

  return (
    <button onClick={() => openModal("building", String(buildingId))}>
      View Building
    </button>
  );
}
```

### From inside another modal (cross-entity navigation)

```tsx
import { useModalContext } from "../../modal-manager";

function BuildingDetailContent({ building }) {
  const { openModal } = useModalContext();

  return (
    <button onClick={() => openModal("incident", incidentId)}>
      View Incident
    </button>
  );
}
```

This pushes the incident modal on top of the building modal. The building modal stays in the stack.

### Supported entity types

```typescript
type ModalType = "building" | "client" | "employee" | "workOrder" | "incident";
```

### NEVER use `router.push` to open detail modals

```tsx
// BAD - bypasses the stack, causes URL conflicts
router.push(`/app/buildings?building=${id}`);

// GOOD - uses the stack
openModal("building", String(id));
```

### NEVER use `<Link>` for cross-entity navigation inside modals

```tsx
// BAD - causes full page navigation, destroys stack
<Link href={`/app/clients?client=${clientId}`}>View Client</Link>

// GOOD - pushes onto the stack
<button onClick={() => openModal("client", String(clientId))}>
  View Client
</button>
```

---

## How to Add a New Entity Type

To add a new entity type (e.g., `"lead"`) to the modal stack:

### Step 1: Add the type

In `modal-stack-context.tsx`, add to the `ModalType` union:

```typescript
export type ModalType = "building" | "client" | "employee" | "workOrder" | "incident" | "lead";
```

### Step 2: Create the content component

Create `src/app/app/leads/lead-detail-content.tsx` — a pure content component that receives data as props. This component should NOT manage its own modal shell.

### Step 3: Create the modal wrapper

In `modal-manager.tsx`, add a new wrapper component:

```tsx
function LeadModal({ leadId, onClose, zIndex, isTopmost, stackDepth, stackSize, onRefresh }: { leadId: string } & StackedModalProps) {
  // Fetch data, handle permissions, render inside ModalShell
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // ... fetch logic ...

  const handleUpdate = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onRefresh();
  }, [onRefresh]);

  return (
    <ModalShell
      onClose={onClose}
      loading={loading}
      error={error}
      zIndex={zIndex}
      isTopmost={isTopmost}
      stackDepth={stackDepth}
      stackSize={stackSize}
    >
      {lead && <LeadDetailContent lead={lead} onUpdate={handleUpdate} />}
    </ModalShell>
  );
}
```

### Step 4: Add to the render switch

In `ModalManager`'s render loop, add:

```tsx
case "lead":
  return <LeadModal key={entry.key} leadId={entry.id} {...sharedProps} />;
```

### Step 5: Open it from list pages

```tsx
const { openModal } = useModalContext();
openModal("lead", leadId);
```

---

## Stack Behavior

### Opening

- `openModal("building", "1")` → pushes `{type:"building", id:"1"}` to the stack
- Calls `history.pushState` so browser Back works
- If `{building, 1}` already exists in the stack, it is **moved to the top** (bring-to-front) with `replaceState` (no extra history entry)

### Closing

- `closeModal()` → pops the top entry
- If a history entry was pushed for it, calls `history.back()`
- Otherwise uses `replaceState` to update the URL

### Browser Back

- The `popstate` event listener detects Back/Forward navigation
- Pops/restores the stack from `history.state`

### Close All

- `closeAllModals()` → clears the entire stack
- Calls `history.go(-depth)` to unwind all pushed history entries

---

## URL Synchronization

- The URL always reflects the **topmost** modal: `?building=1`, `?incident=abc`, etc.
- The **full stack** is stored in `history.state.__modalStack` so browser navigation reconstructs correctly
- Shared/bookmarked URLs work: visiting `/app/buildings?building=1` seeds the stack with one entry on mount
- Page navigation (clicking sidebar links) clears the stack automatically

---

## Data Refresh Without Page Reload

**NEVER use `window.location.reload()` inside a modal.** It destroys the entire stack and causes a jarring page refresh.

### For modal wrappers (in modal-manager.tsx)

Each modal wrapper has a `refreshKey` state. The `handleUpdate` callback increments it (re-fetches entity data) and calls `onRefresh()` (emits a refresh event to the bus):

```tsx
const handleUpdate = useCallback(() => {
  setRefreshKey((k) => k + 1);  // Re-fetches this modal's data
  onRefresh();                    // Notifies other listeners (e.g., list pages)
}, [onRefresh]);
```

### For content components

Pass `onUpdate` as a prop. Call it after mutations:

```tsx
// In your content component
function handleSave() {
  await apiPost(...);
  onUpdate();  // triggers re-fetch, NOT window.location.reload()
}
```

### For list pages that need to refresh after modal mutations

```tsx
const { onRefresh } = useModalContext();

useEffect(() => {
  return onRefresh(() => {
    fetchData(); // re-fetch the list
  });
}, [onRefresh]);
```

---

## Z-Index Layering

```
Layer                          Z-Index Range
─────────────────────────────────────────────
Sidebar                        40
Top bar                        50
Detail modal (bottom of stack)  10000
Detail modal (next)             10010
Detail modal (top of stack)     10000 + N*10
Action modal (add/edit/delete)  50000+
```

- Detail modals: `10000 + stackIndex * 10`
- Action modals: `50000 + counter * 10` (via `useActionModalZIndex()`)
- Action modals always appear above all detail modals

### Visual depth for stacked detail modals

- **Topmost**: Full opacity, close button visible, no offset
- **Below top**: Dimmed with `bg-black/15` overlay, offset `32px` to the left per depth level, close button hidden
- **Backdrop**: Only the bottom-most modal renders the shared backdrop (`bg-black/50 backdrop-blur-sm`)

---

## Common Mistakes to Avoid

1. **Using `router.push` to open entity detail modals** — bypasses the stack, causes URL/state conflicts
2. **Using `<Link>` for cross-entity navigation inside modals** — causes full navigation, destroys stack
3. **Using `window.location.reload()` inside modals** — destroys entire stack, causes flash
4. **Putting `ModalContext.Provider` inside the renderer** — children pages won't be able to access `openModal`
5. **Rendering action modals (add/edit forms) through the stack** — action modals should use local `useState` + `ModalDialog` or `createPortal`, not `openModal()`
6. **Forgetting to pass `zIndex`, `isTopmost`, `stackDepth`, `stackSize` to `ModalShell`** — all four props are required for correct stacking visuals
7. **Hardcoding z-index in detail modals** — always use the `zIndex` prop from the stack
