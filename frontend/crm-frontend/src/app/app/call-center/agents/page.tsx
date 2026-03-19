"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, ApiError } from "@/lib/api";
import { format, subDays } from "date-fns";

type AgentStats = {
  userId: string;
  displayName: string;
  totalCalls: number;
  answered: number;
  missed: number;
  answerRate: number;
  missedRate: number;
  avgHandleTimeSec: number | null;
  avgTalkTimeSec: number | null;
  avgHoldTimeSec: number | null;
  afterCallWorkTimeSec: number | null;
};

function formatSeconds(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function getAnswerRateColor(rate: number | null | undefined): string {
  if (rate == null || Number.isNaN(rate)) return "text-zinc-500";
  if (rate >= 90) return "text-teal-800 font-semibold";
  if (rate >= 75) return "text-yellow-600 font-semibold";
  return "text-red-600 font-semibold";
}

export default function AgentsPage() {
  const today = new Date();
  const defaultTo = format(today, "yyyy-MM-dd");
  const defaultFrom = format(subDays(today, 7), "yyyy-MM-dd");

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const [agents, setAgents] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);

      const res = await apiGet<AgentStats[]>(
        `/v1/telephony/stats/agents?${params.toString()}`
      );
      const list = Array.isArray(res) ? res : [];
      setAgents(list);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load agent stats");
      }
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => b.totalCalls - a.totalCalls);
  }, [agents]);

  return (
    <div className="space-y-6">
      {/* Date range */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="from" className="text-sm text-zinc-500">From</label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="to" className="text-sm text-zinc-500">To</label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[rgb(8,117,56)]" />
          </div>
        ) : sortedAgents.length === 0 ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 py-12">
            <svg
              className="h-14 w-14 text-zinc-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <p className="text-sm text-zinc-500">No agent data found</p>
            <p className="text-xs text-zinc-400">
              Try adjusting your date range. Agent stats appear when calls are
              handled in the selected period.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 text-zinc-500 text-xs uppercase">
                  <th className="px-4 py-3 text-left font-medium">Agent</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Total Calls
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Answered</th>
                  <th className="px-4 py-3 text-right font-medium">Missed</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Answer Rate %
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Avg Handle Time
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Avg Talk Time
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    Avg Hold Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((a) => (
                  <tr
                    key={a.userId}
                    className="border-b border-zinc-100 hover:bg-zinc-50"
                  >
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      {a.displayName}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {a.totalCalls}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {a.answered}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {a.missed}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={getAnswerRateColor(a.answerRate)}>
                        {a.answerRate != null
                          ? a.answerRate.toFixed(1)
                          : "—"}
                        %
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {formatSeconds(a.avgHandleTimeSec)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {formatSeconds(a.avgTalkTimeSec)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {formatSeconds(a.avgHoldTimeSec)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
