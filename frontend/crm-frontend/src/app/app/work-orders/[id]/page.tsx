"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPatch, apiDelete, apiPost, ApiError } from "@/lib/api";
import EditWorkOrderModal from "./edit-work-order-modal";
import ProductUsageSection from "./product-usage-section";
import DeactivatedDevicesSection from "./deactivated-devices-section";
import ActivityTimeline from "./activity-timeline";
import { useI18n } from "@/hooks/useI18n";

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
    | "CANCELED"
    | "NEW"
    | "DISPATCHED"
    | "ACCEPTED"
    | "DONE"; // Legacy
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

function getStatusBadge(status: WorkOrderDetail["status"]) {
  const styles: Record<string, string> = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    LINKED_TO_GROUP: "bg-amber-50 text-amber-700 ring-amber-200",
    IN_PROGRESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    COMPLETED: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    CANCELED: "bg-red-50 text-red-700 ring-red-200",
    // Legacy
    NEW: "bg-blue-50 text-blue-700 ring-blue-200",
    DISPATCHED: "bg-amber-50 text-amber-700 ring-amber-200",
    ACCEPTED: "bg-purple-50 text-purple-700 ring-purple-200",
    DONE: "bg-zinc-50 text-zinc-700 ring-zinc-200",
  };
  return styles[status] || "bg-zinc-50 text-zinc-700 ring-zinc-200";
}

