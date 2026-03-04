# System Overview

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | NestJS + PostgreSQL + Prisma ORM |
| Frontend | Next.js 14+ (App Router) + TypeScript + Tailwind CSS v4 |
| Auth | JWT in httpOnly cookies |
| Real-time | Socket.IO (Messenger, Telephony) |

---

## Ports & URLs (CRITICAL)

| Service | URL | Notes |
|---------|-----|-------|
| Backend | `http://localhost:3000` | NestJS API |
| Frontend | `http://localhost:3002` | Next.js (`pnpm dev --port 3002`) |
| API Base | `http://localhost:3000/v1/*` | All API requests |

**Never use port 4000** — backend runs on 3000.

---

## Key Design Decisions

1. **Dual ID System**
   - Internal: UUID (`id`) for DB relations
   - User-facing: integer (`coreId`) for API/UI
   - Frontend uses `coreId`; backend converts to `id`

2. **RBAC**
   - Position → RoleGroup → Permissions
   - Legacy: `User.role` + `isSuperAdmin` (kept for compatibility)

3. **Modals**
   - Detail modals: z-index 10000, URL params (`?building=1`)
   - Action modals: z-index 50000+, local state

4. **API Client**
   - Centralized `apiGet/apiPost/apiPatch/apiDelete` from `@/lib/api`

---

## Repository Structure

```
CRM-Platform/
├── backend/crm-backend/    NestJS (port 3000)
├── frontend/crm-frontend/  Next.js (port 3002)
├── ami-bridge/            AMI → CRM event relay (Node.js)
├── crm-phone/             Electron desktop softphone
├── docs/                   Canonical process docs
├── .cursor/rules/         AI assistant rules
└── ai/                     This AI knowledge base
```

---

## Core Modules (Summary)
- Buildings, Clients, Incidents, Work Orders
- Inventory (products, purchase orders)
- Employees & HR (positions, departments)
- Instant Messenger (Socket.IO)
- Call Center & Telephony (Asterisk, AMI, CRM28 Phone)
- Sales CRM (leads, services, plans)

---

## References
- **Full snapshot**: [`PROJECT_SNAPSHOT.md`](../../PROJECT_SNAPSHOT.md)
- **Doc index**: [`DOCUMENTATION_INDEX.md`](../../DOCUMENTATION_INDEX.md)
- **AI context**: [`AI_DEVELOPMENT_CONTEXT.md`](../../AI_DEVELOPMENT_CONTEXT.md)
