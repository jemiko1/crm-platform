# AI Start Here

Quick workflow reference for AI assistants working on this repository.

## Workflow Summary

```
Issue labeled ready-for-cursor
    → Cursor implements
    → PR opened
    → PR labeled ready-for-claude-review
    → Claude reviews
    → claude-approved  OR  changes-requested
    → Jemiko tests and merges
```

## Branch Flow

- **Feature branches** → PR into `dev`
- **Test on dev** → validate before release
- **PR dev → master** → deploy (Railway deploys from `master`)
- **Cursor**: Must NOT open PRs directly to `master` except `dev`→`master` release PRs

## Role Reference

- **Cursor**: Implementer — creates branches, commits, opens PRs (to `dev` only)
- **Claude**: Reviewer/advisor only — reviews PRs, comments, recommends labels (see `CLAUDE.md`)
- **Jemiko**: Human — tests, approves, merges; opens PR dev→master for deploy

## Security

**Never store secrets in the repository.** No API keys, tokens, or passwords in code, issues, or PR descriptions. Use environment variables and `.env` (gitignored).
