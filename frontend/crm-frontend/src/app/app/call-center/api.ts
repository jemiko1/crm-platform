import { apiGet } from "@/lib/api";
import type {
  CallsPaginated,
  OverviewKpis,
  AgentKpi,
  QueueKpi,
  LiveQueue,
  LiveAgent,
  CallbacksPaginated,
  BreakdownResponse,
  OverviewExtended,
  AgentBreakdownRow,
} from "./types";

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}

export async function fetchCalls(params: {
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
  disposition?: string;
  search?: string;
  queueId?: string;
  userId?: string;
}): Promise<CallsPaginated> {
  const q = qs(params);
  return apiGet<CallsPaginated>(`/v1/telephony/calls?${q}`);
}

export async function fetchOverviewKpis(params: {
  from: string;
  to: string;
  queueId?: string;
  userId?: string;
}): Promise<OverviewKpis> {
  const q = qs(params);
  return apiGet<OverviewKpis>(`/v1/telephony/stats/overview?${q}`);
}

export async function fetchAgentStats(params: {
  from: string;
  to: string;
  queueId?: string;
}): Promise<AgentKpi[]> {
  const q = qs(params);
  return apiGet<AgentKpi[]>(`/v1/telephony/stats/agents?${q}`);
}

export async function fetchQueueStats(params: {
  from: string;
  to: string;
}): Promise<QueueKpi[]> {
  const q = qs(params);
  return apiGet<QueueKpi[]>(`/v1/telephony/stats/queues?${q}`);
}

export async function fetchLiveQueues(): Promise<LiveQueue[]> {
  return apiGet<LiveQueue[]>("/v1/telephony/queues/live");
}

export async function fetchLiveAgents(): Promise<LiveAgent[]> {
  return apiGet<LiveAgent[]>("/v1/telephony/agents/live");
}

export async function fetchBreakdown(params: {
  from: string;
  to: string;
  groupBy: 'hour' | 'day' | 'weekday';
  queueId?: string;
  agentId?: string;
  direction?: 'IN' | 'OUT';
}): Promise<BreakdownResponse> {
  const q = qs(params);
  return apiGet<BreakdownResponse>(`/v1/telephony/stats/breakdown?${q}`);
}

export async function fetchOverviewExtended(params: {
  from: string;
  to: string;
  queueId?: string;
}): Promise<OverviewExtended> {
  const q = qs(params);
  return apiGet<OverviewExtended>(`/v1/telephony/stats/overview-extended?${q}`);
}

export async function fetchAgentBreakdown(params: {
  from: string;
  to: string;
  queueId?: string;
}): Promise<AgentBreakdownRow[]> {
  const q = qs(params);
  return apiGet<AgentBreakdownRow[]>(`/v1/telephony/stats/agents-breakdown?${q}`);
}

export async function fetchCallbacks(params: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<CallbacksPaginated> {
  const q = qs(params);
  return apiGet<CallbacksPaginated>(`/v1/telephony/callbacks?${q}`);
}
