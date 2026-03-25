#!/bin/bash
INPUT=$(cat)
COMMAND=$(echo "$INPUT" | sed -n 's/.*"command":"\([^"]*\)".*/\1/p' | head -1)

# Block push to master (but allow pushing branches that contain "master" in the name)
if echo "$COMMAND" | grep -qiE "git push[[:space:]]+[^[:space:]]+[[:space:]]+master([[:space:]]|$)|git push[[:space:]]+origin[[:space:]]+master([[:space:]]|$)"; then
    echo "BLOCKED: Cannot push to master. Use a feature branch and PR." >&2
    exit 2
fi

# Block commit while on master
BRANCH=$(git branch --show-current 2>/dev/null)
if [ "$BRANCH" = "master" ] && echo "$COMMAND" | grep -qi "git commit"; then
    echo "BLOCKED: Cannot commit on master. Create a feature branch first." >&2
    exit 2
fi

exit 0
