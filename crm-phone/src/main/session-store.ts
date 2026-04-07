import Store from "electron-store";
import type { AppSession } from "../shared/types";

interface StoreSchema {
  session: AppSession | null;
  crmBaseUrl: string;
}

const CRM_BASE_URL = process.env.CRM_BASE_URL || "https://crm28.asg.ge";

const store = new Store<StoreSchema>({
  name: "crm-phone-session",
  encryptionKey: "crm-phone-v1",
  defaults: {
    session: null,
    crmBaseUrl: CRM_BASE_URL,
  },
});

/* ── Migration: fix stale URLs from previous installs ── */
const OLD_URLS = [
  "https://api-crm28.asg.ge",
  "https://crm28.up.railway.app",
];
const stored = store.get("crmBaseUrl").replace(/\/+$/, "");
if (OLD_URLS.includes(stored)) {
  store.set("crmBaseUrl", CRM_BASE_URL);
}

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
