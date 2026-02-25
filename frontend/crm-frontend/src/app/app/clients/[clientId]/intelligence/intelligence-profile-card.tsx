"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import type { ClientLabel, IntelligenceInsight, IntelligenceProfile } from "./types";

const LABEL_CONFIG: Record<
  ClientLabel,
  { text: string; color: string; bg: string }
> = {
  high_contact: { text: "High Contact", color: "text-blue-700", bg: "bg-blue-50 ring-blue-200" },
  low_contact: { text: "Low Contact", color: "text-zinc-600", bg: "bg-zinc-50 ring-zinc-200" },
  frequent_caller: { text: "Frequent Caller", color: "text-indigo-700", bg: "bg-indigo-50 ring-indigo-200" },
  chat_preferred: { text: "Chat Preferred", color: "text-emerald-700", bg: "bg-emerald-50 ring-emerald-200" },
  incident_prone: { text: "Incident Prone", color: "text-amber-700", bg: "bg-amber-50 ring-amber-200" },
  high_priority_issues: { text: "High Priority Issues", color: "text-rose-700", bg: "bg-rose-50 ring-rose-200" },
  long_calls: { text: "Long Calls", color: "text-purple-700", bg: "bg-purple-50 ring-purple-200" },
  vip_potential: { text: "VIP Potential", color: "text-amber-700", bg: "bg-yellow-50 ring-yellow-300" },
  at_risk: { text: "At Risk", color: "text-red-700", bg: "bg-red-50 ring-red-200" },
  stable: { text: "Stable", color: "text-emerald-700", bg: "bg-emerald-50 ring-emerald-200" },
};

const SEVERITY_STYLE: Record<string, { dot: string; bg: string; ring: string }> = {
  info: { dot: "bg-blue-500", bg: "bg-blue-50", ring: "ring-blue-200" },
  warning: { dot: "bg-amber-500", bg: "bg-amber-50", ring: "ring-amber-200" },
  critical: { dot: "bg-red-500", bg: "bg-red-50", ring: "ring-red-200" },
};

type Props = { clientCoreId: number };

export default function IntelligenceProfileCard({ clientCoreId }: Props) {
  const [profile, setProfile] = useState<IntelligenceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${API_BASE}/v1/client-intelligence/${clientCoreId}/profile`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      setProfile(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [clientCoreId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-lg font-semibold text-zinc-900">Client Intelligence</h2>
        <div className="mt-4 animate-pulse space-y-3">
          <div className="h-6 w-48 rounded bg-zinc-100" />
          <div className="h-20 rounded-2xl bg-zinc-100" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-zinc-100" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-lg font-semibold text-zinc-900">Client Intelligence</h2>
        <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
          <div className="text-sm text-red-700">{error}</div>
          <button type="button" onClick={load} className="mt-2 text-sm font-semibold text-red-700 underline">Retry</button>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const { metrics, labels, summary, insights } = profile;

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-zinc-900">Client Intelligence</h2>
        <span className="rounded-full bg-zinc-50 px-3 py-1 text-xs text-zinc-500 ring-1 ring-zinc-200">
          {profile.provider}
        </span>
      </div>

      {/* Labels */}
      {labels.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {labels.map((l) => {
            const cfg = LABEL_CONFIG[l];
            return (
              <span key={l} className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${cfg.bg} ${cfg.color}`}>
                {cfg.text}
              </span>
            );
          })}
        </div>
      )}

      {/* Summary */}
      <div className="mt-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <div className="text-sm text-zinc-800 leading-relaxed">{summary}</div>
      </div>

      {/* Metric Cards */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Calls"
          value={metrics.calls.total}
          detail={`${metrics.calls.answered} answered · ${metrics.calls.missed} missed`}
          accent="text-blue-700"
        />
        <MetricCard
          label="Avg Call Duration"
          value={formatDuration(metrics.calls.avgDurationSeconds)}
          detail={`Total: ${formatDuration(metrics.calls.totalDurationSeconds)}`}
          accent="text-blue-700"
        />
        <MetricCard
          label="Chats"
          value={metrics.chats.total}
          detail={`${metrics.chats.open} open · ${metrics.chats.totalMessages} messages`}
          accent="text-emerald-700"
        />
        <MetricCard
          label="Incidents"
          value={metrics.incidents.total}
          detail={`${metrics.incidents.open} open · ${metrics.incidents.critical} critical`}
          accent="text-amber-700"
        />
        <MetricCard
          label="Contact Frequency"
          value={`${metrics.contactFrequency.avgContactsPerMonth}/mo`}
          detail={`${metrics.contactFrequency.totalContacts} total contacts`}
          accent="text-zinc-700"
        />
        <MetricCard
          label="Days Since Contact"
          value={metrics.contactFrequency.daysSinceLastContact ?? "N/A"}
          detail={`Over last ${metrics.periodDays} days`}
          accent="text-zinc-700"
        />
        {metrics.incidents.highPriority > 0 && (
          <MetricCard
            label="High Priority"
            value={metrics.incidents.highPriority}
            detail="High/Critical incidents"
            accent="text-rose-700"
          />
        )}
        {Object.keys(metrics.chats.channels).length > 0 && (
          <MetricCard
            label="Chat Channels"
            value={Object.keys(metrics.chats.channels).length}
            detail={Object.entries(metrics.chats.channels).map(([k, v]) => `${k}: ${v}`).join(", ")}
            accent="text-emerald-700"
          />
        )}
      </div>

      {/* Insights */}
      {insights.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-zinc-900">Insights</h3>
          <div className="mt-2 space-y-2">
            {insights.map((insight) => (
              <InsightRow key={insight.key} insight={insight} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, detail, accent }: { label: string; value: string | number; detail: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${accent}`}>{value}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{detail}</div>
    </div>
  );
}

function InsightRow({ insight }: { insight: IntelligenceInsight }) {
  const s = SEVERITY_STYLE[insight.severity] ?? SEVERITY_STYLE.info;
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-3 ring-1 ${s.bg} ${s.ring}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
      <div>
        <div className="text-sm font-semibold text-zinc-900">{insight.title}</div>
        <div className="mt-0.5 text-sm text-zinc-700">{insight.description}</div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}
