"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { useListItems } from "@/hooks/useListItems";

interface CallReportItem {
  id: string;
  callSessionId: string;
  paymentId: string | null;
  notes: string | null;
  status: "DRAFT" | "COMPLETED";
  createdAt: string;
  labels: { categoryCode: string }[];
  callSession: {
    id: string;
    direction: string;
    callerNumber: string | null;
    calleeNumber: string | null;
    startAt: string;
    disposition: string | null;
  };
  callerClient: { id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null } | null;
  subjectClient: { id: string; firstName: string | null; lastName: string | null; primaryPhone: string | null } | null;
  building: { id: string; name: string } | null;
  clientBuilding: { id: string; apartmentNumber: string | null } | null;
  operatorUser: { id: string; email: string; employee: { firstName: string; lastName: string } | null } | null;
}

export function BuildingCallReportsTab({ buildingId }: { buildingId: string }) {
  const { t, language } = useI18n();
  const { getLabel } = useListItems("CALL_REPORT_CATEGORY");

  const [items, setItems] = useState<CallReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ buildingId, status: "COMPLETED", page: String(page), pageSize: String(pageSize) });
      const res = await apiGet<{ items: CallReportItem[]; total: number }>(`/v1/call-reports?${params}`);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [buildingId, page]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[rgb(8,117,56)]" />
      </div>
    );
  }

  if (items.length === 0) {
    return <div className="py-16 text-center text-sm text-zinc-400">{t("callReports.noReports", "No call reports found")}</div>;
  }

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
            <th className="px-4 py-3">{t("callReports.date", "Date")}</th>
            <th className="px-4 py-3">{t("callReports.direction", "Direction")}</th>
            <th className="px-4 py-3">{t("callReports.caller", "Caller")}</th>
            <th className="px-4 py-3">{t("callReports.subject", "Subject")}</th>
            <th className="px-4 py-3">{t("callReports.apartment", "Apartment")}</th>
            <th className="px-4 py-3">{t("callReports.categories", "Categories")}</th>
            <th className="px-4 py-3">{t("callReports.operator", "Operator")}</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const operatorName = r.operatorUser?.employee
              ? `${r.operatorUser.employee.firstName} ${r.operatorUser.employee.lastName}`
              : r.operatorUser?.email || "—";
            const subjectName = r.subjectClient
              ? `${r.subjectClient.firstName || ""} ${r.subjectClient.lastName || ""}`.trim()
              : "—";
            const callerName = r.callerClient
              ? `${r.callerClient.firstName || ""} ${r.callerClient.lastName || ""}`.trim()
              : r.callSession.callerNumber || "—";

            return (
              <tr key={r.id} className="border-b border-zinc-50">
                <td className="px-4 py-3 text-zinc-600">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${r.callSession.direction === "IN" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                    {r.callSession.direction === "IN" ? "↓" : "↑"} {r.callSession.direction === "IN" ? t("callReports.inbound", "Inbound") : t("callReports.outbound", "Outbound")}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-700">{callerName}</td>
                <td className="px-4 py-3 text-zinc-700">{subjectName}</td>
                <td className="px-4 py-3 text-zinc-600">#{r.clientBuilding?.apartmentNumber || "—"}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {r.labels.map((l) => (
                      <span key={l.categoryCode} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
                        {getLabel(l.categoryCode, language) || l.categoryCode}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-600">{operatorName}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm text-zinc-600">
          <span>{total} {t("common.results", "results")}</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-zinc-300 px-3 py-1 hover:bg-zinc-50 disabled:opacity-40">
              {t("common.previous", "Previous")}
            </button>
            <span>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-zinc-300 px-3 py-1 hover:bg-zinc-50 disabled:opacity-40">
              {t("common.next", "Next")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
