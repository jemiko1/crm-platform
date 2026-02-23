"use client";

import React, { useCallback, useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import type { TimelineEntry, TimelineResponse } from "./types";

const PAGE_SIZE = 20;

const TYPE_CONFIG: Record<
  string,
  { icon: React.ReactNode; color: string; bg: string; ring: string }
> = {
  call: {
    icon: <IconPhone />,
    color: "text-blue-700",
    bg: "bg-blue-50",
    ring: "ring-blue-200",
  },
  chat: {
    icon: <IconChat />,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    ring: "ring-emerald-200",
  },
  incident: {
    icon: <IconAlert />,
    color: "text-amber-700",
    bg: "bg-amber-50",
    ring: "ring-amber-200",
  },
};

type Props = { clientCoreId: number };

export default function ActivityTimeline({ clientCoreId }: Props) {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `${API_BASE}/v1/client-intelligence/${clientCoreId}/timeline?limit=200`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data: TimelineResponse = await res.json();
      setEntries(data.entries);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [clientCoreId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered =
    filter === "all" ? entries : entries.filter((e) => e.type === filter);
  const displayed = filtered.slice(0, PAGE_SIZE);
  const hasMore = filtered.length > PAGE_SIZE;

  if (loading) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-lg font-semibold text-zinc-900">
          Activity Timeline
        </h2>
        <div className="mt-4 animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-zinc-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-lg font-semibold text-zinc-900">
          Activity Timeline
        </h2>
        <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
          <div className="text-sm text-red-700">{error}</div>
          <button
            type="button"
            onClick={load}
            className="mt-2 text-sm font-semibold text-red-700 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            Activity Timeline
          </h2>
          <p className="mt-0.5 text-sm text-zinc-600">
            {total} total activities
          </p>
        </div>

        <div className="flex gap-1">
          {["all", "call", "chat", "incident"].map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                filter === f
                  ? "bg-zinc-900 text-white"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}s
            </button>
          ))}
        </div>
      </div>

      {displayed.length === 0 ? (
        <div className="mt-6 rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">
            No activities found for this client.
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {displayed.map((entry) => {
            const cfg = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.incident;
            return (
              <div
                key={`${entry.type}-${entry.id}`}
                className={`flex items-start gap-3 rounded-2xl p-3 ring-1 ${cfg.bg} ${cfg.ring}`}
              >
                <div
                  className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white ring-1 ${cfg.ring}`}
                >
                  <span className={cfg.color}>{cfg.icon}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-semibold uppercase ${cfg.color}`}
                    >
                      {entry.type}
                    </span>
                    <span className="text-xs text-zinc-500">
                      {formatRelative(entry.timestamp)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-zinc-800">
                    {entry.summary}
                  </div>
                </div>
              </div>
            );
          })}
          {hasMore && (
            <div className="pt-2 text-center text-xs text-zinc-500">
              Showing {PAGE_SIZE} of {filtered.length} — scroll or adjust
              filters
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function IconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 9v4M12 17h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
