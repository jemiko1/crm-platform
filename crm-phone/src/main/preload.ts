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
  phone: {
    dial: (number: string) => ipcRenderer.invoke(IPC.PHONE_DIAL, number),
    answer: () => ipcRenderer.invoke(IPC.PHONE_ANSWER),
    hangup: () => ipcRenderer.invoke(IPC.PHONE_HANGUP),
    hold: () => ipcRenderer.invoke(IPC.PHONE_HOLD),
    unhold: () => ipcRenderer.invoke(IPC.PHONE_UNHOLD),
    dtmf: (tone: string) => ipcRenderer.invoke(IPC.PHONE_DTMF, tone),
    mute: () => ipcRenderer.invoke(IPC.PHONE_MUTE),
    onStateChanged: (cb: (state: any) => void) => {
      ipcRenderer.on(IPC.PHONE_STATE_CHANGED, (_e, state) => cb(state));
      return () => ipcRenderer.removeAllListeners(IPC.PHONE_STATE_CHANGED);
    },
    onIncomingCall: (cb: (call: any) => void) => {
      ipcRenderer.on(IPC.PHONE_INCOMING_CALL, (_e, call) => cb(call));
      return () => ipcRenderer.removeAllListeners(IPC.PHONE_INCOMING_CALL);
    },
    onSipStatus: (cb: (registered: boolean) => void) => {
      ipcRenderer.on(IPC.PHONE_SIP_STATUS, (_e, registered) => cb(registered));
      return () => ipcRenderer.removeAllListeners(IPC.PHONE_SIP_STATUS);
    },
  },
  contact: {
    lookup: (number: string) =>
      ipcRenderer.invoke(IPC.CONTACT_LOOKUP, number),
  },
  app: {
    quit: () => ipcRenderer.send(IPC.APP_QUIT),
    show: () => ipcRenderer.send(IPC.APP_SHOW),
  },
});
