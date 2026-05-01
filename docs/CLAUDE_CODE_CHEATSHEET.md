# Working with Claude Code on CRM28 — Cheatsheet

> Pin this. One-page operating manual for how Jemiko + Claude work together.

## How Claude decides "fast" vs "careful" mode

**No trigger word needed.** Claude reads the task and picks. If you want to override, just say so in the prompt.

| Task pattern | Mode | What Claude does |
|---|---|---|
| "Fix the alignment / typo / wording" | Fast | Edit, typecheck, push. No reviewer. |
| "Add a column / button / filter / table view" | Fast | Plan only if multi-file, edit, typecheck + tests, push. |
| "Refactor / rewrite / restructure X" | Careful | Plan, explorer agent, edits, code-reviewer at end. |
| Anything mentioning **auth / JWT / cookie / login** | Careful | + security-scanner |
| Anything mentioning **Prisma schema / migration / enum** | Careful | + db-reviewer |
| Anything mentioning **Asterisk / AMI / SIP / softphone / PBX** | Careful | + read relevant Silent Override Risk |
| Anything mentioning **payment / billing / invoice** | Careful | Always |
| "Merge to master" / "release softphone" / "deploy" | Careful | Always |

To force careful when Claude would default to fast: say "be careful" or "review thoroughly" or "double-check this." To force fast when Claude would default to careful: "just do it" or "skip the review."

## Sacred rules — never overridden by anything

1. ⛔ **Core MySQL is READ-ONLY.** Bridge queries are SELECTs only.
2. **Never push to master.** Always feature branch + PR.
3. **Never drop an active call** to apply a config change.
4. **Never commit secrets** — passwords, SIP creds, API keys, JWT secrets get placeholder-replaced before any file write or commit.
5. **Always check if PR is merged** before pushing to its branch. If merged → new branch + new PR.
6. **Always code-review before PR** when touching any careful-list area.
7. **Asterisk/FreePBX:** every CLI change must also be applied via the FreePBX GUI (or the GUI's next "Apply Config" wipes it). Exception: `timestampevents=yes` lives in `manager.conf` not `_custom.conf`.

## Common patterns

### Starting work
- `/sync` — pull latest master, warn if on a stale branch.
- Just describe the task in plain English. Claude picks fast/careful mode.

### Branch flow
- Claude makes the branch: `feature/<name>`, `fix/<name>`, or `chore/<name>`.
- Claude pushes when done.
- You merge the PR after testing on localhost.
- VM auto-deploys on master push.

### When something's broken in production
- "Bridge looks down" → Claude SSHes to VM and checks PM2 + health endpoints.
- "Calls aren't being recorded" → Claude checks AMI bridge, then asterisk-sync, then CDR import.
- "Operator sees empty call logs" → check `data-scope` (Silent Override #33) + permission assignment.

### Slash commands worth using
- `/sync` — start of session
- `/feature <name>` — new branch + explorer scan
- `/fix <description>` — quick fix flow
- `/done` — comprehensive: rename branch, review, typecheck, lint, test, commit, push, PR
- `/review` — show me the current branch diff with severity flags
- `/audit` — repo-wide health check (typecheck/lint/tests/console.log/raw fetch sweeps)
- `/bridge` — VM bridge ops
- `/asterisk-check` — Asterisk health
- `/deploy-status` — VM + Railway deployment health
- `/analyze-bugs` — pull tester-reported issues, AI-comment them
- `/test <module>` — generate spec.ts for a module
- `/ci-fix` — fix the latest failed CI run

## What you DON'T need to remember

- The 33 Silent Override Risks: Claude reads the relevant one on demand from `docs/SILENT_OVERRIDE_RISKS.md` when a careful-mode task touches the area.
- Cron schedules: in `docs/CRON_JOBS.md`.
- Env vars: in `docs/ENVIRONMENT.md`.
- Module map / API map / DB schema / frontend routes: in their `_MAP.md` files at repo root.
- VM credentials: in user-level memory (`infrastructure_credentials.md`).

## Token-saving habits

- **One prompt per task.** Avoid stringing multiple unrelated tasks into one message — each task pays a fresh "find the right files" cost.
- **Be specific with file paths** when you know them. "fix the bug in `frontend/crm-frontend/src/app/app/work-orders/page.tsx`" beats "fix the work-orders page bug" — saves a Glob round.
- **Tell me what you've already tried.** "I tried restarting PM2, didn't help" saves Claude from suggesting it.
- **Don't paste full error logs unless I ask for them** — usually the first error line + the relevant stack frame is enough.
- **Skip the politeness layer.** "Fix this." not "Could you please take a look at this when you have a moment and let me know what you think?" Two are equivalent in outcome; one is shorter.

## Stash hygiene

You have 25 git stashes accumulated. Most are old WIP. When you have 10 minutes, ask Claude to "review my stashes and tell me which are still relevant" — Claude will list each, show the branch + age, and recommend keep/drop.

## After a session

- If Claude flagged something for "manual review," do that review. The list is in the latest cleanup report under `.audit-reports/`.
- If a PR landed today, the auto-deploy should have run within ~5 min — `/deploy-status` confirms.
