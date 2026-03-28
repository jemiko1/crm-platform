Start a new feature branch. Usage: /feature <name>
Steps:
1. git checkout master ; git pull origin master
2. git checkout -b feature/$ARGUMENTS
3. Read CLAUDE.md for context
4. Use the explorer subagent (from .claude/agents/explorer.md) to scan the parts of the codebase most relevant to the feature name "$ARGUMENTS". The explorer should:
   - Map the relevant modules and files
   - Identify existing patterns that new code should follow
   - List files that will likely need changes
   - Flag any silent override risks or fragile code nearby
5. Show me the explorer's summary and say: "On branch feature/$ARGUMENTS. Here's what I found. What should I build?"
