import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  nativeImage,
  session as electronSession,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { startLocalServer } from "./local-server";
import {
  getSession,
  setSession,
  getCrmBaseUrl,
} from "./session-store";
import { IPC } from "../shared/ipc-channels";
import { setupAutoUpdater, checkForUpdatesManually } from "./auto-updater";
import type { AppLoginResponse, CallerLookupResult } from "../shared/types";
import Store from "electron-store";

const settingsStore = new Store({
  defaults: {
    muteRingtone: false,
    overrideApps: true,
    audioInputDeviceId: "",
    audioOutputDeviceId: "",
  },
});

const logFile = path.join(app.getPath("userData"), "crm-phone-debug.log");
const origLog = console.log;
const origErr = console.error;
function writeLog(prefix: string, args: any[]) {
  const line = `[${new Date().toISOString()}] ${prefix}${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`;
  fs.appendFileSync(logFile, line);
}
console.log = (...args: any[]) => { writeLog("", args); origLog(...args); };
console.error = (...args: any[]) => { writeLog("ERROR ", args); origErr(...args); };
console.log("[INIT] CRM28 Phone starting, log file:", logFile);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sipRegistered = false;

const isDev = !app.isPackaged;
const RENDERER_URL = isDev
  ? "http://localhost:5173"
  : `file://${path.join(__dirname, "../renderer/index.html")}`;

function getAppIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(__dirname, "../../resources/icon.ico");
  return nativeImage.createFromPath(iconPath);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 680,
    minWidth: 340,
    minHeight: 500,
    resizable: true,
    frame: false,
    transparent: false,
    skipTaskbar: false,
    show: false,
    icon: getAppIcon(),
    title: "CRM28 Phone",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(RENDERER_URL);

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (e) => {
    e.preventDefault();
    mainWindow?.hide();
  });
}

