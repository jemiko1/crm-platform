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
    const res = await fetch(`${baseUrl}/auth/app-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({ message: "Login failed" }))) as { message?: string };
      throw new Error(body.message || "Login failed");
    }

    const data = (await res.json()) as AppLoginResponse;
    setSession(data);

    if (data.telephonyExtension) {
      await sipManager.register(data.telephonyExtension);
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
  if (!session) return;

  try {
    const baseUrl = getCrmBaseUrl();
    const res = await fetch(`${baseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });

    if (!res.ok) {
      setSession(null);
      return;
    }

    if (session.telephonyExtension) {
      await sipManager.register(session.telephonyExtension);
    }
  } catch {
    // Network down -- keep session, try SIP later
    if (session.telephonyExtension) {
      setTimeout(() => {
        sipManager
          .register(session.telephonyExtension!)
          .catch(() => {});
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
