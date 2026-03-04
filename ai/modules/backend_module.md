# Backend Module

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Location
`backend/crm-backend/`

---

## Tech
- NestJS, PostgreSQL, Prisma
- Port 3000
- JWT auth (httpOnly cookie)

---

## Key Modules
- **auth** – Login, app-login (desktop), JWT
- **buildings** – Buildings, assets, clients
- **incidents** – Incident CRUD, status
- **work-orders** – Full workflow, products, approval
- **inventory** – Products, purchase orders, stock
- **employees** – Users, positions, departments
- **messenger** – Socket.IO gateway
- **telephony** – AMI ingestion, ARI, WebSocket, quality pipeline
- **clientchats** – Telegram, Viber, Facebook, WhatsApp webhooks
- **system-lists** – Dynamic dropdown categories

---

## Entry Points
- `src/main.ts`
- `src/app.module.ts`
- `prisma/schema.prisma`

---

## Environment
- `DATABASE_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`
- `CORS_ORIGINS`, `COOKIE_SECURE`
- See `.env.example`

---

## References
- **API map**: [`API_ROUTE_MAP.md`](../../API_ROUTE_MAP.md)
- **Architecture**: [`ai/architecture/backend_architecture.md`](../architecture/backend_architecture.md)
- **Backend README**: `backend/crm-backend/README.md`
