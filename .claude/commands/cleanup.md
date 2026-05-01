Audit and clean stale local branches + git stashes. Run on demand, never automatically.

## Why a separate command (not part of /done or /sync)

Jemiko often runs multiple parallel Claude Code sessions in this repo. Auto-cleaning branches in /done or /sync risks deleting a branch another session is working from. This command is opt-in only.

## What to audit (in order, confirm each block separately)

### Block 1 — Local branches whose PR is MERGED

For each local branch (excluding master, current branch, and any branch attached to a worktree):
- Run `gh pr list --head <branch> --state merged --json number,title,mergedAt --limit 1`
- If a merged PR exists, add to the cleanup candidate list with: branch name, PR number, merged date.

**EXCLUDE these worktree-attached branches** (per the manual-review queue from the 2026-04-30 cleanup):
- `claude/competent-benz-1e7c41`
- `feature/softphone-fixes`

Verify via `git worktree list` that no candidate is attached to a worktree before listing it.

Present the list:
```
Local branches with merged PRs (N total):
  feature/foo               → PR #325 (merged 3 days ago)
  fix/inventory-thing       → PR #321 (merged 1 week ago)
  ...
```

Ask: "Delete all N? Or pick specific ones (comma-separated)?"

On "yes" or "all": run `git branch -d <branch>` per branch (use `-d` not `-D` — git refuses if it can't verify the branch is merged into the upstream, which is the safety net for squash-merges where the local commits don't appear in master). If `-d` refuses for a branch with a confirmed-merged PR, ask Jemiko per-branch whether to force with `-D`.

### Block 2 — Git stashes

Run `git stash list --format='%gd|%gs|%cr|%H'` and parse.

For each stash, gather:
- Index (`stash@{N}`)
- Branch the stash was created on (parsed from `%gs` — typically `WIP on <branch>:` or `On <branch>:`)
- Age (relative — `3 weeks ago`)
- First 3 changed file paths (`git stash show <index> --name-only | head -3`)
- Stash subject line

Present the table:
```
Git stashes (N total):
  stash@{0}  feat/softphone-ui-refine    2 days ago    3 files   "softphone-v1.12.0-wip"
  stash@{1}  audit/phase5/launch-readiness 1 week ago  5 files   "rebase/stats-correctness: stash phase5 WIP"
  ...
```

**Flag risky-to-drop stashes:**
- Less than 7 days old → flag with ⚠️
- Original branch still exists locally (not merged to master) → flag with ⚠️
- Diff > 200 lines → flag with ⚠️ (might be substantial work)

**Recommend per stash** (after the table):
- ✅ safe-to-drop: stash on a branch that's been merged + deleted, age > 30 days, small diff
- ⚠️ review: any flagged condition above
- ❓ unclear: ask Jemiko what's in it

Ask per-stash or in batches: "Drop stash@{N}? (yes / no / show me what's in it)"

On "show me": run `git stash show -p <index>` and show the diff. Then ask again.

On "yes": `git stash drop <index>` — and IMPORTANT, drop in REVERSE INDEX ORDER (highest index first) so lower indices stay stable.

### Block 3 — Local branches with NO PR (lower priority)

Find branches that exist locally but have never had a PR opened:
- `git for-each-ref --format='%(refname:short)' refs/heads/`
- For each, `gh pr list --head <branch> --state all --json number --limit 1` — if empty array, no PR ever existed.
- Skip master, current branch, worktree-attached branches.

Present as informational only, with the warning: "These branches never had a PR. Could be abandoned local experiments OR work-in-progress you want to keep. I won't delete without explicit per-branch confirmation."

Show: branch name, last commit date, last commit message.

Ask: "Want to delete any? (list specific names, or 'skip')"

## Final report

After all three blocks complete:
- N branches deleted
- N stashes dropped
- Any errors encountered (per-item)
- Reminder: deleted branches recoverable from `git reflog` for ~90 days; commits already in master if PR was merged

## Safety rules (enforced)

- NEVER delete current branch (`git branch --show-current`)
- NEVER delete master
- NEVER delete a worktree-attached branch (verify via `git worktree list`)
- NEVER auto-drop a stash — always confirm per stash or in named batches
- NEVER use `git branch -D` without Jemiko's explicit per-branch override
- NEVER touch remote branches (`origin/*`) — local-only cleanup
- If unsure about a stash's contents, default to keeping it
