# CRM28 Phone — Update & Release Process

## How Auto-Update Works

CRM28 Phone uses [electron-updater](https://www.electron.build/auto-update) with GitHub Releases as the update feed.

1. On startup the app silently fetches `latest.yml` from the GitHub Release.
2. If a newer version is found it downloads in the background.
3. When the download completes a dialog prompts the user to restart.
4. The user can also trigger a manual check via **Tray → Check for Updates**.

## Prerequisites

Add a `GH_TOKEN` secret to the repository before the first release:

1. GitHub → Settings → Secrets → Actions → **New repository secret**
2. Name: `GH_TOKEN`
3. Value: a GitHub PAT with **`repo`** scope (write access to create releases)

The token is used only by GitHub Actions to publish releases.
Users' machines do not require a token to download NSIS updates.

## Release Process

### 1. Bump the version

In `crm-phone/package.json`:
```json
"version": "1.3.0"
```

### 2. Commit and push to dev

```bash
git add crm-phone/package.json
git commit -m "chore(crm-phone): bump version to 1.3.0"
git push origin dev
```

### 3. Tag the release from master

After the version bump is merged to master, push the tag. The tag can be created from any commit on master that includes the version bump — crm-phone deploys independently via tags, not the web app release:

```bash
git tag crm-phone-v1.3.0
git push origin crm-phone-v1.3.0
```

### 4. GitHub Actions builds and publishes

The `crm-phone-release.yml` workflow runs on `windows-latest` and publishes:

* `CRM28 Phone Setup 1.3.0.exe`
* `CRM28 Phone Setup 1.3.0.exe.blockmap`
* `latest.yml` ← update metadata polled by installed apps

### 5. Users auto-update

On next startup, installed apps check `latest.yml`, find the newer version, and download silently.

---

## Testing an Update (Simulating)

1. Install the current production build (e.g. v1.2.5) on a test machine.
2. Bump `package.json` to `1.2.6` locally.
3. Run `npm run release` locally with `GH_TOKEN` set → creates a **Draft** GitHub Release.
4. Keep the release as **Draft** on GitHub (do not publish).
5. Temporarily add `autoUpdater.allowPrerelease = true` in `auto-updater.ts` for testing.
6. Launch installed v1.2.5 — confirm update is detected, downloaded, and restart dialog appears.
7. Click "Restart" — verify the app relaunches as v1.2.6.
8. Test **Tray → Check for Updates** when already on latest — confirm "You're up to date" dialog.
9. Delete the draft release and revert `allowPrerelease` after testing.

---

## Rollback

1. Edit the broken GitHub Release → convert to Draft or delete it.
2. Ship a hotfix tagged `crm-phone-vX.Y.Z+1`.
