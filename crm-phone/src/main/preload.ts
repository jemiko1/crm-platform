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
