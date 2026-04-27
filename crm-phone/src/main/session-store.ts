import Store from "electron-store";
import type { AppSession, AppLoginResponse } from "../shared/types";

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

/**
 * Convert a wire-format login payload (which may contain sipPassword) into
 * the persisted shape — strips the password so it never hits disk.
 * Audit: P0-C.
 */
function stripPassword(data: AppLoginResponse): AppSession {
  return {
    accessToken: data.accessToken,
    user: data.user,
    telephonyExtension: data.telephonyExtension
      ? {
          extension: data.telephonyExtension.extension,
          displayName: data.telephonyExtension.displayName,
          sipServer: data.telephonyExtension.sipServer,
        }
      : null,
  };
}

/**
 * Reads the session off disk. If an old install persisted `sipPassword` on
 * the extension blob, silently drop it here — never expose it.
 * Audit: P0-C migration path for existing on-disk sessions.
 */
export function getSession(): AppSession | null {
  const raw = store.get("session") as AppSession | null;
  if (!raw || !raw.telephonyExtension) return raw;
  const ext = raw.telephonyExtension as AppSession["telephonyExtension"] & {
    sipPassword?: unknown;
  };
  if (ext && "sipPassword" in ext) {
    // Old session with sipPassword on disk — drop the field and rewrite.
    const clean: AppSession = {
      accessToken: raw.accessToken,
      user: raw.user,
      telephonyExtension: {
        extension: ext.extension,
        displayName: ext.displayName,
        sipServer: ext.sipServer,
      },
    };
    store.set("session", clean);
    return clean;
  }
  return raw;
}

/**
 * Accepts either a full AppLoginResponse (with sipPassword) or an already-
 * stripped AppSession. Always strips sipPassword before writing.
 */
export function setSession(
  session: AppLoginResponse | AppSession | null,
): void {
  if (session === null) {
    store.set("session", null);
    return;
  }
  // Detect: AppLoginResponse has telephonyExtension with optional sipPassword
  // field; we always call stripPassword to normalize.
  const normalized = stripPassword(session as AppLoginResponse);
  store.set("session", normalized);
}

export function getCrmBaseUrl(): string {
  // Dev override: when CRM_BASE_URL is exported into the shell that
  // launches Electron (e.g. `CRM_BASE_URL=http://localhost:3001 pnpm
  // start`), honour it on every call rather than only on first-time
  // install. In production builds this env var is never set, so the
  // stored value is always returned.
  const fromEnv = (process.env.CRM_BASE_URL || "").replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  return store.get("crmBaseUrl");
}

export { store };
