"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchOverviewKpis, fetchAgentStats, fetchQueueStats } from "./api";
import type { OverviewKpis, AgentKpi, QueueKpi } from "./types";

const BRAND = "rgb(8,117,56)";

function todayRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const to = now.toISOString();
  return { from, to };
}

function last7DaysRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).toISOString();
  const to = now.toISOString();
  return { from, to };
}

function last30DaysRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).toISOString();
  const to = now.toISOString();
  return { from, to };
}

const RANGES: Record<string, () => { from: string; to: string }> = {
  today: todayRange,
  "7days": last7DaysRange,
  "30days": last30DaysRange,
};

function fmtSec(sec: number | null): string {
  if (sec == null) return "—";
  if (sec < 60) return `${Math.round(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function fmtPct(val: number | null): string {
  if (val == null) return "—";
  return `${val.toFixed(1)}%`;
}

export default function CallCenterDashboard() {
  const { t } = useI18n();
  const [range, setRange] = useState("today");
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewKpis | null>(null);
  const [agents, setAgents] = useState<AgentKpi[]>([]);
  const [queues, setQueues] = useState<QueueKpi[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { from, to } = RANGES[range]();
      const [ov, ag, qu] = await Promise.all([
        fetchOverviewKpis({ from, to }),
        fetchAgentStats({ from, to }),
        fetchQueueStats({ from, to }),
      ]);
      setOverview(ov);
      setAgents(Array.isArray(ag) ? ag : []);
      setQueues(Array.isArray(qu) ? qu : []);
    } catch (err) {
      console.error("Failed to load stats", err);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-6">
      {/* Range selector */}
      <div className="flex items-center gap-2">
        {[
          { key: "today", label: t("callCenter.range.today", "Today") },
          { key: "7days", label: t("callCenter.range.7days", "Last 7 Days") },
          { key: "30days", label: t("callCenter.range.30days", "Last 30 Days") },
        ].map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={[
              "rounded-xl px-3 py-1.5 text-xs font-medium transition-all",
              range === r.key
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50",
            ].join(" ")}
          >
            {r.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-200 border-t-emerald-600" />
        </div>
      ) : (
        <>
          {/* Volume KPIs */}
          {overview && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard label={t("callCenter.kpi.totalCalls", "Total Calls")} value={overview.volume.totalCalls} />
              <KpiCard label={t("callCenter.kpi.answered", "Answered")} value={overview.volume.answered} color="emerald" />
              <KpiCard label={t("callCenter.kpi.missed", "Missed")} value={overview.volume.missed} color="rose" />
              <KpiCard label={t("callCenter.kpi.abandoned", "Abandoned")} value={overview.volume.abandoned} color="amber" />
              <KpiCard label={t("callCenter.kpi.avgAnswer", "Avg Answer")} value={fmtSec(overview.speed.avgAnswerTimeSec)} />
              <KpiCard label={t("callCenter.kpi.sla", "SLA Met")} value={fmtPct(overview.serviceLevel.slaMetPercent)} color="emerald" />
            </div>
          )}

          {/* Speed & Quality */}
          {overview && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <h3 className="mb-4 text-sm font-semibold text-zinc-900">
                  {t("callCenter.section.speed", "Speed Metrics")}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <MiniStat label={t("callCenter.kpi.medianAnswer", "Median Answer")} value={fmtSec(overview.speed.medianAnswerTimeSec)} />
                  <MiniStat label={t("callCenter.kpi.p90Answer", "P90 Answer")} value={fmtSec(overview.speed.p90AnswerTimeSec)} />
                  <MiniStat label={t("callCenter.kpi.avgAbandonWait", "Avg Abandon Wait")} value={fmtSec(overview.speed.avgAbandonWaitSec)} />
                  <MiniStat label={t("callCenter.kpi.longestWait", "Longest Wait")} value={fmtSec(overview.serviceLevel.longestWaitSec)} />
                </div>
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
                <h3 className="mb-4 text-sm font-semibold text-zinc-900">
                  {t("callCenter.section.quality", "Quality Metrics")}
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <MiniStat label={t("callCenter.kpi.avgTalk", "Avg Talk")} value={fmtSec(overview.quality.avgTalkTimeSec)} />
                  <MiniStat label={t("callCenter.kpi.avgHold", "Avg Hold")} value={fmtSec(overview.quality.avgHoldTimeSec)} />
                  <MiniStat label={t("callCenter.kpi.avgWrapup", "Avg Wrapup")} value={fmtSec(overview.quality.avgWrapupTimeSec)} />
                  <MiniStat label={t("callCenter.kpi.transferRate", "Transfer Rate")} value={fmtPct(overview.quality.transferRate)} />
                </div>
              </div>
            </div>
          )}

          {/* Queue Stats */}
          {queues.length > 0 && (
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">
                {t("callCenter.section.queues", "Queue Performance")}
              </h3>
              <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200 overflow-clip">
                <table className="w-full border-separate border-spacing-0">
                  <thead className="bg-zinc-50">
                    <tr className="text-left text-xs text-zinc-600">
                      <th className="px-4 py-3 font-medium">{t("callCenter.table.queue", "Queue")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.agents", "Agents")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.total", "Total")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.answered", "Answered")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.missed", "Missed")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.avgAnswer", "Avg Answer")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.sla", "SLA")}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {queues.map((q, i) => (
                      <tr key={q.queueId} className={i < queues.length - 1 ? "border-b border-zinc-100" : ""}>
                        <td className="px-4 py-3 text-sm font-medium text-zinc-900">{q.queueName || q.queueId}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600 text-right">{q.agentCount}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600 text-right">{q.totalCalls}</td>
                        <td className="px-4 py-3 text-sm text-emerald-700 text-right">{q.answered}</td>
                        <td className="px-4 py-3 text-sm text-rose-600 text-right">{q.missed}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600 text-right">{fmtSec(q.avgAnswerTimeSec)}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: (q.slaMetPercent ?? 0) >= 80 ? BRAND : "#e11d48" }}>
                          {fmtPct(q.slaMetPercent)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Agent Stats */}
          {agents.length > 0 && (
            <div className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">
                {t("callCenter.section.agents", "Agent Performance")}
              </h3>
              <div className="overflow-x-auto rounded-2xl ring-1 ring-zinc-200 overflow-clip">
                <table className="w-full border-separate border-spacing-0">
                  <thead className="bg-zinc-50">
                    <tr className="text-left text-xs text-zinc-600">
                      <th className="px-4 py-3 font-medium">{t("callCenter.table.agent", "Agent")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.total", "Total")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.answered", "Answered")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.missed", "Missed")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.answerRate", "Answer %")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.avgHandle", "Avg Handle")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("callCenter.table.avgTalk", "Avg Talk")}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {agents.map((a, i) => (
                      <tr key={a.userId} className={i < agents.length - 1 ? "border-b border-zinc-100" : ""}>
                        <td className="px-4 py-3 text-sm font-medium text-zinc-900">{a.displayName || a.userId}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600 text-right">{a.totalCalls}</td>
                        <td className="px-4 py-3 text-sm text-emerald-700 text-right">{a.answered}</td>
                        <td className="px-4 py-3 text-sm text-rose-600 text-right">{a.missed}</td>
                        <td className="px-4 py-3 text-sm text-right font-medium" style={{ color: (a.answerRate ?? 0) >= 80 ? BRAND : "#e11d48" }}>
                          {fmtPct(a.answerRate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-zinc-600 text-right">{fmtSec(a.avgHandleTimeSec)}</td>
                        <td className="px-4 py-3 text-sm text-zinc-600 text-right">{fmtSec(a.avgTalkTimeSec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!overview && agents.length === 0 && queues.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-3xl bg-white p-12 shadow-sm ring-1 ring-zinc-200">
              <div className="text-4xl mb-3 opacity-30">📊</div>
              <p className="text-sm text-zinc-500">{t("callCenter.empty.noData", "No call data for the selected period.")}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const textColor =
    color === "emerald" ? "text-emerald-700" :
    color === "rose" ? "text-rose-600" :
    color === "amber" ? "text-amber-600" :
    "text-zinc-900";

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold tracking-tight ${textColor}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-400 mb-0.5">{label}</p>
      <p className="text-lg font-semibold text-zinc-900">{value}</p>
    </div>
  );
}
