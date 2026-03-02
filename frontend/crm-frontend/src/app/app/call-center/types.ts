export interface CallSession {
  id: string;
  linkedId: string;
  direction: "INBOUND" | "OUTBOUND" | "INTERNAL";
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
  callerNumber: string;
  queueId: string | null;
  queueName: string | null;
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  scheduledAt: string | null;
  completedAt: string | null;
  clientName: string | null;
}

export interface CallbacksPaginated {
  data: CallbackRequest[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}
