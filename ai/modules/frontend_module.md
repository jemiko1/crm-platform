# Frontend Module

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Location
`frontend/crm-frontend/`

---

## Tech
- Next.js 14+ (App Router), TypeScript, Tailwind v4
- Port 3002

---

## Key Areas
- **Modal system** – `modal-manager.tsx`, `modal-stack-context.tsx`, `modal-z-index-context.tsx`
- **API client** – `lib/api.ts` (apiGet, apiPost, apiPatch, apiDelete)
- **Dynamic lists** – `hooks/useListItems.ts`
- **Permissions** – `lib/use-permissions.ts`, PermissionButton, PermissionGuard
- **Messenger** – `messenger/` (chat bubbles, full view)
- **Call Center** – `call-center/` (live, analytics, quality)

---

## Routes (Summary)
- `/app/buildings`, `/app/clients`, `/app/employees`, `/app/work-orders`, `/app/incidents`
- `/app/call-center`, `/app/call-center/analytics`, `/app/call-center/quality`
- `/app/sales/leads`, `/app/admin/*`

---

## Entry Points
- `src/app/app/layout.tsx`
- `src/app/app/modal-manager.tsx`
- `src/lib/api.ts`

---

## References
- **Route map**: [`FRONTEND_ROUTE_MAP.md`](../../FRONTEND_ROUTE_MAP.md)
- **Architecture**: [`ai/architecture/frontend_architecture.md`](../architecture/frontend_architecture.md)
- **Modal stack**: [`MODAL_STACK_ARCHITECTURE.md`](../../MODAL_STACK_ARCHITECTURE.md)
