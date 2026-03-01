"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchLiveQueues, fetchLiveAgents } from "../api";
import type { LiveQueue, LiveAgent } from "../types";

const BRAND = "rgb(8,117,56)";

function fmtSec(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

const STATE_STYLES: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  ON_CALL: { dot: "bg-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", label: "On Call" },
  IDLE: { dot: "bg-blue-400", bg: "bg-blue-50", text: "text-blue-700", label: "Idle" },
  OFFLINE: { dot: "bg-zinc-300", bg: "bg-zinc-100", text: "text-zinc-500", label: "Offline" },
};

export default function LiveMonitorPage() {
  const { t } = useI18n();
  const [queues, setQueues] = useState<LiveQueue[]>([]);
  const [agents, setAgents] = useState<LiveAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [q, a] = await Promise.all([fetchLiveQueues(), fetchLiveAgents()]);
      setQueues(Array.isArray(q) ? q : []);
      setAgents(Array.isArray(a) ? a : []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Failed to load live data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  const onlineAgents = agents.filter((a) => a.currentState !== "OFFLINE");
  const onCallAgents = agents.filter((a) => a.currentState === "ON_CALL");

  return (
    <div className="flex flex-col gap-6">
      {/* Status bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="text-sm font-medium text-zinc-700">{t("callCenter.live.realtime", "Real-time")}</span>
          </div>
          {lastRefresh && (
            <span className="text-xs text-zinc-400">
              {t("callCenter.live.updated", "Updated")} {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
        <button
          onClick={load}
          className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 transition"
        >
          {t("callCenter.live.refresh", "Refresh")}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-emerald-600" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <SummaryCard
              label={t("callCenter.live.activeQueues", "Active Queues")}
              value={queues.filter((q) => q.activeCalls > 0 || q.waitingCallers > 0).length}
              total={queues.length}
            />
            <SummaryCard
              label={t("callCenter.live.onlineAgents", "Online Agents")}
              value={onlineAgents.length}
              total={agents.length}
              color="emerald"
            />
            <SummaryCard
              label={t("callCenter.live.onCall", "On Call Now")}
              value={onCallAgents.length}
              color="blue"
            />
            <SummaryCard
              label={t("callCenter.live.waitingCallers", "Waiting Callers")}
              value={queues.reduce((s, q) => s + q.waitingCallers, 0)}
              color={queues.reduce((s, q) => s + q.waitingCallers, 0) > 0 ? "amber" : undefined}
            />
          </div>

          {/* Live Queues */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">
              {t("callCenter.live.queuesTitle", "Queue Status")}
            </h3>
            {queues.length === 0 ? (
              <p className="text-sm text-zinc-400 py-8 text-center">{t("callCenter.live.noQueues", "No queues configured.")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {queues.map((q) => (
                  <div key={q.queueId} className="rounded-2xl border border-zinc-200 p-4 transition hover:shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-zinc-900">{q.queueName || q.queueId}</h4>
                      {q.activeCalls > 0 && (
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {q.activeCalls} {t("callCenter.live.active", "active")}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-lg font-bold text-zinc-900">{q.waitingCallers}</p>
                        <p className="text-[10px] text-zinc-400">{t("callCenter.live.waiting", "Waiting")}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-zinc-900">{q.availableAgents}</p>
                        <p className="text-[10px] text-zinc-400">{t("callCenter.live.available", "Available")}</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-zinc-900">{fmtSec(q.longestCurrentWaitSec)}</p>
                        <p className="text-[10px] text-zinc-400">{t("callCenter.live.longest", "Longest")}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Agents */}
          <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900">
              {t("callCenter.live.agentsTitle", "Agent Status")}
            </h3>
            {agents.length === 0 ? (
              <p className="text-sm text-zinc-400 py-8 text-center">{t("callCenter.live.noAgents", "No agents found.")}</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {agents.map((a) => {
                  const st = STATE_STYLES[a.currentState] ?? STATE_STYLES.OFFLINE;
                  return (
                    <div key={a.userId} className={`rounded-2xl border border-zinc-200 p-3 flex items-center gap-3 transition hover:shadow-sm ${a.currentState === "OFFLINE" ? "opacity-50" : ""}`}>
                      <div className={`h-10 w-10 rounded-full ${st.bg} flex items-center justify-center`}>
                        <span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 truncate">{a.displayName || a.userId}</p>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${st.text}`}>{st.label}</span>
                          {a.currentState === "ON_CALL" && a.currentCallDurationSec != null && (
                            <span className="text-xs text-zinc-400">{fmtSec(a.currentCallDurationSec)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-zinc-900">{a.callsHandledToday}</p>
                        <p className="text-[10px] text-zinc-400">{t("callCenter.live.today", "today")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, total, color }: { label: string; value: number; total?: number; color?: string }) {
  const numColor =
    color === "emerald" ? "text-emerald-700" :
    color === "blue" ? "text-blue-600" :
    color === "amber" ? "text-amber-600" :
    "text-zinc-900";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${numColor}`}>
        {value}
        {total != null && <span className="text-sm font-normal text-zinc-400">/{total}</span>}
      </p>
    </div>
  );
}
