# Softphone Release Procedure

How to ship a new softphone version so existing operators auto-update.

## TL;DR

```bash
cd crm-phone
# bump version in package.json (e.g. 1.12.2 -> 1.12.3)
pnpm run build
pnpm exec electron-builder --win
gh release create vX.Y.Z \
  "release/CRM28 Phone Setup X.Y.Z.exe" \
  "release/CRM28 Phone Setup X.Y.Z.exe.blockmap" \
  release/latest.yml \
  --title "CRM28 Phone vX.Y.Z" \
  --notes "..."
```

That's it. Operators auto-update on next launch.

## How auto-update works

1. `electron-builder.yml` has `publish.provider: github` pointing at
   `jemiko1/crm-platform`. At build time, electron-builder bakes this
   into `app-update.yml` inside the asar bundle.
2. `electron-updater` reads `app-update.yml` at runtime, calls
   `https://api.github.com/repos/jemiko1/crm-platform/releases/latest`,
   compares the tag (`vX.Y.Z`) against `app.getVersion()`. If higher,
   it downloads the matching `.exe` from the release assets.
3. `latest.yml` is also published as a release asset — `electron-updater`
   uses it to verify the installer SHA-512 before applying.

The repo is public, so no auth tokens are needed at runtime. The user's
OS just needs to reach `api.github.com` and `github-releases.githubusercontent.com`.

## Release assets that MUST be uploaded

GitHub release for vX.Y.Z must include all three files produced by
`electron-builder --win` in `crm-phone/release/`:

| File | Purpose |
|---|---|
| `CRM28 Phone Setup X.Y.Z.exe` | The installer. |
| `CRM28 Phone Setup X.Y.Z.exe.blockmap` | Differential update map (lets `electron-updater` download only changed bytes if `differentialPackage: true` is set, which it is by default for NSIS). |
| `latest.yml` | Manifest with version, file URL, SHA-512, file size, releaseDate. `electron-updater` reads this to know what's available. |

If `latest.yml` is missing, `electron-updater` will fail with
`HttpError: 404 Not Found`. If the SHA in `latest.yml` doesn't match the
uploaded `.exe` (e.g. you uploaded an installer rebuilt after the
manifest), the download succeeds but verification fails and the update
is rejected.

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| "Up to date" but you just shipped a release | Tag doesn't start with `v` | Tag must be `vX.Y.Z` (matches `vPrefixedTagName: true` in `electron-builder.yml`). |
| "Up to date" with correct tag | Release marked as draft or pre-release | Mark as a regular release. `electron-updater` only sees `releaseType: release` (which is the default for `gh release create`). |
| Update download fails with SHA mismatch | Re-built the installer after running `gh release create`, didn't re-upload `latest.yml` | Always upload all three assets together. If you rebuild, delete the release and re-create. |
| One operator stuck on old version | Their machine can't reach GitHub | Manual reinstall: send them the `.exe` directly, or check their corporate firewall. |
| Update appears to download but doesn't apply | NSIS installer needs admin (`perMachine: true`) | The auto-elevate flow handles this; if it fails the user sees a UAC prompt. If they decline, retry on next restart. |

## When to bump version

`semver` rules apply:

- **Patch (1.12.0 → 1.12.1)**: bug fixes, security patches, small UI tweaks.
- **Minor (1.12.0 → 1.13.0)**: new features that don't break operator workflow.
- **Major (1.x.x → 2.0.0)**: breaking changes (config format, IPC channel renames).

Auto-update applies regardless of bump size — `electron-updater` just
compares semver. `allowDowngrade: false` is set, so we can't accidentally
ship a regression that downgrades production.

## Verifying the release worked

After `gh release create` returns the release URL:

1. **From a test machine running an older softphone version**, click
   "Check for Updates" in Settings. Should show "Update available — vX.Y.Z".
2. **From a fresh PowerShell** (no softphone installed):
   ```powershell
   curl https://api.github.com/repos/jemiko1/crm-platform/releases/latest | jq -r .tag_name
   ```
   Should print `vX.Y.Z`. If it prints an older tag, the release isn't
   "latest" yet (most likely it's still marked as a draft).
3. **Cross-check `latest.yml`**:
   ```powershell
   curl https://github.com/jemiko1/crm-platform/releases/latest/download/latest.yml
   ```
   Should match what's in your `release/` directory.

## Historical context

Before v1.12.2 (April 2026), the auto-updater used `provider: generic`
pointed at `https://crm28.asg.ge/downloads/phone/`, a static path served
by nginx on the production VM. Every release required SCPing the
installer + `latest.yml` to that path AFTER creating the GitHub release.
That manual step kept getting skipped, so operators on older builds saw
"up to date" indefinitely.

v1.12.2 switched to `provider: github`. The single action that makes a
new version visible to all operators is now `gh release create`. The VM
nginx path still works (and was bridged one last time at the v1.12.2
release to migrate v1.12.0/v1.12.1 operators) but is no longer the
source of truth.

If you ever need an internal mirror (air-gapped network, custom
distribution), set up a CI job that watches GitHub releases and pushes
to your mirror — but **don't change `app-update.yml` to point at it**.
The single-source-of-truth property is what makes this reliable.
