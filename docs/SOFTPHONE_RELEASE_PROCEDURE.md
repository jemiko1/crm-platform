# Softphone Release Procedure

How to ship a new softphone version so existing operators auto-update.

## TL;DR

```bash
cd crm-phone
# bump version in package.json, e.g. 1.12.3 -> 1.12.4
pnpm run release             # bash (Git Bash on Windows, macOS, Linux)
# OR
pnpm run release:win         # PowerShell (Windows)
```

That single command:

1. Builds the installer (`pnpm run build` + `electron-builder --win`).
2. Verifies `latest.yml` and the installer agree on the filename.
3. SCPs `*.exe` + `*.exe.blockmap` + `latest.yml` to the production VM
   (`Administrator@192.168.65.110:C:/crm/downloads/phone/`).
4. Refreshes the version-less stable copy `CRM28-Phone-Setup.exe`
   on the VM via SSH `Copy-Item -Force` (this is the file the
   website's "Download Phone App" button serves).
5. Re-fetches `https://crm28.asg.ge/downloads/phone/latest.yml` and
   verifies it now reports the new version. (If nginx is serving from
   a different path or the upload failed silently, the script aborts.)
6. Issues a HEAD against `https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup.exe`
   and verifies its byte-size matches the just-built installer. (If
   the SSH `Copy-Item` silently failed, the website serves a stale
   build while auto-update serves the new one — a two-URL skew that
   is the hardest class of bug to diagnose later.)
7. Creates a GitHub release for changelog / audit trail (skippable
   with `--no-github` / `-NoGithub`; will silently skip if `gh` is
   not authenticated, which is what happens once the repo is private).

Operators auto-update on next launch. New users hitting the website
"Download Phone App" button get the same version.

## The release contract

A successful release means **all four** of these are true. The release
script enforces them; do not consider a release shipped if any are
missing.

| URL | Source | Used by |
|---|---|---|
| `https://crm28.asg.ge/downloads/phone/latest.yml` | uploaded by SCP step (3) | `electron-updater` in every running softphone — version check |
| `https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup-X.Y.Z.exe` | uploaded by SCP step (3) | `electron-updater` — actual binary download (URL is taken from `latest.yml`'s `path:` field) |
| `https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup-X.Y.Z.exe.blockmap` | uploaded by SCP step (3) | `electron-updater` — differential update; not strictly required (auto-update falls back to full download if missing) but always uploaded |
| `https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup.exe` | refreshed by SSH `Copy-Item` step (4) | website "Download Phone App" buttons in `header-settings.tsx` and `phone-mismatch-banner.tsx` — new-user install |

Existing users → auto-update via the first three URLs.
New users → download via the fourth URL.

**If you ever see one URL agree but another disagree on what version
is current, you have a stale release and existing-vs-new users will
get different builds.** The script's verification steps (5) and (6)
catch this before the release reports success.

## When NOT to use the script

- **Don't manually `scp` files to the VM.** The script does this for
  a reason — bypassing it skips the post-upload verification, which is
  exactly the failure mode that produced the v1.10.x → v1.12.0
  drift. If the script is broken, fix the script.
- **Don't change a download URL in the frontend without first
  confirming the URL works.** The website buttons point at the stable
  filename, which only exists if the release script's step (4) ran.
- **Don't add a separate "publish to GitHub" step.** The script does
  this. Once the repo is private and `gh release create` starts
  failing for non-collaborators, the script silently skips it (the
  VM upload — what actually matters for ops — is unaffected).

## How auto-update works

The Electron softphone uses
[`electron-updater`](https://www.electron.build/auto-update). At build
time, `electron-builder` bakes the `publish` block from
`crm-phone/electron-builder.yml` into `app-update.yml` inside the asar
bundle. At runtime, `electron-updater` reads that file and:

1. Fetches `https://crm28.asg.ge/downloads/phone/latest.yml`.
2. Compares the `version` field to `app.getVersion()`.
3. If higher, downloads the installer URL given in `latest.yml`'s
   `path` field, relative to the feed URL.
4. Verifies the installer SHA-512 against `latest.yml`.
5. Prompts the operator to restart and apply.

The `setupAutoUpdater()` function in `crm-phone/src/main/auto-updater.ts`
deliberately does NOT call `setFeedURL()`. The embedded `app-update.yml`
is the single source of truth — code-set feed silently overrides the
embedded YAML, which means a build-config change can be defeated by a
stale code path.

## Why VM, not GitHub releases

We considered `provider: github` against `jemiko1/crm-platform` and even
shipped v1.12.2 with that config. We reverted in v1.12.3 because:

- **The repo is going private.** `electron-updater`'s GitHub provider
  does an unauthenticated read of `api.github.com/repos/.../releases/latest`.
  A private repo returns 404 to unauthenticated requests, so the moment
  the repo flips to private every running v1.12.2 softphone loses
  auto-update. Putting an auth token in the softphone is worse —
  decompiling the binary reveals it.
- **The VM is already infrastructure we operate.** Every operator
  reaches `crm28.asg.ge` for the CRM web app anyway. There's no
  additional network surface or SSO requirement.
- **The reliability argument that pushed us toward GitHub** ("the SCP
  step kept getting skipped") is solved differently in v1.12.3: the
  release script makes the SCP step structurally unforgettable. It's
  the same command that produces the build, not a separate manual step.

## Required release artifacts

The script uploads (and the GitHub release also includes) all three
files produced by `electron-builder --win` in `crm-phone/release/`:

| File | Purpose |
|---|---|
| `CRM28-Phone-Setup-X.Y.Z.exe` | The installer. NSIS, `oneClick: true, perMachine: true`. |
| `CRM28-Phone-Setup-X.Y.Z.exe.blockmap` | Differential update map. `electron-updater` uses it to download only changed bytes. |
| `latest.yml` | Manifest with version, file URL, SHA-512, file size, releaseDate. `electron-updater` reads this to know what's available. |

If `latest.yml` is missing on the VM, `electron-updater` errors with
`HttpError: 404 Not Found`. If the SHA in `latest.yml` doesn't match
the uploaded `.exe` (e.g. you manually re-built between
`electron-builder --win` and `scp`, drifting the hash), the download
succeeds but verification fails and the update is rejected.

The script's `latest.yml path:` cross-check at step 2 catches the
artifactName-vs-filename drift that bit us in v1.12.1 (where `latest.yml`
said hyphens but the file had spaces). The post-upload public-URL check
at step 4 catches the "uploaded to wrong directory" class of failure.

## Common gotchas

| Symptom | Cause | Fix |
|---|---|---|
| `pnpm run release` fails at step 4 with "VM serves version='X'" | nginx serves from a path different from where the script uploaded, OR upload silently failed | SSH to VM and check `C:\crm\downloads\phone\latest.yml`. Compare to nginx config (`vm-configs/nginx*.conf`). |
| `Cannot find scripts/release.sh` | Running from a different cwd | Always run from `crm-phone/`, or use `pnpm run release` which sets cwd correctly. |
| SCP fails with "Permission denied" | Wrong key or key not authorized on VM | Set `SOFTPHONE_SSH_KEY` env var. Verify with `ssh -i $KEY Administrator@192.168.65.110 'echo ok'`. |
| `latest.yml says path=X but expected Y` | `electron-builder.yml` `artifactName` drifted from the convention | Restore `artifactName: CRM28-Phone-Setup-${version}.${ext}` in the `win:` block. |
| Operator stuck on old version after release | Their machine can't reach `crm28.asg.ge` | Check VPN / firewall. Manual reinstall from `https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup-X.Y.Z.exe`. |
| Script runs but operators still see "up to date" | They're running a build from before this release | Their build will pick it up on next launch (default check interval is 5 seconds after start), or they can use Settings → About → Check for Updates. |

## When to bump version

`semver` rules apply:

- **Patch (1.12.3 → 1.12.4)**: bug fixes, security patches, small UI tweaks.
- **Minor (1.12.x → 1.13.0)**: new features that don't break operator workflow.
- **Major (1.x.x → 2.0.0)**: breaking changes (config format, IPC channel renames).

Auto-update applies regardless of bump size — `electron-updater` just
compares semver. `allowDowngrade: false` is set, so we can't accidentally
ship a regression that downgrades production.

## Verifying a release worked

After the script returns "Done. vX.Y.Z is live.":

1. **From a test machine running an older softphone version**: click
   "Check for Updates" in Settings. Should show
   "Update available — vX.Y.Z" within seconds.
2. **From a fresh terminal**:
   ```bash
   curl -s https://crm28.asg.ge/downloads/phone/latest.yml | head -3
   ```
   Should print `version: X.Y.Z`.
3. **Spot-check installer download**:
   ```bash
   curl -sIL "https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup-X.Y.Z.exe" | head -3
   ```
   Should print `HTTP/1.1 200 OK`.

## Environment variables (overrides)

The script reads a few env vars if you need to point at a non-standard
target (e.g. testing against a staging VM). Unset = use the production
defaults below.

| Var | Default | Purpose |
|---|---|---|
| `SOFTPHONE_VM_USER` | `Administrator` | SSH user on the VM |
| `SOFTPHONE_VM_HOST` | `192.168.65.110` | VM IP / hostname |
| `SOFTPHONE_VM_PATH` | `C:/crm/downloads/phone/` | Target directory on VM (must end with `/`) |
| `SOFTPHONE_SSH_KEY` | `~/.ssh/id_ed25519_vm` | Path to private key |

## Historical context

| Version | Release strategy | Why it failed (or didn't) |
|---|---|---|
| pre-1.12.2 | `provider: generic` + manual SCP, separate `gh release create` step. | SCP kept getting skipped → operators saw "up to date" forever. |
| 1.12.2 | `provider: github` against the public repo, `gh release create` only. | Worked, but blocked the founder's plan to make the repo private. |
| 1.12.3+ | `provider: generic` + single-command release script (`pnpm run release`) that bundles build + SCP + verification + optional GH release. | Doesn't depend on repo visibility. SCP can't be skipped because it's part of the same command as the build. |

Once all operators are confirmed on >= v1.12.3, the GitHub repo can be
flipped to private without breaking auto-update.
