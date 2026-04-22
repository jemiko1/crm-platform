"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { ClickToCall } from "@/components/click-to-call";
import { fetchCalls } from "../api";
import { RecordingCell } from "../recording-cell";
import type { CallSession, CallsPaginated } from "../types";

const BRAND = "rgb(8,117,56)";

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

const DISPOSITION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  ANSWERED: { bg: "bg-teal-50", text: "text-teal-700", label: "Answered" },
  NOANSWER: { bg: "bg-rose-50", text: "text-rose-700", label: "No Answer" },
  MISSED: { bg: "bg-orange-50", text: "text-orange-700", label: "Missed" },
  ABANDONED: { bg: "bg-red-50", text: "text-red-700", label: "Abandoned" },
  BUSY: { bg: "bg-amber-50", text: "text-amber-700", label: "Busy" },
  FAILED: { bg: "bg-zinc-100", text: "text-zinc-600", label: "Failed" },
};

function DispositionBadge({ disposition }: { disposition: string | null }) {
  const d = disposition ?? "UNKNOWN";
  const c = DISPOSITION_COLORS[d] ?? { bg: "bg-zinc-100", text: "text-zinc-600", label: d };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: string }) {
  const isInbound = direction === "IN";
  const label = isInbound ? "Inbound" : "Outbound";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${isInbound ? "text-blue-600" : "text-zinc-500"}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {isInbound ? <path d="M16 3l-4 4-4-4M12 7v14" /> : <path d="M8 21l4-4 4 4M12 17V3" />}
      </svg>
      {label}
    </span>
  );
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function CallLogsPage() {
  const { t } = useI18n();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [search, setSearch] = useState("");
  const [disposition, setDisposition] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [calls, setCalls] = useState<CallSession[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  // Surface fetch errors instead of silently blanking the table. A
  // field report (April 2026) had an operator staring at an empty
  // table for hours because a stale HTTP 304 returned a zero-byte
  // body AND the old catch block swallowed every error. Visible
  // error state makes the failure mode diagnosable from the UI.
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCalls({
        from: new Date(from).toISOString(),
        to: new Date(to + "T23:59:59").toISOString(),
        page,
        pageSize,
        search: search || undefined,
        disposition: disposition || undefined,
      });
      setCalls(res?.data ?? []);
      setMeta(res?.meta ?? { page: 1, pageSize: 25, total: 0, totalPages: 1 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Could not load calls");
      setCalls([]);
      setMeta({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
    } finally {
      setLoading(false);
    }
  }, [from, to, search, disposition, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-5">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">{t("callCenter.logs.from", "From")}</label>
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">{t("callCenter.logs.to", "To")}</label>
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs text-zinc-500">{t("callCenter.logs.search", "Search")}</label>
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("callCenter.logs.searchPlaceholder", "Phone number, agent name...")}
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">{t("callCenter.logs.disposition", "Status")}</label>
          <select value={disposition} onChange={(e) => { setDisposition(e.target.value); setPage(1); }}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50">
            <option value="">{t("callCenter.logs.allStatuses", "All")}</option>
            <option value="ANSWERED">{t("callCenter.disposition.answered", "Answered")}</option>
            <option value="NOANSWER">{t("callCenter.disposition.noAnswer", "No Answer")}</option>
            <option value="MISSED">{t("callCenter.disposition.missed", "Missed")}</option>
            <option value="ABANDONED">{t("callCenter.disposition.abandoned", "Abandoned")}</option>
            <option value="BUSY">{t("callCenter.disposition.busy", "Busy")}</option>
            <option value="FAILED">{t("callCenter.disposition.failed", "Failed")}</option>
          </select>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <div className="font-medium">
            {t("callCenter.logs.errorTitle", "Could not load calls")}
          </div>
          <div className="mt-0.5 text-xs text-rose-700">{error}</div>
          <div className="mt-1.5 text-xs text-rose-700">
            {t(
              "callCenter.logs.errorHint",
              "Try a hard refresh (Ctrl+Shift+R). If it persists, check that you have permission to view call logs.",
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1300px] border-separate border-spacing-0">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs text-zinc-600">
                <th className="px-4 py-3 font-medium">{t("callCenter.logs.col.time", "Time")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.logs.col.direction", "Dir")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.logs.col.caller", "Caller")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.logs.col.callee", "Destination")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.logs.col.queue", "Queue")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.logs.col.agent", "Agent")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.logs.col.status", "Status")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("callCenter.logs.col.wait", "Wait")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("callCenter.logs.col.talk", "Talk")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("callCenter.logs.col.total", "Total")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.logs.col.recording", "Recording")}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-emerald-600" />
                  </td>
                </tr>
              ) : calls.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-sm text-zinc-400">
                    {t("callCenter.logs.empty", "No calls found for the selected period.")}
                  </td>
                </tr>
              ) : (
                calls.map((c, i) => (
                  <tr
                    key={c.id}
                    className={[
                      "group transition-all duration-200 ease-out",
                      "hover:bg-teal-50/60 hover:shadow-sm",
                      i < calls.length - 1 ? "border-b border-zinc-100" : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3 text-sm text-zinc-700 whitespace-nowrap">{fmtDate(c.startAt)}</td>
                    <td className="px-4 py-3"><DirectionBadge direction={c.direction} /></td>
                    <td className="px-4 py-3 text-sm font-mono text-zinc-900">
                      {c.callerNumber ? (
                        <ClickToCall
                          number={c.callerNumber}
                          className="inline-flex items-center gap-1 font-mono text-zinc-900 hover:text-emerald-700 disabled:opacity-50"
                        >
                          {c.callerNumber}
                        </ClickToCall>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-zinc-600">
                      {c.calleeNumber ? (
                        <ClickToCall
                          number={c.calleeNumber}
                          className="inline-flex items-center gap-1 font-mono text-zinc-600 hover:text-emerald-700 disabled:opacity-50"
                        >
                          {c.calleeNumber}
                        </ClickToCall>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{c.queueName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{c.agentName || c.agentExtension || "—"}</td>
                    <td className="px-4 py-3"><DispositionBadge disposition={c.disposition} /></td>
                    <td className="px-4 py-3 text-sm text-zinc-500 text-right tabular-nums">{fmtDuration(c.waitTimeSec)}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700 text-right tabular-nums">{fmtDuration(c.talkTimeSec)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-zinc-900 text-right tabular-nums">{fmtDuration(c.durationSec)}</td>
                    <td className="px-4 py-3">
                      <RecordingCell
                        recordingId={c.recordingId ?? null}
                        initiallyAvailable={c.recordingAvailable ?? false}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
            <span className="text-xs text-zinc-500">
              {t("common.page", "Page")} <span className="font-semibold">{meta.page}</span> {t("common.of", "of")} <span className="font-semibold">{meta.totalPages}</span>
              {" · "}{meta.total} {t("callCenter.logs.totalCalls", "calls")}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40 transition"
              >
                {t("common.prev", "Prev")}
              </button>
              <button
                disabled={meta.page >= meta.totalPages}
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                className="rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40 transition"
              >
                {t("common.next", "Next")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
