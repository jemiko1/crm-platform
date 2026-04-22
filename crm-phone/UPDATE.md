# CRM28 Phone — Update & Release Process

## How Auto-Update Works

CRM28 Phone uses [electron-updater](https://www.electron.build/auto-update) with
a self-hosted update feed at `https://crm28.asg.ge/downloads/phone/`.

1. On startup the app silently checks `latest.yml` from the VM static files.
2. If a newer version exists it downloads the installer in the background.
3. When the download completes a dialog asks the user to restart.
4. On restart the NSIS installer patches the existing installation in-place — no
   uninstall / reinstall needed.
5. Users can also trigger a manual check via **Tray → Check for Updates** or
   **Settings → About & Updates → Check for Updates**.

## Release Process

```bash
cd crm-phone

# 1. Bump version in package.json
# edit package.json → "version": "X.Y.Z"

# 2. Build the installer
npm run pack

# 3. Upload to VM (requires VPN)
scp -i ~/.ssh/id_ed25519_vm "release/CRM28 Phone Setup X.Y.Z.exe" Administrator@192.168.65.110:C:/crm/downloads/phone/CRM28-Phone-Setup-X.Y.Z.exe
scp -i ~/.ssh/id_ed25519_vm "release/CRM28 Phone Setup X.Y.Z.exe.blockmap" Administrator@192.168.65.110:C:/crm/downloads/phone/CRM28-Phone-Setup-X.Y.Z.exe.blockmap
scp -i ~/.ssh/id_ed25519_vm release/latest.yml Administrator@192.168.65.110:C:/crm/downloads/phone/latest.yml

# 4. Update the stable download link
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 "Copy-Item 'C:\crm\downloads\phone\CRM28-Phone-Setup-X.Y.Z.exe' 'C:\crm\downloads\phone\CRM28-Phone-Setup.exe' -Force"

# 5. (Optional) Create GitHub release for tracking
gh release create vX.Y.Z "release/CRM28 Phone Setup X.Y.Z.exe" --title "CRM28 Phone vX.Y.Z" --notes "changelog"
```

### What gets uploaded to VM

| File | Path on VM | Purpose |
|------|-----------|---------|
| `CRM28-Phone-Setup-X.Y.Z.exe` | `C:\crm\downloads\phone\` | Versioned installer |
| `CRM28-Phone-Setup-X.Y.Z.exe.blockmap` | `C:\crm\downloads\phone\` | Delta updates |
| `latest.yml` | `C:\crm\downloads\phone\` | Version metadata (auto-updater checks this) |
| `CRM28-Phone-Setup.exe` | `C:\crm\downloads\phone\` | Stable download link (copy of latest) |

Nginx serves these at `https://crm28.asg.ge/downloads/phone/` — public, no auth required.

**If `latest.yml` is missing or not updated, the auto-updater cannot detect new versions.**

## How Users Receive Updates

1. App launches → checks `latest.yml` after 5 seconds
2. Finds newer version → downloads silently in background
3. Download completes → "Update Ready — Restart?" dialog
4. User clicks "Restart" → app quits, NSIS applies update, app relaunches
5. If user clicks "Later" → update is applied on next app quit

## Public Download Link

Users download the latest version from the CRM header settings icon, which links to:
`https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup.exe`

This is a stable URL that always points to the latest installer.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ENOENT: app-update.yml` | Built without `publish` config | Rebuild with current `electron-builder.yml` |
| "No update available" but new version exists | `latest.yml` not uploaded to VM | SCP `latest.yml` to `C:\crm\downloads\phone\` |
| Download stalls | Network / firewall | Check proxy settings; retry |
| Update installs but old version remains | NSIS per-machine vs per-user mismatch | Uninstall old version first, then install new |
| Auto-updater error on startup | VPN-only access or VM nginx down | Check `https://crm28.asg.ge/downloads/phone/latest.yml` is accessible |

## Changelog

### v1.10.2 — DND visibility + layout fixes (April 2026)

**DND clicking produced no visible feedback:**
- The hook was calling `setError(res.reason)` but nothing in `PhonePage` rendered it. Errors fell into the void.
- No diagnostic logs — the renderer's devtools console and the main-process log file had nothing to attribute a silent failure to.

Fix:
- `useDnd` now logs every transition (`[DND] hydrating…`, `[DND] toggle(true): starting`, etc.) to both the renderer devtools console AND the main-process log at `%APPDATA%/crm-phone/crm-phone-debug.log`. Any AMI / JWT / preload-mismatch failure is now attributable.
- `PhonePage` renders a small red error chip in the footer whenever `dndError` is non-null. Same treatment as `breakError` got in v1.10.0.
- `useDnd` now catches synchronously-chained throws (e.g. `window.crmPhone.dnd` undefined after a partial upgrade) and surfaces the message instead of leaving it on React's async unhandled-rejection void.

**Break modal was clipping at small window sizes:**
- Icon shrunk 88px → 64px, elapsed counter 3.5rem → 2.75rem
- Body switched from `justifyContent: center` to `flex-start` + `overflowY: auto`
- Padding tightened, flex-shrink applied to chrome elements

**Phone body was trimming content during calls:**
- At default 380×680, a connected call with CallerCard + DTMF pad + footer overflowed the viewport and the Log Out / Break buttons were pushed off-screen.
- Introduced a `scrollArea` div (`flex: 1; min-height: 0; overflow-y: auto`) around the dynamic middle region. The title bar and footer now stay pinned; only the middle scrolls.

### v1.10.1 — Auto-updater hotfix (April 2026)

Fixes `Update error: (0, builder_util_runtime_1.retry) is not a function` when clicking "Check for Updates" on v1.9.0 / v1.10.0 installs.

Root cause: a copy of `builder-util-runtime@9.2.4` (from `electron-builder`'s own deps, missing the `retry` export added in 9.3.x) was being packaged into the asar instead of the `9.5.1` copy that `electron-updater@6.8.3` requires. At runtime the updater called `retry(...)` on the wrong module and crashed.

Four-part fix (all four are load-bearing — see CLAUDE.md Silent Override Risk #22):
- **`.npmrc` — `shamefully-hoist=true`.** Forces pnpm to expose every transitive dep at top-level, matching the flat layout that `electron-builder` expects.
- **`pnpm.overrides` in `package.json`.** Pins `builder-util-runtime` to `9.5.1` and pre-emptively pins `fs-extra`, `js-yaml`, `semver`, `lazy-val` (all shared between `electron-builder` and `electron-updater`) to avoid the same failure mode on a future dep bump.
- **`packageManager: "pnpm@10.27.0"` in `package.json`.** Corepack refuses wrong-manager installs; the `pnpm.overrides` field is silently ignored by npm, so an accidental `npm install` would reintroduce the bug without this pin.
- **Removed `package-lock.json`.** A stale npm lockfile would override `pnpm.overrides`. `pnpm-lock.yaml` is now the canonical lockfile.

Verified post-build: extracted `release/win-unpacked/resources/app.asar` contains `builder-util-runtime@9.5.1` with `exports.retry = retry` and a matching `retry.js` sibling.

No functional changes to Break or DND.

### v1.10.0 — Break + DND (April 2026)

- **Break** — New button in footer. Click → confirm → softphone fully unregisters from SIP for the break → fullscreen countdown modal → click Resume to re-register. Backend `POST /v1/telephony/breaks/start` is called BEFORE SIP unregisters so the CRM audit log and manager live-monitor see the state change instantly.
- **Cold-start break restoration** — If the operator closes the softphone mid-break, the next launch queries `GET /v1/telephony/breaks/my-current` and shows the modal immediately, skipping SIP register.
- **DND** (Do Not Disturb) — Small toggle in the status bar next to the online indicator. Unlike Break, DND keeps SIP registered — only queue dispatch is paused via `POST /v1/telephony/dnd/enable` → backend AMI `QueuePause`. Direct extension calls still ring. Outbound dialing works.
- **Logout during break** — Break modal has a Log Out button. Calls break-end first, then normal logout; swallows break-end failures so logout always completes (the cron auto-closes stale sessions).
- **Auto-close safety net** — Backend cron closes any active break past `COMPANY_WORK_END_HOUR` (default 19:00) or older than 12h. If triggered while the modal is up, clicking Resume on the modal is still safe (idempotent backend).
- **No persisted DND state** — AMI is source of truth. Cold start queries `GET /v1/telephony/dnd/my-state` to sync the toggle.
- **Minor** — Fixed a pre-existing TypeScript prop-signature mismatch on `onDtmf`/`onToggleMute` that was hidden behind other typecheck errors.

### v1.9.0

- SIP password no longer persisted to disk. Renderer fetches fresh credentials from `/v1/telephony/sip-credentials` on every register/re-register (audit/P0-C).

