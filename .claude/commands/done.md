Finish feature — smart branch naming, review, quality checks, commit, create PR.
Steps:
1. Analyze what was actually done in this session:
   - Run git diff master...HEAD and git log master..HEAD --oneline to see all changes and commits
   - Identify: what files changed, what was implemented, what type of work it was (feature, fix, refactor)
2. Generate a proper branch name following these rules:
   - Format: feature/, fix/, or refactor/ prefix based on the actual work type
   - Always lowercase kebab-case, under 5 words
   - Describe the outcome, not the task (e.g., feature/lease-expiry-notifications NOT feature/work-on-lease-stuff)
   - Examples: feature/prisma-v7-upgrade, fix/jwt-secret-fallback, refactor/consolidate-rbac-guards
3. If the current branch name doesn't match what was actually done, rename it:
   - git branch -m <old-name> <new-name>
4. Use the code-reviewer subagent (from .claude/agents/code-reviewer.md) to review ALL changes on this branch vs master. Run: git diff master...HEAD to get the full diff and pass it to the reviewer. The reviewer should check for:
   - Missing auth guards, N+1 queries, silent override risks
   - Security issues, hardcoded secrets, raw fetch() usage
   - Logic errors, missing error handling, broken patterns
5. If the reviewer flags anything as CRITICAL: fix it automatically before proceeding. Show me warnings/info but don't block on them.
6. Run ALL pre-completion checks:
   - cd backend\crm-backend ; pnpm typecheck
   - cd frontend\crm-frontend ; pnpm typecheck
   - cd backend\crm-backend ; pnpm lint
   - cd backend\crm-backend ; pnpm test:unit
7. If ANY check fails: fix automatically, re-run
8. Check if docs need updating — update if needed
9. git add -A ; git commit -m "<conventional commit>"
10. git push origin <branch>
11. gh pr create --base master --title "<title>" --body "<changes list + review summary>"
12. Report: "PR created. Test on localhost:3000 + localhost:4002. Merge when ready."
