import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  Notification,
  nativeImage,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { SipManager } from "./sip-manager";
import { startLocalServer } from "./local-server";
import {
  getSession,
  setSession,
  getCrmBaseUrl,
} from "./session-store";
import { IPC } from "../shared/ipc-channels";
import { setupAutoUpdater } from "./auto-updater";
import type { AppLoginResponse, ContactLookupResult } from "../shared/types";

const logFile = path.join(app.getPath("userData"), "crm-phone-debug.log");
const origLog = console.log;
const origErr = console.error;
console.log = (...args: any[]) => {
  const line = `[${new Date().toISOString()}] ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`;
  fs.appendFileSync(logFile, line);
  origLog(...args);
};
console.error = (...args: any[]) => {
  const line = `[${new Date().toISOString()}] ERROR ${args.map(a => typeof a === "string" ? a : JSON.stringify(a)).join(" ")}\n`;
  fs.appendFileSync(logFile, line);
  origErr(...args);
};
console.log("[INIT] CRM Phone starting, log file:", logFile);

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const sipManager = new SipManager();

const isDev = !app.isPackaged;
const RENDERER_URL = isDev
  ? "http://localhost:5173"
  : `file://${path.join(__dirname, "../renderer/index.html")}`;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 640,
    minWidth: 340,
    minHeight: 500,
    resizable: true,
    frame: false,
    transparent: false,
    skipTaskbar: false,
    show: false,
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
  const iconPath = isDev
    ? path.join(__dirname, "../../resources/tray-icon.png")
    : path.join(process.resourcesPath, "tray-icon.png");

  let trayIcon: Electron.NativeImage;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip("CRM Phone");

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
        label: sipManager.registered ? "SIP: Registered" : "SIP: Offline",
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Show",
        click: () => {
          mainWindow?.show();
          mainWindow?.focus();
        },
      },
      {
        label: "Quit",
        click: () => {
          mainWindow?.destroy();
          app.quit();
        },
      },
    ]);
    tray?.setContextMenu(menu);
  };

  updateMenu();
  sipManager.on("registration-state", updateMenu);
  sipManager.on("state-change", updateMenu);

  tray.on("double-click", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function setupIpc(): void {
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

    if (data.telephonyExtension) {
      console.log("[AUTH] Calling sipManager.register()...");
      await sipManager.register(data.telephonyExtension);
      console.log("[AUTH] sipManager.register() completed, registered:", sipManager.registered);
    } else {
      console.log("[AUTH] No telephonyExtension in login response");
    }

    return data;
  });

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    await sipManager.unregister();
    setSession(null);
    return { ok: true };
  });

  ipcMain.handle(IPC.AUTH_GET_SESSION, () => {
    const session = getSession();
    return {
      session,
      sipRegistered: sipManager.registered,
      callState: sipManager.callState,
      activeCall: sipManager.activeCall,
    };
  });

  ipcMain.handle(IPC.PHONE_DIAL, async (_event, number: string) => {
    await sipManager.dial(number);
  });

  ipcMain.handle(IPC.PHONE_ANSWER, async () => {
    await sipManager.answer();
  });

  ipcMain.handle(IPC.PHONE_HANGUP, async () => {
    await sipManager.hangup();
  });

  ipcMain.handle(IPC.PHONE_HOLD, async () => {
    await sipManager.hold();
  });

  ipcMain.handle(IPC.PHONE_UNHOLD, async () => {
    await sipManager.unhold();
  });

  ipcMain.handle(IPC.PHONE_DTMF, (_event, tone: string) => {
    sipManager.sendDtmf(tone);
  });

  ipcMain.handle(IPC.PHONE_MUTE, () => sipManager.toggleMute());

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
      return (await res.json()) as ContactLookupResult;
    } catch {
      return null;
    }
  });

  ipcMain.handle("debug:get-log-path", () => logFile);
  ipcMain.handle("debug:get-logs", () => {
    try { return fs.readFileSync(logFile, "utf-8"); } catch { return "No log file"; }
  });

  ipcMain.on(IPC.APP_QUIT, () => {
    mainWindow?.destroy();
    app.quit();
  });

  ipcMain.on(IPC.APP_SHOW, () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

function forwardSipEvents(): void {
  sipManager.on("state-change", (state) => {
    mainWindow?.webContents.send(IPC.PHONE_STATE_CHANGED, state);
  });

  sipManager.on("registration-state", (registered) => {
    mainWindow?.webContents.send(IPC.PHONE_SIP_STATUS, registered);
  });

  sipManager.on("incoming-call", (call) => {
    mainWindow?.webContents.send(IPC.PHONE_INCOMING_CALL, call);
    mainWindow?.show();
    mainWindow?.focus();

    if (Notification.isSupported()) {
      const notif = new Notification({
        title: "Incoming Call",
        body: call.remoteName || call.remoteNumber,
        urgency: "critical",
      });
      notif.on("click", () => {
        mainWindow?.show();
        mainWindow?.focus();
      });
      notif.show();
    }
  });

  sipManager.on("error", (msg) => {
    console.error("[SIP Error]", msg);
    mainWindow?.webContents.send("sip:error", msg);
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

    if (session.telephonyExtension) {
      console.log("[RESTORE] Registering SIP with:", JSON.stringify({
        ext: session.telephonyExtension.extension,
        server: session.telephonyExtension.sipServer,
        pwdSet: !!session.telephonyExtension.sipPassword,
      }));
      await sipManager.register(session.telephonyExtension);
      console.log("[RESTORE] SIP register completed, registered:", sipManager.registered);
    } else {
      console.log("[RESTORE] No telephonyExtension to register");
    }
  } catch (err: any) {
    console.log("[RESTORE] Error:", err.message);
    if (session.telephonyExtension) {
      console.log("[RESTORE] Will retry in 5s");
      setTimeout(() => {
        sipManager
          .register(session.telephonyExtension!)
          .catch((e: any) => console.log("[RESTORE] Retry failed:", e.message));
      }, 5000);
    }
  }
}

app.whenReady().then(async () => {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return;
  }

  app.on("second-instance", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  createTray();
  createWindow();
  setupIpc();
  forwardSipEvents();

  startLocalServer(sipManager, {
    onSessionChanged: (data) => {
      mainWindow?.webContents.send(IPC.AUTH_SESSION_CHANGED, data);
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
