"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/hooks/useI18n";
import { apiGet, apiPatch } from "@/lib/api";
import { useDesktopPhone } from "@/hooks/useDesktopPhone";

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
  { value: "CLAIMED", label: "In Progress", labelKey: "missedCalls.filter.claimed" },
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
  CLAIMED: { bg: "bg-indigo-50", text: "text-indigo-700", label: "In Progress" },
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

/** Phone icon SVG for the Call button */
function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

/** Portal-based modal that always renders centered in viewport */
function NoteModal({
  title,
  description,
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  title: string;
  description: string;
  placeholder: string;
  submitLabel: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm"
      style={{ zIndex: 50000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
        <p className="mt-1 text-sm text-zinc-500">{description}</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus
          className="mt-4 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
        />
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(text)}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 shadow-sm transition"
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function MissedCallsPage() {
  const { t } = useI18n();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<any>("/auth/me")
      .then((data) => { if (data?.user?.id) setCurrentUserId(data.user.id); })
      .catch(() => {});
  }, []);

  const { dial, appDetected, sipRegistered } = useDesktopPhone(currentUserId);
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState<"" | "OUT_OF_HOURS" | "ABANDONED" | "NO_ANSWER">("");
  const [myClaimsOnly, setMyClaimsOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<MissedCallItem[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });
  // H7 — surface fetch failures instead of silently blanking the list.
  // CLAUDE.md Risk #23's fix shipped a visible red banner pattern on
  // logs/page.tsx; we mirror it here.
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<{ id: string; action: "resolve" | "ignore" } | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: "error" | "info" } | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-dismiss toasts after 4s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (reason) params.set("reason", reason);
      if (myClaimsOnly) params.set("myClaimsOnly", "true");
      params.set("page", String(page));
      params.set("pageSize", "25");

      const res = await apiGet<MissedCallsPaginated>(
        `/v1/telephony/missed-calls?${params.toString()}`
      );
      setItems(res?.data ?? []);
      setMeta(res?.meta ?? { page: 1, pageSize: 25, total: 0, totalPages: 1 });
      setFetchError(null);
    } catch (err: any) {
      // H7 — do NOT silently blank the table; surface the error so
      // operators know it's a fetch failure, not an empty queue.
      setFetchError(err?.message ?? 'Failed to load missed calls');
    } finally {
      setLoading(false);
    }
  }, [status, reason, myClaimsOnly, page]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    refreshTimerRef.current = setInterval(load, 30000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [load]);

  async function handleAction(id: string, action: string, body?: Record<string, string>) {
    setActionLoading(id);
    try {
      await apiPatch(`/v1/telephony/missed-calls/${id}/${action}`, body ?? {});
      await load();
    } catch (err: any) {
      // H7 / M21 — surface to operator; "silently reload" wasn't
      // actually silent when the server was down: the reload also
      // failed, leaving the user with no feedback at all.
      setToast({
        message: err?.message ?? `Failed to ${action} missed call`,
        kind: 'error',
      });
    } finally {
      setActionLoading(null);
    }
  }

  /** Call button: triggers CRM28 Softphone dial. Attempt is ONLY recorded if dial succeeded. */
  async function handleCall(m: MissedCallItem) {
    if (!m.callerNumber) return;

    // Guard: don't even try if softphone isn't running or not registered
    if (!appDetected) {
      setToast({
        message: t("missedCalls.phoneNotRunning", "CRM28 Softphone is not running. Open the softphone and log in to place calls."),
        kind: "error",
      });
      return;
    }
    if (!sipRegistered) {
      setToast({
        message: t("missedCalls.phoneNotRegistered", "Softphone is running but not registered with the phone server. Try logging out and back in on the softphone."),
        kind: "error",
      });
      return;
    }

    setActionLoading(m.id);
    try {
      // Trigger the softphone to dial — only record an attempt if this succeeds
      const dialOk = await dial(m.callerNumber);
      if (!dialOk) {
        setToast({
          message: t("missedCalls.dialFailed", "Could not reach the softphone. No attempt recorded."),
          kind: "error",
        });
        return;
      }
      // Record attempt on backend (auto-claims + tracks who attempted)
      await apiPatch(`/v1/telephony/missed-calls/${m.id}/attempt`, {
        note: `Outbound call initiated to ${m.callerNumber}`,
      });
      await load();
    } catch {
      setToast({
        message: t("missedCalls.callError", "Something went wrong while placing the call."),
        kind: "error",
      });
    } finally {
      setActionLoading(null);
    }
  }

  function submitNoteAction(text: string) {
    if (!noteModal) return;
    const body: Record<string, string> = {};
    if (noteModal.action === "ignore") {
      body.reason = text || "No reason provided";
    } else {
      body.note = text;
    }
    handleAction(noteModal.id, noteModal.action, body);
    setNoteModal(null);
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
          {!appDetected && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2 ring-1 ring-amber-200">
              <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-xs font-medium text-amber-700">
                {t("missedCalls.phoneNotDetected", "CRM28 Phone not detected")}
              </span>
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
          {t("missedCalls.myClaimsOnly", "My calls only")}
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

      {/*
        Reason filter pills — independent axis from status. Lets the manager
        scope the list to after-hours calls specifically (queue 40 arrivals
        during the non-working window) without also filtering out the status
        dimension. "All reasons" is the default; click again to deselect.
      */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="text-zinc-500">
          {t("missedCalls.reasonFilter", "Reason:")}
        </span>
        <button
          onClick={() => { setReason(""); setPage(1); }}
          className={[
            "rounded-full px-2.5 py-1 text-xs font-medium transition-all",
            reason === ""
              ? "bg-zinc-900 text-white shadow-sm"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50",
          ].join(" ")}
        >
          {t("missedCalls.reason.all", "All")}
        </button>
        {(["OUT_OF_HOURS", "ABANDONED", "NO_ANSWER"] as const).map((r) => (
          <button
            key={r}
            // Match status-chip behavior: click to set, "All" chip above
            // clears. No toggle-off on re-click — consistent UX.
            onClick={() => { setReason(r); setPage(1); }}
            className={[
              "rounded-full px-2.5 py-1 text-xs font-medium transition-all",
              reason === r
                ? "bg-zinc-900 text-white shadow-sm"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50",
            ].join(" ")}
          >
            {t(
              `missedCalls.reason.${r.toLowerCase()}`,
              REASON_BADGES[r]?.label ?? r,
            )}
          </button>
        ))}
      </div>

      {fetchError && (
        <div
          role="alert"
          className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          <div className="font-medium">
            {t('missedCalls.errorTitle', 'Could not load missed calls')}
          </div>
          <div className="mt-0.5 text-xs text-rose-700">{fetchError}</div>
          <div className="mt-1.5 text-xs text-rose-700">
            {t(
              'missedCalls.errorHint',
              'Try a hard refresh (Ctrl+Shift+R). If the problem persists, check your permission to view missed calls.',
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-0">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs text-zinc-600">
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.time", "Time")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.caller", "Caller")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.client", "Client")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.queue", "Queue")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.reason", "Reason")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.status", "Status")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.attempts", "Attempts")}</th>
                <th className="px-4 py-3 font-medium">{t("missedCalls.col.lastAttemptedBy", "Last Attempted By")}</th>
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
                        <div className="text-sm font-mono text-zinc-900">{m.callerNumber || "\u2014"}</div>
                        {m.missedCallCount > 1 && (
                          <span className="mt-0.5 inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                            {m.missedCallCount}x
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-700">
                        {m.clientName || <span className="text-zinc-400">Unknown</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">{m.queueName || "\u2014"}</td>
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
                        {m.claimedByName || "\u2014"}
                        {m.claimedAt && m.claimedByName && (
                          <div className="text-xs text-zinc-400">{timeAgo(m.claimedAt)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isActionable && !isProcessing && (
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Call button — primary action */}
                            {m.attemptsCount < 3 && (
                              <button
                                onClick={() => handleCall(m)}
                                disabled={!appDetected || !sipRegistered}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition ring-1 ring-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-50"
                                title={
                                  !appDetected
                                    ? t("missedCalls.phoneNotRunning", "CRM28 Softphone is not running. Open the softphone and log in to place calls.")
                                    : !sipRegistered
                                      ? t("missedCalls.phoneNotRegistered", "Softphone is running but not registered with the phone server. Try logging out and back in on the softphone.")
                                      : t("missedCalls.action.call", "Call back")
                                }
                              >
                                <PhoneIcon className="h-3.5 w-3.5" />
                                {t("missedCalls.action.call", "Call")}
                              </button>
                            )}
                            {/* Resolve */}
                            <button
                              onClick={() => setNoteModal({ id: m.id, action: "resolve" })}
                              className="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-700 hover:bg-teal-100 transition"
                              title={t("missedCalls.action.resolve", "Resolve")}
                            >
                              {t("missedCalls.action.resolve", "Resolve")}
                            </button>
                            {/* Ignore */}
                            <button
                              onClick={() => setNoteModal({ id: m.id, action: "ignore" })}
                              className="rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-200 transition"
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
              {" \u00B7 "}{meta.total} {t("missedCalls.items", "missed calls")}
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[60000] max-w-sm">
          <div
            className={[
              "rounded-xl px-4 py-3 shadow-lg ring-1 text-sm",
              toast.kind === "error"
                ? "bg-red-50 text-red-800 ring-red-200"
                : "bg-teal-50 text-teal-800 ring-teal-200",
            ].join(" ")}
          >
            <div className="flex items-start gap-2">
              <svg className="mt-0.5 h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {toast.kind === "error" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
              </svg>
              <span>{toast.message}</span>
              <button
                onClick={() => setToast(null)}
                className="ml-auto flex-shrink-0 text-current/60 hover:text-current"
                aria-label={t("common.close", "Close")}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Note modal (portal-based, always centered) */}
      {noteModal && (
        <NoteModal
          title={
            noteModal.action === "resolve"
              ? t("missedCalls.modal.resolveTitle", "Resolve Missed Call")
              : t("missedCalls.modal.ignoreTitle", "Ignore Missed Call")
          }
          description={
            noteModal.action === "ignore"
              ? t("missedCalls.modal.ignoreDesc", "Provide a reason for ignoring this missed call.")
              : t("missedCalls.modal.noteDesc", "Add an optional note about this action.")
          }
          placeholder={
            noteModal.action === "ignore"
              ? t("missedCalls.modal.reasonPlaceholder", "Reason for ignoring...")
              : t("missedCalls.modal.notePlaceholder", "Optional note...")
          }
          submitLabel={
            noteModal.action === "resolve"
              ? t("missedCalls.modal.resolve", "Resolve")
              : t("missedCalls.modal.ignore", "Ignore")
          }
          onSubmit={submitNoteAction}
          onCancel={() => setNoteModal(null)}
        />
      )}
    </div>
  );
}
