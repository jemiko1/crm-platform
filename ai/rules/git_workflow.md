# Git Workflow

> Summarized from existing docs. **Do not delete originals.** See references below.

---

## Branch Model

| Branch | Purpose | AI can commit? |
|--------|---------|-----------------|
| `master` | Production | **NO** |
| `staging` | Pre-production | **NO** |
| `dev` | Integration | Yes |
| `feature/*` | Feature work | Yes |
| `hotfix/*` | Urgent fixes | Yes |

**AI must never**: Commit to master/staging, push to master/staging, merge into master/staging, create PRs targeting master/staging.

---

## Flow

```
feature/* ──PR──> dev ──PR──> staging ──PR──> master
hotfix/*  ──PR──> master, then cherry-pick to staging and dev
```

---

## Creating Branches

```bash
git checkout dev
git pull origin dev
git checkout -b feature/descriptive-name
```

---

## PR Target
- **All PRs target `dev`** (use `gh pr create --base dev`)

---

## Commit Format (Conventional Commits)
- `feat:` – new feature
- `fix:` – bug fix
- `refactor:` – code change
- `test:` – tests
- `docs:` – documentation
- `chore:` – build, CI, deps

---

## Before Committing
- Run `pnpm lint` and `pnpm test:unit`
- Keep commits focused on a single logical change
- Never commit secrets or `.env`

---

## References
- **Full workflow**: [`docs/DEVELOPMENT_WORKFLOW.md`](../../docs/DEVELOPMENT_WORKFLOW.md)
- **AI rules**: [`docs/AI_WORKING_RULES.md`](../../docs/AI_WORKING_RULES.md)
- **Release flow**: [`docs/RELEASE_CHECKLIST.md`](../../docs/RELEASE_CHECKLIST.md)
- **Cursor rules**: [`.cursor/rules/`](../../.cursor/rules/)
