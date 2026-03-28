#!/bin/bash
# PostToolUse hook: Run ESLint --fix and Prettier on edited files.
# Triggered after Edit and Write tool uses.

INPUT=$(cat)

# Extract the file_path from the tool input JSON
FILE_PATH=$(echo "$INPUT" | sed -n 's/.*"file_path":"\([^"]*\)".*/\1/p' | head -1)

# Bail if no file path found
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Normalize path separators (Windows backslash to forward slash)
FILE_PATH=$(echo "$FILE_PATH" | tr '\\' '/')

# Skip node_modules, dist, .next, coverage, and migration files
if echo "$FILE_PATH" | grep -qE "(node_modules|/dist/|/\.next/|/coverage/|prisma/migrations/)"; then
  exit 0
fi

# Only process .ts, .tsx, .js, .jsx files
if ! echo "$FILE_PATH" | grep -qE '\.(ts|tsx|js|jsx)$'; then
  exit 0
fi

# Verify the file exists
if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Determine which project the file belongs to and run the appropriate tools
if echo "$FILE_PATH" | grep -q "backend/crm-backend"; then
  PROJECT_DIR="C:/CRM-Platform/backend/crm-backend"

  # Run ESLint --fix (uses the project's eslint.config.mjs)
  cd "$PROJECT_DIR" && npx eslint --fix "$FILE_PATH" 2>/dev/null

  # Run Prettier (uses project's Prettier config or defaults)
  cd "$PROJECT_DIR" && npx prettier --write "$FILE_PATH" 2>/dev/null

elif echo "$FILE_PATH" | grep -q "frontend/crm-frontend"; then
  PROJECT_DIR="C:/CRM-Platform/frontend/crm-frontend"

  # Run ESLint --fix (uses Next.js eslint config)
  cd "$PROJECT_DIR" && npx eslint --fix "$FILE_PATH" 2>/dev/null

  # Run Prettier
  cd "$PROJECT_DIR" && npx prettier --write "$FILE_PATH" 2>/dev/null

fi

# Always exit 0 — formatting failures should not block edits
exit 0
