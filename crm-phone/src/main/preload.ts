import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc-channels";

contextBridge.exposeInMainWorld("crmPhone", {
  auth: {
    login: (email: string, password: string) =>
      ipcRenderer.invoke(IPC.AUTH_LOGIN, email, password),
    logout: () => ipcRenderer.invoke(IPC.AUTH_LOGOUT),
    getSession: () => ipcRenderer.invoke(IPC.AUTH_GET_SESSION),
    onSessionChanged: (cb: (data: any) => void) => {
      ipcRenderer.on(IPC.AUTH_SESSION_CHANGED, (_e, data) => cb(data));
      return () => ipcRenderer.removeAllListeners(IPC.AUTH_SESSION_CHANGED);
    },
  },
  sip: {
    reportStatus: (registered: boolean) =>
      ipcRenderer.send(IPC.SIP_STATUS_REPORT, registered),
    // Fetch fresh SIP credentials (incl. password) from the CRM backend.
    // Returns null on 401 (expired JWT) or 404 (no extension). Audit: P0-C.
    fetchCredentials: () => ipcRenderer.invoke(IPC.SIP_FETCH_CREDENTIALS),
    /**
     * Send a SIP presence heartbeat to the backend. Called every 30s while
     * registered + immediately on any state transition. Returns when the
     * backend acknowledges — safe to ignore in the caller; failures are
     * non-critical because the backend's stale-sweep cron catches silent
     * outages anyway.
     */
    reportPresence: (payload: {
      state: "registered" | "unregistered";
      extension: string;
      ts: string;
      lastError?: string;
    }) => ipcRenderer.invoke(IPC.SIP_REPORT_PRESENCE, payload),
    /**
     * Notify all renderer frames of a registration state transition so the
     * UI dot, toast notifications, etc. can react without waiting for the
     * next poll.
     */
    reportRegistrationChanged: (payload: {
      registered: boolean;
      lastAttempt: number;
      lastError?: string;
    }) => ipcRenderer.send(IPC.SIP_REGISTRATION_CHANGED, payload),
    onRegistrationChanged: (
      cb: (data: {
        registered: boolean;
        lastAttempt: number;
        lastError?: string;
      }) => void,
    ) => {
      const handler = (_e: unknown, data: any) => cb(data);
      ipcRenderer.on(IPC.SIP_REGISTRATION_CHANGED, handler);
      return () =>
        ipcRenderer.removeListener(IPC.SIP_REGISTRATION_CHANGED, handler);
    },
  },
  phone: {
    /**
     * Subscribe to external dial requests (from the CRM web UI via the local
     * HTTP bridge). Fires with the phone number to dial. Returns an unsubscribe
     * function.
     */
    onDialRequest: (cb: (number: string) => void) => {
      const handler = (_e: unknown, number: string) => cb(number);
      ipcRenderer.on(IPC.PHONE_DIAL, handler);
      return () => ipcRenderer.removeListener(IPC.PHONE_DIAL, handler);
    },
  },
  log: (level: string, ...args: any[]) =>
    ipcRenderer.send(IPC.RENDERER_LOG, level, ...args),
  settings: {
    get: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (key: string, value: any) => ipcRenderer.invoke(IPC.SETTINGS_SET, key, value),
  },
  window: {
    setAlwaysOnTop: (flag: boolean) => ipcRenderer.send(IPC.WIN_SET_ALWAYS_ON_TOP, flag),
  },
  contact: {
    lookup: (number: string) =>
      ipcRenderer.invoke(IPC.CONTACT_LOOKUP, number),
  },
  calls: {
    history: (extension: string) =>
      ipcRenderer.invoke(IPC.CALL_HISTORY, extension),
  },
  directory: {
    list: () => ipcRenderer.invoke(IPC.DIRECTORY_LIST),
  },
  app: {
    quit: () => ipcRenderer.send(IPC.APP_QUIT),
    show: () => ipcRenderer.send(IPC.APP_SHOW),
    hide: () => ipcRenderer.send(IPC.APP_HIDE),
    minimize: () => ipcRenderer.send(IPC.APP_MINIMIZE),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),
    /**
     * Two-step clean shutdown (v1.14.0). Subscribe to PREPARE_QUIT in the
     * renderer; perform SIP unregister + any other teardown that needs to
     * run while the renderer is still alive; then call `notifyQuitReady()`
     * so main exits. Window-close [X] does NOT fire this — only tray Quit
     * and explicit `app.quit()` do.
     */
    onPrepareQuit: (cb: () => void) => {
      // `once` not `on` — quitCleanly() only fires APP_PREPARE_QUIT a
      // single time per main-process lifetime, and accepting a second
      // dispatch would call `sipService.unregister()` twice (the second
      // being a no-op, but still — defense in depth).
      const handler = () => cb();
      ipcRenderer.once(IPC.APP_PREPARE_QUIT, handler);
      return () => ipcRenderer.removeListener(IPC.APP_PREPARE_QUIT, handler);
    },
    notifyQuitReady: () => ipcRenderer.send(IPC.APP_QUIT_READY),
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke(IPC.UPDATE_CHECK),
    install: () => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    getVersion: () => ipcRenderer.invoke(IPC.UPDATE_GET_VERSION),
    onStatus: (cb: (status: any) => void) => {
      const handler = (_e: any, status: any) => cb(status);
      ipcRenderer.on(IPC.UPDATE_STATUS, handler);
      return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, handler);
    },
  },
  /**
   * Operator break (v1.10.0). All three calls hit the main-process IPC
   * handler which performs the authenticated backend fetch. Unlike DND,
   * Break also drives a full SIP unregister on start and re-register
   * on end — the renderer coordinates the SIP transition AFTER the
   * backend acknowledges the state change (so a race between the
   * backend POST and the SIP unregister can't leave Asterisk queuing
   * calls to a desk that has since gone on break).
   */
  break: {
    start: () => ipcRenderer.invoke(IPC.BREAK_START),
    end: () => ipcRenderer.invoke(IPC.BREAK_END),
    myCurrent: () => ipcRenderer.invoke(IPC.BREAK_MY_CURRENT),
  },
  /**
   * Do-Not-Disturb (v1.10.0). Softphone stays registered — backend
   * sends AMI `QueuePause` to pause the extension in all queues the
   * extension is a member of. Direct extension calls and outbound
   * dialing are unaffected. State lives in Asterisk only (see CLAUDE.md
   * Silent Override Risk #20) so `myState` queries the live AMI cache,
   * not the CRM DB.
   */
  dnd: {
    enable: () => ipcRenderer.invoke(IPC.DND_ENABLE),
    disable: () => ipcRenderer.invoke(IPC.DND_DISABLE),
    myState: () => ipcRenderer.invoke(IPC.DND_MY_STATE),
  },
  /**
   * Auto-rebind on extension change (v1.13.0). Backend emits
   * `extension:changed` → main forwards via this IPC channel → renderer
   * unregisters old SIP, fetches fresh /auth/me + credentials, registers
   * new SIP. Soft-defers if on an active call — never drops it.
   */
  session: {
    refresh: (): Promise<{
      ok: boolean;
      telephonyExtension: {
        extension: string;
        displayName: string;
        sipServer: string | null;
      } | null;
    }> => ipcRenderer.invoke(IPC.SESSION_REFRESH),
    onExtensionChanged: (
      cb: (payload: { reason: string; timestamp: string }) => void,
    ) => {
      const handler = (_e: unknown, payload: any) => cb(payload);
      ipcRenderer.on(IPC.EXTENSION_CHANGED, handler);
      return () => ipcRenderer.removeListener(IPC.EXTENSION_CHANGED, handler);
    },
  },
});
