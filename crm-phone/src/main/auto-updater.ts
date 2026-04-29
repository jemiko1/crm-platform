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

  // Feed URL is read from `app-update.yml` baked into the asar at
  // build time, sourced from electron-builder.yml's `publish` block.
  // Today: provider=generic, url=https://crm28.asg.ge/downloads/phone.
  // We deliberately do NOT call `setFeedURL()` here — code-set feed
  // silently overrides the embedded YAML, which means a build-config
  // change (e.g. moving the feed) can be defeated by a stale code
  // path. Single source of truth: electron-builder.yml only.
  //
  // The feed lives on the VM, not on GitHub releases, because the
  // GitHub repo is going to be made private and any github-provider
  // setup would lose unauthenticated read access. The release script
  // (crm-phone/scripts/release.sh) makes the VM upload step
  // structurally unforgettable — it's the SAME command that produces
  // the build, not a separate manual SCP afterward.

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
