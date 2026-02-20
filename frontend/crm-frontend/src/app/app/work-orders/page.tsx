"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { useListItems } from "@/hooks/useListItems";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import CreateWorkOrderModal from "./create-work-order-modal";
import WorkOrderStatistics from "./work-order-statistics";
import { useModalContext } from "../modal-manager";
import { getStatusLabel, getStatusBadge, resolveDisplayStatus } from "@/lib/work-order-status";

const BRAND = "rgb(8, 117, 56)";

type WorkOrder = {
  id: string;
  workOrderNumber: number;
  type:
    | "INSTALLATION"
    | "DIAGNOSTIC"
    | "RESEARCH"
    | "DEACTIVATE"
    | "REPAIR_CHANGE"
    | "ACTIVATE";
  status:
    | "CREATED"
    | "LINKED_TO_GROUP"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELED";
  techEmployeeComment?: string | null;
  title: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  building: {
    coreId: number;
    name: string;
  };
  asset: {
    coreId: number;
    name: string;
    type: string;
  } | null;
  workOrderAssets?: Array<{
    asset: {
      coreId: number;
      name: string;
      type: string;
    };
  }>;
};

type WorkOrdersResponse = {
  data: WorkOrder[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type StatisticsData = {
  totalWorkOrdersCount: number;
  openWorkOrdersCount: number;
  currentMonthCreated: number;
  currentMonthActive: number;
  currentMonthPercentageChange: number;
  averagePercentageChange: number;
  monthlyCreatedBreakdown: Record<number, Record<number, number>>;
  currentMonthCompletionRate: number;
  monthlyCompletionBreakdown: Record<number, Record<number, number>>;
  overdueCount: number;
  monthlyOverdueBreakdown: Record<number, Record<number, number>>;
};

export default function WorkOrdersPage() {
  const { t, language } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const { getLabel: getWoTypeLabel } = useListItems("WORK_ORDER_TYPE");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [meta, setMeta] = useState<WorkOrdersResponse["meta"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { openModal, onRefresh } = useModalContext();

  const canDelete = hasPermission("work_orders.delete");

  useEffect(() => {
    return onRefresh(() => setRefreshKey((k) => k + 1));
  }, [onRefresh]);

  function openWorkOrderModal(workOrderNumber: number) {
    openModal("workOrder", String(workOrderNumber));
  }

  const pageSize = 10;

  const fetchWorkOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      const data = await apiGet<WorkOrdersResponse>(`/v1/work-orders?${params}`);

      setWorkOrders(data.data);
      setMeta(data.meta);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : t("workOrders.failedToLoad", "Failed to load work orders"));
      }
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    fetchWorkOrders();
  }, [fetchWorkOrders, refreshKey]);

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    const confirmed = window.confirm(
      t("workOrders.confirmBulkDelete", `Are you sure you want to delete ${selectedIds.size} work order(s)?`)
    );
    if (!confirmed) return;
    setBulkDeleting(true);
    try {
      await apiPost("/v1/work-orders/bulk-delete", { ids: Array.from(selectedIds) });
      setSelectedIds(new Set());
      setRefreshKey((k) => k + 1);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete work orders");
    } finally {
      setBulkDeleting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((wo) => wo.id)));
    }
  }

  const fetchStatistics = useCallback(() => {
    setStatsError(null);
    setStatsLoading(true);
    apiGet<StatisticsData>("/v1/work-orders/statistics/summary", { cache: "no-store" })
      .then(setStatistics)
      .catch((err) => {
        setStatsError(err instanceof Error ? err.message : "Failed to load statistics");
      })
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return workOrders.filter((wo) => {
      if (!query) return true;
      const hay = [
        wo.id,
        wo.title,
        wo.notes ?? "",
        wo.building.name,
        wo.asset?.name ?? "",
        wo.workOrderAssets?.map((wa) => wa.asset.name).join(" ") ?? "",
        getStatusLabel(resolveDisplayStatus(wo.status, wo.techEmployeeComment), t),
        getWoTypeLabel(wo.type, language) as string,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [workOrders, q, t]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((wo) => selectedIds.has(wo.id));
  const someFilteredSelected = filtered.some((wo) => selectedIds.has(wo.id));

  return (
    <PermissionGuard permission="work_orders.menu">
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              {t("workOrders.title", "Work Orders")}
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              {t("workOrders.titleDirectory", "Work Orders Directory")}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              {t("workOrders.description", "Manage installation, diagnostic, and repair work orders across buildings.")}
            </p>
          </div>
        </div>

        {/* Statistics Section */}
        <WorkOrderStatistics
          statistics={statistics}
          loading={statsLoading}
          error={statsError}
          onRetry={fetchStatistics}
        />

        {/* Main Card */}
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 md:p-6">
          {/* Loading State */}
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">
              {t("workOrders.loading", "Loading work orders...")}
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">{t("workOrders.errorLoading", "Error loading work orders")}</div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {t("common.retry", "Retry")}
              </button>
            </div>
          )}

          {/* Table */}
          {!loading && !error && (
            <>
              {/* Search + Add Work Order - above table, same layout as buildings */}
              <div className="mb-4 flex flex-row flex-wrap items-center justify-between gap-3 sm:gap-4">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder={t("workOrders.searchPlaceholder", "Search by title, building, asset, status, type...")}
                  className="min-w-0 flex-1 rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-md ring-2 ring-emerald-500/40 border border-emerald-500/30 hover:ring-emerald-500/60 hover:border-emerald-500/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:shadow-lg focus:border-emerald-500/60 transition-all sm:max-w-md"
                />
                {hasPermission("work_orders.create") && (
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(true)}
                    className="shrink-0 ml-auto rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 whitespace-nowrap"
                    style={{ backgroundColor: BRAND }}
                  >
                    + {t("workOrders.actions.create", "Create Work Order")}
                  </button>
                )}
              </div>

              {canDelete && selectedIds.size > 0 && (
                <div className="mb-4 flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 ring-1 ring-red-200">
                  <span className="text-sm font-semibold text-red-700">
                    {selectedIds.size} {t("common.selected", "selected")}
                  </span>
                  <button
                    type="button"
                    disabled={bulkDeleting}
                    onClick={handleBulkDelete}
                    className="rounded-xl bg-red-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {bulkDeleting ? t("common.deleting", "Deleting...") : t("workOrders.actions.deleteSelected", "Delete Selected")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="ml-auto text-sm text-zinc-600 hover:text-zinc-900"
                  >
                    {t("common.clearSelection", "Clear selection")}
                  </button>
                </div>
              )}

              <div className="rounded-2xl ring-1 ring-zinc-200 overflow-x-clip">
                <div>
                  <table className="min-w-[980px] w-full border-separate border-spacing-0">
                    <thead className="bg-zinc-50 sticky top-[52px] z-20 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
                      <tr className="text-left text-xs text-zinc-600">
                        {canDelete && (
                          <th className="w-10 px-3 py-3 bg-zinc-50">
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              ref={(el) => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                              onChange={toggleSelectAll}
                              className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </th>
                        )}
                        <th className="px-4 py-3 font-medium bg-zinc-50">{t("workOrders.columns.workOrder", "Work Order")}</th>
                        <th className="px-4 py-3 font-medium bg-zinc-50">{t("workOrders.columns.building", "Building")}</th>
                        <th className="px-4 py-3 font-medium bg-zinc-50">{t("workOrders.columns.asset", "Asset")}</th>
                        <th className="px-4 py-3 font-medium bg-zinc-50">{t("workOrders.columns.type", "Type")}</th>
                        <th className="px-4 py-3 font-medium bg-zinc-50">{t("workOrders.columns.status", "Status")}</th>
                        <th className="px-4 py-3 font-medium bg-zinc-50">{t("workOrders.columns.created", "Created")}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={canDelete ? 7 : 6} className="px-4 py-10 text-center text-sm text-zinc-600">
                            {workOrders.length === 0
                              ? t("workOrders.noWorkOrders", "No work orders found.")
                              : t("workOrders.noMatch", "No work orders match your search.")}
                          </td>
                        </tr>
                      ) : (
                        filtered.map((wo, index) => {
                          const isLast = index === filtered.length - 1;
                          const isSelected = selectedIds.has(wo.id);
                          return (
                            <tr
                              key={wo.id}
                              className={[
                                "group transition-all duration-200 ease-out",
                                isSelected ? "bg-emerald-50/40" : "hover:bg-emerald-50/60",
                                "hover:shadow-lg hover:-translate-y-0.5 hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                            >
                              {canDelete && (
                                <td className="w-10 px-3 py-4 align-middle">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => toggleSelect(wo.id)}
                                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                  />
                                </td>
                              )}
                              {/* Work Order */}
                              <td className="px-4 py-4 align-middle">
                                <button
                                  type="button"
                                  onClick={() => openWorkOrderModal(wo.workOrderNumber)}
                                  className="block w-full text-left"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-zinc-900 underline-offset-2 group-hover:underline">
                                        {wo.title}
                                      </span>
                                      <span className="text-zinc-400">→</span>
                                    </div>
                                    {wo.notes && (
                                      <div className="mt-1 text-xs text-zinc-500 line-clamp-1">
                                        {wo.notes}
                                      </div>
                                    )}
                                  </div>
                                </button>
                              </td>

                              {/* Building */}
                              <td className="px-4 py-4 align-middle">
                                <button
                                  type="button"
                                  onClick={() => openModal("building", String(wo.building.coreId))}
                                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                                  title={t("workOrders.openBuilding", "Open building")}
                                >
                                  <span className="font-semibold">{wo.building.name}</span>
                                  <span className="text-xs text-zinc-500">#{wo.building.coreId}</span>
                                </button>
                              </td>

                              {/* Asset */}
                              <td className="px-4 py-4 align-middle">
                                {wo.asset ? (
                                  <span className="inline-flex items-center rounded-2xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700 ring-1 ring-zinc-200">
                                    {wo.asset.name} ({wo.asset.type})
                                  </span>
                                ) : (
                                  <span className="text-sm text-zinc-400">—</span>
                                )}
                              </td>

                              {/* Type */}
                              <td className="px-4 py-4 align-middle">
                                <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
                                  {getWoTypeLabel(wo.type, language)}
                                </span>
                              </td>

                              {/* Status */}
                              <td className="px-4 py-4 align-middle">
                                {(() => {
                                  const ds = resolveDisplayStatus(wo.status, wo.techEmployeeComment);
                                  return (
                                    <span
                                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(ds)}`}
                                    >
                                      {getStatusLabel(ds, t)}
                                    </span>
                                  );
                                })()}
                              </td>

                              {/* Created */}
                              <td className="px-4 py-4 align-middle">
                                <button
                                  onClick={() => openWorkOrderModal(wo.workOrderNumber)}
                                  className="block text-left hover:bg-zinc-50 rounded-lg transition-colors w-full"
                                  title={t("workOrders.openWorkOrder", "Open work order")}
                                >
                                  <div className="text-sm text-zinc-900">
                                    {new Date(wo.createdAt).toLocaleDateString()}
                                  </div>
                                  <div className="mt-1 text-xs text-zinc-500">
                                    {new Date(wo.createdAt).toLocaleTimeString()}
                                  </div>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {meta && filtered.length > 0 && (
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-zinc-600">
                    {t("common.page", "Page")} <span className="font-semibold text-zinc-900">{meta.page}</span> {t("common.of", "of")}{" "}
                    <span className="font-semibold text-zinc-900">{meta.totalPages}</span>
                    <span className="mx-2 text-zinc-300">•</span>
                    <span className="font-semibold text-zinc-900">{meta.total}</span> {t("common.total", "total")}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
                      disabled={meta.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t("common.previous", "Previous")}
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                    >
                      {t("common.next", "Next")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Create Modal */}
      <CreateWorkOrderModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          setRefreshKey((k) => k + 1);
        }}
      />
      </div>
    </PermissionGuard>
  );
}
