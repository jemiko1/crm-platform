"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { apiGet, apiPatch } from "@/lib/api";

interface MissedCallItem {
  id: string;
  callSessionId: string | null;
  callerNumber: string;
  clientName: string | null;
  clientId: string | null;
  queueId: string | null;
  queueName: string | null;
  reason: "OUT_OF_HOURS" | "ABANDONED" | "NO_ANSWER";
  status: string;
  detectedAt: string;
  direction: string | null;
  disposition: string | null;
  claimedByUserId: string | null;
  claimedByName: string | null;
  claimedAt: string | null;
  attemptsCount: number;
  lastAttemptAt: string | null;
  resolvedAt: string | null;
  notes: string | null;
  missedCallCount: number;
}

interface MissedCallsPaginated {
  data: MissedCallItem[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_FILTERS = [
  { value: "", label: "Active", labelKey: "missedCalls.filter.active" },
  { value: "NEW", label: "New", labelKey: "missedCalls.filter.new" },
  { value: "CLAIMED", label: "Claimed", labelKey: "missedCalls.filter.claimed" },
  { value: "ATTEMPTED", label: "Attempted", labelKey: "missedCalls.filter.attempted" },
  { value: "HANDLED", label: "Resolved", labelKey: "missedCalls.filter.resolved" },
  { value: "IGNORED", label: "Ignored", labelKey: "missedCalls.filter.ignored" },
  { value: "EXPIRED", label: "Expired", labelKey: "missedCalls.filter.expired" },
];

const REASON_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  ABANDONED: { bg: "bg-red-50", text: "text-red-700", label: "Abandoned" },
  NO_ANSWER: { bg: "bg-orange-50", text: "text-orange-700", label: "No Answer" },
  OUT_OF_HOURS: { bg: "bg-purple-50", text: "text-purple-700", label: "After Hours" },
};

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  NEW: { bg: "bg-blue-50", text: "text-blue-700", label: "New" },
  CLAIMED: { bg: "bg-indigo-50", text: "text-indigo-700", label: "Claimed" },
  ATTEMPTED: { bg: "bg-amber-50", text: "text-amber-700", label: "Attempted" },
  HANDLED: { bg: "bg-teal-50", text: "text-teal-700", label: "Resolved" },
  IGNORED: { bg: "bg-zinc-100", text: "text-zinc-500", label: "Ignored" },
  EXPIRED: { bg: "bg-zinc-100", text: "text-zinc-400", label: "Expired" },
};

