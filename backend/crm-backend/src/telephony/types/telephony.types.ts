export const TELEPHONY_EVENT_TYPES = [
  'call_start',
  'call_answer',
  'call_end',
  'queue_enter',
  'queue_leave',
  'agent_connect',
  'transfer',
  'hold_start',
  'hold_end',
  'recording_ready',
  'wrapup_start',
  'wrapup_end',
] as const;

export type TelephonyEventType = (typeof TELEPHONY_EVENT_TYPES)[number];

export interface AsteriskEventPayload {
  uniqueId?: string;
  linkedId?: string;
  channel?: string;
  callerIdNum?: string;
  callerIdName?: string;
  connectedLineNum?: string;
  context?: string;
  extension?: string;
  priority?: number;
  queue?: string;
  position?: number;
  holdTime?: number;
  talkTime?: number;
  cause?: string;
  causeTxt?: string;
  recordingFile?: string;
  recordingDuration?: number;
  [key: string]: unknown;
}

export interface IngestEventItem {
  eventType: TelephonyEventType;
  timestamp: string;
  idempotencyKey: string;
  payload: AsteriskEventPayload;
  linkedId?: string;
  uniqueId?: string;
}

export interface IngestResult {
  processed: number;
  skipped: number;
  errors: Array<{ idempotencyKey: string; error: string }>;
}

export interface OverviewKpis {
  volume: {
    totalCalls: number;
    answered: number;
    missed: number;
    abandoned: number;
    callbacksCreated: number;
    callbacksCompleted: number;
  };
  speed: {
    avgAnswerTimeSec: number | null;
    medianAnswerTimeSec: number | null;
    p90AnswerTimeSec: number | null;
    avgAbandonWaitSec: number | null;
  };
  quality: {
    avgTalkTimeSec: number | null;
    avgHoldTimeSec: number | null;
    avgWrapupTimeSec: number | null;
    transferRate: number | null;
  };
  serviceLevel: {
    slaMetPercent: number | null;
    longestWaitSec: number | null;
    peakHourDistribution: Record<number, number>;
  };
  /**
   * M3 — measurement coverage for the KPI window, 0..100. Equal to
   * `sessions with CallMetrics / sessions with disposition`. When this drops
   * below 95% the UI badges SLA% amber; below 90%, red. A low number means
   * ingest dropped some CallMetrics rows — the SLA ratio is still correct
   * (it's computed over sessions that have metrics) but the denominator no
   * longer reflects every session that reached disposition.
   *
   * See audit/STATS_STANDARDS.md M3 for decision rationale.
   */
  dataQualityPercent: number | null;
}

export interface AgentKpis {
  userId: string;
  displayName: string | null;
  totalCalls: number;
  answered: number;
  missed: number;
  answerRate: number | null;
  missedRate: number | null;
  avgHandleTimeSec: number | null;
  avgTalkTimeSec: number | null;
  avgHoldTimeSec: number | null;
  afterCallWorkTimeSec: number | null;
  occupancyProxy: number | null;
  /**
   * M5 (STATS_STANDARDS.md) — primary-handler count. The number of
   * CallSessions for which this agent had the longest connected CallLeg
   * (talkSec). Transfers don't double-count volume — only one agent per
   * session gets `handled += 1`.
   */
  handledCount: number;
  /**
   * M5 — engagement count. The number of CallSessions where this agent had
   * any AGENT/TRANSFER leg with an answerAt timestamp. A transferred call
   * credits both the originator and the recipient as "touched" — giving
   * managers the "who was involved" view alongside the "who did the work"
   * view (`handledCount`).
   */
  touchedCount: number;
}

export interface QueueKpis {
  queueId: string;
  queueName: string;
  agentCount: number;
  totalCalls: number;
  answered: number;
  missed: number;
  abandoned: number;
  avgAnswerTimeSec: number | null;
  avgTalkTimeSec: number | null;
  slaMetPercent: number | null;
}

