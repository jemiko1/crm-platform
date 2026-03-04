export interface CrmUser {
  id: string;
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface TelephonyExtensionInfo {
  extension: string;
  displayName: string;
  sipServer: string | null;
  sipPassword: string | null;
}

export interface AppLoginResponse {
  accessToken: string;
  user: CrmUser;
  telephonyExtension: TelephonyExtensionInfo | null;
}

export interface AppSession {
  accessToken: string;
  user: CrmUser;
  telephonyExtension: TelephonyExtensionInfo | null;
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

export interface ContactLookupResult {
  name: string | null;
  company: string | null;
  lastInteraction: string | null;
  leadId?: string;
  employeeId?: string;
}
