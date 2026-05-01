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
import { installPbxCertPin } from "./pbx-cert-pin";
import {
  connectTelephonySocket,
  disconnectTelephonySocket,
} from "./telephony-socket";
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
    // Staff tab — list of employee IDs the operator pinned to the
    // Favorites tab. Stored locally per-machine; no backend sync.
    staffFavorites: [] as string[],
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

app.name = "CRM28 Phone";
app.setAppUserModelId("ge.asg.crm28-phone");

// Dev-mode taskbar icon fix: Windows uses the .exe's embedded icon for
// pinned shortcuts (electron.exe ships with the default atom icon). By
// registering our AppUserModelID in the Registry with a custom
// IconResource, Windows uses *that* icon for any window/shortcut tagged
// with this AUMID — including pinned taskbar items.
// In packaged builds this is unnecessary: electron-builder embeds the
// icon directly into CRM28 Phone.exe.
if (!app.isPackaged && process.platform === "win32") {
  try {
    const iconAbsPath = path.resolve(__dirname, "../../resources/icon.ico");
    const { execFileSync } = require("child_process");
    const regKey = "HKCU\\Software\\Classes\\AppUserModelId\\ge.asg.crm28-phone";
    execFileSync("reg", ["add", regKey, "/v", "DisplayName", "/t", "REG_SZ", "/d", "CRM28 Phone", "/f"], { stdio: "ignore" });
    execFileSync("reg", ["add", regKey, "/v", "IconResource", "/t", "REG_SZ", "/d", `${iconAbsPath},0`, "/f"], { stdio: "ignore" });
    console.log("[INIT] Registered AppUserModelID icon:", iconAbsPath);
  } catch (e) {
    console.error("[INIT] Failed to register AppUserModelID icon:", e);
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let sipRegistered = false;
/**
 * Set when a clean-quit flow is in progress so the window's "close"
 * handler stops swallowing close events and lets the destroy go through.
 * Without this, our `e.preventDefault()` close handler keeps the app
 * alive even when we've explicitly asked it to quit.
 */
let isQuitting = false;

/**
 * Two-step clean shutdown. Tells the renderer to SIP-unregister cleanly
 * (REGISTER `Expires:0` → wait for Asterisk ACK), waits up to 5s for
 * acknowledgement, then exits. The 5s ceiling guarantees the app always
 * exits — even when the renderer is hung — at the cost of a slightly
 * stale Asterisk contact (cleaned up by the qualify-timeout in 60s).
 *
 * Window-close [X] does NOT call this — close hides to tray. This
 * function is invoked only by the tray "Quit" menu and the renderer's
 * `app.quit()` IPC.
 */
function quitCleanly(): void {
  if (isQuitting) return;
  isQuitting = true;

  if (!mainWindow || mainWindow.isDestroyed()) {
    app.quit();
    return;
  }

  let resolved = false;
  const finish = () => {
    if (resolved) return;
    resolved = true;
    ipcMain.removeListener(IPC.APP_QUIT_READY, finish);
    mainWindow?.destroy();
    app.quit();
  };

  ipcMain.once(IPC.APP_QUIT_READY, finish);
  // 5s timeout — the renderer's own SIP `unregister()` already self-caps
  // at ~3s waiting for the Asterisk ACK, so 5s gives it room to finish
  // plus a bit of slack for IPC + event-loop overhead. Anything longer
  // and the operator stares at a frozen "Quit" click.
  setTimeout(() => {
    if (!resolved) {
      console.log('[quit] renderer did not ACK PREPARE_QUIT in 5s — forcing exit');
      finish();
    }
  }, 5000);

  try {
    mainWindow.webContents.send(IPC.APP_PREPARE_QUIT);
  } catch (err) {
    // Renderer may already be torn down (e.g. crashed). Force-exit.
    finish();
  }
}

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
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    transparent: false,
    backgroundColor: "#115e59",
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
    // Default close [X] = hide to tray, keep SIP registered. Standard
    // softphone behavior — operators expect the app to keep receiving
    // calls when they close the window. Only `quitCleanly()` (tray Quit
    // or explicit `app.quit()` IPC) sets `isQuitting=true` to let the
    // close-then-destroy go through.
    if (isQuitting) return;
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
        click: () => quitCleanly(),
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
    // Connect to backend Socket.IO so we receive `extension:changed`
    // events when admin re-links the operator. Soft-defer to renderer
    // happens there if a call is active.
    connectTelephonySocket(getCrmBaseUrl(), data.accessToken, mainWindow);
    return data;
  });

  ipcMain.handle(IPC.AUTH_LOGOUT, async () => {
    setSession(null);
    sipRegistered = false;
    // Invalidate the bridge token so a stale web UI cannot dial after
    // the operator walks away.
    onSoftphoneLogout();
    // Close backend Socket.IO — no more events for this user.
    disconnectTelephonySocket();
    return { ok: true };
  });

  /**
   * Re-fetch /auth/me at runtime and update the persisted session if
   * the extension assignment changed. Triggered by:
   *   - The renderer's `extension:changed` rebind handler (this PR)
   *   - The SSO handoff flow on first-time login (PR 3)
   *
   * Returns the fresh telephonyExtension metadata (no sipPassword — that
   * stays on the server, fetched separately via /v1/telephony/sip-credentials
   * just before SIP register, never persisted to disk).
   */
  ipcMain.handle(
    IPC.SESSION_REFRESH,
    async (): Promise<{
      ok: boolean;
      telephonyExtension: AppLoginResponse["telephonyExtension"] | null;
    }> => {
      const session = getSession();
      if (!session) {
        return { ok: false, telephonyExtension: null };
      }
      try {
        const baseUrl = getCrmBaseUrl();
        const res = await fetch(`${baseUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${session.accessToken}` },
        });
        if (res.status === 401) {
          // JWT expired — clear session, signal to renderer.
          setSession(null);
          onSoftphoneLogout();
          disconnectTelephonySocket();
          return { ok: false, telephonyExtension: null };
        }
        if (!res.ok) {
          console.log(`[SESSION-REFRESH] /auth/me ${res.status}`);
          return { ok: false, telephonyExtension: null };
        }
        const meData = (await res.json()) as {
          user: {
            telephonyExtension?: AppLoginResponse["telephonyExtension"];
          };
        };
        const freshExt = meData.user?.telephonyExtension ?? null;
        const persistedExt = session.telephonyExtension;
        const changed =
          (freshExt?.extension ?? null) !== (persistedExt?.extension ?? null) ||
          (freshExt?.sipServer ?? null) !== (persistedExt?.sipServer ?? null) ||
          (freshExt?.displayName ?? null) !==
            (persistedExt?.displayName ?? null);
        if (changed) {
          console.log(
            `[SESSION-REFRESH] ext changed: ${persistedExt?.extension ?? "none"} → ${freshExt?.extension ?? "none"}`,
          );
          setSession({
            accessToken: session.accessToken,
            user: session.user,
            telephonyExtension: freshExt,
          });
        }
        return { ok: true, telephonyExtension: freshExt };
      } catch (err: any) {
        console.log(`[SESSION-REFRESH] error: ${err.message}`);
        return { ok: false, telephonyExtension: null };
      }
    },
  );

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

  ipcMain.handle(IPC.DIRECTORY_LIST, async () => {
    const session = getSession();
    if (!session) return [];
    try {
      const baseUrl = getCrmBaseUrl();
      const res = await fetch(`${baseUrl}/v1/telephony/directory`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
      if (!res.ok) {
        // Surface auth/permission failures in the debug log so a stuck
        // empty Staff tab can be diagnosed without DevTools open
        // (Silent Override Risk #23 corollary — silent empties hide
        // permission revocations).
        console.warn(`[directory] HTTP ${res.status} from ${baseUrl}/v1/telephony/directory`);
        return [];
      }
      return await res.json();
    } catch (err: any) {
      console.warn("[directory] fetch failed:", err?.message ?? err);
      return [];
    }
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

  ipcMain.on(IPC.APP_QUIT, () => quitCleanly());
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

  // H12 — restrict openExternal to an HTTPS allowlist. Accepting any
  // http(s) URL lets a renderer XSS become a one-click phishing vector.
  const EXTERNAL_URL_ALLOWLIST = [
    "crm28.asg.ge",
    "crm28demo.asg.ge",
  ];
  ipcMain.handle(IPC.APP_OPEN_EXTERNAL, async (_e, url: string) => {
    if (typeof url !== "string" || !url.startsWith("https://")) return;
    try {
      const parsed = new URL(url);
      if (!EXTERNAL_URL_ALLOWLIST.includes(parsed.hostname)) return;
    } catch {
      return;
    }
    const { shell } = await import("electron");
    await shell.openExternal(url);
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

    // Connect backend Socket.IO so we receive admin-driven extension
    // change events. Mirrors the post-login wiring above.
    connectTelephonySocket(baseUrl, session.accessToken, mainWindow);
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

  // Hostname-scoped TLS-trust override for the FreePBX self-signed cert.
  // Trust is restricted to `pbx.asg.ge` / `5.10.34.153`; every other
  // HTTPS connection (CRM web, auto-updater, OpenAI, etc.) uses
  // Chromium's normal public-CA validation. The perimeter is the
  // FreePBX firewall's IP-whitelist of office public IPs — see
  // pbx-cert-pin.ts and CLAUDE.md Silent Override Risk #29.
  installPbxCertPin();

  // H11 — auto-grant only the permissions we actually need (microphone
  // for SIP media). Everything else (geolocation, clipboard-read, midi,
  // hid, serial, usb, …) is denied. The previous implementation returned
  // `true` for every request, turning a renderer XSS into broad OS-level
  // privilege escalation.
  electronSession.defaultSession.setPermissionRequestHandler(
    (_wc, permission, callback) => {
      const allowed = permission === "media" || permission === "notifications";
      callback(allowed);
    },
  );
  electronSession.defaultSession.setPermissionCheckHandler(
    (_wc, permission) =>
      permission === "media" || permission === "notifications",
  );

  createTray();
  createWindow();
  setupIpc();

  startLocalServer(null, {
    onSessionChanged: (data) => {
      mainWindow?.webContents.send(IPC.AUTH_SESSION_CHANGED, data);
      // Refresh the backend Socket.IO connection for the new session.
      // Triggered by /switch-user (existing user-switch flow) AND
      // /switch-user when used as SSO handoff (first-time sign-in).
      // Without this, the new operator's softphone would not receive
      // `extension:changed` events from the backend.
      if (data?.accessToken) {
        connectTelephonySocket(getCrmBaseUrl(), data.accessToken, mainWindow);
      } else {
        disconnectTelephonySocket();
      }
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
