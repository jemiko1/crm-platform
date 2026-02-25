"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import CreateLeadModal from "./create-lead-modal";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(8, 117, 56)";

type LeadStage = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  color: string | null;
  sortOrder: number;
  isTerminal: boolean;
  isActive: boolean;
};

type Lead = {
  id: string;
  leadNumber: number;
  status: "ACTIVE" | "WON" | "LOST";
  isLocked: boolean;
  name: string;
  city: string;
  address: string;
  primaryPhone: string;
  createdAt: string;
  stage: LeadStage;
  source: { id: string; name: string; nameKa: string } | null;
  responsibleEmployee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
  responsibleEmployeeName: string | null; // Cached name when employee is deleted
  _count: {
    services: number;
    notes: number;
    reminders: number;
    appointments: number;
  };
};

type LeadsResponse = {
  data: Lead[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type Statistics = {
  total: number;
  active: number;
  won: number;
  lost: number;
  conversionRate: string;
  byStage: Array<{
    stageId: string;
    stageName: string;
    stageNameKa: string;
    stageCode: string;
    color: string | null;
    count: number;
  }>;
};

function getStatusBadge(status: Lead["status"]) {
  const styles: Record<string, string> = {
    ACTIVE: "bg-blue-50 text-blue-700 ring-blue-200",
    WON: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    LOST: "bg-red-50 text-red-700 ring-red-200",
  };
  return styles[status] || "bg-zinc-50 text-zinc-700 ring-zinc-200";
}

function getStatusLabel(status: Lead["status"]) {
  const labels: Record<string, string> = {
    ACTIVE: "Active",
    WON: "Won",
    LOST: "Lost",
  };
  return labels[status] || status;
}

function LeadsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const { t } = useI18n();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStage, setSelectedStage] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("pageSize", "20");
      if (searchQuery) params.set("q", searchQuery);
      if (selectedStage) params.set("stageId", selectedStage);
      if (selectedStatus) params.set("status", selectedStatus);

      const [leadsRes, stagesRes, statsRes] = await Promise.all([
        apiGet<LeadsResponse>(`/v1/sales/leads?${params}`),
        apiGet<LeadStage[]>("/v1/sales/config/stages"),
        apiGet<Statistics>("/v1/sales/leads/statistics"),
      ]);

      setLeads(leadsRes.data);
      setTotalPages(leadsRes.meta.totalPages);
      setTotal(leadsRes.meta.total);
      setStages(stagesRes.filter((s) => s.isActive));
      setStatistics(statsRes);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load leads");
      }
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, selectedStage, selectedStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleLeadClick = (lead: Lead) => {
    router.push(`/app/sales/leads/${lead.id}`);
  };

  const handleCreateSuccess = () => {
    setShowCreateModal(false);
    fetchData();
  };

  // Pipeline view - group leads by stage
  const leadsByStage = useMemo(() => {
    const grouped = new Map<string, Lead[]>();
    stages.forEach((stage) => grouped.set(stage.id, []));
    leads.forEach((lead) => {
      const stageLeads = grouped.get(lead.stage.id) || [];
      stageLeads.push(lead);
      grouped.set(lead.stage.id, stageLeads);
    });
    return grouped;
  }, [leads, stages]);

  return (
    <PermissionGuard permission="sales.read">
      <div className="min-h-screen p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{t("sales.leads.title", "Sales Pipeline")}</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {t("sales.leads.description", "Manage leads and track sales progress")}
            </p>
          </div>
          {hasPermission("leads.create") && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl active:scale-[0.98]"
              style={{ backgroundColor: BRAND }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t("sales.leads.newLead", "New Lead")}
            </button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-zinc-200">
            <div className="text-sm font-medium text-zinc-600">{t("sales.leads.totalLeads", "Total Leads")}</div>
            <div className="mt-1 text-2xl font-bold text-zinc-900">{statistics.total}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-zinc-200">
            <div className="text-sm font-medium text-zinc-600">{t("sales.leads.active", "Active")}</div>
            <div className="mt-1 text-2xl font-bold text-blue-600">{statistics.active}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-zinc-200">
            <div className="text-sm font-medium text-zinc-600">{t("sales.leads.won", "Won")}</div>
            <div className="mt-1 text-2xl font-bold text-emerald-600">{statistics.won}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-zinc-200">
            <div className="text-sm font-medium text-zinc-600">{t("sales.leads.lost", "Lost")}</div>
            <div className="mt-1 text-2xl font-bold text-red-600">{statistics.lost}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-md ring-1 ring-zinc-200">
            <div className="text-sm font-medium text-zinc-600">{t("sales.leads.conversionRate", "Conversion Rate")}</div>
            <div className="mt-1 text-2xl font-bold text-zinc-900">{statistics.conversionRate}%</div>
          </div>
        </div>
      )}

      {/* Pipeline Stage Progress */}
      {statistics && statistics.byStage.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {statistics.byStage
              .filter((s) => !["WON", "LOST"].includes(s.stageCode))
              .map((stage, idx) => (
                <button
                  key={stage.stageId}
                  onClick={() => setSelectedStage(selectedStage === stage.stageId ? "" : stage.stageId)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${
                    selectedStage === stage.stageId
                      ? "ring-2 ring-offset-2"
                      : "hover:ring-1 hover:ring-zinc-300"
                  }`}
                  style={{
                    backgroundColor: `${stage.color || "#6366f1"}15`,
                    borderColor: stage.color || "#6366f1",
                    ...(selectedStage === stage.stageId ? { ringColor: stage.color || "#6366f1" } : {}),
                  }}
                >
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: stage.color || "#6366f1" }}
                  >
                    {stage.count}
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium text-zinc-900">{stage.stageName}</div>
                    <div className="text-xs text-zinc-500">{stage.stageNameKa}</div>
                  </div>
                  {idx < statistics.byStage.filter((s) => !["WON", "LOST"].includes(s.stageCode)).length - 1 && (
                    <svg className="ml-2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t("sales.leads.searchPlaceholder", "Search leads...")}
            className="w-full rounded-xl border border-zinc-200 py-2.5 pl-10 pr-4 text-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <select
          value={selectedStatus}
          onChange={(e) => {
            setSelectedStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="WON">Won</option>
          <option value="LOST">Lost</option>
        </select>

        <select
          value={selectedStage}
          onChange={(e) => {
            setSelectedStage(e.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm transition focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">All Stages</option>
          {stages.map((stage) => (
            <option key={stage.id} value={stage.id}>
              {stage.name}
            </option>
          ))}
        </select>
      </div>

      {/* Leads Table */}
      <div className="rounded-2xl bg-white shadow-lg ring-1 ring-zinc-200">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-4">
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchData}
              className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium hover:bg-zinc-200"
            >
              Retry
            </button>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2">
            <svg className="h-12 w-12 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
            <p className="text-zinc-500">{t("sales.leads.noLeads", "No leads found")}</p>
            {hasPermission("leads.create") && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: BRAND }}
              >
                Create First Lead
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-clip">
              <table className="w-full">
                <thead className="sticky top-[52px] z-20 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 bg-zinc-50">
                      Lead
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 bg-zinc-50">
                      Stage
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 bg-zinc-50">
                      Status
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 bg-zinc-50">
                      Location
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 bg-zinc-50">
                      Responsible
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600 bg-zinc-50">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {leads.map((lead) => (
                    <tr
                      key={lead.id}
                      onClick={() => handleLeadClick(lead)}
                      className="cursor-pointer transition-colors hover:bg-zinc-50"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                            style={{ backgroundColor: lead.stage.color || BRAND }}
                          >
                            #{lead.leadNumber}
                          </div>
                          <div>
                            <div className="font-medium text-zinc-900">{lead.name}</div>
                            <div className="text-sm text-zinc-500">{lead.primaryPhone}</div>
                          </div>
                          {lead.isLocked && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                              🔒 Locked
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
                          style={{
                            backgroundColor: `${lead.stage.color || "#6366f1"}15`,
                            color: lead.stage.color || "#6366f1",
                          }}
                        >
                          {lead.stage.name}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${getStatusBadge(
                            lead.status
                          )}`}
                        >
                          {getStatusLabel(lead.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-zinc-900">{lead.city}</div>
                        <div className="text-xs text-zinc-500 truncate max-w-[200px]">{lead.address}</div>
                      </td>
                      <td className="px-6 py-4">
                        {lead.responsibleEmployee ? (
                          <>
                            <div className="text-sm text-zinc-900">
                              {lead.responsibleEmployee.firstName} {lead.responsibleEmployee.lastName}
                            </div>
                            <div className="text-xs text-zinc-500">{lead.responsibleEmployee.employeeId}</div>
                          </>
                        ) : (
                          <div className="text-sm text-zinc-500 italic">
                            {lead.responsibleEmployeeName || "Not assigned"}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-zinc-600">
                          {new Date(lead.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-zinc-200 px-6 py-4">
                <div className="text-sm text-zinc-600">
                  Showing {(page - 1) * 20 + 1} - {Math.min(page * 20, total)} of {total}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Lead Modal */}
      {showCreateModal && (
        <CreateLeadModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
    </div>
    </PermissionGuard>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <LeadsPageContent />
    </Suspense>
  );
}
