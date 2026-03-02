"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import { format, subDays } from "date-fns";

const BRAND_GREEN = "rgb(8,117,56)";

const TABS = [
  { href: "/app/call-center", label: "Dashboard" },
  { href: "/app/call-center/calls", label: "Calls" },
  { href: "/app/call-center/live", label: "Live" },
  { href: "/app/call-center/quality", label: "Quality" },
  { href: "/app/call-center/agents", label: "Agents" },
];

type CallRecord = {
  id: string;
  linkedId: string;
  direction: "IN" | "OUT";
  callerNumber: string;
  calleeNumber: string;
  startAt: string;
  answerAt: string | null;
  endAt: string | null;
  disposition: string;
  assignedExtension: string | null;
  queue: { name: string } | null;
  callMetrics?: {
    waitSeconds?: number;
    talkSeconds?: number;
    holdSeconds?: number;
  } | null;
};

type CallsResponse = {
  data: CallRecord[];
  total: number;
  page: number;
  pageSize: number;
};

const DISPOSITIONS = [
  { value: "", label: "All" },
  { value: "ANSWERED", label: "Answered" },
  { value: "MISSED", label: "Missed" },
  { value: "ABANDONED", label: "Abandoned" },
  { value: "NOANSWER", label: "No Answer" },
  { value: "BUSY", label: "Busy" },
  { value: "FAILED", label: "Failed" },
];

const DISPOSITION_BADGE_STYLES: Record<string, string> = {
  ANSWERED: "bg-green-100 text-green-800",
  MISSED: "bg-yellow-100 text-yellow-800",
  ABANDONED: "bg-red-100 text-red-800",
  NOANSWER: "bg-orange-100 text-orange-800",
  BUSY: "bg-purple-100 text-purple-800",
  FAILED: "bg-gray-100 text-gray-800",
};

function formatDuration(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return format(d, "dd.MM HH:mm");
  } catch {
    return "—";
  }
}

export default function CallsPage() {
  const pathname = usePathname();
  const today = new Date();
  const defaultTo = format(today, "yyyy-MM-dd");
  const defaultFrom = format(subDays(today, 7), "yyyy-MM-dd");

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [disposition, setDisposition] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [data, setData] = useState<CallsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("from", from);
      params.set("to", to);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (disposition) params.set("disposition", disposition);
      if (search.trim()) params.set("search", search.trim());

      const res = await apiGet<CallsResponse>(
        `/v1/telephony/calls?${params.toString()}`
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load calls");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to, disposition, search, page]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  useEffect(() => {
    setPage(1);
  }, [from, to, disposition, search]);

  const calls = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Calls</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Call history and telephony records
        </p>
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

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4">
        <div className="flex items-center gap-2">
          <label htmlFor="from" className="text-sm text-zinc-500">
            From
          </label>
          <input
            id="from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="to" className="text-sm text-zinc-500">
            To
          </label>
          <input
            id="to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
          />
        </div>
        <select
          value={disposition}
          onChange={(e) => setDisposition(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
        >
          {DISPOSITIONS.map((d) => (
            <option key={d.value || "all"} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <label htmlFor="search" className="text-sm text-zinc-500">
            Search
          </label>
          <input
            id="search"
            type="text"
            placeholder="Phone number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
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
            <div
              className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300"
              style={{ borderTopColor: BRAND_GREEN }}
            />
          </div>
        ) : calls.length === 0 ? (
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
                d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
              />
            </svg>
            <p className="text-sm text-zinc-500">No calls found</p>
            <p className="text-xs text-zinc-400">
              Try adjusting your date range or filters
            </p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-zinc-50 text-zinc-500 text-xs uppercase">
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">Direction</th>
                  <th className="px-4 py-3 text-left font-medium">Caller</th>
                  <th className="px-4 py-3 text-left font-medium">Queue</th>
                  <th className="px-4 py-3 text-left font-medium">Agent Ext</th>
                  <th className="px-4 py-3 text-left font-medium">Duration</th>
                  <th className="px-4 py-3 text-left font-medium">Wait</th>
                  <th className="px-4 py-3 text-left font-medium">
                    Disposition
                  </th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => {
                  const talkSec =
                    call.callMetrics?.talkSeconds ??
                    (call.answerAt && call.endAt
                      ? Math.round(
                          (new Date(call.endAt).getTime() -
                            new Date(call.answerAt).getTime()) /
                            1000
                        )
                      : null);
                  const waitSec = call.callMetrics?.waitSeconds ?? null;
                  return (
                    <tr
                      key={call.id}
                      className="border-b border-zinc-100 hover:bg-zinc-50"
                    >
                      <td className="px-4 py-3 text-zinc-900">
                        {formatDateTime(call.startAt)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          {call.direction === "IN" ? (
                            <svg
                              className="h-4 w-4 text-blue-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 14l-7 7m0 0l-7-7m7 7V3"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-4 w-4 text-emerald-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 10l7-7m0 0l7 7m-7-7v18"
                              />
                            </svg>
                          )}
                          <span className="font-medium">{call.direction}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-900">
                        {call.direction === "IN"
                          ? call.callerNumber
                          : call.calleeNumber}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {call.queue?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {call.assignedExtension ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {formatDuration(talkSec)}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {formatDuration(waitSec)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            DISPOSITION_BADGE_STYLES[call.disposition] ??
                            "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {call.disposition}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
              <div className="text-sm text-zinc-500">
                Page {page} of {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
