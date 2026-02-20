"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPatch, apiDelete, apiPost, ApiError, API_BASE } from "@/lib/api";
import EditWorkOrderModal from "./edit-work-order-modal";
import ActivityTimeline from "./activity-timeline";
import { useI18n } from "@/hooks/useI18n";
import { usePermissions } from "@/lib/use-permissions";
import { PermissionGuard } from "@/lib/permission-guard";
import { getStatusLabel as sharedGetStatusLabel, getStatusBadge as sharedGetStatusBadge, resolveDisplayStatus } from "@/lib/work-order-status";

const BRAND = "rgb(8, 117, 56)";

type WorkOrderDetail = {
  id: string;
  workOrderNumber: number;
  type:
    | "INSTALLATION"
    | "DIAGNOSTIC"
    | "RESEARCH"
    | "DEACTIVATE"
    | "REPAIR_CHANGE"
    | "ACTIVATE"
    | "INSTALL"
    | "REPAIR"; // Legacy
  status:
    | "CREATED"
    | "LINKED_TO_GROUP"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELED";
  title: string;
  notes: string | null;
  description?: string | null;
  contactNumber: string | null;
  deadline: string | null;
  amountGel: number | null;
  inventoryProcessingType: string | null;
  techEmployeeComment: string | null;
  techHeadComment: string | null;
  cancelReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  building: {
    coreId: number;
    name: string;
    address: string | null;
    city: string | null;
  };
  asset: {
    coreId: number;
    name: string;
    type: string;
    status: string;
  } | null;
  workOrderAssets?: Array<{
    asset: {
      coreId: number;
      name: string;
      type: string;
      status: string;
    };
  }>;
  assignments?: Array<{
    id: string;
    assignedAt: string;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      employeeId: string;
    };
  }>;
  productUsages?: Array<{
    id: string;
    quantity: number;
    isApproved: boolean;
    product: {
      id: string;
      name: string;
      sku: string;
      category: string;
    };
    batch?: {
      id: string;
      purchasePrice: number;
      sellPrice: number;
    };
  }>;
  deactivatedDevices?: Array<{
    id: string;
    quantity: number;
    isWorkingCondition: boolean;
    transferredToStock: boolean;
    product: {
      id: string;
      name: string;
      sku: string;
      category: string;
    };
  }>;
  parentWorkOrder?: {
    id: string;
    workOrderNumber: number;
    title: string;
    type: string;
    status: string;
  } | null;
  childWorkOrders?: Array<{
    id: string;
    workOrderNumber: number;
    title: string;
    type: string;
    status: string;
    createdAt: string;
  }>;
  notifications?: Array<{
    id: string;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    notifiedAt: string | null;
    readAt: string | null;
    createdAt: string;
  }>;
};

function getStatusBadge(status: string) {
  return sharedGetStatusBadge(status);
}

function getStatusLabel(status: string, t: (key: string, fallback?: string) => string) {
  return sharedGetStatusLabel(status, t);
}

function getResolvedStatusBadge(wo: { status: string; techEmployeeComment?: string | null }) {
  return sharedGetStatusBadge(resolveDisplayStatus(wo.status, wo.techEmployeeComment));
}

function getResolvedStatusLabel(wo: { status: string; techEmployeeComment?: string | null }, t: (key: string, fallback?: string) => string) {
  return sharedGetStatusLabel(resolveDisplayStatus(wo.status, wo.techEmployeeComment), t);
}

function getTypeLabel(type: WorkOrderDetail["type"], t: (key: string, fallback?: string) => string) {
  const labels: Record<string, string> = {
    INSTALLATION: t("workOrders.types.INSTALLATION", "Installation"),
    DIAGNOSTIC: t("workOrders.types.DIAGNOSTIC", "Diagnostic"),
    RESEARCH: t("workOrders.types.RESEARCH", "Research"),
    DEACTIVATE: t("workOrders.types.DEACTIVATE", "Deactivate"),
    REPAIR_CHANGE: t("workOrders.types.REPAIR_CHANGE", "Repair/Change"),
    ACTIVATE: t("workOrders.types.ACTIVATE", "Activate"),
    // Legacy
    INSTALL: "Install",
    REPAIR: "Repair",
  };
  return labels[type] || type;
}