function getStatusLabel(status: WorkOrderDetail["status"], t: (key: string, fallback?: string) => string) {
  const labels: Record<string, string> = {
    CREATED: t("workOrders.statuses.CREATED", "Created"),
    LINKED_TO_GROUP: t("workOrders.statuses.LINKED_TO_GROUP", "Linked To a Group"),
    IN_PROGRESS: t("workOrders.statuses.IN_PROGRESS", "In Progress"),
    COMPLETED: t("workOrders.statuses.COMPLETED", "Completed"),
    CANCELED: t("workOrders.statuses.CANCELED", "Canceled"),
    // Legacy
    NEW: "New",
    DISPATCHED: "Dispatched",
    ACCEPTED: "Accepted",
    DONE: "Done",
  };
  return labels[status] || status;
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
    <div>
      <div className="text-xs font-medium text-zinc-600">{label}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-900">{value || "—"}</div>
    </div>
  );
}

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
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
  const [inventoryImpact, setInventoryImpact] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Fetch current user info
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const res = await fetch("http://localhost:3000/auth/me", {
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
      const impact = await apiGet(`/v1/work-orders/${id}/inventory-impact`);
      setInventoryImpact(impact);
      
      if (impact.hasImpact) {
        // Show confirmation dialog with options
        setShowDeleteConfirm(true);
      } else {
        // No impact, simple confirmation
        if (confirm("Are you sure you want to delete this work order?")) {
          await performDelete(false);
        }
      }
    } catch (err) {
      // If check fails, proceed with simple confirmation
      if (confirm("Are you sure you want to delete this work order?")) {
        await performDelete(false);
      }
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
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-zinc-200">
            <div className="text-sm text-zinc-600">Loading work order...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !workOrder) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-red-50 p-6 ring-1 ring-red-200">
            <div className="text-sm font-semibold text-red-900">Error loading work order</div>
            <div className="mt-1 text-sm text-red-700">{error || "Work order not found"}</div>
            <Link
              href="/app/work-orders"
              className="mt-3 inline-block rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Back to Work Orders
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/app/work-orders"
            className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <span>←</span>
            <span>Work Orders</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Work Order
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              {workOrder.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Created {new Date(workOrder.createdAt).toLocaleString()}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {!isTechnicalEmployee && (
              <>
                <button
                  type="button"
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                  onClick={() => setShowEditModal(true)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
                  onClick={handleDelete}
                >
                  Delete
                </button>
              </>
            )}
            {isTechnicalEmployee && (
              <div className="text-sm text-zinc-600 italic">
                Work orders are read-only. Manage tasks in your workspace.
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-zinc-200">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("details")}
              className={`px-4 py-2 text-sm font-semibold transition ${
                activeTab === "details"
                  ? "border-b-2 border-emerald-600 text-emerald-900"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Details
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("timeline")}
              className={`px-4 py-2 text-sm font-semibold transition ${
                activeTab === "timeline"
                  ? "border-b-2 border-emerald-600 text-emerald-900"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Timeline
            </button>
            {currentUser?.isSuperAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab("workflow")}
                className={`px-4 py-2 text-sm font-semibold transition ${
                  activeTab === "workflow"
                    ? "border-b-2 border-emerald-600 text-emerald-900"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Workflow (Debug)
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
          <div className="lg:col-span-2 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
            <div className="flex items-center justify-between gap-3 mb-6">
              <h2 className="text-lg font-semibold text-zinc-900">Details</h2>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(
                  workOrder.status
                )}`}
              >
                {getStatusLabel(workOrder.status, t)}
              </span>
            </div>

            <div className="space-y-4">
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
                value={getStatusLabel(workOrder.status, t)}
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
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Building</h2>
              <Link
                href={`/app/buildings/${workOrder.building.coreId}`}
                className="group block rounded-2xl bg-white p-3 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-900 group-hover:underline">
                      {workOrder.building.name}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      #{workOrder.building.coreId}
                    </div>
                    {workOrder.building.address && (
                      <div className="mt-1 text-xs text-zinc-600">{workOrder.building.address}</div>
                    )}
                  </div>
                  <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </div>
              </Link>
            </div>

            {/* Devices */}
            {(workOrder.workOrderAssets && workOrder.workOrderAssets.length > 0) || workOrder.asset ? (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                  {t("workOrders.fields.devices", "Devices")}
                </h2>
                <div className="space-y-2">
                  {workOrder.workOrderAssets && workOrder.workOrderAssets.length > 0
                    ? workOrder.workOrderAssets.map((wa) => (
                        <div key={wa.asset.coreId} className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                          <div className="text-sm font-semibold text-zinc-900">{wa.asset.name}</div>
                          <div className="mt-1 text-xs text-zinc-600">
                            Type: {wa.asset.type} • Status: {wa.asset.status}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">#{wa.asset.coreId}</div>
                        </div>
                      ))
                    : workOrder.asset && (
                        <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                          <div className="text-sm font-semibold text-zinc-900">{workOrder.asset.name}</div>
                          <div className="mt-1 text-xs text-zinc-600">
                            Type: {workOrder.asset.type} • Status: {workOrder.asset.status}
                          </div>
                          <div className="mt-1 text-xs text-zinc-500">#{workOrder.asset.coreId}</div>
                        </div>
                      )}
                </div>
              </div>
            ) : null}

            {/* Assigned Employees */}
            {workOrder.assignments && workOrder.assignments.length > 0 && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">Assigned Employees</h2>
                <div className="space-y-2">
                  {workOrder.assignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                      <div className="text-sm font-semibold text-zinc-900">
                        {assignment.employee.firstName} {assignment.employee.lastName}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {assignment.employee.email} • {assignment.employee.employeeId}
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
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">Comments</h2>
                <div className="space-y-3">
                  {workOrder.techEmployeeComment && (
                    <div>
                      <div className="text-xs font-medium text-zinc-600">Technical Employee Comment</div>
                      <div className="mt-1 text-sm text-zinc-900">{workOrder.techEmployeeComment}</div>
                    </div>
                  )}
                  {workOrder.techHeadComment && (
                    <div>
                      <div className="text-xs font-medium text-zinc-600">Head of Technical Comment</div>
                      <div className="mt-1 text-sm text-zinc-900">{workOrder.techHeadComment}</div>
                    </div>
                  )}
                  {workOrder.cancelReason && (
                    <div>
                      <div className="text-xs font-medium text-red-600">Cancel Reason</div>
                      <div className="mt-1 text-sm text-red-900">{workOrder.cancelReason}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sub-Orders */}
            {workOrder.childWorkOrders && workOrder.childWorkOrders.length > 0 && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">Sub-Orders</h2>
                <div className="space-y-2">
                  {workOrder.childWorkOrders.map((child) => (
                    <Link
                      key={child.id}
                      href={`/app/work-orders/${child.workOrderNumber}`}
                      className="block rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
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
          </div>

          {/* Product Usage Section - Only for INSTALLATION and REPAIR_CHANGE - Hidden for technical employees */}
          {!isTechnicalEmployee && (workOrder.type === "INSTALLATION" || workOrder.type === "REPAIR_CHANGE") && (
            <ProductUsageSection
              workOrderId={workOrder.workOrderNumber?.toString() || workOrder.id}
              workOrderType={workOrder.type}
              workOrderStatus={workOrder.status}
              existingUsages={workOrder.productUsages}
              isAssignedEmployee={isAssignedEmployee || false}
              isHeadOfTechnical={isHeadOfTechnical || false}
              onUpdate={() => window.location.reload()}
            />
          )}

          {/* Deactivated Devices Section - Only for DEACTIVATE - Hidden for technical employees */}
          {!isTechnicalEmployee && workOrder.type === "DEACTIVATE" && (
            <DeactivatedDevicesSection
              workOrderId={workOrder.workOrderNumber?.toString() || workOrder.id}
              workOrderStatus={workOrder.status}
              existingDevices={workOrder.deactivatedDevices}
              isAssignedEmployee={isAssignedEmployee || false}
              isHeadOfTechnical={isHeadOfTechnical || false}
              onUpdate={() => window.location.reload()}
            />
          )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-xl ring-1 ring-zinc-200">
            <h2 className="text-xl font-semibold text-zinc-900 mb-2">
              Delete Work Order with Inventory Impact
            </h2>
            <p className="text-sm text-zinc-600 mb-4">
              This work order has already made changes to inventory stocks:
            </p>

            {inventoryImpact.approvedProductUsages > 0 && (
              <div className="mb-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <div className="text-sm font-semibold text-amber-900 mb-2">
                  Products Deducted ({inventoryImpact.approvedProductUsages}):
                </div>
                <ul className="space-y-1 text-xs text-amber-800">
                  {inventoryImpact.productUsages?.map((pu: any, idx: number) => (
                    <li key={idx}>
                      • {pu.productName}: {pu.quantity} units
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {inventoryImpact.transferredDevices > 0 && (
              <div className="mb-4 rounded-2xl bg-blue-50 p-4 ring-1 ring-blue-200">
                <div className="text-sm font-semibold text-blue-900 mb-2">
                  Devices Transferred to Stock ({inventoryImpact.transferredDevices}):
                </div>
                <ul className="space-y-1 text-xs text-blue-800">
                  {inventoryImpact.deactivatedDevices?.map((dd: any, idx: number) => (
                    <li key={idx}>
                      • {dd.productName}: {dd.quantity} units
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mb-6 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
              <p className="text-sm font-semibold text-zinc-900 mb-2">Choose an option:</p>
              <div className="space-y-2 text-xs text-zinc-700">
                <div>
                  <strong>1. Delete and Revert Inventory:</strong> Restore all products to stock
                  (reverse deductions and remove transferred devices), then delete the work order.
                </div>
                <div>
                  <strong>2. Delete and Keep Changes:</strong> Delete the work order record but
                  leave inventory changes as-is.
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
                className="flex-1 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => performDelete(false)}
                disabled={deleteLoading}
                className="flex-1 rounded-2xl bg-zinc-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-zinc-700 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Delete & Keep Changes"}
              </button>
              <button
                type="button"
                onClick={() => performDelete(true)}
                disabled={deleteLoading}
                className="flex-1 rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Reverting..." : "Delete & Revert Inventory"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
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
