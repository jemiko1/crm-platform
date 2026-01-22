"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import AssignEmployeesModal from "../../work-orders/[id]/assign-employees-modal";

const BRAND = "rgb(8, 117, 56)";

type TaskDetail = {
  id: string;
  title: string;
  type: string;
  status: string;
  notes: string | null;
  contactNumber: string | null;
  deadline: string | null;
  inventoryProcessingType: string | null;
  techEmployeeComment: string | null;
  techHeadComment: string | null;
  cancelReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  // For identification
  workOrderNumber?: number;
  building: {
    coreId: number;
    name: string;
    address: string | null;
    city: string | null;
  };
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
    filledBy?: string;
    product: {
      id: string;
      name: string;
      sku: string;
      category: string;
    };
  }>;
  deactivatedDevices?: Array<{
    id: string;
    quantity: number;
    isWorkingCondition: boolean;
    transferredToStock: boolean;
    notes?: string;
    product: {
      id: string;
      name: string;
      sku: string;
      category: string;
    };
  }>;
  parentWorkOrder?: {
    id: string;
    title: string;
    type: string;
    status: string;
  } | null;
  childWorkOrders?: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    createdAt: string;
  }>;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
  unit?: string;
};

function getStatusBadge(status: string) {
  const styles: Record<string, string> = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    LINKED_TO_GROUP: "bg-amber-50 text-amber-700 ring-amber-200",
    IN_PROGRESS: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    COMPLETED: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    CANCELED: "bg-red-50 text-red-700 ring-red-200",
  };
  return styles[status] || "bg-zinc-50 text-zinc-700 ring-zinc-200";
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    CREATED: "Created",
    LINKED_TO_GROUP: "Assigned",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    CANCELED: "Canceled",
  };
  return labels[status] || status;
}

