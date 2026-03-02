import { app, dialog } from "electron";
import { autoUpdater } from "electron-updater";

export function setupAutoUpdater(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    console.log(`[AutoUpdater] Update available: v${info.version}`);
  });

  autoUpdater.on("update-downloaded", (info) => {
    dialog
      .showMessageBox({
        type: "info",
        title: "Update Ready",
        message: `CRM Phone v${info.version} has been downloaded. Restart now to apply the update?`,
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

  autoUpdater.checkForUpdates().catch((err) => {
    console.warn("[AutoUpdater] Check failed:", err.message);
  });
}
