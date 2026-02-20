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
    name: string;
    idNumber: string | null;
    paymentId: string | null;
    buildings: Array<{ id: string; name: string; coreId: number }>;
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
  recentCalls: Array<{
    id: string;
    direction: string;
    startAt: Date;
    disposition: string | null;
    durationSec: number | null;
  }>;
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
  _disclaimer: string;
}

export interface LiveAgentState {
  userId: string;
  displayName: string | null;
  currentState: 'ON_CALL' | 'IDLE' | 'OFFLINE';
  currentCallDurationSec: number | null;
  callsHandledToday: number;
  _disclaimer: string;
}
