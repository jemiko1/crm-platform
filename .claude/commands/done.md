Finish feature — quality checks, commit, create PR.
Steps:
1. Run ALL pre-completion checks:
   - cd backend\crm-backend ; pnpm typecheck
   - cd frontend\crm-frontend ; pnpm typecheck
   - cd backend\crm-backend ; pnpm lint
   - cd backend\crm-backend ; pnpm test:unit
2. If ANY check fails: fix automatically, re-run
3. Check if docs need updating — update if needed
4. git add -A ; git commit -m "<conventional commit>"
5. git push origin <branch>
6. gh pr create --base master --title "<title>" --body "<changes list>"
7. Report: "PR created. Test on localhost:3000 + localhost:4002. Merge when ready."
