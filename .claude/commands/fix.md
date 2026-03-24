Quick fix. Usage: /fix <description>
Steps:
1. Find the relevant code
2. Explain root cause in one sentence
3. Fix it
4. Run type checks (both projects)
5. Run tests if fix touches tested code
6. git add -A ; git commit -m "fix(scope): description"
7. git push origin <branch>
8. Report: "Fixed and pushed. Test again."