function getTypeLabel(type: string) {
  const labels: Record<string, string> = {
    INSTALLATION: "Installation",
    DIAGNOSTIC: "Diagnostic",
    RESEARCH: "Research",
    DEACTIVATE: "Deactivate",
    REPAIR_CHANGE: "Repair/Change",
    ACTIVATE: "Activate",
  };
  return labels[type] || type;
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

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const taskId = params?.taskId as string | undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Product usage state
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; quantity: number }[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);

  // Completion state
  const [completionComment, setCompletionComment] = useState("");
  const [showCompletionForm, setShowCompletionForm] = useState(false);

  // Repair request state
  const [repairReason, setRepairReason] = useState("");
  const [showRepairRequestForm, setShowRepairRequestForm] = useState(false);

  // Workflow role state - separated by step
  const [canAssignEmployees, setCanAssignEmployees] = useState(false); // Step 1: Can assign employees
  const [canApprove, setCanApprove] = useState(false); // Step 5: Can approve/reject
  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [approvalComment, setApprovalComment] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [modifiedProducts, setModifiedProducts] = useState<{ productId: string; quantity: number; productName?: string; productSku?: string }[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [workflowPositions, setWorkflowPositions] = useState<{step1: string[], step5: string[]}>({ step1: [], step5: [] });

  // Fetch workflow step positions
  useEffect(() => {
    async function loadWorkflowPositions() {
      try {
        const steps = await apiGet<any[]>("/v1/workflow/steps");
        const step1 = steps.find((s: any) => s.stepKey === "ASSIGN_EMPLOYEES");
        const step5 = steps.find((s: any) => s.stepKey === "FINAL_APPROVAL");
        
        setWorkflowPositions({
          step1: step1?.assignedPositions?.map((ap: any) => ap.position?.id) || [],
          step5: step5?.assignedPositions?.map((ap: any) => ap.position?.id) || [],
        });
      } catch {
        // Ignore - workflow may not be configured
      }
    }
    
    loadWorkflowPositions();
  }, []);

  // Fetch current employee
  useEffect(() => {
    async function loadEmployee() {
      try {
        const res = await fetch("http://localhost:3000/auth/me", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const userData = data?.user || data;

        if (userData.email) {
          const employees = await apiGet<any[]>(`/v1/employees?search=${userData.email}`);
          if (employees && employees.length > 0) {
            const emp = employees[0];
            setCurrentEmployee(emp);
          }
        }
      } catch {
        // Ignore
      }
    }

    loadEmployee();
  }, []);

  // Check if current employee's position is assigned to workflow steps
  useEffect(() => {
    if (!currentEmployee?.position?.id) return;
    
    const positionId = currentEmployee.position.id;
    const isInStep1 = workflowPositions.step1.includes(positionId);
    const isInStep5 = workflowPositions.step5.includes(positionId);
    
    setCanAssignEmployees(isInStep1);
    setCanApprove(isInStep5);
  }, [currentEmployee, workflowPositions]);

  // Fetch task details
  useEffect(() => {
    if (!taskId) {
      setLoading(false);
      setError("Task ID is required");
      return;
    }

    let cancelled = false;

    async function loadTask() {
      try {
        setLoading(true);
        setError(null);

        const data = await apiGet<TaskDetail>(`/v1/work-orders/${taskId}`);

        if (!cancelled) {
          setTask(data);

          // Log that we viewed this task
          try {
            await apiPost(`/v1/work-orders/${taskId}/view`, {});
          } catch {
            // Ignore view logging errors
          }
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            setError(err.message);
          } else {
            setError(err instanceof Error ? err.message : "Failed to load task");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTask();

    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Fetch products when needed
  useEffect(() => {
    if (
      task &&
      (task.type === "INSTALLATION" || task.type === "REPAIR_CHANGE" || task.type === "DEACTIVATE") &&
      task.status === "IN_PROGRESS"
    ) {
      async function loadProducts() {
        try {
          const data = await apiGet<Product[]>("/v1/inventory/products");
          // API returns array directly, not wrapped
          setProducts(Array.isArray(data) ? data : []);
        } catch (err) {
          console.error("Failed to load products:", err);
        }
      }
      loadProducts();
    }
  }, [task]);

  // Initialize modified products when Step 5 position needs to review products
  useEffect(() => {
    if (
      task &&
      canApprove &&
      task.status === "IN_PROGRESS" &&
      task.techEmployeeComment &&
      task.productUsages &&
      task.productUsages.length > 0 &&
      modifiedProducts.length === 0
    ) {
      setModifiedProducts(
        task.productUsages.map((u) => ({
          productId: u.product.id,
          quantity: u.quantity,
          productName: u.product.name,
          productSku: u.product.sku,
        })),
      );
    }
  }, [task, canApprove, modifiedProducts.length]);

  // Check if current employee is assigned
  const isAssigned = task?.assignments?.some((a) => a.employee.id === currentEmployee?.id);

  // Workflow actions
  async function handleStartWork() {
    if (!taskId) return;
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${taskId}/start`, {});
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to start work");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitProducts() {
    if (!taskId || selectedProducts.length === 0) return;
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${taskId}/products`, selectedProducts);
      setShowProductForm(false);
      setSelectedProducts([]);
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to submit products");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitDeactivatedDevices() {
    if (!taskId || selectedProducts.length === 0) return;
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${taskId}/deactivated-devices`, selectedProducts);
      setShowProductForm(false);
      setSelectedProducts([]);
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to submit devices");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSubmitCompletion() {
    if (!taskId || !completionComment.trim()) {
      alert("Please enter a completion comment");
      return;
    }
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${taskId}/complete`, { comment: completionComment });
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to submit completion");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRequestRepair() {
    if (!taskId || !repairReason.trim()) {
      alert("Please enter a reason for the repair request");
      return;
    }
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${taskId}/request-repair`, { reason: repairReason });
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to request repair conversion");
    } finally {
      setActionLoading(false);
    }
  }

  // Head of Technical Department actions
  async function handleApprove() {
    if (!taskId) return;
    setActionLoading(true);
    try {
      // Filter out products with zero or negative quantity
      const validProducts = modifiedProducts.filter(p => p.quantity > 0);
      // Send products list (empty array means no products)
      const productUsages = validProducts.length > 0 
        ? validProducts.map(p => ({ productId: p.productId, quantity: p.quantity })) 
        : undefined;
      await apiPost(`/v1/work-orders/${taskId}/approve`, {
        productUsages,
        comment: approvalComment || undefined,
      });
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to approve work order");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!taskId || !cancelReason.trim()) {
      alert("Please enter a cancel reason");
      return;
    }
    setActionLoading(true);
    try {
      await apiPost(`/v1/work-orders/${taskId}/cancel`, {
        cancelReason,
        comment: approvalComment || undefined,
      });
      window.location.reload();
    } catch (err: any) {
      alert(err.message || "Failed to cancel work order");
    } finally {
      setActionLoading(false);
    }
  }

  function updateModifiedProduct(index: number, quantity: number) {
    setModifiedProducts(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], quantity };
      }
      return updated;
    });
  }

  function removeProduct(index: number) {
    setModifiedProducts(prev => prev.filter((_, i) => i !== index));
  }

  function addProduct(product: Product) {
    setModifiedProducts(prev => {
      // Check if product already exists
      const existingIndex = prev.findIndex(p => p.productId === product.id);
      if (existingIndex >= 0) {
        // Increment quantity if exists
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: updated[existingIndex].quantity + 1,
        };
        return updated;
      } else {
        // Add new product
        return [
          ...prev,
          {
            productId: product.id,
            quantity: 1,
            productName: product.name,
            productSku: product.sku,
          },
        ];
      }
    });
    setShowAddProductModal(false);
    setProductSearchQuery("");
  }

  // Fetch available products for adding
  async function loadAvailableProducts() {
    try {
      const data = await apiGet<Product[]>("/v1/inventory/products");
      setAvailableProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load products:", err);
    }
  }

  // Filter products by search query
  const filteredAvailableProducts = availableProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(productSearchQuery.toLowerCase()),
  );

  function addProduct() {
    setSelectedProducts([...selectedProducts, { productId: "", quantity: 1 }]);
  }

  function removeProduct(index: number) {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  }

  function updateProduct(index: number, field: "productId" | "quantity", value: string | number) {
    const updated = [...selectedProducts];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedProducts(updated);
  }

  if (loading) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-white p-12 text-center shadow-sm ring-1 ring-zinc-200">
            <div className="text-sm text-zinc-600">Loading task...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-red-50 p-6 ring-1 ring-red-200">
            <div className="text-sm font-semibold text-red-900">Error loading task</div>
            <div className="mt-1 text-sm text-red-700">{error || "Task not found"}</div>
            <Link
              href="/app/tasks"
              className="mt-3 inline-block rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Back to Tasks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canStartWork = isAssigned && task.status === "LINKED_TO_GROUP";
  const canWorkOnTask = isAssigned && task.status === "IN_PROGRESS" && !task.techEmployeeComment;
  const needsProducts = task.type === "INSTALLATION" || task.type === "REPAIR_CHANGE";
  const needsDeactivatedDevices = task.type === "DEACTIVATE";
  const canRequestRepair = task.type === "DIAGNOSTIC";
  const isCompleted = task.status === "COMPLETED" || task.status === "CANCELED";
  
  // Workflow step permissions:
  // Step 1 positions - can assign employees for CREATED tasks
  // Step 5 positions - can approve/reject IN_PROGRESS tasks with techEmployeeComment
  const showAssignSection = canAssignEmployees && task.status === "CREATED";
  const needsHeadReview = canApprove && task.status === "IN_PROGRESS" && !!task.techEmployeeComment;
  const techEmployeeSubmitted = task.status === "IN_PROGRESS" && !!task.techEmployeeComment;

  return (
    <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <Link
            href="/app/tasks"
            className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900"
          >
            <span>←</span>
            <span>My Workspace</span>
          </Link>
        </div>

        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
            Task
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
            {task.title}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(task.status)}`}
            >
              {getStatusLabel(task.status)}
            </span>
            <span className="text-sm text-zinc-500">
              {getTypeLabel(task.type)}
            </span>
          </div>
        </div>

        {/* Status Progress Bar */}
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-700">Progress</span>
            <span className="text-xs text-zinc-500">{getStatusLabel(task.status)}</span>
          </div>
          <div className="relative h-2 bg-zinc-200 rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full rounded-full transition-all"
              style={{
                backgroundColor: BRAND,
                width:
                  task.status === "CREATED"
                    ? "10%"
                    : task.status === "LINKED_TO_GROUP"
                      ? "35%"
                      : task.status === "IN_PROGRESS"
                        ? "70%"
                        : task.status === "COMPLETED"
                          ? "100%"
                          : task.status === "CANCELED"
                            ? "100%"
                            : "0%",
              }}
            />
          </div>
          <div className="mt-2 flex justify-between text-xs text-zinc-500">
            <span>Created</span>
            <span>Assigned</span>
            <span>In Progress</span>
            <span>Done</span>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Task Details */}
          <div className="space-y-6">
            {/* Building Info */}
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">📍 Location</h2>
              <div className="space-y-3">
                <InfoCard label="Building" value={task.building.name} icon="🏢" />
                {task.building.address && (
                  <InfoCard label="Address" value={task.building.address} icon="📍" />
                )}
                {task.building.city && (
                  <InfoCard label="City" value={task.building.city} icon="🌆" />
                )}
              </div>
            </div>

            {/* Contact & Deadline */}
            <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">📋 Task Info</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoCard label="Contact Number" value={task.contactNumber} icon="📞" />
                <InfoCard
                  label="Deadline"
                  value={
                    task.deadline
                      ? new Date(task.deadline).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })
                      : null
                  }
                  icon="📅"
                />
              </div>
              {task.notes && (
                <div className="mt-4">
                  <div className="text-xs font-medium text-zinc-500 mb-1">📝 Description</div>
                  <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-700 ring-1 ring-zinc-200">
                    {task.notes}
                  </div>
                </div>
              )}
            </div>

            {/* Devices */}
            {task.workOrderAssets && task.workOrderAssets.length > 0 && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">📱 Devices</h2>
                <div className="space-y-2">
                  {task.workOrderAssets.map((wa) => (
                    <div
                      key={wa.asset.coreId}
                      className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                    >
                      <div className="text-sm font-semibold text-zinc-900">{wa.asset.name}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        Type: {wa.asset.type} • ID: #{wa.asset.coreId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assigned Employees */}
            {task.assignments && task.assignments.length > 0 && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">👥 Team</h2>
                <div className="space-y-2">
                  {task.assignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className={`rounded-2xl p-3 ring-1 ${
                        assignment.employee.id === currentEmployee?.id
                          ? "bg-emerald-50 ring-emerald-200"
                          : "bg-zinc-50 ring-zinc-200"
                      }`}
                    >
                      <div className="text-sm font-semibold text-zinc-900">
                        {assignment.employee.firstName} {assignment.employee.lastName}
                        {assignment.employee.id === currentEmployee?.id && (
                          <span className="ml-2 text-xs text-emerald-600">(You)</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {assignment.employee.employeeId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions Panel */}
          <div className="space-y-6">
            {/* Start Work Button */}
            {canStartWork && (
              <div className="rounded-3xl bg-emerald-50 p-6 shadow-sm ring-1 ring-emerald-200">
                <h2 className="text-lg font-semibold text-emerald-900 mb-2">🚀 Ready to Start?</h2>
                <p className="text-sm text-emerald-700 mb-4">
                  Click the button below to notify your team that you're starting work on this task.
                </p>
                <button
                  type="button"
                  onClick={handleStartWork}
                  disabled={actionLoading}
                  className="w-full rounded-2xl px-6 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {actionLoading ? "Starting..." : "▶️ Start Work"}
                </button>
              </div>
            )}

            {/* Work in Progress Actions */}
            {canWorkOnTask && !isCompleted && (
              <>
                {/* Product Usage (for Installation/Repair-Change) */}
                {needsProducts && (
                  <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                    <h2 className="text-lg font-semibold text-zinc-900 mb-4">📦 Products Used</h2>

                    {/* Existing usages */}
                    {task.productUsages && task.productUsages.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {task.productUsages.map((usage) => (
                          <div
                            key={usage.id}
                            className="flex items-center justify-between rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                          >
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">
                                {usage.product.name}
                              </div>
                              <div className="text-xs text-zinc-500">{usage.product.sku}</div>
                            </div>
                            <div className="text-sm font-bold text-zinc-900">×{usage.quantity}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!showProductForm ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProductForm(true);
                          if (selectedProducts.length === 0) addProduct();
                        }}
                        className="w-full rounded-2xl border-2 border-dashed border-zinc-300 p-4 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-700"
                      >
                        + Add Products
                      </button>
                    ) : (
                      <div className="space-y-3">
                        {selectedProducts.map((item, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <select
                              value={item.productId}
                              onChange={(e) => updateProduct(index, "productId", e.target.value)}
                              className="flex-1 rounded-xl border-zinc-300 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                            >
                              <option value="">Select product...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.sku}) - Stock: {p.currentStock}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateProduct(index, "quantity", parseInt(e.target.value) || 1)
                              }
                              className="w-20 rounded-xl border-zinc-300 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => removeProduct(index)}
                              className="p-2 text-red-600 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={addProduct}
                            className="flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                          >
                            + Add More
                          </button>
                          <button
                            type="button"
                            onClick={handleSubmitProducts}
                            disabled={actionLoading || selectedProducts.every((p) => !p.productId)}
                            className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                          >
                            {actionLoading ? "Saving..." : "Save Products"}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowProductForm(false);
                            setSelectedProducts([]);
                          }}
                          className="w-full text-sm text-zinc-500 hover:text-zinc-700"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Deactivated Devices (for Deactivate type) */}
                {needsDeactivatedDevices && (
                  <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                    <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                      📱 Devices Removed from Building
                    </h2>

                    {/* Existing devices */}
                    {task.deactivatedDevices && task.deactivatedDevices.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {task.deactivatedDevices.map((device) => (
                          <div
                            key={device.id}
                            className="flex items-center justify-between rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                          >
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">
                                {device.product.name}
                              </div>
                              <div className="text-xs text-zinc-500">{device.product.sku}</div>
                            </div>
                            <div className="text-sm font-bold text-zinc-900">×{device.quantity}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {!showProductForm ? (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProductForm(true);
                          if (selectedProducts.length === 0) addProduct();
                        }}
                        className="w-full rounded-2xl border-2 border-dashed border-zinc-300 p-4 text-sm font-medium text-zinc-600 hover:border-zinc-400 hover:text-zinc-700"
                      >
                        + Add Removed Devices
                      </button>
                    ) : (
                      <div className="space-y-3">
                        {selectedProducts.map((item, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <select
                              value={item.productId}
                              onChange={(e) => updateProduct(index, "productId", e.target.value)}
                              className="flex-1 rounded-xl border-zinc-300 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                            >
                              <option value="">Select device type...</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.sku})
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) =>
                                updateProduct(index, "quantity", parseInt(e.target.value) || 1)
                              }
                              className="w-20 rounded-xl border-zinc-300 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => removeProduct(index)}
                              className="p-2 text-red-600 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={addProduct}
                            className="flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                          >
                            + Add More
                          </button>
                          <button
                            type="button"
                            onClick={handleSubmitDeactivatedDevices}
                            disabled={actionLoading || selectedProducts.every((p) => !p.productId)}
                            className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                            style={{ backgroundColor: BRAND }}
                          >
                            {actionLoading ? "Saving..." : "Save Devices"}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setShowProductForm(false);
                            setSelectedProducts([]);
                          }}
                          className="w-full text-sm text-zinc-500 hover:text-zinc-700"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Repair Request (for Diagnostic type) */}
                {canRequestRepair && (
                  <div className="rounded-3xl bg-amber-50 p-6 shadow-sm ring-1 ring-amber-200">
                    <h2 className="text-lg font-semibold text-amber-900 mb-2">🔧 Need Products?</h2>
                    <p className="text-sm text-amber-700 mb-4">
                      If this diagnostic work requires repair or product installation, request a
                      conversion to a Repair/Change work order.
                    </p>

                    {!showRepairRequestForm ? (
                      <button
                        type="button"
                        onClick={() => setShowRepairRequestForm(true)}
                        className="w-full rounded-2xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700"
                      >
                        Request Repair/Change Conversion
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <textarea
                          value={repairReason}
                          onChange={(e) => setRepairReason(e.target.value)}
                          placeholder="Explain why repair/change is needed..."
                          rows={3}
                          className="w-full rounded-xl border-amber-300 text-sm focus:border-amber-500 focus:ring-amber-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setShowRepairRequestForm(false);
                              setRepairReason("");
                            }}
                            className="flex-1 rounded-xl bg-amber-100 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleRequestRepair}
                            disabled={actionLoading || !repairReason.trim()}
                            className="flex-1 rounded-xl bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                          >
                            {actionLoading ? "Requesting..." : "Submit Request"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Completion Form */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                  <h2 className="text-lg font-semibold text-zinc-900 mb-4">✅ Submit Completion</h2>
                  <p className="text-sm text-zinc-600 mb-4">
                    When you finish the work, add a summary comment and submit for review.
                  </p>

                  {task.techEmployeeComment ? (
                    <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                      <div className="text-xs font-medium text-emerald-700 mb-1">
                        Your submitted comment:
                      </div>
                      <div className="text-sm text-emerald-900">{task.techEmployeeComment}</div>
                    </div>
                  ) : !showCompletionForm ? (
                    <button
                      type="button"
                      onClick={() => setShowCompletionForm(true)}
                      className="w-full rounded-2xl px-4 py-3 text-sm font-semibold text-white hover:opacity-95"
                      style={{ backgroundColor: BRAND }}
                    >
                      Complete Task
                    </button>
                  ) : (
                    <div className="space-y-3">
                      <textarea
                        value={completionComment}
                        onChange={(e) => setCompletionComment(e.target.value)}
                        placeholder="Describe what was done, any issues encountered, etc..."
                        rows={4}
                        className="w-full rounded-xl border-zinc-300 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCompletionForm(false);
                            setCompletionComment("");
                          }}
                          className="flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSubmitCompletion}
                          disabled={actionLoading || !completionComment.trim()}
                          className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                          style={{ backgroundColor: BRAND }}
                        >
                          {actionLoading ? "Submitting..." : "Submit for Review"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Completed Status Info */}
            {isCompleted && (
              <div
                className={`rounded-3xl p-6 shadow-sm ring-1 ${
                  task.status === "COMPLETED"
                    ? "bg-emerald-50 ring-emerald-200"
                    : "bg-red-50 ring-red-200"
                }`}
              >
                <h2
                  className={`text-lg font-semibold mb-2 ${
                    task.status === "COMPLETED" ? "text-emerald-900" : "text-red-900"
                  }`}
                >
                  {task.status === "COMPLETED" ? "✅ Task Completed" : "❌ Task Canceled"}
                </h2>

                {task.techEmployeeComment && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-zinc-600 mb-1">Your Comment:</div>
                    <div className="text-sm text-zinc-800">{task.techEmployeeComment}</div>
                  </div>
                )}

                {task.techHeadComment && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-zinc-600 mb-1">
                      Tech Head Comment:
                    </div>
                    <div className="text-sm text-zinc-800">{task.techHeadComment}</div>
                  </div>
                )}

                {task.cancelReason && (
                  <div>
                    <div className="text-xs font-medium text-red-600 mb-1">Cancel Reason:</div>
                    <div className="text-sm text-red-800">{task.cancelReason}</div>
                  </div>
                )}

                {task.completedAt && (
                  <div className="mt-3 text-xs text-zinc-500">
                    Completed:{" "}
                    {new Date(task.completedAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Step 1 Position - Assign Employees */}
            {showAssignSection && (
              <div className="rounded-3xl bg-purple-50 p-6 shadow-sm ring-1 ring-purple-200">
                <h2 className="text-lg font-semibold text-purple-900 mb-2">👥 Assign Employees</h2>
                <p className="text-sm text-purple-700 mb-4">
                  This work order needs to be assigned to technical employees.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(true)}
                  disabled={actionLoading}
                  className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                >
                  {actionLoading ? "Loading..." : "Assign Employees"}
                </button>
              </div>
            )}

            {/* Step 5 Position - Review & Approve */}
            {needsHeadReview && (
              <div className="space-y-4">
                {/* Tech Employee's Submission Info */}
                <div className="rounded-3xl bg-amber-50 p-6 shadow-sm ring-1 ring-amber-200">
                  <h2 className="text-lg font-semibold text-amber-900 mb-2">📋 Pending Your Review</h2>
                  <p className="text-sm text-amber-700 mb-4">
                    Technical employee has submitted this task for your review.
                  </p>

                  {/* Tech Employee Comment */}
                  {task.techEmployeeComment && (
                    <div className="rounded-2xl bg-white p-4 ring-1 ring-amber-200 mb-4">
                      <div className="text-xs font-medium text-amber-700 mb-1">
                        Tech Employee's Comment:
                      </div>
                      <div className="text-sm text-zinc-800">{task.techEmployeeComment}</div>
                    </div>
                  )}
                </div>

                {/* Products Review (if applicable) */}
                {needsProducts && (
                  <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-zinc-900">📦 Review Products Used</h2>
                      <button
                        type="button"
                        onClick={() => {
                          loadAvailableProducts();
                          setShowAddProductModal(true);
                        }}
                        className="rounded-xl bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"
                      >
                        + Add Product
                      </button>
                    </div>
                    <p className="text-sm text-zinc-600 mb-4">
                      Review, edit quantities, add new products, or remove items before approving.
                    </p>
                    
                    {/* Products List */}
                    {modifiedProducts.length === 0 ? (
                      <div className="text-center py-6 text-sm text-zinc-500">
                        No products added yet. Click "Add Product" to add items.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {modifiedProducts.map((item, index) => (
                          <div
                            key={`${item.productId}-${index}`}
                            className="flex items-center justify-between rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                          >
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-zinc-900">
                                {item.productName || "Unknown Product"}
                              </div>
                              <div className="text-xs text-zinc-500">
                                {item.productSku || "N/A"}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-zinc-500">Qty:</span>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const newQty = parseInt(e.target.value) || 1;
                                    updateModifiedProduct(index, newQty);
                                  }}
                                  className="w-20 rounded-xl border-zinc-300 text-sm text-center focus:border-emerald-500 focus:ring-emerald-500"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeProduct(index)}
                                className="rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200"
                                title="Remove product"
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Products Summary */}
                    {modifiedProducts.length > 0 && (
                      <div className="mt-4 p-3 rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
                        <div className="text-xs font-semibold text-emerald-800">
                          📦 {modifiedProducts.length} product{modifiedProducts.length !== 1 ? "s" : ""} • Total qty: {modifiedProducts.reduce((sum, p) => sum + p.quantity, 0)}
                        </div>
                        <div className="text-xs text-emerald-700 mt-1">
                          These products will be deducted from inventory when approved.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Deactivated Devices Review (if applicable) */}
                {needsDeactivatedDevices && task.deactivatedDevices && task.deactivatedDevices.length > 0 && (
                  <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                    <h2 className="text-lg font-semibold text-zinc-900 mb-4">📱 Deactivated Devices</h2>
                    <div className="space-y-2">
                      {task.deactivatedDevices.map((device) => (
                        <div
                          key={device.id}
                          className="flex items-center justify-between rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                        >
                          <div>
                            <div className="text-sm font-semibold text-zinc-900">
                              {device.product.name}
                            </div>
                            <div className="text-xs text-zinc-500">{device.product.sku}</div>
                          </div>
                          <div className="text-sm font-bold text-zinc-900">×{device.quantity}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Approval Actions */}
                <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                  <h2 className="text-lg font-semibold text-zinc-900 mb-4">✅ Your Decision</h2>

                  {/* Comment Field */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      Your Comment (optional)
                    </label>
                    <textarea
                      value={approvalComment}
                      onChange={(e) => setApprovalComment(e.target.value)}
                      placeholder="Add any notes or feedback..."
                      rows={3}
                      className="w-full rounded-xl border-zinc-300 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                      style={{ backgroundColor: BRAND }}
                    >
                      {actionLoading ? "Approving..." : "✅ Approve & Complete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelForm(true)}
                      disabled={actionLoading}
                      className="flex-1 rounded-2xl px-4 py-3 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50"
                    >
                      ❌ Cancel
                    </button>
                  </div>

                  {/* Cancel Form */}
                  {showCancelForm && (
                    <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                      <label className="block text-sm font-medium text-red-700 mb-2">
                        Cancel Reason (required)
                      </label>
                      <textarea
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        placeholder="Explain why this task is being canceled..."
                        rows={2}
                        className="w-full rounded-xl border-red-300 text-sm focus:border-red-500 focus:ring-red-500 mb-3"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowCancelForm(false);
                            setCancelReason("");
                          }}
                          className="flex-1 rounded-xl bg-white px-3 py-2 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
                        >
                          Go Back
                        </button>
                        <button
                          type="button"
                          onClick={handleCancel}
                          disabled={actionLoading || !cancelReason.trim()}
                          className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading ? "Canceling..." : "Confirm Cancel"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Waiting for Review Notice (for tech employees) */}
            {techEmployeeSubmitted && !canApprove && isAssigned && (
              <div className="rounded-3xl bg-amber-50 p-6 shadow-sm ring-1 ring-amber-200">
                <div className="text-center">
                  <div className="text-lg mb-2">⏳</div>
                  <div className="text-sm font-medium text-amber-900">Waiting for Review</div>
                  <div className="text-sm text-amber-700 mt-1">
                    Your submission is being reviewed for final approval.
                  </div>
                </div>
              </div>
            )}

            {/* Not Assigned Notice */}
            {!isAssigned && !isCompleted && !canAssignEmployees && !canApprove && (
              <div className="rounded-3xl bg-zinc-50 p-6 shadow-sm ring-1 ring-zinc-200">
                <div className="text-center">
                  <div className="text-lg mb-2">👀</div>
                  <div className="text-sm font-medium text-zinc-700">Viewing Only</div>
                  <div className="text-sm text-zinc-500 mt-1">
                    You are not assigned to this task.
                  </div>
                </div>
              </div>
            )}

            {/* Sub-Orders */}
            {task.childWorkOrders && task.childWorkOrders.length > 0 && (
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">📋 Related Orders</h2>
                <div className="space-y-2">
                  {task.childWorkOrders.map((child) => (
                    <Link
                      key={child.id}
                      href={`/app/tasks/${(child as any).workOrderNumber || child.id}`}
                      className="block rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
                    >
                      <div className="text-sm font-semibold text-zinc-900">{child.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">
                        {getTypeLabel(child.type)} • {getStatusLabel(child.status)}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assign Employees Modal */}
      {showAssignModal && task && (
        <AssignEmployeesModal
          open={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          onSuccess={() => {
            setShowAssignModal(false);
            window.location.reload();
          }}
          workOrderId={task.workOrderNumber?.toString() || task.id}
          existingAssignments={task.assignments?.map((a) => a.employee.id) || []}
        />
      )}

      {/* Add Product Modal */}
      {showAddProductModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl mx-4 max-h-[80vh] flex flex-col">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-zinc-900">Add Product</h2>
              <p className="text-sm text-zinc-600 mt-1">
                Select a product from inventory to add to this work order
              </p>
            </div>

            {/* Search */}
            <input
              type="text"
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              placeholder="Search by name or SKU..."
              className="w-full rounded-xl border-zinc-300 text-sm mb-4 focus:border-emerald-500 focus:ring-emerald-500"
            />

            {/* Products List */}
            <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-80">
              {filteredAvailableProducts.length === 0 ? (
                <div className="text-center py-8 text-sm text-zinc-500">
                  {productSearchQuery ? "No products found matching your search" : "Loading products..."}
                </div>
              ) : (
                filteredAvailableProducts.map((product) => {
                  const alreadyAdded = modifiedProducts.some(p => p.productId === product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      className={`w-full flex items-center justify-between p-3 rounded-2xl text-left transition ring-1 ${
                        alreadyAdded
                          ? "bg-emerald-50 ring-emerald-300"
                          : "bg-zinc-50 ring-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-zinc-900">{product.name}</div>
                        <div className="text-xs text-zinc-500">{product.sku}</div>
                        <div className="text-xs text-zinc-400 mt-1">
                          Stock: {product.currentStock || 0} {product.unit || "units"}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {alreadyAdded && (
                          <span className="text-xs font-semibold text-emerald-600">Added</span>
                        )}
                        <span className="text-emerald-600">+</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-4 pt-4 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => {
                  setShowAddProductModal(false);
                  setProductSearchQuery("");
                }}
                className="flex-1 rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
