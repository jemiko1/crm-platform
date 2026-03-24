Full codebase health check.
Steps:
1. TypeScript: pnpm typecheck (both projects)
2. Lint: pnpm lint (backend)
3. Tests: pnpm test:unit (backend)
4. Check for console.log in src/ (excluding tests)
5. Check for raw fetch() in frontend
6. Check for hardcoded dropdowns
7. git status for uncommitted changes
8. gh run list --limit 3 — check recent CI status
9. Report summary with action items
