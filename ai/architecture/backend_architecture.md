# Backend Architecture

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Stack
- **Framework**: NestJS
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: JWT in httpOnly cookies
- **Port**: 3000

---

## Module Structure

```
backend/crm-backend/src/
├── main.ts
├── app.module.ts
├── auth/              JWT, login, app-login
├── buildings/
├── clients/
├── incidents/
├── work-orders/
├── inventory/
├── employees/
├── messenger/         Socket.IO gateway
├── telephony/         AMI, ARI, call events, WebSocket
├── clientchats/       Telegram, Viber, Facebook, WhatsApp
├── system-lists/      Dynamic dropdown categories
└── ...
```

Each module typically has:
- `{module}.module.ts`
- `{module}.service.ts`
- `{module}.controller.ts`
- `dto/create-*.dto.ts`, `dto/update-*.dto.ts`

---

## Key Patterns
- **Guards**: `JwtAuthGuard`, `PositionPermissionGuard`, `@RequirePermission('resource.action')`
- **Dual ID**: Controllers accept `coreId`; services use `id` internally
- **Prisma**: Use `_count`, `groupBy` to avoid N+1

---

## Database
- **Container**: `crm-prod-db` (port 5433)
- **Migrations**: `npx prisma migrate dev --name descriptive_name`
- **Never edit** applied migration files
- **Generate client**: `npx prisma generate` after schema changes

---

## Quick Commands
```bash
cd backend/crm-backend
pnpm start:dev      # Dev server
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e
pnpm build
npx prisma studio   # DB browser
```

---

## References
- **API routes**: [`API_ROUTE_MAP.md`](../../API_ROUTE_MAP.md)
- **Auth**: [`AUTH_CONFIG_SUMMARY.md`](../../AUTH_CONFIG_SUMMARY.md)
- **Schema**: `backend/crm-backend/prisma/schema.prisma`
