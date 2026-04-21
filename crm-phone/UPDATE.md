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

