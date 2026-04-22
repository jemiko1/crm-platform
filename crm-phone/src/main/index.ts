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
import { startLocalServer, onSoftphoneLogin, onSoftphoneLogout } from "./local-server";
import {
  getSession,
  setSession,
  getCrmBaseUrl,
} from "./session-store";
import { IPC } from "../shared/ipc-channels";
import { setupAutoUpdater, checkForUpdatesManually } from "./auto-updater";
import type {
  AppLoginResponse,
  CallerLookupResult,
  TelephonyExtensionInfo,
} from "../shared/types";
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

app.setAppUserModelId("ge.asg.crm28-phone");

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

function getTrayIcon(): Electron.NativeImage {
  // .ico resize() can produce blank images on Windows — extract a
  // specific size from the multi-resolution .ico instead of resizing.
  const icon = getAppIcon();
  // Try to pick the 16x16 representation already inside the .ico
  const sizes = icon.getSize();
  if (sizes.width === 16 && sizes.height === 16) return icon;
  // Fallback: convert to PNG buffer first, then resize — avoids the
  // blank-image bug with direct .ico resize on Windows.
  const pngBuf = icon.toPNG();
  return nativeImage.createFromBuffer(pngBuf).resize({ width: 16, height: 16 });
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
  const trayIcon = getTrayIcon();
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

  // SIP presence heartbeat: softphone → backend. Main process owns the
  // authenticated fetch so we never expose the JWT to renderer network
  // code. Every 30s while registered, plus immediately on state changes.
  ipcMain.handle(
    IPC.SIP_REPORT_PRESENCE,
    async (
      _e,
      payload: {
        state: "registered" | "unregistered";
        extension: string;
        ts: string;
        lastError?: string;
      },
    ) => {
      const session = getSession();
      if (!session) return { ok: false, reason: "no-session" };
      try {
        const baseUrl = getCrmBaseUrl();
        const res = await fetch(`${baseUrl}/v1/telephony/agents/presence`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          // Don't log the full payload (extension only, no creds) at WARN.
          // 401 during a deploy / restart is expected — the next heartbeat
          // (within 30s) will succeed.
          console.log(
            `[SIP-PRESENCE] backend rejected (${res.status}) extension=${payload.extension}`,
          );
          return { ok: false, status: res.status };
        }
        return { ok: true };
      } catch (err: any) {
        console.log(
          "[SIP-PRESENCE] network error:",
          err?.message ?? String(err),
        );
        return { ok: false, reason: "network-error" };
      }
    },
  );

  // SIP registration-state change: broadcast to every renderer frame so
  // secondary windows (if any) stay in sync with the primary.
  ipcMain.on(
    IPC.SIP_REGISTRATION_CHANGED,
    (
      _e,
      payload: {
        registered: boolean;
        lastAttempt: number;
        lastError?: string;
      },
    ) => {
      sipRegistered = payload.registered;
      mainWindow?.webContents.send(IPC.SIP_REGISTRATION_CHANGED, payload);
    },
  );

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
    // SECURITY (audit/P0-C): do NOT JSON.stringify telephonyExtension — it
    // contains sipPassword on login responses. Log only identifiers.
    console.log(
      `[AUTH] Login OK userId=${data.user.id} extension=${data.telephonyExtension?.extension ?? "none"}`,
    );
    // `setSession` strips sipPassword before persisting (audit/P0-C).
    // The password is returned to the renderer in the handler's return
    // value so it can register SIP immediately, but never hits disk.
    setSession(data);
    // Rotate the bridge token so any previously-paired web UI (from a
    // different user) is forced to re-handshake.
    onSoftphoneLogin();
    return data;
  });

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    setSession(null);
    sipRegistered = false;
    // Invalidate the bridge token so a stale web UI cannot dial after
    // the operator walks away.
    onSoftphoneLogout();
    return { ok: true };
  });

  ipcMain.handle(IPC.AUTH_GET_SESSION, () => {
    const session = getSession();
    return { session, sipRegistered };
  });

  /**
   * Fetch fresh SIP credentials (incl. password) from the CRM backend.
   * The softphone calls this before every SIP register (and re-register)
   * so the password is never kept on disk (audit/P0-C). If the JWT has
   * expired, returns null — renderer should prompt for login.
   */
  ipcMain.handle(
    IPC.SIP_FETCH_CREDENTIALS,
    async (): Promise<TelephonyExtensionInfo | null> => {
      const session = getSession();
      if (!session) {
        console.log("[SIP-CREDS] No session, cannot fetch");
        return null;
      }
      try {
        const baseUrl = getCrmBaseUrl();
        const res = await fetch(`${baseUrl}/v1/telephony/sip-credentials`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (res.status === 401) {
          console.log("[SIP-CREDS] JWT expired, clearing session");
          setSession(null);
          return null;
        }
        if (res.status === 404) {
          console.log("[SIP-CREDS] No active extension bound to user");
          return null;
        }
        if (!res.ok) {
          console.log("[SIP-CREDS] Unexpected status:", res.status);
          return null;
        }
        const data = (await res.json()) as {
          extension: string;
          sipUsername: string;
          sipPassword: string | null;
          sipServer: string | null;
          displayName: string;
        };
        console.log(
          `[SIP-CREDS] Fetched extension=${data.extension} server=${data.sipServer ?? "none"}`,
        );
        return {
          extension: data.extension,
          displayName: data.displayName,
          sipServer: data.sipServer,
          sipPassword: data.sipPassword,
        };
      } catch (err: any) {
        console.log("[SIP-CREDS] Fetch failed:", err.message);
        return null;
      }
    },
  );

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

  // ────────────────────────────────────────────────────────────
  // Break + DND (v1.10.0). Every handler below is a thin
  // authenticated-fetch wrapper around the CRM backend. The JWT never
  // leaves the main process. On failure we return a well-shaped
  // `{ ok: false, reason }` so the renderer can show a specific error
  // without leaking internals.
  // ────────────────────────────────────────────────────────────

  async function callBackend(
    method: "GET" | "POST",
    path: string,
  ): Promise<{ ok: true; data: any } | { ok: false; status?: number; reason: string }> {
    const session = getSession();
    if (!session) return { ok: false, reason: "no-session" };
    try {
      const baseUrl = getCrmBaseUrl();
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
      if (res.status === 401) {
        console.log(`[BREAK/DND] 401 from ${path} — JWT expired, clearing session`);
        setSession(null);
        onSoftphoneLogout();
        return { ok: false, status: 401, reason: "unauthorized" };
      }
      if (!res.ok) {
        // Try to pick up a specific message (e.g. "on an active call", "no extension")
        let reason = `http-${res.status}`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) reason = body.message;
        } catch { /* non-JSON body — keep default */ }
        return { ok: false, status: res.status, reason };
      }
      // Some endpoints return 200 with no body (e.g. /breaks/end returns null when idempotent)
      const text = await res.text();
      const data = text ? JSON.parse(text) : null;
      return { ok: true, data };
    } catch (err: any) {
      // Log only the short error code / name, not `err.message`. Node's
      // undici has historically surfaced full request URLs (potentially
      // with secrets in query strings) inside error messages. Code-
      // reviewer W3 (v1.10.0) flagged this as precautionary hardening.
      const shortError = err?.code ?? err?.name ?? "unknown";
      console.log(`[BREAK/DND] Network error on ${path}:`, shortError);
      return { ok: false, reason: "network-error" };
    }
  }

  ipcMain.handle(IPC.BREAK_START, () => callBackend("POST", "/v1/telephony/breaks/start"));
  ipcMain.handle(IPC.BREAK_END, () => callBackend("POST", "/v1/telephony/breaks/end"));
  ipcMain.handle(IPC.BREAK_MY_CURRENT, () => callBackend("GET", "/v1/telephony/breaks/my-current"));
  ipcMain.handle(IPC.DND_ENABLE, () => callBackend("POST", "/v1/telephony/dnd/enable"));
  ipcMain.handle(IPC.DND_DISABLE, () => callBackend("POST", "/v1/telephony/dnd/disable"));
  ipcMain.handle(IPC.DND_MY_STATE, () => callBackend("GET", "/v1/telephony/dnd/my-state"));

  ipcMain.handle("debug:get-log-path", () => logFile);
  ipcMain.handle("debug:get-logs", () => {
    try { return fs.readFileSync(logFile, "utf-8"); } catch { return "No log file"; }
  });

  ipcMain.on(IPC.APP_QUIT, () => { mainWindow?.destroy(); app.quit(); });
  ipcMain.on(IPC.APP_SHOW, () => { mainWindow?.show(); mainWindow?.focus(); });
  // Minimize to taskbar. setSkipTaskbar(false) first because a previously
  // hidden window (hide()) loses its taskbar slot on Windows — restoring
  // it before minimize() keeps the button visible in the taskbar.
  const minimizeToTaskbar = () => {
    if (!mainWindow) return;
    // Re-apply the custom icon every time we restore the taskbar slot —
    // setSkipTaskbar(false) on Windows resets the taskbar button to the
    // default Electron exe icon unless we explicitly call setIcon() again.
    mainWindow.setIcon(getAppIcon());
    mainWindow.setSkipTaskbar(false);
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.minimize();
  };
  ipcMain.on(IPC.APP_HIDE, minimizeToTaskbar);
  ipcMain.on(IPC.APP_MINIMIZE, minimizeToTaskbar);

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
      onSoftphoneLogout();
      return;
    }

    // /auth/me no longer returns sipPassword (audit/P0-B). We still refresh
    // extension metadata (extension number, sipServer, displayName) from it
    // so operators who get reassigned to a different extension pick up the
    // change. The sipPassword is fetched separately by the renderer via
    // /v1/telephony/sip-credentials before SIP registration.
    //
    // Session is still valid — mint a fresh bridge token (audit/P1-12).
    // Any previously paired web UI tab will have its token invalidated
    // and must re-handshake.
    onSoftphoneLogin();


    const meData = (await res.json()) as {
      user: {
        telephonyExtension?: {
          extension: string;
          displayName: string;
          sipServer: string | null;
        } | null;
      };
    };

    const freshExt = meData.user?.telephonyExtension ?? null;
    console.log(
      `[RESTORE] Fresh ext from /auth/me: extension=${freshExt?.extension ?? "none"} server=${freshExt?.sipServer ?? "none"}`,
    );

    const persistedExt = session.telephonyExtension;
    const changed =
      (freshExt?.extension ?? null) !== (persistedExt?.extension ?? null) ||
      (freshExt?.sipServer ?? null) !== (persistedExt?.sipServer ?? null) ||
      (freshExt?.displayName ?? null) !== (persistedExt?.displayName ?? null);

    if (changed) {
      console.log("[RESTORE] Updating session with fresh ext data");
      const updated = {
        accessToken: session.accessToken,
        user: session.user,
        telephonyExtension: freshExt,
      };
      setSession(updated);
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
      // Bring window to front reliably on Windows. Windows normally blocks
      // focus-stealing from background apps (only flashes the taskbar).
      // The trick: briefly toggle alwaysOnTop to force the window up, then
      // clear it so it behaves normally again.
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.setAlwaysOnTop(true);
      mainWindow.focus();
      // Clear the "always on top" flag after a short delay so the window
      // doesn't stay pinned above other apps.
      setTimeout(() => {
        mainWindow?.setAlwaysOnTop(false);
      }, 500);
      return true;
    },
    getSipRegistered: () => sipRegistered,
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
