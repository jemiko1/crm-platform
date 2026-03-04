import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

let manualCheck = false;

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.log("[AutoUpdater] Checking for updates...");
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[AutoUpdater] No update available.");
    if (manualCheck) {
      manualCheck = false;
      dialog.showMessageBox({
        type: "info",
        title: "No Updates",
        message: "CRM28 Phone is up to date.",
        buttons: ["OK"],
      });
    }
  });

  autoUpdater.on("update-available", (info) => {
    manualCheck = false;
    console.log(`[AutoUpdater] Update available: v${info.version}`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: `CRM28 Phone v${info.version} has been downloaded. Restart now to apply the update?`,
        buttons: ["Restart", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("[AutoUpdater] Error:", err.message);
  });

  setTimeout(
    () =>
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn("[AutoUpdater] Check failed:", err.message);
      }),
    3000,
  );
}

export function checkForUpdatesManually(): void {
  if (!app.isPackaged) return;
  manualCheck = true;
  autoUpdater.checkForUpdates().catch((err) => {
    manualCheck = false;
    console.warn("[AutoUpdater] Manual check failed:", err.message);
  });
}
