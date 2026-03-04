# Claude PR Review Template

**Claude's role: Reviewer only.** No edits, commits, or merges.

---

## What to Check

### 1) Security
- No secrets, API keys, or credentials in code or config
- Sensitive data not logged or exposed
- Auth/authorization used correctly

### 2) Database / Migrations
- Migrations backward-compatible when possible
- No destructive changes without migration path
- Indexes on filtered/sorted fields

### 3) Telephony (AMI, call linking, recordings)
- AMI event idempotency keys used correctly
- Call linking (linkedId) consistent
- Recording paths handled safely

### 4) Performance
- No N+1 queries (use `_count`, `groupBy`)
- Parallel API calls where independent
- Heavy filtering moved to backend

### 5) Architecture Consistency
- NestJS module pattern (backend)
- Next.js App Router patterns (frontend)
- `useListItems()` for dropdowns (no hardcoded enums)
- `apiGet`/`apiPost`/etc. from `@/lib/api` (no raw fetch)

---

## Output Format

### RESULT
One of: **APPROVED** | **CHANGES REQUESTED** | **BLOCKED**

### Must-fix items
List blocking issues that must be addressed before merge.

### Nice-to-have items
Suggestions for improvement (non-blocking).

### Test checklist for Jemiko
- [ ] Manual test steps
- [ ] Edge cases to verify
- [ ] Environment notes

### Review cycle
**1/2** or **2/2** (max 2 cycles; after 2, label `blocked` and propose options)
