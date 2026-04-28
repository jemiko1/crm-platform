import { app, dialog, ipcMain, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { IPC } from "../shared/ipc-channels";

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string }
  | { state: "downloading"; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "not-available" }
  | { state: "error"; message: string };

let currentStatus: UpdateStatus = { state: "idle" };
let manualCheck = false;

function broadcast(status: UpdateStatus) {
  currentStatus = status;
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.UPDATE_STATUS, status);
  }
}

export function setupAutoUpdater(): void {
  if (!app.isPackaged) {
    console.log("[AutoUpdater] Skipping — not packaged (dev mode)");
    return;
  }

  // Feed URL is read from `app-update.yml` baked into the asar at build
  // time (sourced from electron-builder.yml's `publish` block). Provider
  // is `github` against `jemiko1/crm-platform` — public repo, no token
  // needed at runtime. We deliberately do NOT call `setFeedURL()` here:
  // the embedded config is the single source of truth, and any drift
  // between code and YAML is silent breakage. If you ever need to
  // override the feed for a one-off (e.g. internal mirror), do it in
  // electron-builder.yml + a fresh build, not in code.
  //
  // Why GitHub instead of `https://crm28.asg.ge/downloads/phone`:
  //   The previous "generic" feed pointed at a static path on the
  //   production VM. Every release required also SCPing the installer +
  //   latest.yml to that path. That step kept getting skipped, so
  //   operators on older builds could never see new releases — the
  //   "Check for Updates" button just said "up to date" forever. With
  //   the GitHub provider, `gh release create` (or
  //   `electron-builder --publish always`) is the single action that
  //   makes a new version visible to every running softphone.

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for updates...");
    broadcast({ state: "checking" });
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[AutoUpdater] App is up to date.");
    broadcast({ state: "not-available" });
    if (manualCheck) {
      manualCheck = false;
      dialog.showMessageBox({
        type: "info",
        title: "No Updates",
        message: `CRM28 Phone v${app.getVersion()} is up to date.`,
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("update-available", (info) => {
    console.log(`[AutoUpdater] Update available: v${info.version}`);
    manualCheck = false;
    broadcast({ state: "available", version: info.version });
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent);
    console.log(`[AutoUpdater] Download: ${pct}%`);
    broadcast({ state: "downloading", percent: pct });
  });

  autoUpdater.on("update-downloaded", (info) => {
    console.log(`[AutoUpdater] Update downloaded: v${info.version}`);
    broadcast({ state: "downloaded", version: info.version });
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: `CRM28 Phone v${info.version} has been downloaded.\nRestart now to apply the update?`,
        buttons: ["Restart", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdater] Error:", err.message);
    broadcast({ state: "error", message: err.message });
    if (manualCheck) {
      manualCheck = false;
      dialog.showMessageBox({
        type: "error",
        title: "Update Error",
        message: `Failed to check for updates:\n${err.message}`,
        buttons: ["OK"],
      });
    }
  });

  ipcMain.handle(IPC.UPDATE_CHECK, () => {
    manualCheck = true;
    return autoUpdater.checkForUpdates().catch((err) => {
      manualCheck = false;
      console.warn("[AutoUpdater] Manual check failed:", err.message);
      broadcast({ state: "error", message: err.message });
    });
  });

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle(IPC.UPDATE_GET_VERSION, () => app.getVersion());

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.warn("[AutoUpdater] Startup check failed:", err.message);
    });
  }, 5_000);
}

export function checkForUpdatesManually(): void {
  if (!app.isPackaged) return;
  manualCheck = true;
  autoUpdater.checkForUpdates().catch((err) => {
    manualCheck = false;
    console.warn("[AutoUpdater] Manual check failed:", err.message);
  });
}