function createTray(): void {
  const trayIcon = getAppIcon().resize({ width: 16, height: 16 });
  tray = new Tray(trayIcon);
  tray.setToolTip("CRM28 Phone");

  const updateMenu = () => {
    const session = getSession();
    const menu = Menu.buildFromTemplate([
      {
        label: session
          ? `Logged in: ${session.user.email}`
          : "Not logged in",
        enabled: false,
      },
      {
        label: sipRegistered ? "SIP: Registered" : "SIP: Offline",
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Check for Updates",
        click: () => checkForUpdatesManually(),
      },
      {
        label: "Show",
        click: () => { mainWindow?.show(); mainWindow?.focus(); },
      },
      {
        label: "Quit",
        click: () => { mainWindow?.destroy(); app.quit(); },
      },
    ]);
    tray?.setContextMenu(menu);
  };

  updateMenu();
  ipcMain.on(IPC.SIP_STATUS_REPORT, (_e, registered: boolean) => {
    sipRegistered = registered;
    updateMenu();
  });

  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function setupIpc(): void {
  ipcMain.on(IPC.RENDERER_LOG, (_e, level: string, ...args: any[]) => {
    const prefix = level === "error" ? "ERROR [R] " : "[R] ";
    writeLog(prefix, args);
    if (level === "error") origErr("[R]", ...args);
    else origLog("[R]", ...args);
  });

  ipcMain.handle(IPC.SETTINGS_GET, () => settingsStore.store);
  ipcMain.handle(IPC.SETTINGS_SET, (_e, key: string, value: any) => {
    settingsStore.set(key, value);
    return settingsStore.store;
  });

  ipcMain.on(IPC.WIN_SET_ALWAYS_ON_TOP, (_e, flag: boolean) => {
    mainWindow?.setAlwaysOnTop(flag, "screen-saver");
    if (flag) { mainWindow?.show(); mainWindow?.focus(); }
  });

  ipcMain.handle(IPC.AUTH_LOGIN, async (_event, email: string, password: string) => {
    const baseUrl = getCrmBaseUrl();
    console.log("[AUTH] app-login to:", `${baseUrl}/auth/app-login`, "email:", email);
    const res = await fetch(`${baseUrl}/auth/app-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({ message: "Login failed" }))) as { message?: string };
      console.log("[AUTH] Login failed:", res.status, body.message);
      throw new Error(body.message || "Login failed");
    }

    const data = (await res.json()) as AppLoginResponse;
    console.log("[AUTH] Login OK, telephonyExtension:", JSON.stringify(data.telephonyExtension));
    setSession(data);
    return data;
  });

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    setSession(null);
    sipRegistered = false;
    return { ok: true };
  });

  ipcMain.handle(IPC.AUTH_GET_SESSION, () => {
    const session = getSession();
    return { session, sipRegistered };
  });

  ipcMain.handle(IPC.CONTACT_LOOKUP, async (_event, number: string) => {
    const session = getSession();
    if (!session) return null;
    try {
      const baseUrl = getCrmBaseUrl();
      const res = await fetch(
        `${baseUrl}/v1/telephony/lookup?phone=${encodeURIComponent(number)}`,
        { headers: { Authorization: `Bearer ${session.accessToken}` } },
      );
      if (!res.ok) return null;
      return (await res.json()) as CallerLookupResult;
    } catch { return null; }
  });

  ipcMain.handle(IPC.CALL_HISTORY, async (_event, extension: string) => {
    const session = getSession();
    if (!session) return [];
    try {
      const baseUrl = getCrmBaseUrl();
      const res = await fetch(
        `${baseUrl}/v1/telephony/history/${encodeURIComponent(extension)}`,
        { headers: { Authorization: `Bearer ${session.accessToken}` } },
      );
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  });

  ipcMain.handle("debug:get-log-path", () => logFile);
  ipcMain.handle("debug:get-logs", () => {
    try { return fs.readFileSync(logFile, "utf-8"); } catch { return "No log file"; }
  });

  ipcMain.on(IPC.APP_QUIT, () => { mainWindow?.destroy(); app.quit(); });
  ipcMain.on(IPC.APP_SHOW, () => { mainWindow?.show(); mainWindow?.focus(); });
  ipcMain.on(IPC.APP_HIDE, () => { mainWindow?.hide(); });

  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_e, url: string) => {
    if (typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"))) {
      const { shell } = await import("electron");
      await shell.openExternal(url);
    }
  });
}

async function restoreSession(): Promise<void> {
  const session = getSession();
  console.log("[RESTORE] Session exists:", !!session, session?.user?.email);
  if (!session) return;

  try {
    const baseUrl = getCrmBaseUrl();
    console.log("[RESTORE] Fetching /auth/me from:", baseUrl);
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });

    console.log("[RESTORE] /auth/me status:", res.status);
    if (!res.ok) {
      console.log("[RESTORE] Token invalid, clearing session");
      setSession(null);
      return;
    }

    const meData = (await res.json()) as {
      user: {
        telephonyExtension?: {
          extension: string;
          displayName: string;
          sipServer: string | null;
          sipPassword: string | null;
        } | null;
      };
    };

    const freshExt = meData.user?.telephonyExtension ?? null;
    console.log("[RESTORE] Fresh ext from /auth/me:", JSON.stringify(freshExt));

    if (freshExt && (freshExt.extension !== session.telephonyExtension?.extension
        || freshExt.sipServer !== session.telephonyExtension?.sipServer
        || freshExt.sipPassword !== session.telephonyExtension?.sipPassword)) {
      console.log("[RESTORE] Updating session with fresh ext data");
      session.telephonyExtension = freshExt;
      setSession(session);
    }
  } catch (err: any) {
    console.log("[RESTORE] Error:", err.message);
  }
}

app.whenReady().then(async () => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) { app.quit(); return; }

  app.on("second-instance", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  electronSession.defaultSession.setCertificateVerifyProc((_request, callback) => {
    callback(0);
  });

  electronSession.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(true);
  });
  electronSession.defaultSession.setPermissionCheckHandler(() => true);

  createTray();
  createWindow();
  setupIpc();

  startLocalServer(null, {
    onSessionChanged: (data) => {
      mainWindow?.webContents.send(IPC.AUTH_SESSION_CHANGED, data);
    },
    onDial: (number) => {
      if (!mainWindow) return false;
      mainWindow.webContents.send(IPC.PHONE_DIAL, number);
      // Bring window to front so user sees the call
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      return true;
    },
  });

  await restoreSession();
  setupAutoUpdater();
});

app.on("window-all-closed", (e: Event) => {
  e.preventDefault();
});

if (app.isPackaged) {
  app.setLoginItemSettings({
    openAtLogin: true,
    path: process.execPath,
  });
}
