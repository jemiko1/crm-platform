"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";

type QueueLive = {
  queueId: string;
  queueName: string;
  activeCalls: number;
  waitingCallers: number;
  longestCurrentWaitSec: number | null;
  availableAgents: number;
  _disclaimer?: string;
};

type AgentLive = {
  userId: string;
  displayName: string;
  currentState: "ON_CALL" | "IDLE" | "OFFLINE" | "RINGING" | "PAUSED";
  currentCallDurationSec?: number | null;
  callsHandledToday: number;
  _disclaimer?: string;
  presence?: string;
  pausedReason?: string | null;
};

const TABS = [
  { href: "/app/call-center", label: "Dashboard" },
  { href: "/app/call-center/calls", label: "Calls" },
  { href: "/app/call-center/live", label: "Live" },
  { href: "/app/call-center/quality", label: "Quality" },
  { href: "/app/call-center/agents", label: "Agents" },
];

const REFRESH_INTERVAL_MS = 10_000;

function formatSeconds(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function getQueueBorderClass(waiting: number): string {
  if (waiting > 5) return "border-red-500 border-2";
  if (waiting > 3) return "border-yellow-500 border-2";
  return "border-zinc-100";
}

function getAgentStateStyles(state: AgentLive["currentState"]): {
  dotClass: string;
  label: string;
} {
  switch (state) {
    case "ON_CALL":
      return { dotClass: "bg-green-500 animate-pulse", label: "On Call" };
    case "RINGING":
      return { dotClass: "bg-yellow-500 animate-pulse", label: "Ringing" };
    case "PAUSED":
      return { dotClass: "bg-orange-500", label: "Paused" };
    case "IDLE":
      return { dotClass: "bg-blue-500", label: "Idle" };
    case "OFFLINE":
    default:
      return { dotClass: "bg-zinc-400", label: "Offline" };
  }
}

export default function CallCenterLivePage() {
  const pathname = usePathname();
  const [queues, setQueues] = useState<QueueLive[]>([]);
  const [agents, setAgents] = useState<AgentLive[]>([]);
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(10);

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [queuesRes, agentsRes] = await Promise.all([
        apiGet<QueueLive[] | { data: QueueLive[]; _disclaimer?: string }>(
          "/v1/telephony/queues/live"
        ),
        apiGet<AgentLive[] | { data: AgentLive[]; _disclaimer?: string }>(
          "/v1/telephony/agents/live"
        ),
      ]);

      const queuesList = Array.isArray(queuesRes) ? queuesRes : queuesRes?.data ?? [];
      const agentsList = Array.isArray(agentsRes) ? agentsRes : agentsRes?.data ?? [];

      setQueues(queuesList);
      setAgents(agentsList);

      const disc =
        (Array.isArray(queuesRes) ? null : (queuesRes as { _disclaimer?: string })?._disclaimer) ??
        (Array.isArray(agentsRes) ? null : (agentsRes as { _disclaimer?: string })?._disclaimer) ??
        queuesList[0]?._disclaimer ??
        agentsList[0]?._disclaimer ??
        null;
      setDisclaimer(disc ?? null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load live data");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData();
          return REFRESH_INTERVAL_MS / 1000;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [loading, fetchData]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[rgb(8,117,56)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Live Monitoring</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Real-time queue and agent status
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <span>Refreshing in</span>
          <span className="font-mono font-semibold text-zinc-700">{countdown}s</span>
        </div>
      </div>

      {/* Sub-nav tabs */}
      <div className="flex flex-wrap gap-1 border-b border-zinc-200">
        {TABS.map((tab) => {
          const isActive = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg -mb-px ${
                isActive
                  ? "border-b-2 border-[rgb(8,117,56)] text-[rgb(8,117,56)] bg-white"
                  : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {disclaimer && (
        <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-800 flex items-start gap-2">
          <span className="text-blue-500 shrink-0">ℹ</span>
          <span>{disclaimer}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {/* Queue Status */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">Queue Status</h2>
        {queues.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 border-dashed bg-zinc-50 p-12 text-center">
            <p className="text-zinc-500">No queues configured</p>
            <p className="mt-1 text-sm text-zinc-400">
              Configure telephony queues to see live status here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {queues.map((q) => (
              <div
                key={q.queueId}
                className={`rounded-2xl border bg-white p-6 shadow-sm ${getQueueBorderClass(q.waitingCallers)}`}
              >
                <div className="text-sm font-medium text-zinc-500">
                  {q.queueName}
                </div>
                <div className="mt-2 text-4xl font-bold text-zinc-900">
                  {q.activeCalls}
                </div>
                <div className="mt-1 text-sm text-zinc-600">active calls</div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-zinc-500">Waiting:</span>{" "}
                    <span className="font-medium">{q.waitingCallers}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Longest wait:</span>{" "}
                    <span className="font-medium">
                      {formatSeconds(q.longestCurrentWaitSec)}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Available:</span>{" "}
                    <span className="font-medium">{q.availableAgents}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Agent Status */}
      <section>
        <h2 className="text-lg font-semibold text-zinc-800 mb-4">
          Agent Status
        </h2>
        {agents.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 border-dashed bg-zinc-50 p-12 text-center">
            <p className="text-zinc-500">No agents configured</p>
            <p className="mt-1 text-sm text-zinc-400">
              Configure telephony agents to see live status here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map((a) => {
              const { dotClass, label } = getAgentStateStyles(a.currentState);
              return (
                <div
                  key={a.userId}
                  className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
                      aria-hidden
                    />
                    <span className="font-semibold text-zinc-900">
                      {a.displayName}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-500">{label}</div>
                  {a.currentState === "ON_CALL" &&
                    a.currentCallDurationSec != null && (
                      <div className="mt-2 text-sm">
                        <span className="text-zinc-500">Call duration: </span>
                        <span className="font-medium">
                          {formatSeconds(a.currentCallDurationSec)}
                        </span>
                      </div>
                    )}
                  {a.currentState === "PAUSED" && a.pausedReason && (
                    <div className="mt-2 text-sm text-orange-600">
                      {a.pausedReason}
                    </div>
                  )}
                  <div className="mt-3 text-sm text-zinc-500">
                    Calls today:{" "}
                    <span className="font-medium text-zinc-700">
                      {a.callsHandledToday}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
