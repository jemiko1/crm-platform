import Store from "electron-store";
import type { AppSession } from "../shared/types";

interface StoreSchema {
  session: AppSession | null;
  crmBaseUrl: string;
}

const store = new Store<StoreSchema>({
  name: "crm-phone-session",
  encryptionKey: "crm-phone-v1",
  defaults: {
    session: null,
    crmBaseUrl: process.env.CRM_BASE_URL || "https://crm28.asg.ge",
  },
});

export function getSession(): AppSession | null {
  return store.get("session");
}

export function setSession(session: AppSession | null): void {
  store.set("session", session);
}

export function getCrmBaseUrl(): string {
  return store.get("crmBaseUrl");
}

export { store };
