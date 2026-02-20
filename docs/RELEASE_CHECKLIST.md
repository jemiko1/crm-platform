# Release Checklist

> Step-by-step process for promoting code from dev to production.

---

## Pre-release

- [ ] All feature branches merged into `dev`
- [ ] `dev` branch CI is green (all checks passing)
- [ ] Manual smoke test on dev environment (if applicable)
- [ ] No known critical bugs or regressions

---

## Promote dev to staging

1. Open a PR from `dev` to `staging`.
2. Title: `release: prepare vX.Y.Z for staging`
3. Wait for CI to pass (lint, typecheck, unit tests, e2e tests, build).
4. Merge the PR.
5. If a staging environment exists, deploy and verify.

---

## Promote staging to master (production)

1. Open a PR from `staging` to `master`.
2. Title: `release: vX.Y.Z`
3. Description should include:
   - Summary of changes since last release
   - Any migration notes
   - Any manual steps required
4. Wait for CI to pass.
5. Get at least 1 approval.
6. Merge the PR.
7. Tag the release:
   ```bash
   git checkout master
   git pull origin master
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

---

## Post-release

- [ ] Verify production deployment is healthy
- [ ] Monitor logs for errors for at least 15 minutes
- [ ] Announce the release to the team

---

## Database Migration Safety

### Before releasing with migrations

1. Review all pending migrations in `prisma/migrations/`.
2. Ensure migrations are **backward-compatible** when possible:
   - Adding columns: use `DEFAULT` values or make nullable
   - Dropping columns: first deploy code that doesn't use them, then drop in a follow-up release
   - Renaming: add new column, migrate data, remove old column (3-step process)
3. Test migrations against a copy of production data if feasible.

### Migration execution order

Migrations run automatically via `prisma migrate deploy` during CI. In production:

```bash
cd backend/crm-backend
npx prisma migrate deploy
```

This command applies all pending migrations in order. It is safe to run multiple times (idempotent).

### Migration rollback

Prisma does **not** support automatic rollback of applied migrations. If a migration needs to be reverted:

1. **Do NOT use** `prisma migrate reset` in production (it drops and recreates the database).
2. Write a new migration that reverses the changes:
   ```bash
   npx prisma migrate dev --name revert_bad_migration --create-only
   # Edit the generated SQL file to reverse the changes
   npx prisma migrate dev
   ```
3. For emergency situations, write raw SQL directly against the database.

---

## Code Rollback

### Revert a release

If a production release has critical issues:

1. **Revert the merge commit** on `master`:
   ```bash
   git checkout master
   git revert -m 1 <merge-commit-sha>
   git push origin master
   ```
2. Redeploy from the reverted `master`.
3. Investigate and fix the issue on a `hotfix/*` branch.

### Hotfix flow

1. Branch from `master`:
   ```bash
   git checkout -b hotfix/fix-description master
   ```
2. Fix the issue, push, open a PR to `master`.
3. After merge, cherry-pick back to `staging` and `dev`:
   ```bash
   git checkout staging && git cherry-pick <sha> && git push origin staging
   git checkout dev && git cherry-pick <sha> && git push origin dev
   ```

---

## Version Numbering

Use [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking API or schema changes
- **MINOR** (0.X.0): New features, backward-compatible
- **PATCH** (0.0.X): Bug fixes, backward-compatible
