export interface CallSession {
  id: string;
  linkedId: string;
  direction: "IN" | "OUT";
  callerNumber: string | null;
  calleeNumber: string | null;
  queueId: string | null;
  queueName: string | null;
  disposition: string | null;
  startAt: string;
  answerAt: string | null;
  endAt: string | null;
  durationSec: number | null;
  talkTimeSec: number | null;
  waitTimeSec: number | null;
  holdTimeSec: number | null;
  agentExtension: string | null;
  agentName: string | null;
  clientName: string | null;
  recordingUrl: string | null;
  recordingId?: string | null;
  qualityScore?: number | null;
}

export interface CallsPaginated {
  data: CallSession[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
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

export interface AgentKpi {
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

export interface QueueKpi {
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

export interface LiveQueue {
  queueId: string;
  queueName: string;
  activeCalls: number;
  waitingCallers: number;
  longestCurrentWaitSec: number | null;
  availableAgents: number;
}

export interface LiveAgent {
  userId: string;
  displayName: string | null;
  currentState: "ON_CALL" | "IDLE" | "OFFLINE";
  currentCallDurationSec: number | null;
  callsHandledToday: number;
}

export interface CallbackRequest {
  id: string;
  callerNumber: string | null;
  queueId: string | null;
  queueName: string | null;
  status: "PENDING" | "SCHEDULED" | "ATTEMPTING" | "DONE" | "FAILED" | "CANCELED";
  reason: "OUT_OF_HOURS" | "ABANDONED" | "NO_ANSWER" | null;
  createdAt: string;
  scheduledAt: string | null;
  completedAt: string | null;
  attemptsCount: number;
  lastAttemptAt: string | null;
  assignedToName: string | null;
  clientName: string | null;
  missedCallId: string;
  callSessionId: string | null;
  missedAt: string | null;
}

export interface CallbacksPaginated {
  data: CallbackRequest[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
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
}

export interface OverviewExtended {
  holdDistribution: {
    answered: HoldTimeDistribution;
    lost: HoldTimeDistribution;
  };
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
}
