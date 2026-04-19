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
  app: {
    quit: () => ipcRenderer.send(IPC.APP_QUIT),
    show: () => ipcRenderer.send(IPC.APP_SHOW),
    hide: () => ipcRenderer.send(IPC.APP_HIDE),
    openExternal: (url: string) => ipcRenderer.invoke(IPC.APP_OPEN_EXTERNAL, url),
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
});
