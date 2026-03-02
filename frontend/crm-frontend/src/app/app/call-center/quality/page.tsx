"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import { format } from "date-fns";

const TABS = [
  { href: "/app/call-center", label: "Dashboard" },
  { href: "/app/call-center/calls", label: "Calls" },
  { href: "/app/call-center/live", label: "Live" },
  { href: "/app/call-center/quality", label: "Quality" },
  { href: "/app/call-center/agents", label: "Agents" },
];

type QualityReview = {
  id: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "FAILED";
  score: number | null;
  summary: string | null;
  tags: string[];
  createdAt: string;
  callSession: {
    callerNumber: string;
    startAt: string;
    disposition: string;
    assignedExtension: string;
  };
};

type QualityReviewsResponse = {
  data: QualityReview[];
  total: number;
  page: number;
  pageSize: number;
};

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "DONE", label: "Done" },
  { value: "FAILED", label: "Failed" },
];

const STATUS_BADGE_STYLES: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  PROCESSING: "bg-blue-100 text-blue-800",
  DONE: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
};

function getScoreColor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return "text-zinc-400";
  if (score >= 80) return "text-green-600 font-semibold";
  if (score >= 60) return "text-yellow-600 font-semibold";
  return "text-red-600 font-semibold";
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return format(d, "dd.MM.yyyy HH:mm");
  } catch {
    return "—";
  }
}

function truncate(str: string | null | undefined, maxLen: number): string {
  if (!str) return "—";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "…";
}

export default function QualityPage() {
  const pathname = usePathname();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [data, setData] = useState<QualityReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (status) params.set("status", status);

      const res = await apiGet<QualityReviewsResponse>(
        `/v1/telephony/quality/reviews?${params.toString()}`
      );
      setData(res);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load quality reviews");
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  useEffect(() => {
    setPage(1);
  }, [status]);

  const reviews = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Quality Reviews</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Call quality scores and AI-generated summaries
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
          <label htmlFor="status" className="text-sm text-zinc-500">
            Status
          </label>
          <select
            id="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-[rgb(8,117,56)] focus:outline-none focus:ring-1 focus:ring-[rgb(8,117,56)]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
        ) : reviews.length === 0 ? (
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
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm text-zinc-500">No quality reviews found</p>
            <p className="text-xs text-zinc-400">
              Try adjusting your status filter
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-500 text-xs uppercase">
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    <th className="px-4 py-3 text-left font-medium">Caller</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Agent Ext
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Score</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Summary</th>
                    <th className="px-4 py-3 text-left font-medium">Tags</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-zinc-100 hover:bg-zinc-50"
                    >
                      <td className="px-4 py-3 text-zinc-900">
                        {formatDateTime(r.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-zinc-900 font-mono text-xs">
                        {r.callSession?.callerNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-600">
                        {r.callSession?.assignedExtension ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={getScoreColor(r.score)}>
                          {r.score != null ? r.score : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            STATUS_BADGE_STYLES[r.status] ??
                            "bg-zinc-100 text-zinc-700"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 max-w-[200px]">
                        <span title={r.summary ?? undefined}>
                          {truncate(r.summary, 60)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(r.tags ?? []).slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="inline-block rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600"
                            >
                              {tag}
                            </span>
                          ))}
                          {(r.tags?.length ?? 0) > 3 && (
                            <span className="text-xs text-zinc-400">
                              +{r.tags!.length - 3}
                            </span>
                          )}
                          {(!r.tags || r.tags.length === 0) && "—"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
              <div className="text-sm text-zinc-500">
                Page {page} of {totalPages} ({total} total)
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
