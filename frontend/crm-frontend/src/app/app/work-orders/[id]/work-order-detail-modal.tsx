"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiDelete } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { usePermissions } from "@/lib/use-permissions";
import ActivityTimeline from "./activity-timeline";
import StagesMonitoring from "./stages-monitoring";
import EditWorkOrderModal from "./edit-work-order-modal";

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
    | "REPAIR";
  status:
    | "CREATED"
    | "LINKED_TO_GROUP"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELED"
    | "NEW"
    | "DISPATCHED"
    | "ACCEPTED"
    | "DONE";
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

type Props = {
  open: boolean;
  onClose: () => void;
  workOrderId: string;
  onUpdate?: () => void;
};

function getTypeLabel(type: string, t: (key: string, fallback?: string) => string): string {
  const labels: Record<string, string> = {
    INSTALLATION: t("workOrders.types.INSTALLATION", "Installation"),
    DIAGNOSTIC: t("workOrders.types.DIAGNOSTIC", "Diagnostic"),
    RESEARCH: t("workOrders.types.RESEARCH", "Research"),
    DEACTIVATE: t("workOrders.types.DEACTIVATE", "Deactivate"),
    REPAIR_CHANGE: t("workOrders.types.REPAIR_CHANGE", "Repair/Change"),
    ACTIVATE: t("workOrders.types.ACTIVATE", "Activate"),
    INSTALL: "Install",
    REPAIR: "Repair",
  };
  return labels[type] || type;
}

function getStatusLabel(status: string, t: (key: string, fallback?: string) => string): string {
  const labels: Record<string, string> = {
    CREATED: t("workOrders.statuses.CREATED", "Created"),
    LINKED_TO_GROUP: t("workOrders.statuses.LINKED_TO_GROUP", "Linked To a Group"),
    IN_PROGRESS: t("workOrders.statuses.IN_PROGRESS", "In Progress"),
    COMPLETED: t("workOrders.statuses.COMPLETED", "Completed"),
    CANCELED: t("workOrders.statuses.CANCELED", "Canceled"),
    NEW: "New",
    DISPATCHED: "Dispatched",
    ACCEPTED: "Accepted",
    DONE: "Done",
  };
  return labels[status] || status;
}

function InfoCard({ label, value, icon }: { label: string; value: string | null | undefined; icon?: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-zinc-900">{value || "—"}</div>
    </div>
  );
}

function getCurrentStage(wo: WorkOrderDetail | null): number {
  if (!wo) return 1;
  
  if (wo.status === "COMPLETED" || wo.status === "CANCELED") {
    return 5;
  }
  
  if (wo.status === "IN_PROGRESS" && wo.techEmployeeComment) {
    return 4;
  }
  
  if (wo.status === "IN_PROGRESS" && wo.startedAt) {
    return 3;
  }
  
  if (wo.assignments && wo.assignments.length > 0) {
    return 2;
  }
  
  return 1;
}

