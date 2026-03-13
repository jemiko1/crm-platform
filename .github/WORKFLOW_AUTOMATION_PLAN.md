# EP 0 — Repo Discovery & Workflow Automation Plan

**Goal**: Safe, automated Human (reviewer) + Claude (implementer) workflow. No secrets in code.

**Constraints**: NO app code. NO new dependencies. NO deploy. NO secrets.

---

## A) Current State (Discovery)

| Item | Current |
|------|---------|
| Default branch | `master` |
| CI workflow | `.github/workflows/ci.yml` — backend test, typecheck, frontend build |
| CI triggers | PR to dev/staging/master; push to dev |
| Branch model | feature/* → dev → master (Railway deploys from master) |
| Labels | Standard (bug, enhancement, etc.) — no workflow labels |
| Project board | None |
| Issue templates | None |
| SECURITY.md | None |

---

## B) GitHub-Side Changes (via gh CLI or UI)

### Labels to Create
- `ready-for-cursor` — Cursor/Claude can implement
- `ready-for-claude-review` — Awaiting Claude review
- `changes-requested` — Revisions needed
- `ci-green` — CI passed (optional, can be auto-applied)

### Project Board (Manual — GitHub UI)
- **Name**: "CRM Workflow"
- **Columns**: To Do | Cursor Working | Claude Review | Done
- **Note**: `gh project create` requires `project` scope. Create manually: GitHub → Projects → New project → Board. Add columns as above.

### Branch Protection (Manual in GitHub UI)
- `master`: PR required, 1 approval, require status checks
- `staging`: PR required, status checks
- `dev`: Status checks (recommended)

---

## C) Repo Files to Add/Modify (Exact Paths)

| Path | Action |
|------|--------|
| `.github/ISSUE_TEMPLATE/bug_report.yml` | **Create** — Bug report form (steps, expected/actual, logs) |
| `.github/workflows/pr-labels.yml` | **Create** — Auto-add `ready-for-cursor` on PR open; add `ci-green` when CI passes |
| `.github/PULL_REQUEST_TEMPLATE.md` | **Create** — PR checklist, AI entrypoint reference |
| `SECURITY.md` | **Create** — Short policy, no secrets, how to report |
| `.github/WORKFLOW_AUTOMATION_PLAN.md` | **Create** — This plan (reference) |

**No changes to**: `ci.yml`, app code, dependencies, deploy config.

---

## D) Branch Flow

- **Feature branches** → PR into `dev`
- **Test on dev** → validate before release
- **PR dev → master** → deploy (Railway deploys from `master`)
- **Cursor**: Must NOT open PRs directly to `master` except `dev`→`master` release PRs

## E) Workflow (Human + Claude)

1. **Human** creates issue or PR with requirements
2. Label `ready-for-cursor` → Cursor/Claude implements
3. PR opened/updated → Label `ready-for-cursor` (auto)
4. CI passes → Label `ci-green` (auto)
5. Human adds `ready-for-claude-review` when ready for review
6. Claude reviews (or Human reviews)
7. `changes-requested` → back to implementer
8. Human approves → merge

---

## F) Stop Conditions

- Do not merge to `master` or `staging` without human approval
- Do not add secrets to workflows or templates
- Do not modify application code in this PR
- Do not add npm/pnpm dependencies
