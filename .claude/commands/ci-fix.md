Fix a failed CI check. Usage: /ci-fix
Steps:
1. gh run list --limit 1 — get latest run ID
2. gh run view <id> --log-failed — get failure details
3. Read the error
4. Fix the issue
5. Run the same check locally to verify
6. git add -A ; git commit -m "fix(ci): description"
7. git push origin <branch>
8. Report: "CI fix pushed. Check: gh run list"
