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
  recentCalls: Array<{
    id: string;
    direction: string;
    startAt: string;
    disposition: string | null;
    durationSec: number | null;
  }>;
}
