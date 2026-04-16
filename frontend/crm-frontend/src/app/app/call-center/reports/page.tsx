"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { useListItems } from "@/hooks/useListItems";
import { usePermissions } from "@/lib/use-permissions";
import { CallReportModal } from "./call-report-modal";

const BRAND = "rgb(8,117,56)";

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

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, String(v));
  }
  return sp.toString();
}

export default function CallReportsPage() {
  const { t, language } = useI18n();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { items: categories, getLabel } = useListItems("CALL_REPORT_CATEGORY");
  const searchParams = useSearchParams();

  const [items, setItems] = useState<CallReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Drafts
  const [drafts, setDrafts] = useState<CallReportItem[]>([]);

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [editingReport, setEditingReport] = useState<CallReportItem | null>(null);

  // Open modal from softphone button via ?openReport=true
  useEffect(() => {
    if (searchParams.get("openReport") === "true") {
      setShowModal(true);
    }
  }, [searchParams]);

  if (!permLoading && !hasPermission("call_center.reports")) {
    return <div className="py-12 text-center text-zinc-500">{t("common.noResults", "No results found")}</div>;
  }

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const q = qs({ status: statusFilter, categoryCode: categoryFilter, dateFrom, dateTo, page, pageSize });
      const res = await apiGet<{ items: CallReportItem[]; total: number }>(`/v1/call-reports?${q}`);
      setItems(res.items);
      setTotal(res.total);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, dateFrom, dateTo, page]);

  const fetchDrafts = useCallback(async () => {
    try {
      const res = await apiGet<CallReportItem[]>("/v1/call-reports/my-drafts");
      setDrafts(res);
    } catch { setDrafts([]); }
  }, []);

  useEffect(() => { fetchReports(); }, [fetchReports]);
  useEffect(() => { fetchDrafts(); }, [fetchDrafts]);

  const handleSuccess = () => {
    fetchReports();
    fetchDrafts();
    setEditingReport(null);
  };

  const openEdit = (report: CallReportItem) => {
    setEditingReport(report);
    setShowModal(true);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Draft banner */}
      {drafts.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {t("callReports.draftBanner", "You have {count} draft reports to complete.").replace("{count}", String(drafts.length))}
          </div>
          <button onClick={() => { setStatusFilter("DRAFT"); setPage(1); }} className="text-sm font-medium text-amber-700 hover:text-amber-900">
            {t("callReports.viewDrafts", "View Drafts")}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500">
          <option value="">{t("callReports.status", "Status")}: {t("common.all", "All")}</option>
          <option value="DRAFT">{t("callReports.statusDraft", "Draft")}</option>
          <option value="COMPLETED">{t("callReports.statusCompleted", "Completed")}</option>
        </select>

        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }} className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500">
          <option value="">{t("callReports.categories", "Categories")}: {t("common.all", "All")}</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>{language === "ka" ? (c.displayNameKa || c.displayName) : c.displayName}</option>
          ))}
        </select>

        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-500" />
        <span className="text-zinc-400">—</span>
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-teal-500" />

        {(statusFilter || categoryFilter || dateFrom || dateTo) && (
          <button onClick={() => { setStatusFilter(""); setCategoryFilter(""); setDateFrom(""); setDateTo(""); setPage(1); }} className="text-sm text-zinc-500 hover:text-zinc-700">
            {t("common.clear", "Clear")}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-300 border-t-[rgb(8,117,56)]" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-400">{t("callReports.noReports", "No call reports found")}</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">{t("callReports.date", "Date")}</th>
                <th className="px-4 py-3">{t("callReports.direction", "Direction")}</th>
                <th className="px-4 py-3">{t("callReports.caller", "Caller")}</th>
                <th className="px-4 py-3">{t("callReports.subject", "Subject")}</th>
                <th className="px-4 py-3">{t("callReports.building", "Building")}</th>
                <th className="px-4 py-3">{t("callReports.categories", "Categories")}</th>
                <th className="px-4 py-3">{t("callReports.operator", "Operator")}</th>
                <th className="px-4 py-3">{t("callReports.status", "Status")}</th>
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
                  <tr key={r.id} onClick={() => openEdit(r)} className="cursor-pointer border-b border-zinc-50 hover:bg-teal-50/60 transition-colors">
                    <td className="px-4 py-3 text-zinc-600">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${r.callSession.direction === "IN" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}`}>
                        {r.callSession.direction === "IN" ? "↓" : "↑"} {r.callSession.direction === "IN" ? t("callReports.inbound", "Inbound") : t("callReports.outbound", "Outbound")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-700">{callerName}</td>
                    <td className="px-4 py-3 text-zinc-700">{subjectName}</td>
                    <td className="px-4 py-3 text-zinc-600">{r.building?.name || "—"}</td>
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
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.status === "DRAFT" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                        {r.status === "DRAFT" ? t("callReports.statusDraft", "Draft") : t("callReports.statusCompleted", "Completed")}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-zinc-600">
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

      {/* Modal */}
      <CallReportModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditingReport(null); }}
        onSuccess={handleSuccess}
        editReport={editingReport ? {
          id: editingReport.id,
          callSessionId: editingReport.callSessionId,
          callerClientId: editingReport.callerClient?.id,
          paymentId: editingReport.paymentId,
          subjectClientId: editingReport.subjectClient?.id,
          clientBuildingId: editingReport.clientBuilding?.id,
          buildingId: editingReport.building?.id,
          labels: editingReport.labels,
          notes: editingReport.notes,
          status: editingReport.status,
        } : undefined}
      />
    </div>
  );
}
