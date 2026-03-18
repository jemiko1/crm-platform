"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface OverviewData {
  totalConversations: number;
  totalMessages: number;
  avgFirstResponseMinutes: number | null;
  avgResolutionMinutes: number | null;
  byStatus: Record<string, number>;
}

interface ChannelData {
  channelType: string;
  conversations: number;
  messages: number;
}

interface AgentData {
  userId: string;
  agentName: string;
  email: string;
  conversationsHandled: number;
  messagesSent: number;
  avgFirstResponseMinutes: number | null;
}

type SortField = "agentName" | "conversationsHandled" | "messagesSent" | "avgFirstResponseMinutes";
type SortDir = "asc" | "desc";

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: "#25D366",
  TELEGRAM: "#0088cc",
  FACEBOOK: "#1877F2",
  VIBER: "#7360F2",
  WEB: "#6B7280",
};

const SPINNER = (
  <div className="flex min-h-[300px] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[rgb(8,117,56)]" />
  </div>
);

function formatMinutes(mins: number | null): string {
  if (mins === null || mins === undefined) return "—";
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toISODate(dateStr: string): string {
  return new Date(dateStr).toISOString();
}

function ChatAnalyticsContent() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [from, setFrom] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [agents, setAgents] = useState<AgentData[]>([]);

  const [sortField, setSortField] = useState<SortField>("conversationsHandled");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = `from=${toISODate(from)}&to=${toISODate(to + "T23:59:59")}`;
    try {
      const [ov, ch, ag] = await Promise.all([
        apiGet<OverviewData>(`/v1/clientchats/analytics/overview?${params}`),
        apiGet<ChannelData[]>(`/v1/clientchats/analytics/by-channel?${params}`),
        apiGet<AgentData[]>(`/v1/clientchats/analytics/by-agent?${params}`),
      ]);
      setOverview(ov);
      setChannels(ch);
      setAgents(ag);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      let av: string | number = a[sortField] ?? -1;
      let bv: string | number = b[sortField] ?? -1;
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [agents, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/app/client-chats"
            className="text-zinc-400 hover:text-zinc-600 transition"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </Link>
          <h1 className="text-xl font-bold text-zinc-900">Chat Analytics</h1>
        </div>
      </div>

      {/* Date range picker */}
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-zinc-600">From</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
        <label className="text-sm font-medium text-zinc-600">To</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-red-700 text-sm">{error}</div>
      )}

      {loading ? (
        SPINNER
      ) : (
        <>
          {/* Overview KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total Conversations"
              value={String(overview?.totalConversations ?? 0)}
              borderColor="border-l-emerald-500"
            />
            <KpiCard
              label="Total Messages"
              value={String(overview?.totalMessages ?? 0)}
              borderColor="border-l-blue-500"
            />
            <KpiCard
              label="Avg First Response"
              value={formatMinutes(overview?.avgFirstResponseMinutes ?? null)}
              subtitle="Time to first agent reply"
              borderColor="border-l-amber-500"
            />
            <KpiCard
              label="Avg Resolution Time"
              value={formatMinutes(overview?.avgResolutionMinutes ?? null)}
              subtitle="Time from creation to close"
              borderColor="border-l-purple-500"
            />
          </div>

          {/* Status breakdown */}
          {overview?.byStatus && Object.keys(overview.byStatus).length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800 mb-3">Conversations by Status</h2>
              <div className="flex gap-4 flex-wrap">
                {Object.entries(overview.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-2">
                    <span className={`inline-block h-3 w-3 rounded-full ${
                      status === "OPEN" ? "bg-emerald-400" :
                      status === "PENDING" ? "bg-amber-400" :
                      status === "CLOSED" ? "bg-zinc-400" :
                      "bg-red-400"
                    }`} />
                    <span className="text-sm text-zinc-700">{status}</span>
                    <span className="text-sm font-semibold text-zinc-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Channel breakdown chart */}
          {channels.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800 mb-4">Volume by Channel</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channels} barGap={8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="channelType" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 13 }}
                    />
                    <Bar dataKey="conversations" name="Conversations" radius={[6, 6, 0, 0]}>
                      {channels.map((entry) => (
                        <Cell
                          key={entry.channelType}
                          fill={CHANNEL_COLORS[entry.channelType] || "#9CA3AF"}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="messages" name="Messages" radius={[6, 6, 0, 0]} fill="#94a3b8" opacity={0.5} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Agent performance table */}
          {agents.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800 mb-4">Agent Performance</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th
                        className="text-left py-2 px-3 font-medium text-zinc-500 cursor-pointer hover:text-zinc-700 select-none"
                        onClick={() => toggleSort("agentName")}
                      >
                        Agent {sortIcon("agentName")}
                      </th>
                      <th
                        className="text-right py-2 px-3 font-medium text-zinc-500 cursor-pointer hover:text-zinc-700 select-none"
                        onClick={() => toggleSort("conversationsHandled")}
                      >
                        Conversations {sortIcon("conversationsHandled")}
                      </th>
                      <th
                        className="text-right py-2 px-3 font-medium text-zinc-500 cursor-pointer hover:text-zinc-700 select-none"
                        onClick={() => toggleSort("messagesSent")}
                      >
                        Messages Sent {sortIcon("messagesSent")}
                      </th>
                      <th
                        className="text-right py-2 px-3 font-medium text-zinc-500 cursor-pointer hover:text-zinc-700 select-none"
                        onClick={() => toggleSort("avgFirstResponseMinutes")}
                      >
                        Avg Response {sortIcon("avgFirstResponseMinutes")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAgents.map((agent) => (
                      <tr key={agent.userId} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-zinc-800">{agent.agentName}</div>
                          <div className="text-xs text-zinc-400">{agent.email}</div>
                        </td>
                        <td className="text-right py-2.5 px-3 text-zinc-700 font-medium">
                          {agent.conversationsHandled}
                        </td>
                        <td className="text-right py-2.5 px-3 text-zinc-700 font-medium">
                          {agent.messagesSent}
                        </td>
                        <td className="text-right py-2.5 px-3 text-zinc-700">
                          {formatMinutes(agent.avgFirstResponseMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {channels.length === 0 && agents.length === 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
              <p className="text-zinc-400 text-sm">No data for the selected date range</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  subtitle,
  borderColor,
}: {
  label: string;
  value: string;
  subtitle?: string;
  borderColor: string;
}) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-zinc-100 p-5 border-l-4 ${borderColor}`}>
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="mt-2 text-2xl font-bold text-zinc-900">{value}</div>
      {subtitle && <div className="mt-1 text-xs text-zinc-500">{subtitle}</div>}
    </div>
  );
}

export default function ChatAnalyticsPage() {
  return (
    <PermissionGuard permission="client_chats_config.access">
      <ChatAnalyticsContent />
    </PermissionGuard>
  );
}
