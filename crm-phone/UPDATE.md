# CRM28 Phone — Update & Release Process

## How Auto-Update Works

CRM28 Phone uses [electron-updater](https://www.electron.build/auto-update) with
GitHub Releases as the update feed.

1. On startup the app silently checks `latest.yml` from the latest GitHub Release.
2. If a newer version exists it downloads the installer in the background.
3. When the download completes a dialog asks the user to restart.
4. On restart the NSIS installer patches the existing installation in-place — no
   uninstall / reinstall needed.
5. Users can also trigger a manual check via **Tray → Check for Updates** or
   **Settings → About & Updates → Check for Updates**.

## Prerequisites

### GH_TOKEN (for publishing only)

A GitHub PAT is needed to **publish** releases from CI or locally.
End-users do **not** need any token — NSIS updates are downloaded from public
GitHub Release assets.

1. Go to GitHub → Settings → Developer settings → Personal access tokens
2. Create a token with **`repo`** scope
3. For CI: add it as a repository secret named `GH_TOKEN`
4. For local publishing: `set GH_TOKEN=ghp_xxx` before running the release command

## Release Process

### Option A — Local release (current workflow)

```bash
cd crm-phone

# 1. Bump version
npm version patch          # or minor / major

# 2. Build + publish to GitHub Releases
set GH_TOKEN=ghp_xxx
npm run release
```

`electron-builder --publish always` will:
- Build the NSIS installer (`CRM28 Phone Setup X.Y.Z.exe`)
- Generate `latest.yml` (update metadata)
- Upload both to a new GitHub Release tagged `vX.Y.Z`

### Option B — GitHub Actions (automated)

Create `.github/workflows/crm-phone-release.yml`:

```yaml
name: CRM28 Phone Release
on:
  push:
    tags:
      - "crm-phone-v*"
jobs:
  build:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
        working-directory: crm-phone
      - run: npm run release
        working-directory: crm-phone
        env:
          GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

Then to release:

```bash
git tag crm-phone-v1.3.0
git push origin crm-phone-v1.3.0
```

### 3. Verify

After publishing, the GitHub Release should contain:

| File | Purpose |
|------|---------|
| `CRM28 Phone Setup X.Y.Z.exe` | Installer |
| `CRM28 Phone Setup X.Y.Z.exe.blockmap` | Delta updates |
| `latest.yml` | Version metadata polled by installed apps |

If `latest.yml` is missing, the auto-updater cannot detect the new version.

## How Users Receive Updates

1. App launches → checks `latest.yml` after 5 seconds
2. Finds newer version → downloads silently in background
3. Download completes → "Update Ready — Restart?" dialog
4. User clicks "Restart" → app quits, NSIS applies update, app relaunches
5. If user clicks "Later" → update is applied on next app quit

## Testing an Update Locally

### Step-by-step simulation

1. **Install the current production build** on a test machine (e.g. v1.2.5).

2. **Bump version locally**:
   ```bash
   cd crm-phone
   # edit package.json → "version": "1.2.6"
   ```

3. **Build & publish** (creates a GitHub Release with the installer + latest.yml):
   ```bash
   set GH_TOKEN=ghp_your_token
   npm run release
   ```
   Alternatively, to create a **draft** release for safer testing:
   ```bash
   npm run build
   npx electron-builder --win --publish always
   ```
   Then go to GitHub → Releases → find the draft → keep it as draft.

4. **Publish the release** on GitHub (click "Publish release") — or if you
   want to test with drafts, temporarily set `autoUpdater.allowPrerelease = true`
   in `auto-updater.ts`.

5. **Launch the installed v1.2.5** — it should detect v1.2.6, download it,
   and prompt to restart.

6. **Click "Restart"** — verify the app relaunches and reports v1.2.6 in
   Settings → About & Updates.

7. **Test manual check** — open Settings → About & Updates → "Check for Updates"
   when already on latest. Should show "You're up to date."

### Quick validation checklist

- [ ] App starts without `ENOENT: app-update.yml` error
- [ ] Startup auto-check runs (check log file)
- [ ] Tray → "Check for Updates" shows dialog
- [ ] Settings page shows correct version
- [ ] When update exists: download progress → restart dialog → successful update
- [ ] When no update: "You're up to date" message

## Rollback

1. Go to GitHub → Releases → find the broken release → delete or convert to draft.
2. Ship a hotfix with a higher version number.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ENOENT: app-update.yml` | Built without `publish` config | Rebuild with current `electron-builder.yml` |
| "No update available" but release exists | `latest.yml` missing from release | Re-publish with `npm run release` |
| Download stalls | Network / firewall | Check proxy settings; retry |
| Update installs but old version remains | NSIS per-machine vs per-user mismatch | Uninstall old version first, then install new |
