export interface CrmUser {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
}

/**
 * Full SIP registration credentials including the password.
 * Kept in memory only — never persisted to disk (audit/P0-C).
 */
export interface TelephonyExtensionInfo {
  extension: string;
  displayName: string;
  sipServer: string | null;
  sipPassword: string | null;
}

/**
 * Extension metadata safe to persist to disk — NO sipPassword.
 * Used in `AppSession` on disk. The full `TelephonyExtensionInfo` is
 * fetched fresh from /v1/telephony/sip-credentials on app start or
 * user switch, then held in memory only.
 */
export interface PersistedExtensionInfo {
  extension: string;
  displayName: string;
  sipServer: string | null;
}

/**
 * /auth/app-login response. Still returns `telephonyExtension` with
 * sipPassword for back-compat with the softphone's initial login flow.
 * Kept narrow so the renderer can treat it as the in-memory
 * TelephonyExtensionInfo right after login, without persisting it.
 */
export interface AppLoginResponse {
  accessToken: string;
  user: CrmUser;
  telephonyExtension: TelephonyExtensionInfo | null;
}

/**
 * Session persisted to disk. Never contains sipPassword.
 * Full SIP credentials (incl. password) are held only in memory at
 * runtime and re-fetched after restart.
 */
export interface AppSession {
  accessToken: string;
  user: CrmUser;
  telephonyExtension: PersistedExtensionInfo | null;
}

export type CallState = "idle" | "ringing" | "connecting" | "connected" | "hold" | "dialing";
export type CallDirection = "inbound" | "outbound";

export interface ActiveCall {
  id: string;
  state: CallState;
  direction: CallDirection;
  remoteNumber: string;
  remoteName?: string;
  startedAt: string;
  answeredAt?: string;
}

export interface BridgeStatusResponse {
  running: true;
  loggedIn: boolean;
  user: { id: string; name: string; extension: string } | null;
  callState: CallState;
  activeCall: ActiveCall | null;
  sipRegistered: boolean;
}

export interface CallerLookupClient {
  id: string;
  coreId: number;
  name: string;
  firstName: string | null;
  lastName: string | null;
  idNumber: string | null;
  paymentId: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  buildings: Array<{ id: string; name: string; coreId: number }>;
}

export interface CallerLookupIncident {
  id: string;
  incidentNumber: string;
  status: string;
  priority: string;
  incidentType: string;
  description: string;
  buildingName: string;
  createdAt: string;
}

export interface CallerLookupResult {
  client?: CallerLookupClient;
  lead?: {
    id: string;
    leadNumber: number;
    stageName: string;
    responsibleEmployee: string | null;
  };
  openWorkOrders: Array<{
    id: string;
    workOrderNumber: number;
    title: string;
    status: string;
    type: string;
  }>;
  openIncidents: CallerLookupIncident[];
  recentIncidents: CallerLookupIncident[];
  intelligence?: {
    labels: string[];
    summary: string;
  };
  recentCalls: Array<{
    id: string;
    direction: string;
    startAt: string;
    disposition: string | null;
    durationSec: number | null;
  }>;
}
