"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, ApiError } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import CreateWorkOrderModal from "./create-work-order-modal";
import WorkOrderDetailModal from "./[id]/work-order-detail-modal";

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
    | "PENDING_APPROVAL"
    | "APPROVED"
    | "CANCELED";
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

function getStatusBadge(status: WorkOrder["status"]) {
  const styles: Record<string, string> = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    LINKED_TO_GROUP: "bg-amber-50 text-amber-700 ring-amber-200",
    IN_PROGRESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    PENDING_APPROVAL: "bg-purple-50 text-purple-700 ring-purple-200",
    APPROVED: "bg-green-50 text-green-700 ring-green-200",
    CANCELED: "bg-red-50 text-red-700 ring-red-200",
  };
  return styles[status] || "bg-zinc-50 text-zinc-700 ring-zinc-200";
}

function getStatusLabel(status: WorkOrder["status"], t: (key: string, fallback?: string) => string) {
  const labels: Record<string, string> = {
    CREATED: t("workOrders.statuses.CREATED", "Created"),
    LINKED_TO_GROUP: t("workOrders.statuses.LINKED_TO_GROUP", "Linked To a Group"),
    IN_PROGRESS: t("workOrders.statuses.IN_PROGRESS", "In Progress"),
    PENDING_APPROVAL: t("workOrders.statuses.PENDING_APPROVAL", "Pending Approval"),
    APPROVED: t("workOrders.statuses.APPROVED", "Approved"),
    CANCELED: t("workOrders.statuses.CANCELED", "Canceled"),
  };
  return labels[status] || status;
}

function getTypeLabel(type: WorkOrder["type"], t: (key: string, fallback?: string) => string) {
  const labels: Record<string, string> = {
    INSTALLATION: t("workOrders.types.INSTALLATION", "Installation"),
    DIAGNOSTIC: t("workOrders.types.DIAGNOSTIC", "Diagnostic"),
    RESEARCH: t("workOrders.types.RESEARCH", "Research"),
    DEACTIVATE: t("workOrders.types.DEACTIVATE", "Deactivate"),
    REPAIR_CHANGE: t("workOrders.types.REPAIR_CHANGE", "Repair/Change"),
    ACTIVATE: t("workOrders.types.ACTIVATE", "Activate"),
  };
  return labels[type] || type;
}

export default function WorkOrdersPage() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [meta, setMeta] = useState<WorkOrdersResponse["meta"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string | null>(null);

  // Check URL for workOrder parameter on mount and when it changes
  useEffect(() => {
    const workOrderParam = searchParams?.get("workOrder");
    if (workOrderParam) {
      setSelectedWorkOrderId(workOrderParam);
    } else {
      // If parameter is removed from URL, close modal
      if (selectedWorkOrderId) {
        setSelectedWorkOrderId(null);
      }
    }
  }, [searchParams]);

  const pageSize = 10;

  useEffect(() => {
    let cancelled = false;

    async function fetchWorkOrders() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(pageSize),
        });

        const data = await apiGet<WorkOrdersResponse>(`/v1/work-orders?${params}`);

        if (!cancelled) {
          setWorkOrders(data.data);
          setMeta(data.meta);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load work orders");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchWorkOrders();

    return () => {
      cancelled = true;
    };
  }, [page]);

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
        getStatusLabel(wo.status, t),
        getTypeLabel(wo.type, t),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [workOrders, q, t]);

  return (
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
              {t("workOrders.title", "Work Orders")} Directory
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Manage installation, diagnostic, and repair work orders across buildings.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: BRAND }}
          >
            + {t("workOrders.actions.create", "Create Work Order")}
          </button>
        </div>

        {/* Main Card */}
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 md:p-6 overflow-hidden">
          {/* Loading State */}
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">
              Loading work orders...
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">Error loading work orders</div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          {!loading && !error && (
            <>
              {/* Search Input */}
              <div className="mb-4">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by title, building, asset, status, type..."
                  className="w-full max-w-md rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-md ring-2 ring-emerald-500/40 border border-emerald-500/30 hover:ring-emerald-500/60 hover:border-emerald-500/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:shadow-lg focus:border-emerald-500/60 transition-all"
                />
              </div>

              <div className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full border-separate border-spacing-0">
                    <thead className="bg-zinc-50">
                      <tr className="text-left text-xs text-zinc-600">
                        <th className="px-4 py-3 font-medium">Work Order</th>
                        <th className="px-4 py-3 font-medium">Building</th>
                        <th className="px-4 py-3 font-medium">Asset</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-600">
                            {workOrders.length === 0
                              ? "No work orders found."
                              : "No work orders match your search."}
                          </td>
                        </tr>
                      ) : (
                        filtered.map((wo, index) => {
                          const isLast = index === filtered.length - 1;
                          return (
                            <tr
                              key={wo.id}
                              className={[
                                "group transition-all duration-200 ease-out",
                                "hover:bg-emerald-50/60",
                                "hover:shadow-lg hover:-translate-y-0.5 hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                            >
                              {/* Work Order */}
                              <td className="px-4 py-4 align-middle">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const workOrderId = wo.workOrderNumber.toString();
                                    setSelectedWorkOrderId(workOrderId);
                                    // Update URL with workOrder parameter
                                    const params = new URLSearchParams(searchParams?.toString() || "");
                                    params.set("workOrder", workOrderId);
                                    router.push(`${window.location.pathname}?${params.toString()}`);
                                  }}
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
                                <Link
                                  href={`/app/buildings/${wo.building.coreId}`}
                                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                                  title="Open building"
                                >
                                  <span className="font-semibold">{wo.building.name}</span>
                                  <span className="text-xs text-zinc-500">#{wo.building.coreId}</span>
                                </Link>
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
                                  {getTypeLabel(wo.type, t)}
                                </span>
                              </td>

                              {/* Status */}
                              <td className="px-4 py-4 align-middle">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(
                                    wo.status
                                  )}`}
                                >
                                  {getStatusLabel(wo.status, t)}
                                </span>
                              </td>

                              {/* Created */}
                              <td className="px-4 py-4 align-middle">
                                <button
                                  onClick={() => {
                                    setSelectedWorkOrderId(wo.workOrderNumber.toString());
                                    router.push(`/app/work-orders?workOrder=${wo.workOrderNumber}`);
                                  }}
                                  className="block text-left hover:bg-zinc-50 rounded-lg transition-colors w-full"
                                  title="Open work order"
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
                    Page <span className="font-semibold text-zinc-900">{meta.page}</span> of{" "}
                    <span className="font-semibold text-zinc-900">{meta.totalPages}</span>
                    <span className="mx-2 text-zinc-300">•</span>
                    <span className="font-semibold text-zinc-900">{meta.total}</span> total
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
                      disabled={meta.page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
                      disabled={meta.page >= meta.totalPages}
                      onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                    >
                      Next
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
          window.location.reload();
        }}
      />

      {/* Work Order Detail Modal */}
      {selectedWorkOrderId && (
        <WorkOrderDetailModal
          open={!!selectedWorkOrderId}
          onClose={() => {
            setSelectedWorkOrderId(null);
            // Remove workOrder parameter from URL
            const params = new URLSearchParams(searchParams?.toString() || "");
            params.delete("workOrder");
            const newUrl = params.toString() 
              ? `${window.location.pathname}?${params.toString()}` 
              : window.location.pathname;
            router.push(newUrl);
          }}
          workOrderId={selectedWorkOrderId}
          onUpdate={() => {
            // Reload work orders list
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
