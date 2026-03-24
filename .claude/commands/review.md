Self-review current branch before PR.
Steps:
1. git diff master..HEAD --stat
2. git diff master..HEAD
3. Review for: security, performance (N+1), error handling, patterns, missing tests, docs
4. Report findings with severity (critical/warning/suggestion)
5. Offer to fix issues found
