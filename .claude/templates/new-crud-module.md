When building a new CRUD module, create these files in order:
1. Prisma schema addition (model + relations)
2. Migration: npx prisma migrate dev --name add-{module}
3. backend/src/{module}/{module}.module.ts — imports PrismaModule
4. backend/src/{module}/{module}.service.ts — CRUD with pagination, select, _count
5. backend/src/{module}/{module}.controller.ts — guards + permissions + Swagger
6. backend/src/{module}/dto/create-{module}.dto.ts — class-validator
7. backend/src/{module}/dto/update-{module}.dto.ts — PartialType
8. backend/src/{module}/{module}.service.spec.ts — unit tests
9. Register module in app.module.ts
10. frontend/src/app/app/{module}/page.tsx — list with table, pagination, filters
11. Add/edit modals with createPortal pattern
12. Add permissions to seed-permissions.ts
13. Update CLAUDE.md, API_ROUTE_MAP.md, FRONTEND_ROUTE_MAP.md
