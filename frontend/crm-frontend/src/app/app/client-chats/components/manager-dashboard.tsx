"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { apiGet } from "@/lib/api";
import { useClientChatSocket } from "../hooks/useClientChatSocket";
import ManagerQueuePanel from "./manager-queue-panel";
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

// ── Shared types ─────────────────────────────────────────

interface OperatorStatus {
  userId: string;
  name: string;
  email: string;
  openChats: number;
  avgResponseMins: number | null;
  isOnline: boolean;
}

interface QueueStats {
  totalOpen: number;
  unassigned: number;
  pastSLA: number;
  avgWaitMins: number;
}

interface EscalationEvent {
  id: string;
  conversationId: string;
  type: string;
  fromUserId: string | null;
  toUserId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  conversation?: {
    id: string;
    channelType: string;
    externalConversationId: string;
    assignedUserId: string | null;
  };
}

interface LiveStatus {
  activeOperators: OperatorStatus[];
  queueStats: QueueStats;
  recentEscalations: EscalationEvent[];
}

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

type DashboardTab = "analytics" | "operators" | "live" | "queue";

const CHANNEL_COLORS: Record<string, string> = {
  WHATSAPP: "#25D366",
  TELEGRAM: "#0088cc",
  FACEBOOK: "#1877F2",
  VIBER: "#7360F2",
  WEB: "#6B7280",
};

const SPINNER = (
  <div className="flex min-h-[200px] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[rgb(8,117,56)]" />
  </div>
);

// ── Helpers ──────────────────────────────────────────────

