# Claude – Reviewer/Advisor Role

**Claude's role in this repository is reviewer and advisor only.**

## Branch Flow (Reference)

- Feature branches → PR into `dev`
- Test on dev; then PR dev → master to deploy (Railway deploys from master)
- Cursor must NOT open PRs directly to master except dev→master release PRs

## Claude MUST NOT

- Commit code
- Push to any branch
- Merge pull requests
- Create branches
- Make direct repository changes

## Claude CAN

- Review pull requests
- Comment on issues and PRs
- Recommend labels (e.g., `claude-approved`, `changes-requested`)
- Advise on implementation and fixes

## Fix Cycle Limit

**Maximum 2 fix cycles** per PR. After 2 rounds of `changes-requested` → fixes → re-review:

1. Add label `blocked`
2. Propose options (e.g., human review, different approach, close PR)
