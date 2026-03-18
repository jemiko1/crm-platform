"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet } from "@/lib/api";
import { useClientChatSocket } from "../hooks/useClientChatSocket";

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

const STORAGE_KEY = "clientchat_dashboard_collapsed";

export default function ManagerDashboard() {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const [data, setData] = useState<LiveStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const { on, off } = useClientChatSocket();
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const toggleCollapse = () => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const fetchLiveStatus = useCallback(async () => {
    if (collapsed) return;
    setLoading((prev) => !data ? true : prev);
    try {
      const res = await apiGet<LiveStatus>("/v1/clientchats/queue/live-status");
      if (mountedRef.current) setData(res);
    } catch {
      // silent
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [collapsed, data]);

  useEffect(() => {
    if (collapsed) return;
    fetchLiveStatus();
    const interval = setInterval(fetchLiveStatus, 30000);
    return () => clearInterval(interval);
  }, [collapsed, fetchLiveStatus]);

  useEffect(() => {
    const handleEscalation = () => {
      fetchLiveStatus();
    };
    on("escalation:warning", handleEscalation);
    on("escalation:reassign", handleEscalation);
    return () => {
      off("escalation:warning", handleEscalation);
      off("escalation:reassign", handleEscalation);
    };
  }, [on, off, fetchLiveStatus]);

  const stats = data?.queueStats;
  const total = stats?.totalOpen ?? 0;

  return (
    <div className="border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <button
        onClick={toggleCollapse}
        className="w-full flex items-center justify-between px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
          </svg>
          <span>Live Dashboard</span>
          {!collapsed && stats && (
            <span className="flex items-center gap-1.5 text-xs text-gray-500 ml-2">
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{total} open</span>
              {stats.unassigned > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{stats.unassigned} unassigned</span>
              )}
              {stats.pastSLA > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 animate-pulse">{stats.pastSLA} past SLA</span>
              )}
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`transition-transform ${collapsed ? "" : "rotate-180"}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-4">
          {loading && !data ? (
            <div className="text-center text-sm text-gray-400 py-4">Loading...</div>
          ) : data ? (
            <>
              <QueueHealthBar stats={data.queueStats} />
              <OperatorCards operators={data.activeOperators} />
              <AlertFeed events={data.recentEscalations} />
            </>
          ) : null}
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
      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
        <span>Queue Health</span>
        <span>Avg wait: {avgWaitMins}m</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
        {healthy > 0 && (
          <div
            className="bg-emerald-500 transition-all"
            style={{ width: `${(healthy / total) * 100}%` }}
          />
        )}
        {pastSLA > 0 && (
          <div
            className="bg-red-500 animate-pulse transition-all"
            style={{ width: `${(pastSLA / total) * 100}%` }}
          />
        )}
        {unassigned > 0 && (
          <div
            className="bg-amber-400 transition-all"
            style={{ width: `${(unassigned / total) * 100}%` }}
          />
        )}
      </div>
      <div className="flex gap-3 mt-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Healthy ({healthy})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          Past SLA ({pastSLA})
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          Unassigned ({unassigned})
        </span>
      </div>
    </div>
  );
}

function OperatorCards({ operators }: { operators: OperatorStatus[] }) {
  if (operators.length === 0) {
    return <p className="text-xs text-gray-400">No active operators today</p>;
  }

  return (
    <div>
      <h4 className="text-xs font-medium text-gray-600 mb-2">Active Operators</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
        {operators.map((op) => (
          <div
            key={op.userId}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-100 bg-white text-xs"
          >
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${op.isOnline ? "bg-emerald-500" : "bg-gray-300"}`}
              title={op.isOnline ? "Online" : "Offline"}
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-700 truncate">{op.name}</p>
              <p className="text-gray-400">
                {op.openChats} chats
                {op.avgResponseMins != null && ` · ${op.avgResponseMins}m avg`}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AlertFeed({ events }: { events: EscalationEvent[] }) {
  if (events.length === 0) return null;

  const typeLabel: Record<string, string> = {
    TIMEOUT_WARNING: "SLA Warning",
    AUTO_REASSIGN: "Auto-Reassigned",
    MANAGER_NOTIFIED: "Manager Notified",
  };

  const typeColor: Record<string, string> = {
    TIMEOUT_WARNING: "text-amber-600 bg-amber-50",
    AUTO_REASSIGN: "text-red-600 bg-red-50",
    MANAGER_NOTIFIED: "text-blue-600 bg-blue-50",
  };

  return (
    <div>
      <h4 className="text-xs font-medium text-gray-600 mb-2">Recent Escalations</h4>
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {events.slice(0, 10).map((ev) => {
          const ago = timeAgo(ev.createdAt);
          return (
            <div
              key={ev.id}
              className="flex items-center gap-2 px-2 py-1 rounded text-xs"
            >
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${typeColor[ev.type] ?? "text-gray-600 bg-gray-50"}`}
              >
                {typeLabel[ev.type] ?? ev.type}
              </span>
              <span className="text-gray-500 truncate">
                {ev.conversation?.channelType ?? ""} · {ev.conversationId.slice(0, 8)}
              </span>
              <span className="text-gray-400 ml-auto flex-shrink-0">{ago}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
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
