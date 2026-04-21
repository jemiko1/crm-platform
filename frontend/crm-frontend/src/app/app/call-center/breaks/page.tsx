"use client";

/**
 * Call Center — Breaks tab.
 *
 * Two sections:
 *   1. Live: operators currently on break, with elapsed timer.
 *      Subscribes to /telephony Socket.IO for real-time updates; falls
 *      back to a 30s poll when sockets are unavailable.
 *   2. History: paginated table of finished sessions. System-ended rows
 *      flagged with a yellow warning chip so reports distinguish
 *      operator-initiated closes from forgotten breaks.
 *
 * Backend: see PR (break-feature-backend) + (break-dnd-manager-ui).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet, WS_BASE } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { usePermissions } from "@/lib/use-permissions";
import { io, Socket } from "socket.io-client";

interface ActiveBreak {
  id: string;
  userId: string;
  userName: string;
  email: string;
  extension: string;
  startedAt: string;
  elapsedSec: number;
}

interface HistoryBreak {
  id: string;
  userId: string;
  userName: string;
  email: string;
  extension: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  isAutoEnded: boolean;
  autoEndReason: string | null;
}

interface HistoryPage {
  data: HistoryBreak[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

interface DurationUnits {
  h: string;
  m: string;
  s: string;
}

function formatDuration(seconds: number, units: DurationUnits): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}${units.h} ${m}${units.m} ${s}${units.s}`;
  if (m > 0) return `${m}${units.m} ${s}${units.s}`;
  return `${s}${units.s}`;
}

// Locale-aware date/time formatter. `language` is "en" | "ka" — we map it to
// the proper BCP 47 tag so Georgian users see localized month names instead
// of the English "Jan/Feb/..." abbreviations `"en-GB"` would produce.
function formatDateTime(iso: string, language: string): string {
  const locale = language === "ka" ? "ka-GE" : "en-GB";
  return new Date(iso).toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BreaksPage() {
  const { t, language } = useI18n();
  // Memoize the unit labels so formatDuration gets a stable reference across
  // renders — the translations only change when the user switches language.
  const durationUnits = useMemo<DurationUnits>(
    () => ({
      h: t("breaks.units.h", "h"),
      m: t("breaks.units.m", "m"),
      s: t("breaks.units.s", "s"),
    }),
    [t],
  );
  const { hasPermission } = usePermissions();
  const canSeeLive = hasPermission("call_center.live");
  const canSeeHistory = hasPermission("call_center.statistics");

  // ───── Live section ─────

  const [active, setActive] = useState<ActiveBreak[]>([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [liveTick, setLiveTick] = useState(0); // re-render every second for elapsed timer
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadActive = useCallback(async () => {
    if (!canSeeLive) return;
    try {
      const rows = await apiGet<ActiveBreak[]>("/v1/telephony/breaks/current");
      setActive(rows ?? []);
    } catch {
      setActive([]);
    } finally {
      setLiveLoading(false);
    }
  }, [canSeeLive]);

  // Re-render every second so the elapsed timer ticks smoothly. Cheaper
  // than mutating state per-row — just trigger a render.
  useEffect(() => {
    if (!canSeeLive) return;
    const id = setInterval(() => setLiveTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [canSeeLive]);

  // Initial load + periodic refetch (30s) as fallback when sockets drop.
  useEffect(() => {
    if (!canSeeLive) return;
    loadActive();
    pollTimerRef.current = setInterval(loadActive, 30_000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [canSeeLive, loadActive]);

  // Socket.IO subscription for real-time updates. Falls back to the
  // polling above when the socket never connects (e.g. nginx WS misrouted).
  //
  // Using WS_BASE (which resolves to http://localhost:3000 in dev or the
  // production same-origin URL on the VM) rather than a bare "/telephony"
  // path — the frontend runs on :4002 in dev, so a relative path would
  // try to connect to the wrong origin and silently fall back to
  // 30-second polling only. Matches the pattern used by
  // call-report-trigger.tsx and manager-dashboard.tsx.
  useEffect(() => {
    if (!canSeeLive) return;
    const socket: Socket = io(`${WS_BASE}/telephony`, {
      transports: ["websocket", "polling"],
      withCredentials: true,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.2,
    });

    socket.on("operator:break:started", () => {
      loadActive();
    });
    socket.on("operator:break:ended", () => {
      loadActive();
    });

    return () => {
      socket.disconnect();
    };
  }, [canSeeLive, loadActive]);

  // Computed list with live-ticked elapsed seconds.
  const activeWithLiveElapsed = useMemo(() => {
    // Use liveTick to force recompute every second.
    void liveTick;
    const now = Date.now();
    return active.map((row) => ({
      ...row,
      elapsedSec: Math.floor((now - new Date(row.startedAt).getTime()) / 1000),
    }));
  }, [active, liveTick]);

  // ───── History section ─────

  const [history, setHistory] = useState<HistoryBreak[]>([]);
  const [historyMeta, setHistoryMeta] = useState({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [includeAutoEnded, setIncludeAutoEnded] = useState(true);
  const [page, setPage] = useState(1);

  const loadHistory = useCallback(async () => {
    if (!canSeeHistory) return;
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "25",
      });
      if (!includeAutoEnded) params.set("includeAutoEnded", "false");
      const res = await apiGet<HistoryPage>(
        `/v1/telephony/breaks/history?${params.toString()}`,
      );
      setHistory(res?.data ?? []);
      setHistoryMeta(
        res?.meta ?? { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      );
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [canSeeHistory, includeAutoEnded, page]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ───── Render ─────

  return (
    <div className="space-y-6">
      {canSeeLive && (
        <section className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900">
              {t("breaks.live.title", "Currently on break")}
            </h2>
            <span className="text-sm text-zinc-500">
              {liveLoading
                ? t("breaks.live.loading", "Loading…")
                : t("breaks.live.count", "{n} operator(s)").replace(
                    "{n}",
                    String(activeWithLiveElapsed.length),
                  )}
            </span>
          </div>

          {activeWithLiveElapsed.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">
              {t("breaks.live.empty", "No operators currently on break.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead className="bg-zinc-50">
                  <tr className="text-left text-xs text-zinc-600">
                    <th className="px-4 py-3 font-medium">{t("breaks.col.operator", "Operator")}</th>
                    <th className="px-4 py-3 font-medium">{t("breaks.col.extension", "Extension")}</th>
                    <th className="px-4 py-3 font-medium">{t("breaks.col.startedAt", "Started")}</th>
                    <th className="px-4 py-3 font-medium text-right">{t("breaks.col.elapsed", "Elapsed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {activeWithLiveElapsed.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-50">
                      <td className="px-4 py-3 text-zinc-900">{row.userName}</td>
                      <td className="px-4 py-3 text-zinc-600">{row.extension}</td>
                      <td className="px-4 py-3 text-zinc-600">
                        {formatDateTime(row.startedAt, language)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-xs font-mono font-medium">
                          {formatDuration(row.elapsedSec, durationUnits)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {canSeeHistory && (
        <section className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900">
              {t("breaks.history.title", "History")}
            </h2>
            <label className="flex items-center gap-2 text-xs text-zinc-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeAutoEnded}
                onChange={(e) => {
                  setIncludeAutoEnded(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-zinc-300 text-teal-800 focus:ring-teal-500 w-3.5 h-3.5"
              />
              {t("breaks.history.includeAutoEnded", "Include system-ended")}
            </label>
          </div>

          {historyLoading ? (
            <p className="text-sm text-zinc-400 py-6 text-center">
              {t("breaks.history.loading", "Loading…")}
            </p>
          ) : history.length === 0 ? (
            <p className="text-sm text-zinc-400 py-6 text-center">
              {t("breaks.history.empty", "No break history in this range.")}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-0 text-sm">
                  <thead className="bg-zinc-50">
                    <tr className="text-left text-xs text-zinc-600">
                      <th className="px-4 py-3 font-medium">{t("breaks.col.operator", "Operator")}</th>
                      <th className="px-4 py-3 font-medium">{t("breaks.col.extension", "Extension")}</th>
                      <th className="px-4 py-3 font-medium">{t("breaks.col.startedAt", "Started")}</th>
                      <th className="px-4 py-3 font-medium">{t("breaks.col.endedAt", "Ended")}</th>
                      <th className="px-4 py-3 font-medium text-right">{t("breaks.col.duration", "Duration")}</th>
                      <th className="px-4 py-3 font-medium">{t("breaks.col.closedBy", "Closed by")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-50">
                        <td className="px-4 py-3 text-zinc-900">{row.userName}</td>
                        <td className="px-4 py-3 text-zinc-600">{row.extension}</td>
                        <td className="px-4 py-3 text-zinc-600">
                          {formatDateTime(row.startedAt, language)}
                        </td>
                        <td className="px-4 py-3 text-zinc-600">
                          {formatDateTime(row.endedAt, language)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-zinc-700">
                          {formatDuration(row.durationSec, durationUnits)}
                        </td>
                        <td className="px-4 py-3">
                          {row.isAutoEnded ? (
                            <span
                              className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 px-2 py-0.5 text-xs font-medium"
                              title={
                                row.autoEndReason === "company_hours_end"
                                  ? t(
                                      "breaks.history.endedByCompanyHours",
                                      "Auto-closed at end of business hours",
                                    )
                                  : t(
                                      "breaks.history.endedByMaxDuration",
                                      "Auto-closed after 12h hard cap",
                                    )
                              }
                            >
                              {t("breaks.history.systemEnded", "⚠ System")}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-zinc-100 text-zinc-600 px-2 py-0.5 text-xs font-medium">
                              {t("breaks.history.operatorEnded", "Operator")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4 text-xs text-zinc-500">
                <span>
                  {t("breaks.history.pageInfo", "Page {page} of {total} · {count} rows")
                    .replace("{page}", String(historyMeta.page))
                    .replace("{total}", String(Math.max(historyMeta.totalPages, 1)))
                    .replace("{count}", String(historyMeta.total))}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {t("breaks.history.prev", "Previous")}
                  </button>
                  <button
                    onClick={() =>
                      setPage((p) => Math.min(historyMeta.totalPages, p + 1))
                    }
                    disabled={page >= historyMeta.totalPages}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 hover:bg-zinc-50 disabled:opacity-40"
                  >
                    {t("breaks.history.next", "Next")}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