function Badge({ map, value }: { map: Record<string, { bg: string; text: string; label: string }>; value: string }) {
  const c = map[value] ?? { bg: "bg-zinc-100", text: "text-zinc-500", label: value };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MissedCallsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const [myClaimsOnly, setMyClaimsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MissedCallItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ id: string; action: "attempt" | "resolve" | "ignore" } | null>(null);
  const [noteText, setNoteText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (myClaimsOnly) params.set("myClaimsOnly", "true");
      params.set("page", String(page));
      params.set("pageSize", "25");

      const res = await apiGet<MissedCallsPaginated>(
        `/v1/telephony/missed-calls?${params.toString()}`
      );
      setItems(res?.data ?? []);
      setMeta(res?.meta ?? { page: 1, pageSize: 25, total: 0, totalPages: 1 });
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [status, myClaimsOnly, page]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleAction(id: string, action: string, body?: Record<string, string>) {
    setActionLoading(id);
    try {
      await apiPatch(`/v1/telephony/missed-calls/${id}/${action}`, body ?? {});
      await load();
    } catch {
      // silently handle — reload will show current state
    } finally {
      setActionLoading(null);
    }
  }

  function submitNoteAction() {
    if (!noteModal) return;
    const body: Record<string, string> = {};
    if (noteModal.action === "ignore") {
      body.reason = noteText || "No reason provided";
    } else {
      body.note = noteText;
    }
    handleAction(noteModal.id, noteModal.action, body);
    setNoteModal(null);
    setNoteText("");
  }

  const activeCount = items.filter(
    (i) => i.status === "NEW" || i.status === "CLAIMED" || i.status === "ATTEMPTED"
  ).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Header stats */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow-sm ring-1 ring-zinc-200">
            <span className="text-2xl font-bold text-zinc-900">{meta.total}</span>
            <span className="text-sm text-zinc-500">{t("missedCalls.total", "total")}</span>
          </div>
          {status === "" && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2 ring-1 ring-red-100">
              <span className="text-2xl font-bold text-red-700">{activeCount}</span>
              <span className="text-sm text-red-600">{t("missedCalls.needAction", "need action")}</span>
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={myClaimsOnly}
            onChange={(e) => { setMyClaimsOnly(e.target.checked); setPage(1); }}
            className="rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
          />
          {t("missedCalls.myClaimsOnly", "My claims only")}
        </label>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setStatus(f.value); setPage(1); }}
            className={[
              "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
              status === f.value
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50",
            ].join(" ")}
          >
            {t(f.labelKey, f.label)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-separate border-spacing-0">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs text-zinc-600">
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.time", "Time")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.caller", "Caller")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.client", "Client")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.queue", "Queue")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.reason", "Reason")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.status", "Status")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.attempts", "Attempts")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.claimedBy", "Claimed by")}</th>
                <th className="px-4 py-3 font-medium text-right">{t("missedCalls.col.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-emerald-600" />
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <svg className="h-12 w-12 text-zinc-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-zinc-400">
                        {t("missedCalls.empty", "No missed calls to show")}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((m, i) => {
                  const isActionable = ["NEW", "CLAIMED", "ATTEMPTED"].includes(m.status);
                  const isProcessing = actionLoading === m.id;

                  return (
                    <tr
                      key={m.id}
                      className={[
                        "group transition-all duration-150",
                        isActionable ? "hover:bg-teal-50/40" : "hover:bg-zinc-50/60 opacity-70",
                        i < items.length - 1 ? "border-b border-zinc-100" : "",
                      ].join(" ")}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="text-sm text-zinc-700">{fmtDate(m.detectedAt)}</div>
                        <div className="text-xs text-zinc-400">{timeAgo(m.detectedAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-mono text-zinc-900">{m.callerNumber || "—"}</div>
                        {m.missedCallCount > 1 && (
                          <span className="mt-0.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            {m.missedCallCount}x
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-700">
                        {m.clientName || <span className="text-zinc-400">Unknown</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">{m.queueName || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge map={REASON_BADGES} value={m.reason} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge map={STATUS_BADGES} value={m.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-zinc-700">{m.attemptsCount}/3</div>
                        {m.lastAttemptAt && (
                          <div className="text-xs text-zinc-400">
                            {t("missedCalls.lastAttempt", "Last")}: {timeAgo(m.lastAttemptAt)}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {m.claimedByName || "—"}
                        {m.claimedAt && (
                          <div className="text-xs text-zinc-400">{timeAgo(m.claimedAt)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isActionable && !isProcessing && (
                          <div className="flex items-center justify-end gap-1.5">
                            {m.status === "NEW" && (
                              <button
                                onClick={() => handleAction(m.id, "claim")}
                                className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition"
                                title={t("missedCalls.action.claim", "Claim")}
                              >
                                {t("missedCalls.action.claim", "Claim")}
                              </button>
                            )}
                            {(m.status === "CLAIMED" || m.status === "ATTEMPTED") && m.attemptsCount < 3 && (
                              <button
                                onClick={() => { setNoteModal({ id: m.id, action: "attempt" }); setNoteText(""); }}
                                className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition"
                                title={t("missedCalls.action.attempt", "Log attempt")}
                              >
                                {t("missedCalls.action.attempt", "Attempt")}
                              </button>
                            )}
                            <button
                              onClick={() => { setNoteModal({ id: m.id, action: "resolve" }); setNoteText(""); }}
                              className="rounded-lg bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100 transition"
                              title={t("missedCalls.action.resolve", "Resolve")}
                            >
                              {t("missedCalls.action.resolve", "Resolve")}
                            </button>
                            <button
                              onClick={() => { setNoteModal({ id: m.id, action: "ignore" }); setNoteText(""); }}
                              className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-200 transition"
                              title={t("missedCalls.action.ignore", "Ignore")}
                            >
                              {t("missedCalls.action.ignore", "Ignore")}
                            </button>
                          </div>
                        )}
                        {isProcessing && (
                          <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-teal-600" />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
            <span className="text-xs text-zinc-500">
              {t("common.page", "Page")} <span className="font-semibold">{meta.page}</span>{" "}
              {t("common.of", "of")} <span className="font-semibold">{meta.totalPages}</span>
              {" · "}{meta.total} {t("missedCalls.items", "missed calls")}
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

      {/* Note modal */}
      {noteModal && (
        <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">
              {noteModal.action === "attempt"
                ? t("missedCalls.modal.attemptTitle", "Log Callback Attempt")
                : noteModal.action === "resolve"
                  ? t("missedCalls.modal.resolveTitle", "Resolve Missed Call")
                  : t("missedCalls.modal.ignoreTitle", "Ignore Missed Call")}
            </h3>
            <p className="mt-1 text-sm text-zinc-500">
              {noteModal.action === "ignore"
                ? t("missedCalls.modal.ignoreDesc", "Provide a reason for ignoring this missed call.")
                : t("missedCalls.modal.noteDesc", "Add an optional note about this action.")}
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder={
                noteModal.action === "ignore"
                  ? t("missedCalls.modal.reasonPlaceholder", "Reason for ignoring...")
                  : t("missedCalls.modal.notePlaceholder", "Optional note...")
              }
              rows={3}
              className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setNoteModal(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                onClick={submitNoteAction}
                className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 shadow-sm transition"
              >
                {noteModal.action === "attempt"
                  ? t("missedCalls.modal.logAttempt", "Log Attempt")
                  : noteModal.action === "resolve"
                    ? t("missedCalls.modal.resolve", "Resolve")
                    : t("missedCalls.modal.ignore", "Ignore")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
