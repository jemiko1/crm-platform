# Frontend Architecture

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Stack
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Port**: 3002 (dev), 3002 (prod)

---

## Structure

```
frontend/crm-frontend/src/
├── app/
│   ├── app/              Main app layout
│   │   ├── layout.tsx
│   │   ├── modal-manager.tsx
│   │   ├── modal-provider.tsx
│   │   ├── sidebar-nav.tsx
│   │   ├── app-header.tsx
│   │   ├── buildings/
│   │   ├── clients/
│   │   ├── work-orders/
│   │   ├── call-center/
│   │   ├── messenger/
│   │   └── admin/
│   └── login/
├── hooks/
│   └── useListItems.ts   Dynamic dropdowns (CRITICAL)
├── lib/
│   ├── api.ts            apiGet, apiPost, apiPatch, apiDelete
│   └── use-permissions.ts
└── components/
```

---

## Modal System
- **Detail modals**: Side panels, z-index 10000, URL params (`?building=1`)
- **Action modals**: Centered dialogs, z-index 50000+
- **Stack**: `ModalStackProvider`, `ModalZIndexProvider`, `ModalManager`
- **Open**: `openModal("building", "1")` or `router.push('/app/buildings?building=1')`
- **Close**: `router.back()`

---

## Mandatory Rules
1. **Dynamic lists**: `useListItems(categoryCode)` — never hardcode
2. **API**: `apiGet`/`apiPost`/`apiPatch`/`apiDelete` — never raw fetch
3. **Modals**: `createPortal` to `document.body`, `mounted` check for SSR

---

## Quick Commands
```bash
cd frontend/crm-frontend
pnpm dev --port 3002
pnpm lint
pnpm typecheck
pnpm build
```

---

## References
- **Routes**: [`FRONTEND_ROUTE_MAP.md`](../../FRONTEND_ROUTE_MAP.md)
- **Modal stack**: [`MODAL_STACK_ARCHITECTURE.md`](../../MODAL_STACK_ARCHITECTURE.md)
- **Guidelines**: [`DEVELOPMENT_GUIDELINES.md`](../../DEVELOPMENT_GUIDELINES.md)