function InfoCard({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="py-3 border-b border-zinc-100 last:border-0">
      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1.5 text-sm text-zinc-900">{value || "—"}</div>
    </div>
  );
}

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { hasPermission } = usePermissions();
  const id = params?.id as string | undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "timeline" | "workflow">("details");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSimpleDeleteConfirm, setShowSimpleDeleteConfirm] = useState(false);
  const [inventoryImpact, setInventoryImpact] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch current user info
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const res = await fetch(`${API_BASE}/auth/me`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed /auth/me");
        const data = await res.json();
        const userData = data?.user || data;

        if (!cancelled) {
          setCurrentUser(userData);
          // Try to get employee ID from user
          if (userData.employeeId) {
            try {
              const empData = await apiGet(`/v1/employees?search=${userData.email}`);
              if (Array.isArray(empData) && empData.length > 0) {
                setCurrentEmployee(empData[0]);
              }
            } catch {
              // Ignore employee fetch errors
            }
          }
        }
      } catch {
        // Ignore user fetch errors
      }
    }

    loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Work order ID is required");
      return;
    }

    let cancelled = false;

    async function loadWorkOrder() {
      try {
        setLoading(true);
        setError(null);

        const data = await apiGet<WorkOrderDetail>(`/v1/work-orders/${id}`);

        if (!cancelled) {
          setWorkOrder(data);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load work order");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadWorkOrder();

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleDelete() {
    if (!id) return;

    try {
      // Check inventory impact first
      const impact = await apiGet<any>(`/v1/work-orders/${id}/inventory-impact`);
      setInventoryImpact(impact);
      
      if (impact.hasImpact) {
        // Show confirmation dialog with options
        setShowDeleteConfirm(true);
      } else {
        // No impact, show simple styled confirmation
        setShowSimpleDeleteConfirm(true);
      }
    } catch (err) {
      // If check fails, show simple styled confirmation
      setShowSimpleDeleteConfirm(true);
    }
  }

  async function performDelete(revertInventory: boolean) {
    if (!id) return;

    try {
      setDeleteLoading(true);
      const url = revertInventory 
        ? `/v1/work-orders/${id}?revertInventory=true`
        : `/v1/work-orders/${id}`;
      
      await apiDelete(url);
      setShowDeleteConfirm(false);
      router.push("/app/work-orders");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete work order");
    } finally {
      setDeleteLoading(false);
    }
  }

  function handleEditSuccess() {
    setShowEditModal(false);
    // Reload work order data
    window.location.reload();
  }

  // Check if current user is assigned to this work order
  const isAssignedEmployee = workOrder?.assignments?.some(
    (a) => a.employee.id === currentEmployee?.id,
  );

  // Check if current user is head of technical department (simplified check)
  const isHeadOfTechnical = currentEmployee?.position?.code?.toLowerCase().includes("technical") || 
                            currentEmployee?.position?.name?.toLowerCase().includes("technical") ||
                            currentUser?.isSuperAdmin;

  // Check if user is technical employee (should only view, not edit)
  const isTechnicalEmployee = currentEmployee?.position?.code?.toLowerCase().includes("technical") ||
                              currentEmployee?.position?.name?.toLowerCase().includes("technical");

  // Check if user has permission to view sensitive data (amountGel)
  const canViewSensitiveData = !isTechnicalEmployee || currentUser?.isSuperAdmin;

  // Delete permission checks
  const canDelete = currentUser?.isSuperAdmin || hasPermission("work_orders.delete");
  const canDeleteKeepInventory = currentUser?.isSuperAdmin || hasPermission("work_orders.delete_keep_inventory");
  const canDeleteRevertInventory = currentUser?.isSuperAdmin || hasPermission("work_orders.delete_revert_inventory");
  const canDeleteAny = canDelete || canDeleteKeepInventory || canDeleteRevertInventory;

  // Workflow actions
  async function handleStartWork() {
    if (!id || !currentEmployee) return;
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${id}/start`, {});
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to start work");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete(comment: string) {
    if (!id || !currentEmployee) return;
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${id}/complete`, { comment });
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to submit completion");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApprove(productUsages?: any[], comment?: string) {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${id}/approve`, { productUsages, comment });
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to approve work order");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel(cancelReason: string, comment?: string) {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${id}/cancel`, { cancelReason, comment });
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to cancel work order");
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <PermissionGuard permission="work_orders.read">
        <div className="w-full">
          <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
            <div className="rounded-lg bg-white p-12 text-center border border-zinc-200">
              <div className="text-sm text-zinc-600">Loading work order...</div>
            </div>
          </div>
        </div>
      </PermissionGuard>
    );
  }

  if (error || !workOrder) {
    return (
      <PermissionGuard permission="work_orders.read">
        <div className="w-full">
          <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
            <div className="rounded-lg bg-white p-6 border border-zinc-300">
              <div className="text-sm font-semibold text-zinc-900">Error loading work order</div>
              <div className="mt-1 text-sm text-zinc-600">{error || "Work order not found"}</div>
              <Link
                href="/app/work-orders"
                className="mt-3 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Back to Work Orders
              </Link>
            </div>
          </div>
        </div>
      </PermissionGuard>
    );
  }

  return (
    <PermissionGuard permission="work_orders.read">
    <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Breadcrumb */}
        <div className="mb-4">
          <Link
            href="/app/work-orders"
            className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to Work Orders</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6 pb-6 border-b border-zinc-200">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Work Order #{workOrder.workOrderNumber}</span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${getResolvedStatusBadge(workOrder)}`}
                >
                  {getResolvedStatusLabel(workOrder, t)}
                </span>
              </div>
              <h1 className="text-2xl font-semibold text-zinc-900 md:text-3xl">
                {workOrder.title}
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                Created {new Date(workOrder.createdAt).toLocaleString()}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {!isTechnicalEmployee && (
                <>
                  {hasPermission('work_orders.update') && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300 transition-all shadow-sm"
                      onClick={() => setShowEditModal(true)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        <path d="m15 5 4 4" />
                      </svg>
                      Edit
                    </button>
                  )}
                  {canDeleteAny && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 hover:ring-red-300 transition-all shadow-sm"
                      onClick={handleDelete}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        <line x1="10" x2="10" y1="11" y2="17" />
                        <line x1="14" x2="14" y1="11" y2="17" />
                      </svg>
                      Delete
                    </button>
                  )}
                </>
              )}
              {isTechnicalEmployee && (
                <div className="text-sm text-zinc-500 italic">
                  Work orders are read-only. Manage tasks in your workspace.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-zinc-200">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={`px-1 py-3 text-sm font-medium transition relative ${
                activeTab === "details"
                  ? "text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Details
              {activeTab === "details" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`px-1 py-3 text-sm font-medium transition relative ${
                activeTab === "timeline"
                  ? "text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Timeline
              {activeTab === "timeline" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
              )}
            </button>
            {currentUser?.isSuperAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("workflow")}
                className={`px-1 py-3 text-sm font-medium transition relative ${
                  activeTab === "workflow"
                    ? "text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                Workflow (Debug)
                {activeTab === "workflow" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        {activeTab === "workflow" && currentUser?.isSuperAdmin ? (
          <WorkflowTab workOrder={workOrder} />
        ) : activeTab === "timeline" ? (
          <ActivityTimeline workOrderId={workOrder.workOrderNumber?.toString() || workOrder.id} />
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Info */}
          <div className="lg:col-span-2 rounded-lg bg-white p-6 border border-zinc-200">
            <h2 className="text-base font-semibold text-zinc-900 mb-5">Work Order Information</h2>

            <div className="space-y-0">
              <InfoCard label={t("workOrders.fields.type", "Type")} value={getTypeLabel(workOrder.type, t)} />
              <InfoCard label={t("workOrders.fields.title", "Title")} value={workOrder.title} />
              {workOrder.description && (
                <InfoCard label={t("workOrders.fields.description", "Description")} value={workOrder.description} />
              )}
              {workOrder.contactNumber && (
                <InfoCard
                  label={t("workOrders.fields.contactNumber", "Contact Number")}
                  value={workOrder.contactNumber}
                />
              )}
              {workOrder.deadline && (
                <InfoCard
                  label={t("workOrders.fields.deadline", "Deadline")}
                  value={new Date(workOrder.deadline).toLocaleString()}
                />
              )}
              {workOrder.amountGel && canViewSensitiveData && (
                <InfoCard label={t("workOrders.fields.amountGel", "Amount (GEL)")} value={`${workOrder.amountGel} GEL`} />
              )}
              <InfoCard
                label={t("workOrders.fields.status", "Status")}
                value={getResolvedStatusLabel(workOrder, t)}
              />
              <InfoCard
                label="Created"
                value={new Date(workOrder.createdAt).toLocaleString()}
              />
              {workOrder.startedAt && (
                <InfoCard label="Started" value={new Date(workOrder.startedAt).toLocaleString()} />
              )}
              {workOrder.completedAt && (
                <InfoCard label="Completed" value={new Date(workOrder.completedAt).toLocaleString()} />
              )}
              {workOrder.canceledAt && (
                <InfoCard label="Canceled" value={new Date(workOrder.canceledAt).toLocaleString()} />
              )}
            </div>
          </div>

          {/* Building & Asset */}
          <div className="space-y-6">
            {/* Building */}
            <div className="rounded-lg bg-white p-6 border border-zinc-200">
              <h2 className="text-base font-semibold text-zinc-900 mb-4">Building</h2>
              <Link
                href={`/app/buildings?building=${workOrder.building.coreId}`}
                className="group block rounded-lg bg-zinc-50 p-4 border border-zinc-200 transition hover:border-zinc-300 hover:bg-zinc-100"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-900">
                      {workOrder.building.name}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      ID: #{workOrder.building.coreId}
                    </div>
                    {workOrder.building.address && (
                      <div className="mt-1.5 text-xs text-zinc-600">{workOrder.building.address}</div>
                    )}
                  </div>
                  <svg className="w-4 h-4 text-zinc-400 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            </div>

            {/* Devices */}
            {(workOrder.workOrderAssets && workOrder.workOrderAssets.length > 0) || workOrder.asset ? (
              <div className="rounded-lg bg-white p-6 border border-zinc-200">
                <h2 className="text-base font-semibold text-zinc-900 mb-4">
                  {t("workOrders.fields.devices", "Devices")}
                </h2>
                <div className="space-y-2">
                  {workOrder.workOrderAssets && workOrder.workOrderAssets.length > 0
                    ? workOrder.workOrderAssets.map((wa) => (
                        <div key={wa.asset.coreId} className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                          <div className="text-sm font-medium text-zinc-900">{wa.asset.name}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {wa.asset.type} • {wa.asset.status} • ID #{wa.asset.coreId}
                          </div>
                        </div>
                      ))
                    : workOrder.asset && (
                        <div className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                          <div className="text-sm font-medium text-zinc-900">{workOrder.asset.name}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {workOrder.asset.type} • {workOrder.asset.status} • ID #{workOrder.asset.coreId}
                          </div>
                        </div>
                      )}
                </div>
              </div>
            ) : null}

            {/* Assigned Employees */}
            {workOrder.assignments && workOrder.assignments.length > 0 && (
              <div className="rounded-lg bg-white p-6 border border-zinc-200">
                <h2 className="text-base font-semibold text-zinc-900 mb-4">Assigned Employees</h2>
                <div className="space-y-2">
                  {workOrder.assignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-lg bg-zinc-50 p-3 border border-zinc-200">
                      <div className="text-sm font-medium text-zinc-900">
                        {assignment.employee.firstName} {assignment.employee.lastName}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {assignment.employee.email}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400">
                        Assigned: {new Date(assignment.assignedAt).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Workflow actions removed - technical employees should use /app/tasks instead */}

            {/* Comments */}
            {(workOrder.techEmployeeComment || workOrder.techHeadComment || workOrder.cancelReason) && (
              <div className="rounded-lg bg-white p-6 border border-zinc-200">
                <h2 className="text-base font-semibold text-zinc-900 mb-4">Comments</h2>
                <div className="space-y-4">
                  {workOrder.techEmployeeComment && (
                    <div className="pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
                      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">Technical Employee Comment</div>
                      <div className="text-sm text-zinc-900">{workOrder.techEmployeeComment}</div>
                    </div>
                  )}
                  {workOrder.techHeadComment && (
                    <div className="pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
                      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">Head of Technical Comment</div>
                      <div className="text-sm text-zinc-900">{workOrder.techHeadComment}</div>
                    </div>
                  )}
                  {workOrder.cancelReason && (
                    <div className="pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
                      <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">Cancel Reason</div>
                      <div className="text-sm text-zinc-900">{workOrder.cancelReason}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-Orders */}
            {workOrder.childWorkOrders && workOrder.childWorkOrders.length > 0 && (
              <div className="rounded-lg bg-white p-6 border border-zinc-200">
                <h2 className="text-base font-semibold text-zinc-900 mb-4">Sub-Orders</h2>
                <div className="space-y-2">
                  {workOrder.childWorkOrders.map((child) => (
                    <Link
                      key={child.id}
                      href={`/app/work-orders/${child.workOrderNumber}`}
                      className="block rounded-lg bg-zinc-50 p-3 border border-zinc-200 transition hover:border-zinc-300 hover:bg-zinc-100"
                    >
                      <div className="text-sm font-medium text-zinc-900">{child.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {child.type} • {child.status} • {new Date(child.createdAt).toLocaleDateString()}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Note: Product management is handled in Tasks workspace (/app/tasks/[taskId]) */}
          {/* Work orders page is for viewing/management only, not for product operations */}
        </div>
        )}
      </div>

      {/* Edit Modal */}
      <EditWorkOrderModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={handleEditSuccess}
        workOrder={workOrder}
      />

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && inventoryImpact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-red-500 to-red-600">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Delete Work Order #{inventoryImpact.workOrderNumber}
                  </h2>
                  <p className="text-sm text-white/80">
                    This work order has attached products
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              {/* Warning message */}
              <div className="mb-5 p-4 rounded-2xl bg-amber-50 ring-1 ring-amber-200">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 text-amber-500">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                      <path d="M12 9v4" />
                      <path d="M12 17h.01" />
                    </svg>
                  </div>
                  <div className="text-sm text-amber-800">
                    <strong>Attention:</strong> This completed work order has processed products that affected your inventory and building records.
                  </div>
                </div>
              </div>

              {/* Impact Summary */}
              <div className="space-y-3 mb-5">
                {inventoryImpact.approvedProductUsages > 0 && (
                  <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📦</span>
                      <span className="text-sm font-semibold text-zinc-900">
                        Products Deducted from Inventory ({inventoryImpact.approvedProductUsages})
                      </span>
                    </div>
                    <div className="ml-7 space-y-1">
                      {inventoryImpact.productUsages?.slice(0, 5).map((pu: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-zinc-600">{pu.productName}</span>
                          <span className="font-medium text-zinc-900 bg-zinc-100 px-2 py-0.5 rounded-lg">
                            -{pu.quantity} units
                          </span>
                        </div>
                      ))}
                      {inventoryImpact.productUsages?.length > 5 && (
                        <div className="text-xs text-zinc-500 italic">
                          +{inventoryImpact.productUsages.length - 5} more items...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {inventoryImpact.buildingProductFlowCount > 0 && (
                  <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🏢</span>
                      <span className="text-sm font-semibold text-emerald-900">
                        Building Product Flow Records ({inventoryImpact.buildingProductFlowCount})
                      </span>
                    </div>
                    <div className="ml-7 space-y-1">
                      {inventoryImpact.buildingProductFlow?.slice(0, 3).map((bpf: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-emerald-700">{bpf.productName} → {bpf.buildingName}</span>
                          <span className="font-medium text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg">
                            {bpf.quantity} units
                          </span>
                        </div>
                      ))}
                      {inventoryImpact.buildingProductFlow?.length > 3 && (
                        <div className="text-xs text-emerald-600 italic">
                          +{inventoryImpact.buildingProductFlow.length - 3} more entries...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Show building info for context if work order has building */}
                {workOrder?.building && inventoryImpact.approvedProductUsages > 0 && (
                  <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">🏢</span>
                      <span className="text-sm font-semibold text-emerald-900">
                        Building: {workOrder.building.name}
                      </span>
                    </div>
                    <div className="ml-7 text-xs text-emerald-700">
                      Products were installed/used at this building location
                    </div>
                  </div>
                )}

                {inventoryImpact.inventoryTransactionsCount > 0 && (
                  <div className="rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📊</span>
                      <span className="text-sm font-semibold text-blue-900">
                        Inventory Transactions ({inventoryImpact.inventoryTransactionsCount})
                      </span>
                    </div>
                    <div className="ml-7 text-xs text-blue-700">
                      Transaction records were created in Inventory → Transactions
                    </div>
                  </div>
                )}

                {inventoryImpact.transferredDevices > 0 && (
                  <div className="rounded-2xl bg-purple-50 p-4 ring-1 ring-purple-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">📱</span>
                      <span className="text-sm font-semibold text-purple-900">
                        Devices Transferred to Stock ({inventoryImpact.transferredDevices})
                      </span>
                    </div>
                    <div className="ml-7 space-y-1">
                      {inventoryImpact.deactivatedDevices?.slice(0, 3).map((dd: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-purple-700">{dd.productName}</span>
                          <span className="font-medium text-purple-800 bg-purple-100 px-2 py-0.5 rounded-lg">
                            {dd.quantity} units
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Options */}
              <div className="mb-6">
                <p className="text-sm font-semibold text-zinc-900 mb-3">Choose how to handle the attached products:</p>
                
                <div className="space-y-3">
                  {/* Option 1: Delete & Revert - requires delete_revert_inventory permission */}
                  {canDeleteRevertInventory ? (
                    <button
                      type="button"
                      onClick={() => performDelete(true)}
                      disabled={deleteLoading}
                      className="w-full text-left p-4 rounded-2xl border-2 border-red-200 hover:border-red-400 hover:bg-red-50 transition-all group disabled:opacity-50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center group-hover:bg-red-200 transition-colors">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(220, 38, 38)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-red-700 mb-1">Delete & Revert All Changes</div>
                          <div className="text-xs text-zinc-600">
                            Return products to inventory stock, remove building product flow entries, and delete all related transaction records. The inventory will be restored to its state before this work order was completed.
                          </div>
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="w-full p-4 rounded-2xl border-2 border-zinc-100 bg-zinc-50 opacity-60">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-200 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(161, 161, 170)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-zinc-500 mb-1">Delete & Revert All Changes</div>
                          <div className="text-xs text-zinc-400">
                            You don't have permission to delete with inventory revert. Contact your administrator.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Option 2: Delete & Keep - requires delete_keep_inventory permission */}
                  {canDeleteKeepInventory ? (
                    <button
                      type="button"
                      onClick={() => performDelete(false)}
                      disabled={deleteLoading}
                      className="w-full text-left p-4 rounded-2xl border-2 border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50 transition-all group disabled:opacity-50"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-100 flex items-center justify-center group-hover:bg-zinc-200 transition-colors">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(82, 82, 91)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-zinc-700 mb-1">Delete & Keep Product Data</div>
                          <div className="text-xs text-zinc-600">
                            Only delete the work order record. Keep inventory deductions, building product flow entries, and transaction history intact. Useful if products were physically used and records should be preserved.
                          </div>
                        </div>
                      </div>
                    </button>
                  ) : (
                    <div className="w-full p-4 rounded-2xl border-2 border-zinc-100 bg-zinc-50 opacity-60">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-200 flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgb(161, 161, 170)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-zinc-500 mb-1">Delete & Keep Product Data</div>
                          <div className="text-xs text-zinc-400">
                            You don't have permission to delete while keeping inventory changes. Contact your administrator.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* No permissions warning */}
                  {!canDeleteKeepInventory && !canDeleteRevertInventory && (
                    <div className="mt-4 p-4 rounded-2xl bg-amber-50 ring-1 ring-amber-200">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 text-amber-500">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                            <path d="M12 9v4" />
                            <path d="M12 17h.01" />
                          </svg>
                        </div>
                        <div className="text-sm text-amber-800">
                          <strong>Missing Permissions:</strong> You don't have permission to delete work orders with inventory impact. Please contact your administrator to request the appropriate permissions.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Loading indicator */}
              {deleteLoading && (
                <div className="mb-4 p-3 rounded-xl bg-zinc-100 flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-zinc-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm text-zinc-600">Processing deletion...</span>
                </div>
              )}

              {/* Cancel Button */}
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
                className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Simple Delete Confirmation Dialog (No Inventory Impact) */}
      {showSimpleDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 bg-gradient-to-r from-zinc-600 to-zinc-700">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" />
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    Delete Work Order
                  </h2>
                  <p className="text-sm text-white/80">
                    This action cannot be undone
                  </p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-sm text-zinc-600 mb-6">
                Are you sure you want to delete this work order? This will permanently remove all associated data including assignments, activity logs, and any pending product submissions.
              </p>

              {/* Loading indicator */}
              {deleteLoading && (
                <div className="mb-4 p-3 rounded-xl bg-zinc-100 flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-zinc-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm text-zinc-600">Deleting work order...</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSimpleDeleteConfirm(false)}
                  disabled={deleteLoading}
                  className="flex-1 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await performDelete(false);
                    setShowSimpleDeleteConfirm(false);
                  }}
                  disabled={deleteLoading}
                  className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-all disabled:opacity-50"
                >
                  {deleteLoading ? "Deleting..." : "Delete Work Order"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </PermissionGuard>
  );
}

function WorkflowTab({ workOrder }: { workOrder: WorkOrderDetail }) {
  return (
    <div className="space-y-6">
      {/* Workflow State */}
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Workflow State</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200">
            <span className="text-sm font-medium text-zinc-700">Current Status</span>
            <span className="text-sm font-semibold text-zinc-900">{workOrder.status}</span>
          </div>
          <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200">
            <span className="text-sm font-medium text-zinc-700">Created At</span>
            <span className="text-sm text-zinc-900">
              {new Date(workOrder.createdAt).toLocaleString()}
            </span>
          </div>
          {workOrder.startedAt && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200">
              <span className="text-sm font-medium text-zinc-700">Started At</span>
              <span className="text-sm text-zinc-900">
                {new Date(workOrder.startedAt).toLocaleString()}
              </span>
            </div>
          )}
          {workOrder.completedAt && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 ring-1 ring-zinc-200">
              <span className="text-sm font-medium text-zinc-700">Completed At</span>
              <span className="text-sm text-zinc-900">
                {new Date(workOrder.completedAt).toLocaleString()}
              </span>
            </div>
          )}
          {workOrder.canceledAt && (
            <div className="flex items-center justify-between p-3 rounded-2xl bg-red-50 ring-1 ring-red-200">
              <span className="text-sm font-medium text-red-700">Canceled At</span>
              <span className="text-sm text-red-900">
                {new Date(workOrder.canceledAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">
          Notifications ({workOrder.notifications?.length || 0})
        </h2>
        {!workOrder.notifications || workOrder.notifications.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 p-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
            No notifications created. Work order was not assigned to any employees automatically.
          </div>
        ) : (
          <div className="space-y-2">
            {workOrder.notifications.map((notif) => (
              <div
                key={notif.id}
                className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">
                      {notif.employee.firstName} {notif.employee.lastName}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">{notif.employee.email}</div>
                    <div className="mt-2 text-xs text-zinc-400">
                      Notification created: {new Date(notif.createdAt).toLocaleString()}
                    </div>
                    {notif.notifiedAt && (
                      <div className="mt-1 text-xs text-emerald-600">
                        ✓ Notified: {new Date(notif.notifiedAt).toLocaleString()}
                      </div>
                    )}
                    {notif.readAt && (
                      <div className="mt-1 text-xs text-blue-600">
                        ✓ Read: {new Date(notif.readAt).toLocaleString()}
                      </div>
                    )}
                    {!notif.readAt && (
                      <div className="mt-1 text-xs text-amber-600">⚠ Not read yet</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {notif.notifiedAt ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                        Notified
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                        Pending
                      </span>
                    )}
                    {notif.readAt ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-blue-200">
                        Read
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-800 ring-1 ring-zinc-200">
                        Unread
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assignments */}
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">
          Assignments ({workOrder.assignments?.length || 0})
        </h2>
        {!workOrder.assignments || workOrder.assignments.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 p-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
            No employees assigned yet. Head of Technical Department should assign employees in workspace.
          </div>
        ) : (
          <div className="space-y-2">
            {workOrder.assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm font-semibold text-zinc-900">
                      {assignment.employee.firstName} {assignment.employee.lastName}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {assignment.employee.email} • {assignment.employee.employeeId}
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">
                      Assigned: {new Date(assignment.assignedAt).toLocaleString()}
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800 ring-1 ring-purple-200">
                    Assigned
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Parent Work Order */}
      {workOrder.parentWorkOrder && (
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">Parent Work Order</h2>
          <Link
            href={`/app/work-orders/${workOrder.parentWorkOrder.workOrderNumber}`}
            className="block rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
          >
            <div className="text-sm font-semibold text-zinc-900">
              {workOrder.parentWorkOrder.title}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {workOrder.parentWorkOrder.type} • {workOrder.parentWorkOrder.status}
            </div>
          </Link>
        </div>
      )}

      {/* Child Work Orders */}
      {workOrder.childWorkOrders && workOrder.childWorkOrders.length > 0 && (
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">
            Sub-Orders ({workOrder.childWorkOrders.length})
          </h2>
          <div className="space-y-2">
            {workOrder.childWorkOrders.map((child) => (
              <Link
                key={child.id}
                href={`/app/work-orders/${child.workOrderNumber}`}
                className="block rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
              >
                <div className="text-sm font-semibold text-zinc-900">{child.title}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {child.type} • {child.status} • {new Date(child.createdAt).toLocaleDateString()}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Workflow Summary */}
      <div className="rounded-3xl bg-blue-50 p-6 shadow-sm ring-1 ring-blue-200">
        <h2 className="text-lg font-semibold text-blue-900 mb-4">Workflow Summary</h2>
        <div className="space-y-2 text-sm text-blue-800">
          <div>
            <span className="font-medium">Step 1 (Creation):</span> Work order created →{" "}
            {workOrder.notifications?.length || 0} employee(s) notified (Head of Technical
            Department)
          </div>
          <div>
            <span className="font-medium">Step 2 (Assignment):</span> Head assigns employees →{" "}
            {workOrder.assignments?.length || 0} employee(s) assigned
          </div>
          {workOrder.assignments && workOrder.assignments.length > 0 && (
            <div>
              <span className="font-medium">Step 3 (Work):</span> Assigned employees see task in
              workspace → Status: {workOrder.status}
            </div>
          )}
          {workOrder.childWorkOrders && workOrder.childWorkOrders.length > 0 && (
            <div>
              <span className="font-medium">Step 4 (Sub-Orders):</span> {workOrder.childWorkOrders.length}{" "}
              sub-order(s) created from this work order
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
