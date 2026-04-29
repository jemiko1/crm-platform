# CRM28 Phone — Update & Release Process

**Moved.** See [`../docs/SOFTPHONE_RELEASE_PROCEDURE.md`](../docs/SOFTPHONE_RELEASE_PROCEDURE.md).

The release flow is now a single command (`pnpm run release` or
`pnpm run release:win`) that builds and ships in one atomic step.
The old multi-step procedure that lived here was the source of
"Check for Updates says up to date even after I shipped a release"
because the SCP step kept being skipped.