export interface CallerLookupResult {
  client?: {
    id: string;
    coreId: number | null;
    name: string;
    firstName: string | null;
    lastName: string | null;
    idNumber: string | null;
    paymentId: string | null;
    primaryPhone: string | null;
    secondaryPhone: string | null;
    buildings: Array<{ id: string; name: string; coreId: number | null }>;
  };
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
  openIncidents: Array<{
    id: string;
    incidentNumber: string;
    status: string;
    priority: string;
    incidentType: string;
    description: string;
    buildingName: string;
    createdAt: Date;
  }>;
  recentIncidents: Array<{
    id: string;
    incidentNumber: string;
    status: string;
    priority: string;
    incidentType: string;
    description: string;
    buildingName: string;
    createdAt: Date;
  }>;
  intelligence?: {
    labels: string[];
    summary: string;
  };
  recentCalls: Array<{
    id: string;
    direction: string;
    startAt: Date;
    disposition: string | null;
    durationSec: number | null;
  }>;
}

export interface BreakdownRow {
  label: string;
  sortKey: number;
  totalCalls: number;
  answeredCalls: number;
  lostCalls: number;
  callsLostBefore5Sec: number;
  totalCallsDurationMin: number;
  avgCallDurationSec: number | null;
  answeredAvgHoldTimeSec: number | null;
  answeredAvgPosition: number | null;
  lostAvgHoldTimeSec: number | null;
  lostAvgPosition: number | null;
  slaPercent: number | null;
}

export interface HoldTimeDistribution {
  under15: { count: number; percent: number };
  under30: { count: number; percent: number };
  under60: { count: number; percent: number };
  over60: { count: number; percent: number };
}

export interface BreakdownResponse {
  rows: BreakdownRow[];
  answeredHoldDistribution?: HoldTimeDistribution;
  lostHoldDistribution?: HoldTimeDistribution;
}

export interface AgentBreakdownRow {
  userId: string;
  displayName: string | null;
  extension: string | null;
  answeredCalls: number;
  noAnswerCalls: number;
  busyCalls: number;
  totalCalls: number;
  totalCallsDurationMin: number;
  avgCallDurationSec: number | null;
  answeredAvgRingTimeSec: number | null;
  noAnswerAvgRingTimeSec: number | null;
  /** M5 — see AgentKpis. `answeredCalls` is kept as alias for handledCount. */
  handledCount: number;
  /** M5 — see AgentKpis. */
  touchedCount: number;
}

export interface WorktimeWindow {
  day: number; // 0=Sun, 1=Mon, ..., 6=Sat
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

export interface WorktimeConfig {
  timezone: string;
  windows: WorktimeWindow[];
}

export interface LiveQueueState {
  queueId: string;
  queueName: string;
  activeCalls: number;
  waitingCallers: number;
  longestCurrentWaitSec: number | null;
  availableAgents: number;
  _disclaimer: string | null;
}

export interface LiveAgentState {
  userId: string;
  displayName: string | null;
  currentState: 'ON_CALL' | 'IDLE' | 'OFFLINE';
  currentCallDurationSec: number | null;
  callsHandledToday: number;
  _disclaimer: string | null;
  presence?: 'ON_CALL' | 'RINGING' | 'IDLE' | 'WRAPUP' | 'PAUSED' | 'OFFLINE';
  pausedReason?: string | null;
  /**
   * Whether the operator's softphone is currently SIP-registered with
   * Asterisk. Driven by the 30s heartbeat from `POST /v1/telephony/agents/presence`
   * and the stale-registration sweep. True means the softphone is alive and
   * registered; false means the softphone is down, crashed, or silently
   * offline even if the operator's CRM session appears available.
   */
  sipRegistered?: boolean;
  /** Last heartbeat timestamp (ISO8601). Null if the softphone has never
   *  heartbeated. */
  sipLastSeenAt?: string | null;
}