export default function WorkOrderDetailModal({ open, onClose, workOrderId, onUpdate }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const [mounted, setMounted] = useState(false);
  const [workOrder, setWorkOrder] = useState<WorkOrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [activeInfoTab, setActiveInfoTab] = useState<"general" | "activity" | "workflow">("general");
  const [showEditModal, setShowEditModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ isSuperAdmin?: boolean; email?: string } | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showSimpleDeleteConfirm, setShowSimpleDeleteConfirm] = useState(false);
  const [inventoryImpact, setInventoryImpact] = useState<any>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Fetch current user and employee info
  useEffect(() => {
    let cancelled = false;
    async function fetchCurrentUser() {
      try {
        const data = await apiGet<any>("/auth/me");
        const userData = data?.user || data;
        if (!cancelled) {
          setCurrentUser({ 
            isSuperAdmin: userData?.isSuperAdmin ?? false,
            email: userData?.email
          });
          // Try to get employee info
          if (userData?.email) {
            try {
              const empData = await apiGet<any[]>(`/v1/employees?search=${userData.email}`);
              if (Array.isArray(empData) && empData.length > 0) {
                setCurrentEmployee(empData[0]);
              }
            } catch {
              // Ignore employee fetch errors
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch current user:", err);
      }
    }
    fetchCurrentUser();
    return () => {
      cancelled = true;
    };
  }, []);
  
  // Permission checks - superadmin always has access
  const canEdit = currentUser?.isSuperAdmin || hasPermission("work_orders.update");
  const canDelete = currentUser?.isSuperAdmin || hasPermission("work_orders.delete");
  // New granular delete permissions for inventory control
  const canDeleteKeepInventory = currentUser?.isSuperAdmin || hasPermission("work_orders.delete_keep_inventory");
  const canDeleteRevertInventory = currentUser?.isSuperAdmin || hasPermission("work_orders.delete_revert_inventory");
  // User can delete if they have basic delete OR any of the granular delete permissions
  const canDeleteAny = canDelete || canDeleteKeepInventory || canDeleteRevertInventory;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setIsOpening(true);
      setTimeout(() => setIsOpening(false), 300);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !workOrderId || isDeleting) return;

    let cancelled = false;

    async function fetchWorkOrder() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiGet<WorkOrderDetail>(`/v1/work-orders/${workOrderId}`);
        if (!cancelled) {
          setWorkOrder(data);
        }
      } catch (err: any) {
        if (!cancelled && !isDeleting) {
          setError(err.message || "Failed to load work order");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchWorkOrder();

    return () => {
      cancelled = true;
    };
  }, [open, workOrderId, isDeleting]);

  function handleClose() {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.delete("workOrder");
      const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}` 
        : window.location.pathname;
      router.push(newUrl);
    }, 300);
  }

  async function handleDelete() {
    if (!workOrder) return;
    
    try {
      // Check inventory impact first
      const impact = await apiGet(`/v1/work-orders/${workOrder.id}/inventory-impact`);
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
    if (!workOrder) return;
    
    try {
      setDeleteLoading(true);
      setIsDeleting(true);
      const url = revertInventory 
        ? `/v1/work-orders/${workOrder.id}?revertInventory=true`
        : `/v1/work-orders/${workOrder.id}`;
      
      await apiDelete(url);
      // Clear work order immediately to prevent error from showing
      setWorkOrder(null);
      setError(null);
      setLoading(false);
      setShowDeleteConfirm(false);
      setShowSimpleDeleteConfirm(false);
      // Close immediately and navigate away
      setIsClosing(true);
      const params = new URLSearchParams(searchParams?.toString() || "");
      params.delete("workOrder");
      const newUrl = params.toString() 
        ? `${window.location.pathname}?${params.toString()}` 
        : window.location.pathname;
      router.push(newUrl);
      setTimeout(() => {
        setIsClosing(false);
        setIsDeleting(false);
        setDeleteLoading(false);
        onClose();
        if (onUpdate) onUpdate();
      }, 300);
    } catch (err: any) {
      setIsDeleting(false);
      setDeleteLoading(false);
      alert(err.message || "Failed to delete work order");
    }
  }

  function handleEditSuccess() {
    if (workOrderId) {
      apiGet<WorkOrderDetail>(`/v1/work-orders/${workOrderId}`).then(setWorkOrder).catch(console.error);
    }
    if (onUpdate) onUpdate();
  }

  const currentStage = useMemo(() => getCurrentStage(workOrder), [workOrder]);
  
  // Check if user is technical employee (for sensitive data visibility)
  const isTechnicalEmployee = useMemo(() => {
    const posCode = currentEmployee?.position?.code?.toLowerCase() || "";
    const posName = currentEmployee?.position?.name?.toLowerCase() || "";
    return posCode.includes("technical") || posName.includes("technical");
  }, [currentEmployee?.position]);
  
  // Check if user can view sensitive data (amounts)
  const canViewSensitiveData = currentUser?.isSuperAdmin || hasPermission("work_orders.view_sensitive") || !isTechnicalEmployee;

  if (!mounted || !open) return null;

  const modalContent = (
    <div
      className={`fixed inset-0 z-[9999] flex items-end lg:items-center justify-end lg:justify-start bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <div className="relative w-full lg:w-[calc(100%-148px)] lg:ml-[148px] h-full">
        <div
          className={`relative w-full h-full bg-white shadow-2xl flex flex-col transition-transform duration-300 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none lg:rounded-br-none ${
            isClosing ? "translate-y-full lg:translate-y-0 lg:translate-x-full" : isOpening ? "translate-y-full lg:translate-y-0 lg:translate-x-full" : "translate-y-0"
          }`}
          onClick={(e) => e.stopPropagation()}
          style={{ maxHeight: "100vh" }}
        >
          {/* Close button - integrated into popup, top left corner */}
          <button
            onClick={handleClose}
            className="absolute -left-12 top-6 z-[10000] h-12 w-12 bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
            aria-label="Close"
            style={{ 
              borderRadius: "9999px 0 0 9999px",
              clipPath: "inset(0 0 0 0 round 9999px 0 0 9999px)"
            }}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        {/* Header */}
        <div className="flex-shrink-0 border-b border-zinc-200 bg-white px-6 py-4 rounded-t-3xl lg:rounded-tl-3xl lg:rounded-tr-none">
          <div className="flex items-center gap-4 mb-3">
            <h2 className="text-xl font-semibold text-zinc-900">{workOrder?.title || "Work Order"}</h2>
            {workOrder?.workOrderNumber && (
              <span className="px-3 py-1 bg-zinc-100 text-zinc-700 rounded-full text-xs font-semibold">
                #{workOrder.workOrderNumber}
              </span>
            )}
            {workOrder && (
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                workOrder.status === "COMPLETED" ? "bg-green-100 text-green-700" :
                workOrder.status === "CANCELED" ? "bg-red-100 text-red-700" :
                workOrder.status === "IN_PROGRESS" ? "bg-emerald-100 text-emerald-700" :
                "bg-zinc-100 text-zinc-700"
              }`}>
                {getStatusLabel(workOrder.status, t)}
              </span>
            )}
          </div>
          
          {/* Progress Bar - Minimized */}
          {workOrder && (
            <div className="mb-3">
              <div className="flex items-center justify-center gap-1 sm:gap-2">
                {[1, 2, 3, 4, 5].map((stage) => {
                  const isActive = currentStage === stage;
                  const isCompleted = currentStage > stage;
                  const stageNames = [
                    t("workOrders.stages.created", "Created"),
                    t("workOrders.stages.techniciansAssigned", "Technicians Assigned"),
                    t("workOrders.stages.working", "Working"),
                    t("workOrders.stages.waitingForApproval", "Waiting For Approval"),
                    t("workOrders.stages.completedOrCanceled", "Completed or Canceled"),
                  ];

                  return (
                    <React.Fragment key={stage}>
                      <div className="flex flex-col items-center">
                        <div
                          className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                            isCompleted
                              ? "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white"
                              : isActive
                              ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white scale-110"
                              : "bg-zinc-200 text-zinc-600"
                          }`}
                        >
                          {isCompleted ? (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            stage
                          )}
                        </div>
                        <span className={`text-[9px] font-medium mt-0.5 whitespace-nowrap ${
                          isActive ? "text-blue-600" : isCompleted ? "text-emerald-600" : "text-zinc-400"
                        }`}>
                          {stageNames[stage - 1]}
                        </span>
                      </div>
                      {stage < 5 && (
                        <div
                          className={`h-0.5 w-6 sm:w-8 transition-all ${
                            isCompleted
                              ? "bg-gradient-to-r from-emerald-500 to-emerald-600"
                              : isActive
                              ? "bg-gradient-to-r from-blue-500 to-blue-600"
                              : "bg-zinc-200"
                          }`}
                        />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit and Delete buttons */}
          {(canEdit || canDeleteAny) && (
            <div className="flex items-center gap-2 justify-end">
              {canEdit && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 hover:ring-zinc-300 transition-all shadow-sm"
                  aria-label="Edit"
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
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 hover:ring-red-300 transition-all shadow-sm"
                  aria-label="Delete"
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
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Left Panel - Details */}
          <div className="flex-1 md:w-[70%] overflow-y-auto border-r border-zinc-200">
            {/* Tabs - Moved outside and on top of description div */}
            <div className="sticky top-0 z-20 bg-white border-b border-zinc-200">
              <div className="px-6 flex items-end gap-1 overflow-x-auto">
                <button
                  onClick={() => setActiveInfoTab("general")}
                  className={`relative px-4 py-3 text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                    activeInfoTab === "general"
                      ? "text-zinc-900 font-semibold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  General
                  {activeInfoTab === "general" && (
                    <>
                      {/* Wave overlay connecting tab to content */}
                      <div 
                        className="absolute bottom-0 left-0 right-0 h-8 bg-emerald-50/30 pointer-events-none"
                        style={{
                          clipPath: "polygon(0% 100%, 0% 60%, 20% 50%, 40% 60%, 50% 50%, 60% 60%, 80% 50%, 100% 60%, 100% 100%)",
                        }}
                      />
                    </>
                  )}
                </button>
                <button
                  onClick={() => setActiveInfoTab("activity")}
                  className={`relative px-4 py-3 text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                    activeInfoTab === "activity"
                      ? "text-zinc-900 font-semibold"
                      : "text-zinc-600 hover:text-zinc-900"
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Activity
                  {activeInfoTab === "activity" && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 h-8 bg-emerald-50/30 pointer-events-none"
                      style={{
                        clipPath: "polygon(0% 100%, 0% 60%, 20% 50%, 40% 60%, 50% 50%, 60% 60%, 80% 50%, 100% 60%, 100% 100%)",
                      }}
                    />
                  )}
                </button>
                {currentUser?.isSuperAdmin && (
                  <button
                    onClick={() => setActiveInfoTab("workflow")}
                    className={`relative px-4 py-3 text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                      activeInfoTab === "workflow"
                        ? "text-zinc-900 font-semibold"
                        : "text-zinc-600 hover:text-zinc-900"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Workflow (Debug)
                    {activeInfoTab === "workflow" && (
                      <div 
                        className="absolute bottom-0 left-0 right-0 h-8 bg-emerald-50/30 pointer-events-none"
                        style={{
                          clipPath: "polygon(0% 100%, 0% 60%, 20% 50%, 40% 60%, 50% 50%, 60% 60%, 80% 50%, 100% 60%, 100% 100%)",
                        }}
                      />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Tab Content with light green overlay - description div */}
            <div className="relative p-6 bg-emerald-50/30 min-h-full">
              {/* Wave connection from selected tab to content */}
              {activeInfoTab && (
                <div 
                  className="absolute top-0 left-0 right-0 h-12 bg-emerald-50/30 pointer-events-none z-0"
                  style={{
                    clipPath: "polygon(0% 100%, 0% 80%, 10% 75%, 20% 80%, 30% 75%, 40% 80%, 50% 75%, 60% 80%, 70% 75%, 80% 80%, 90% 75%, 100% 80%, 100% 100%)",
                  }}
                />
              )}
              <div className="relative z-10">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-sm text-zinc-600">Loading work order...</div>
                </div>
              ) : error || !workOrder ? (
                <div className="rounded-xl bg-red-50 p-4 border border-red-200">
                  <div className="text-sm font-semibold text-red-900">Error loading work order</div>
                  <div className="mt-1 text-sm text-red-700">{error || "Work order not found"}</div>
                </div>
              ) : activeInfoTab === "general" ? (
                <div className="space-y-6">
                  {/* Work Order Information Card */}
                  <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                    <h2 className="text-lg font-semibold text-zinc-900 mb-4">📋 Work Order Information</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoCard label={t("workOrders.fields.type", "Type")} value={getTypeLabel(workOrder.type, t)} icon="📝" />
                      <InfoCard label={t("workOrders.fields.title", "Title")} value={workOrder.title} icon="📄" />
                      {workOrder.contactNumber && (
                        <InfoCard label={t("workOrders.fields.contactNumber", "Contact Number")} value={workOrder.contactNumber} icon="📞" />
                      )}
                      {workOrder.deadline && (
                        <InfoCard 
                          label={t("workOrders.fields.deadline", "Deadline")} 
                          value={new Date(workOrder.deadline).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })} 
                          icon="📅" 
                        />
                      )}
                      {workOrder.amountGel && canViewSensitiveData && (
                        <InfoCard label={t("workOrders.fields.amountGel", "Amount (GEL)")} value={`${workOrder.amountGel} GEL`} icon="💰" />
                      )}
                      <InfoCard label="Created" value={new Date(workOrder.createdAt).toLocaleString()} icon="🕐" />
                      {workOrder.startedAt && (
                        <InfoCard label="Started" value={new Date(workOrder.startedAt).toLocaleString()} icon="▶️" />
                      )}
                      {workOrder.completedAt && (
                        <InfoCard label="Completed" value={new Date(workOrder.completedAt).toLocaleString()} icon="✅" />
                      )}
                    </div>
                    {(workOrder.description || workOrder.notes) && (
                      <div className="mt-4">
                        <div className="text-xs font-medium text-zinc-500 mb-1">📝 Description</div>
                        <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">
                          {workOrder.description || workOrder.notes}
                        </div>
                      </div>
                    )}
                  </div>


                  {/* Assigned Employees */}
                  {workOrder.assignments && workOrder.assignments.length > 0 && (
                    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                      <h2 className="text-lg font-semibold text-zinc-900 mb-4">👥 Team</h2>
                      <div className="space-y-2">
                        {workOrder.assignments.map((assignment) => (
                          <div
                            key={assignment.id}
                            className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                          >
                            <div className="text-sm font-semibold text-zinc-900">
                              {assignment.employee.firstName} {assignment.employee.lastName}
                            </div>
                            <div className="mt-1 text-xs text-zinc-500">
                              {assignment.employee.employeeId}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comments */}
                  {(workOrder.techEmployeeComment || workOrder.techHeadComment || workOrder.cancelReason) && (
                    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                      <h2 className="text-lg font-semibold text-zinc-900 mb-4">💬 Comments</h2>
                      <div className="space-y-3">
                        {workOrder.techEmployeeComment && (
                          <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                            <div className="text-xs font-medium text-zinc-600 mb-1">Technical Employee Comment</div>
                            <div className="text-sm text-zinc-800">{workOrder.techEmployeeComment}</div>
                          </div>
                        )}
                        {workOrder.techHeadComment && (
                          <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                            <div className="text-xs font-medium text-zinc-600 mb-1">Head of Technical Comment</div>
                            <div className="text-sm text-zinc-800">{workOrder.techHeadComment}</div>
                          </div>
                        )}
                        {workOrder.cancelReason && (
                          <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                            <div className="text-xs font-medium text-red-600 mb-1">Cancel Reason</div>
                            <div className="text-sm text-red-800">{workOrder.cancelReason}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : activeInfoTab === "activity" ? (
                <ActivityTimeline workOrderId={workOrder.workOrderNumber?.toString() || workOrder.id} />
              ) : activeInfoTab === "workflow" && currentUser?.isSuperAdmin ? (
                <div className="space-y-4">
                  <div className="rounded-xl bg-gradient-to-br from-amber-50 via-white to-amber-50 border-2 border-amber-200 shadow-sm p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md">
                        <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <h3 className="text-base font-bold text-zinc-900">Workflow Debug Information</h3>
                      <span className="ml-auto px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
                        Admin Only
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-white/80 rounded-lg border border-amber-100 p-4">
                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Work Order ID</div>
                        <div className="text-sm font-mono text-zinc-900">{workOrder.id}</div>
                      </div>
                      <div className="bg-white/80 rounded-lg border border-amber-100 p-4">
                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Work Order Number</div>
                        <div className="text-sm font-mono text-zinc-900">#{workOrder.workOrderNumber}</div>
                      </div>
                      <div className="bg-white/80 rounded-lg border border-amber-100 p-4">
                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Current Status</div>
                        <div className="text-sm font-mono text-zinc-900">{workOrder.status}</div>
                      </div>
                      <div className="bg-white/80 rounded-lg border border-amber-100 p-4">
                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Type</div>
                        <div className="text-sm font-mono text-zinc-900">{workOrder.type}</div>
                      </div>
                      <div className="bg-white/80 rounded-lg border border-amber-100 p-4">
                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Assignments</div>
                        <div className="text-sm font-mono text-zinc-900">
                          {workOrder.assignments?.length || 0} employee(s) assigned
                        </div>
                        {workOrder.assignments && workOrder.assignments.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {workOrder.assignments.map((a: any) => (
                              <div key={a.id} className="text-xs text-zinc-600">
                                • {a.employee?.firstName} {a.employee?.lastName} ({a.employee?.position?.name || 'No position'})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="bg-white/80 rounded-lg border border-amber-100 p-4">
                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Products</div>
                        <div className="text-sm font-mono text-zinc-900">
                          {workOrder.productUsages?.length || 0} product(s) attached
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          Approved: {workOrder.productUsages?.filter((p: any) => p.isApproved).length || 0}
                        </div>
                      </div>
                      <div className="bg-white/80 rounded-lg border border-amber-100 p-4">
                        <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Created / Updated</div>
                        <div className="text-sm font-mono text-zinc-900">
                          {new Date(workOrder.createdAt).toLocaleString()}
                        </div>
                        <div className="text-xs text-zinc-500 mt-1">
                          Updated: {new Date(workOrder.updatedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
              </div>
            </div>
          </div>

          {/* Right Panel - Stages Monitoring */}
          <div className="hidden md:block w-[30%] overflow-y-auto bg-zinc-50">
            {workOrder && <StagesMonitoring workOrder={workOrder} />}
          </div>
        </div>
      </div>
      </div>
    </div>
  );

  const deleteConfirmDialog = showDeleteConfirm && inventoryImpact && (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
  );

  const simpleDeleteConfirmDialog = showSimpleDeleteConfirm && (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
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
              onClick={() => performDelete(false)}
              disabled={deleteLoading}
              className="flex-1 rounded-2xl bg-red-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-all disabled:opacity-50"
            >
              {deleteLoading ? "Deleting..." : "Delete Work Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mounted ? createPortal(modalContent, document.body) : null}
      {mounted && deleteConfirmDialog ? createPortal(deleteConfirmDialog, document.body) : null}
      {mounted && simpleDeleteConfirmDialog ? createPortal(simpleDeleteConfirmDialog, document.body) : null}
      {workOrder && (
        <EditWorkOrderModal
          open={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSuccess={handleEditSuccess}
          workOrder={{
            id: workOrder.id,
            type: (workOrder.type === "INSTALLATION" ? "INSTALL" : workOrder.type === "REPAIR_CHANGE" ? "REPAIR" : "DIAGNOSTIC") as "INSTALL" | "DIAGNOSTIC" | "REPAIR",
            status: (workOrder.status === "CREATED" ? "NEW" : workOrder.status === "LINKED_TO_GROUP" ? "DISPATCHED" : workOrder.status === "IN_PROGRESS" ? "IN_PROGRESS" : workOrder.status === "COMPLETED" ? "DONE" : workOrder.status === "CANCELED" ? "CANCELED" : "NEW") as "NEW" | "DISPATCHED" | "ACCEPTED" | "IN_PROGRESS" | "DONE" | "CANCELED",
            title: workOrder.title,
            notes: workOrder.notes,
          }}
        />
      )}
    </>
  );
}
