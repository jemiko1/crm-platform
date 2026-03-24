Sync with latest master. Run at the start of every session.
Steps:
1. git fetch origin
2. Check current branch. If on a feature branch, warn: "You're on [branch]. Switch to master? (stale work may exist)"
3. git checkout master
4. git pull origin master
5. git log --oneline -3
6. Report: "Master synced. Latest: [hash] [message]"
