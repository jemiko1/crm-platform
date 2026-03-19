"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";
import { fetchCallbacks } from "../api";
import type { CallbackRequest, CallbacksPaginated } from "../types";

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  PENDING: { bg: "bg-amber-50", text: "text-amber-700" },
  IN_PROGRESS: { bg: "bg-blue-50", text: "text-blue-700" },
  COMPLETED: { bg: "bg-teal-50", text: "text-teal-800" },
  EXPIRED: { bg: "bg-zinc-100", text: "text-zinc-500" },
  CANCELLED: { bg: "bg-zinc-100", text: "text-zinc-500" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.PENDING;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.bg} ${s.text}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function CallbacksPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [callbacks, setCallbacks] = useState<CallbackRequest[]>([]);
  const [meta, setMeta] = useState({ page: 1, pageSize: 25, total: 0, totalPages: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCallbacks({
        status: status || undefined,
        page,
        pageSize: 25,
      });
      const data = res?.data ?? (Array.isArray(res) ? res as unknown as CallbackRequest[] : []);
      setCallbacks(data);
      setMeta(res?.meta ?? { page: 1, pageSize: 25, total: data.length, totalPages: 1 });
    } catch (err) {
      console.error("Failed to load callbacks", err);
      setCallbacks([]);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-5">
      {/* Status filter pills */}
      <div className="flex items-center gap-2">
        {[
          { key: "", label: t("callCenter.callbacks.all", "All") },
          { key: "PENDING", label: t("callCenter.callbacks.pending", "Pending") },
          { key: "IN_PROGRESS", label: t("callCenter.callbacks.inProgress", "In Progress") },
          { key: "COMPLETED", label: t("callCenter.callbacks.completed", "Completed") },
          { key: "EXPIRED", label: t("callCenter.callbacks.expired", "Expired") },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => { setStatus(f.key); setPage(1); }}
            className={[
              "rounded-xl px-3 py-1.5 text-xs font-medium transition-all",
              status === f.key
                ? "bg-teal-800 text-white shadow-sm"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50",
            ].join(" ")}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-clip">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-separate border-spacing-0">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs text-zinc-600">
                <th className="px-4 py-3 font-medium">{t("callCenter.callbacks.col.caller", "Caller")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.callbacks.col.client", "Client")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.callbacks.col.queue", "Queue")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.callbacks.col.status", "Status")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.callbacks.col.created", "Created")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.callbacks.col.scheduled", "Scheduled")}</th>
                <th className="px-4 py-3 font-medium">{t("callCenter.callbacks.col.completed", "Completed")}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-zinc-200 border-t-emerald-600" />
                  </td>
                </tr>
              ) : callbacks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center text-sm text-zinc-400">
                    {t("callCenter.callbacks.empty", "No callback requests found.")}
                  </td>
                </tr>
              ) : (
                callbacks.map((cb, i) => (
                  <tr
                    key={cb.id}
                    className={[
                      "group transition-all duration-200 ease-out",
                      "hover:bg-teal-50/60 hover:shadow-sm",
                      i < callbacks.length - 1 ? "border-b border-zinc-100" : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-zinc-900">{cb.callerNumber}</td>
                    <td className="px-4 py-3 text-sm text-zinc-700">{cb.clientName || "—"}</td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{cb.queueName || "—"}</td>
                    <td className="px-4 py-3"><StatusBadge status={cb.status} /></td>
                    <td className="px-4 py-3 text-sm text-zinc-500" title={fmtDate(cb.createdAt)}>
                      {timeAgo(cb.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{fmtDate(cb.scheduledAt)}</td>
                    <td className="px-4 py-3 text-sm text-zinc-500">{fmtDate(cb.completedAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3">
            <span className="text-xs text-zinc-500">
              {t("common.page", "Page")} <span className="font-semibold">{meta.page}</span> {t("common.of", "of")} <span className="font-semibold">{meta.totalPages}</span>
              {" · "}{meta.total} {t("callCenter.callbacks.totalCallbacks", "callbacks")}
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