function formatMinutes(mins: number | null): string {
  if (mins === null || mins === undefined) return "—";
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function toISODate(dateStr: string): string {
  return new Date(dateStr).toISOString();
}

// ── Main component ───────────────────────────────────────

interface Props {
  visible: boolean;
}

export default function ManagerDashboard({ visible }: Props) {
  const [tab, setTab] = useState<DashboardTab>("analytics");

  if (!visible) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-1 px-4 pt-4 pb-2 border-b border-zinc-200 bg-white flex-shrink-0">
        <TabButton active={tab === "analytics"} onClick={() => setTab("analytics")}>
          Chat Analytics
        </TabButton>
        <TabButton active={tab === "operators"} onClick={() => setTab("operators")}>
          Active Operators
        </TabButton>
        <TabButton active={tab === "live"} onClick={() => setTab("live")}>
          Live Dashboard
        </TabButton>
        <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
          Queue &amp; Schedule
        </TabButton>
      </div>
      <div className="flex-1 overflow-y-auto p-4 bg-zinc-50/50">
        {tab === "analytics" && <AnalyticsTab />}
        {tab === "operators" && <OperatorsTab />}
        {tab === "live" && <LiveDashboardTab />}
        {tab === "queue" && <ManagerQueuePanel open={true} onToggle={() => {}} />}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
        active
          ? "bg-white text-zinc-900 border border-zinc-200 border-b-white -mb-px"
          : "text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100"
      }`}
    >
      {children}
    </button>
  );
}

// ── KPI Card (shared) ────────────────────────────────────

function KpiCard({ label, value, subtitle, borderColor }: {
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

// ── Tab 1: Chat Analytics ────────────────────────────────

type SortField = "agentName" | "conversationsHandled" | "messagesSent" | "avgFirstResponseMinutes";
type SortDir = "asc" | "desc";

function AnalyticsTab() {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [from, setFrom] = useState(thirtyDaysAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [channels, setChannels] = useState<ChannelData[]>([]);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [sortField, setSortField] = useState<SortField>("conversationsHandled");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fetchAll = useCallback(async () => {
    setLoading(true);
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
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

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
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return "↕";
    return sortDir === "asc" ? "↑" : "↓";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="text-sm font-medium text-zinc-600">From</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
        <label className="text-sm font-medium text-zinc-600">To</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400" />
      </div>

      {loading ? SPINNER : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Conversations" value={String(overview?.totalConversations ?? 0)} borderColor="border-l-emerald-500" />
            <KpiCard label="Total Messages" value={String(overview?.totalMessages ?? 0)} borderColor="border-l-blue-500" />
            <KpiCard label="Avg First Response" value={formatMinutes(overview?.avgFirstResponseMinutes ?? null)} subtitle="Time to first agent reply" borderColor="border-l-amber-500" />
            <KpiCard label="Avg Resolution Time" value={formatMinutes(overview?.avgResolutionMinutes ?? null)} subtitle="Time from creation to close" borderColor="border-l-purple-500" />
          </div>

          {overview?.byStatus && Object.keys(overview.byStatus).length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800 mb-3">Conversations by Status</h2>
              <div className="flex gap-4 flex-wrap">
                {Object.entries(overview.byStatus).map(([status, count]) => (
                  <div key={status} className="flex items-center gap-2">
                    <span className={`inline-block h-3 w-3 rounded-full ${
                      status === "LIVE" ? "bg-emerald-400" : status === "CLOSED" ? "bg-zinc-400" : "bg-gray-400"
                    }`} />
                    <span className="text-sm text-zinc-700">{status}</span>
                    <span className="text-sm font-semibold text-zinc-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {channels.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800 mb-4">Volume by Channel</h2>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channels} barGap={8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="channelType" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 13 }} />
                    <Bar dataKey="conversations" name="Conversations" radius={[6, 6, 0, 0]}>
                      {channels.map((entry) => (
                        <Cell key={entry.channelType} fill={CHANNEL_COLORS[entry.channelType] || "#9CA3AF"} />
                      ))}
                    </Bar>
                    <Bar dataKey="messages" name="Messages" radius={[6, 6, 0, 0]} fill="#94a3b8" opacity={0.5} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {agents.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-800 mb-4">Agent Performance</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100">
                      <th className="text-left py-2 px-3 font-medium text-zinc-500 cursor-pointer hover:text-zinc-700 select-none" onClick={() => toggleSort("agentName")}>Agent {sortIcon("agentName")}</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-500 cursor-pointer hover:text-zinc-700 select-none" onClick={() => toggleSort("conversationsHandled")}>Conversations {sortIcon("conversationsHandled")}</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-500 cursor-pointer hover:text-zinc-700 select-none" onClick={() => toggleSort("messagesSent")}>Messages Sent {sortIcon("messagesSent")}</th>
                      <th className="text-right py-2 px-3 font-medium text-zinc-500 cursor-pointer hover:text-zinc-700 select-none" onClick={() => toggleSort("avgFirstResponseMinutes")}>Avg Response {sortIcon("avgFirstResponseMinutes")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAgents.map((agent) => (
                      <tr key={agent.userId} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                        <td className="py-2.5 px-3"><div className="font-medium text-zinc-800">{agent.agentName}</div><div className="text-xs text-zinc-400">{agent.email}</div></td>
                        <td className="text-right py-2.5 px-3 text-zinc-700 font-medium">{agent.conversationsHandled}</td>
                        <td className="text-right py-2.5 px-3 text-zinc-700 font-medium">{agent.messagesSent}</td>
                        <td className="text-right py-2.5 px-3 text-zinc-700">{formatMinutes(agent.avgFirstResponseMinutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tab 2: Active Operators ──────────────────────────────

function OperatorsTab() {
  const [data, setData] = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiGet<LiveStatus>("/v1/clientchats/queue/live-status");
      setData(res);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) return SPINNER;
  if (!data || data.activeOperators.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
        <p className="text-zinc-400 text-sm">No active operators scheduled for today</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Active Operators" value={String(data.activeOperators.length)} borderColor="border-l-emerald-500" />
        <KpiCard label="Online Now" value={String(data.activeOperators.filter((o) => o.isOnline).length)} borderColor="border-l-blue-500" />
        <KpiCard label="Total Open Chats" value={String(data.queueStats.totalOpen)} borderColor="border-l-amber-500" />
        <KpiCard label="Unassigned" value={String(data.queueStats.unassigned)} borderColor="border-l-purple-500" />
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-800 mb-4">Operator Status</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100">
                <th className="text-left py-2 px-3 font-medium text-zinc-500">Status</th>
                <th className="text-left py-2 px-3 font-medium text-zinc-500">Operator</th>
                <th className="text-right py-2 px-3 font-medium text-zinc-500">Open Chats</th>
                <th className="text-right py-2 px-3 font-medium text-zinc-500">Avg Response</th>
              </tr>
            </thead>
            <tbody>
              {data.activeOperators.map((op) => (
                <tr key={op.userId} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                      op.isOnline ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${op.isOnline ? "bg-emerald-500" : "bg-zinc-400"}`} />
                      {op.isOnline ? "Online" : "Offline"}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-zinc-800">{op.name}</div>
                    <div className="text-xs text-zinc-400">{op.email}</div>
                  </td>
                  <td className="text-right py-2.5 px-3 text-zinc-700 font-medium">{op.openChats}</td>
                  <td className="text-right py-2.5 px-3 text-zinc-700">{formatMinutes(op.avgResponseMins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Tab 3: Live Dashboard ────────────────────────────────

function LiveDashboardTab() {
  const [data, setData] = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { on, off } = useClientChatSocket();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const res = await apiGet<LiveStatus>("/v1/clientchats/queue/live-status");
      if (mountedRef.current) setData(res);
    } catch { /* silent */ } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    const refresh = () => { fetchData(); };
    on("escalation:warning", refresh);
    on("escalation:reassign", refresh);
    return () => {
      off("escalation:warning", refresh);
      off("escalation:reassign", refresh);
    };
  }, [on, off, fetchData]);

  if (loading) return SPINNER;

  const stats = data?.queueStats;

  return (
    <div className="space-y-6">
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Open" value={String(stats.totalOpen)} borderColor="border-l-emerald-500" />
          <KpiCard label="Unassigned" value={String(stats.unassigned)} borderColor="border-l-amber-500" />
          <KpiCard label="Past SLA" value={String(stats.pastSLA)} borderColor="border-l-red-500" />
          <KpiCard label="Avg Wait Time" value={formatMinutes(stats.avgWaitMins)} borderColor="border-l-blue-500" />
        </div>
      )}

      {stats && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-800 mb-3">Queue Health</h2>
          <QueueHealthBar stats={stats} />
        </div>
      )}

      {data && data.activeOperators.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-800 mb-4">Operator Workload</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {data.activeOperators.map((op) => (
              <div key={op.userId} className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${op.isOnline ? "bg-emerald-500" : "bg-zinc-300"}`} />
                  <span className="text-sm font-medium text-zinc-800 truncate">{op.name}</span>
                </div>
                <div className="text-xs text-zinc-500">
                  <span className="font-semibold text-zinc-700">{op.openChats}</span> open chats
                </div>
                {op.avgResponseMins != null && (
                  <div className="text-xs text-zinc-400 mt-0.5">{op.avgResponseMins}m avg response</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {data && data.recentEscalations.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-800 mb-4">Recent Escalations</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left py-2 px-3 font-medium text-zinc-500">Type</th>
                  <th className="text-left py-2 px-3 font-medium text-zinc-500">Conversation</th>
                  <th className="text-right py-2 px-3 font-medium text-zinc-500">Time</th>
                </tr>
              </thead>
              <tbody>
                {data.recentEscalations.slice(0, 20).map((ev) => (
                  <tr key={ev.id} className="border-b border-zinc-50 hover:bg-zinc-50/50">
                    <td className="py-2 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        ev.type === "TIMEOUT_WARNING" ? "bg-amber-50 text-amber-700" :
                        ev.type === "AUTO_REASSIGN" ? "bg-red-50 text-red-700" :
                        "bg-blue-50 text-blue-700"
                      }`}>
                        {ev.type === "TIMEOUT_WARNING" ? "SLA Warning" :
                         ev.type === "AUTO_REASSIGN" ? "Auto-Reassigned" :
                         ev.type === "MANAGER_NOTIFIED" ? "Manager Notified" : ev.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-zinc-600">
                      {ev.conversation?.channelType ?? ""} · {ev.conversationId.slice(0, 8)}
                    </td>
                    <td className="text-right py-2 px-3 text-zinc-400">{timeAgo(ev.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function QueueHealthBar({ stats }: { stats: QueueStats }) {
  const { totalOpen, unassigned, pastSLA, avgWaitMins } = stats;
  const assigned = totalOpen - unassigned;
  const healthy = assigned - pastSLA;
  const total = totalOpen || 1;

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
        <span>{totalOpen} total open conversations</span>
        <span>Avg wait: {formatMinutes(avgWaitMins)}</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-zinc-100">
        {healthy > 0 && (
          <div className="bg-emerald-500 transition-all" style={{ width: `${(healthy / total) * 100}%` }} />
        )}
        {pastSLA > 0 && (
          <div className="bg-red-500 animate-pulse transition-all" style={{ width: `${(pastSLA / total) * 100}%` }} />
        )}
        {unassigned > 0 && (
          <div className="bg-amber-400 transition-all" style={{ width: `${(unassigned / total) * 100}%` }} />
        )}
      </div>
      <div className="flex gap-4 mt-2 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          Healthy ({healthy})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          Past SLA ({pastSLA})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          Unassigned ({unassigned})
        </span>
      </div>
    </div>
  );
}
