# Engineering Rules

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Code Standards

### Backend (NestJS)
- **Module pattern**: Each feature has `{module}.module.ts`, `{module}.service.ts`, `{module}.controller.ts`, `dto/`
- **No refactoring unrelated code** when implementing a feature
- **Unit tests**: New services must have `.spec.ts` next to source
- **E2E tests**: New API endpoints with business logic should be covered

### Frontend (Next.js)
- **App Router** with existing component structure
- **Modal patterns**: Use `createPortal` to `document.body`; check `mounted` for SSR
- **API client**: ALWAYS use `apiGet`, `apiPost`, `apiPatch`, `apiDelete` from `@/lib/api` — never hardcode URLs
- **Dynamic lists**: ALWAYS use `useListItems(categoryCode)` — never hardcode dropdown values

### Terminology
- **Devices** = Building assets (elevators, intercoms)
- **Products** = Inventory items (routers, sensors)

---

## Performance (CRITICAL)

### Backend – Avoid N+1
- Use `_count` or `groupBy` instead of loading relations and counting in code
- See `AI_DEVELOPMENT_CONTEXT.md` for examples

### Frontend – Parallelize
- Use `Promise.all()` for independent API calls
- Never sequential `await` for unrelated fetches

### Database
- Add indexes for: foreign keys, WHERE fields, ORDER BY, search fields

---

## Files to Never Modify
- `.env` (local config)
- `prisma/migrations/*/migration.sql` (applied migrations)
- `pnpm-lock.yaml` (only via `pnpm install`)

---

## References
- **Full patterns**: [`DEVELOPMENT_GUIDELINES.md`](../../DEVELOPMENT_GUIDELINES.md)
- **AI rules**: [`docs/AI_WORKING_RULES.md`](../../docs/AI_WORKING_RULES.md)
- **Performance**: [`AI_DEVELOPMENT_CONTEXT.md`](../../AI_DEVELOPMENT_CONTEXT.md)
- **Modal stack**: [`MODAL_STACK_ARCHITECTURE.md`](../../MODAL_STACK_ARCHITECTURE.md)
