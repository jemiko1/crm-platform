"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

  // Product usage state - unified for both tech employee and tech head
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<{ productId: string; quantity: number }[]>([]);
  const [showProductForm, setShowProductForm] = useState(false);
  // For tech employee: manage their own products before submission
  const [techEmployeeProducts, setTechEmployeeProducts] = useState<{ productId: string; quantity: number; productName?: string; productSku?: string }[]>([]);

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
  
  // Product selection state for quantity input
  const [selectedProductForAdd, setSelectedProductForAdd] = useState<Product | null>(null);
  const [addProductQuantity, setAddProductQuantity] = useState(1);
  
  // Portal mount state
  const [portalMounted, setPortalMounted] = useState(false);
  
  useEffect(() => {
    setPortalMounted(true);
  }, []);

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

  // Tech employee products are managed locally - no initialization from server
  // Products are only submitted when completing the task
  // This prevents duplication issues from the old "Save Products" flow

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

  // Note: Products are now submitted together with completion, not separately
  // This function is kept for backward compatibility but should not be used
  async function handleSubmitProducts() {
    // Products are submitted with completion, not separately
    // This prevents duplication issues
    console.warn("handleSubmitProducts called - products should be submitted with completion");
  }

  function updateTechEmployeeProduct(index: number, quantity: number) {
    setTechEmployeeProducts((prev) => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], quantity };
      }
      return updated;
    });
  }

  // Direct removal - simple and reliable
  function removeTechEmployeeProduct(index: number) {
    setTechEmployeeProducts((prev) => prev.filter((_, i) => i !== index));
  }

  function addTechEmployeeProduct(product: Product, quantity: number = 1) {
    // Check if product already exists
    const existingIndex = techEmployeeProducts.findIndex((p) => p.productId === product.id);
    
    if (existingIndex >= 0) {
      // Product already exists - don't add again
      return;
    }
    
    // Add new product with specified quantity
    setTechEmployeeProducts((prev) => [
      ...prev,
      {
        productId: product.id,
        quantity: quantity,
        productName: product.name,
        productSku: product.sku,
      },
    ]);
    
    // Reset selection state and close modal
    setSelectedProductForAdd(null);
    setAddProductQuantity(1);
    setShowAddProductModal(false);
    setProductSearchQuery("");
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
      // First, submit products if any (this replaces existing products)
      const validProducts = techEmployeeProducts.filter((p) => p.quantity > 0);
      if (validProducts.length > 0) {
        const productUsages = validProducts.map((p) => ({
          productId: p.productId,
          quantity: p.quantity,
        }));
        await apiPost(`/v1/work-orders/${taskId}/products`, productUsages);
      }
      
      // Then submit completion
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
      
      // If there were products submitted by tech employee but all were removed
      if (task.productUsages && task.productUsages.length > 0 && validProducts.length === 0) {
        if (!window.confirm("Are you sure you want to remove all products? This will approve the work order without any products.")) {
          setActionLoading(false);
          return;
        }
      }
      
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

  // Direct removal - mark for deletion by setting quantity to 0
  function removeModifiedProduct(index: number) {
    setModifiedProducts(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], quantity: 0 };
        return updated;
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  function addProduct(product: Product, quantity: number = 1) {
    try {
      // For tech head review - add to modifiedProducts
      if (needsHeadReview && canApprove) {
        // Check if product already exists
        const existingIndex = modifiedProducts.findIndex(p => p.productId === product.id && p.quantity > 0);
        if (existingIndex >= 0) {
          // Product already exists - don't add again
          return;
        }
        
        // Check if product was marked for deletion (quantity 0)
        const deletedIndex = modifiedProducts.findIndex(p => p.productId === product.id && p.quantity === 0);
        if (deletedIndex >= 0) {
          // Restore with new quantity
          setModifiedProducts(prev => {
            const updated = [...prev];
            updated[deletedIndex] = {
              ...updated[deletedIndex],
              quantity: quantity,
            };
            return updated;
          });
        } else {
          // Add new product
          setModifiedProducts(prev => [
            ...prev,
            {
              productId: product.id,
              quantity: quantity,
              productName: product.name,
              productSku: product.sku,
            },
          ]);
        }
        
        // Reset selection and close modal
        setSelectedProductForAdd(null);
        setAddProductQuantity(1);
        setShowAddProductModal(false);
        setProductSearchQuery("");
      } else {
        // For tech employee - add to techEmployeeProducts
        addTechEmployeeProduct(product, quantity);
      }
    } catch (error) {
      console.error("Error adding product:", error);
    }
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

  function addDeactivatedDevice() {
    setSelectedProducts([...selectedProducts, { productId: "", quantity: 1 }]);
  }

  function removeDeactivatedDevice(index: number) {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  }

  function updateDeactivatedDevice(index: number, field: "productId" | "quantity", value: string | number) {
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
                {/* Product Usage (for Installation/Repair-Change) - Unified View */}
                {needsProducts && (
                  <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-semibold text-zinc-900">📦 Products Used</h2>
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
                      Add products used for this task. You can modify or remove products before submitting for review.
                    </p>

                    {/* Products List - Tech Employee's products */}
                    {techEmployeeProducts.length > 0 ? (
                      <div className="space-y-2">
                        {techEmployeeProducts.map((item, index) => {
                          const product = products.find((p) => p.id === item.productId);
                          return (
                            <div
                              key={`${item.productId}-${index}`}
                              className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                            >
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-zinc-900">
                                  {item.productName || product?.name || "Unknown Product"}
                                </div>
                                <div className="mt-1 text-xs text-zinc-500">
                                  SKU: {item.productSku || product?.sku || "N/A"}
                                  {product && ` • Stock: ${product.currentStock}`}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-zinc-600">Qty:</label>
                                <input
                                  type="number"
                                  min="1"
                                  max={product?.currentStock || 999}
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const newQty = parseInt(e.target.value) || 1;
                                    if (newQty > 0) {
                                      updateTechEmployeeProduct(index, Math.min(newQty, product?.currentStock || 999));
                                    }
                                  }}
                                  className="w-20 rounded-xl border-zinc-300 bg-white px-2 py-1 text-sm text-center focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeTechEmployeeProduct(index)}
                                  className="rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200 transition-colors"
                                  title="Remove product"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Info message */}
                        <div className="mt-3 p-3 rounded-xl bg-blue-50 ring-1 ring-blue-200">
                          <div className="text-xs text-blue-700">
                            📌 Products will be submitted when you complete the task below.
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-sm text-zinc-500">
                        No products added yet. Click "Add Product" to add items.
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
                          if (selectedProducts.length === 0) addDeactivatedDevice();
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
                              onChange={(e) => updateDeactivatedDevice(index, "productId", e.target.value)}
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
                                updateDeactivatedDevice(index, "quantity", parseInt(e.target.value) || 1)
                              }
                              className="w-20 rounded-xl border-zinc-300 text-sm focus:border-emerald-500 focus:ring-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => removeDeactivatedDevice(index)}
                              className="p-2 text-red-600 hover:text-red-700"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={addDeactivatedDevice}
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
                    
                    {/* Show products - either from tech employee or modified by tech head */}
                    {task.productUsages && task.productUsages.length > 0 && (
                      <div className="mb-4 space-y-2">
                        {modifiedProducts.length === 0 && (
                          <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Submitted by Tech Employee</div>
                        )}
                        {modifiedProducts.length > 0 && (
                          <div className="text-xs font-semibold text-amber-600 uppercase mb-2">Your Modifications</div>
                        )}
                        {task.productUsages.map((usage) => {
                          // Check if this product has been modified
                          const modifiedIndex = modifiedProducts.findIndex((p) => p.productId === usage.product.id);
                          const isModified = modifiedIndex >= 0;
                          const currentItem = isModified ? modifiedProducts[modifiedIndex] : null;
                          const currentQuantity = currentItem ? currentItem.quantity : usage.quantity;
                          const isMarkedForDeletion = currentItem && currentItem.quantity === 0;
                          
                          // Skip if marked for deletion
                          if (isMarkedForDeletion) return null;
                          
                          const hasChanged = isModified && currentItem && currentItem.quantity !== usage.quantity;
                          
                          return (
                            <div
                              key={usage.id}
                              className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                            >
                              <div className="flex-1">
                                <div className="text-sm font-semibold text-zinc-900">
                                  {usage.product.name}
                                  {hasChanged && (
                                    <span className="ml-2 text-xs text-amber-600">(Modified)</span>
                                  )}
                                </div>
                                <div className="mt-1 text-xs text-zinc-500">
                                  SKU: {usage.product.sku}
                                  {hasChanged && (
                                    <span className="ml-2">Original: {usage.quantity}</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <label className="text-xs text-zinc-600">Qty:</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={currentQuantity}
                                  onChange={(e) => {
                                    const newQty = parseInt(e.target.value) || 1;
                                    // Allow typing - immediate update without confirmation
                                    if (newQty === usage.quantity && isModified) {
                                      // Back to original - remove modification
                                      const updated = modifiedProducts.filter((_, i) => i !== modifiedIndex);
                                      setModifiedProducts(updated);
                                    } else if (newQty !== usage.quantity && newQty >= 1) {
                                      if (isModified) {
                                        updateModifiedProduct(modifiedIndex, newQty);
                                      } else {
                                        // Initialize modifiedProducts with all products
                                        const allProducts = task.productUsages!.map((u) => ({
                                          productId: u.product.id,
                                          quantity: u.id === usage.id ? newQty : u.quantity,
                                          productName: u.product.name,
                                          productSku: u.product.sku,
                                        }));
                                        setModifiedProducts(allProducts);
                                      }
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const newQty = parseInt(e.target.value) || 1;
                                    // Ensure minimum
                                    if (newQty < 1) {
                                      e.target.value = "1";
                                      if (isModified) {
                                        updateModifiedProduct(modifiedIndex, 1);
                                      }
                                    }
                                  }}
                                  className="w-20 rounded-xl border-zinc-300 bg-white px-2 py-1 text-sm text-center focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Direct removal - mark for deletion
                                    if (modifiedProducts.length === 0) {
                                      const allProducts = task.productUsages!.map((u) => ({
                                        productId: u.product.id,
                                        quantity: u.id === usage.id ? 0 : u.quantity,
                                        productName: u.product.name,
                                        productSku: u.product.sku,
                                      }));
                                      setModifiedProducts(allProducts);
                                    } else {
                                      const index = modifiedProducts.findIndex((p) => p.productId === usage.product.id);
                                      if (index >= 0) {
                                        updateModifiedProduct(index, 0);
                                      } else {
                                        setModifiedProducts([
                                          ...modifiedProducts,
                                          {
                                            productId: usage.product.id,
                                            quantity: 0,
                                            productName: usage.product.name,
                                            productSku: usage.product.sku,
                                          },
                                        ]);
                                      }
                                    }
                                  }}
                                  className="rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200 transition-colors"
                                  title="Remove product"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    
                    {/* Show newly added products (not from tech employee) */}
                    {modifiedProducts.filter((p) => !task.productUsages?.some((u) => u.product.id === p.productId) && p.quantity > 0).length > 0 && (
                      <div className="mb-4 space-y-2">
                        <div className="text-xs font-semibold text-emerald-600 uppercase mb-2">Newly Added Products</div>
                        {modifiedProducts
                          .filter((p) => !task.productUsages?.some((u) => u.product.id === p.productId) && p.quantity > 0)
                          .map((item, index) => {
                            const actualIndex = modifiedProducts.findIndex((p) => p.productId === item.productId);
                            return (
                              <div
                                key={`new-${item.productId}-${index}`}
                                className="flex items-center gap-3 rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200"
                              >
                                <div className="flex-1">
                                  <div className="text-sm font-semibold text-zinc-900">
                                    {item.productName || "Unknown Product"}
                                    <span className="ml-2 text-xs text-emerald-600">(New)</span>
                                  </div>
                                  <div className="mt-1 text-xs text-zinc-500">
                                    SKU: {item.productSku || "N/A"}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <label className="text-xs text-zinc-600">Qty:</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const newQty = parseInt(e.target.value) || 1;
                                      if (newQty > 0) {
                                        updateModifiedProduct(actualIndex, newQty);
                                      }
                                    }}
                                    className="w-20 rounded-xl border-zinc-300 bg-white px-2 py-1 text-sm text-center focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeModifiedProduct(actualIndex)}
                                    className="rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200 transition-colors"
                                    title="Remove product"
                                  >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                      <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}
                    
                    {(!task.productUsages || task.productUsages.length === 0) && modifiedProducts.filter((p) => p.quantity > 0).length === 0 && (
                      <div className="text-center py-6 text-sm text-zinc-500">
                        No products added yet. Click "Add Product" to add items.
                      </div>
                    )}

                    {/* Products Summary */}
                    {modifiedProducts.filter((p) => p.quantity > 0).length > 0 && (
                      <div className="mt-4 p-3 rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
                        <div className="text-xs font-semibold text-emerald-800">
                          📦 {modifiedProducts.filter((p) => p.quantity > 0).length} product{modifiedProducts.filter((p) => p.quantity > 0).length !== 1 ? "s" : ""} • Total qty: {modifiedProducts.reduce((sum, p) => sum + (p.quantity > 0 ? p.quantity : 0), 0)}
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

      {/* Add Product Modal - Using createPortal for proper viewport centering */}
      {showAddProductModal && portalMounted && createPortal(
        <div 
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99999 }}
        >
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setShowAddProductModal(false);
              setProductSearchQuery("");
              setSelectedProductForAdd(null);
              setAddProductQuantity(1);
            }}
          />
          
          {/* Modal */}
          <div 
            className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 pb-4 border-b border-zinc-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {selectedProductForAdd ? "Set Quantity" : "Add Product"}
                  </h2>
                  <p className="text-sm text-zinc-500 mt-1">
                    {selectedProductForAdd 
                      ? `How many "${selectedProductForAdd.name}" do you need?`
                      : "Select a product from inventory"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddProductModal(false);
                    setProductSearchQuery("");
                    setSelectedProductForAdd(null);
                    setAddProductQuantity(1);
                  }}
                  className="p-2 rounded-xl hover:bg-zinc-100 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content - Product Selection or Quantity Input */}
            {selectedProductForAdd ? (
              // Quantity Input View
              <div className="p-6">
                {/* Selected Product Info */}
                <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <span className="text-lg">📦</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-zinc-900">{selectedProductForAdd.name}</div>
                      <div className="text-xs text-zinc-500">{selectedProductForAdd.sku}</div>
                      <div className="text-xs text-emerald-600 mt-0.5">
                        Available: {selectedProductForAdd.currentStock || 0} {selectedProductForAdd.unit || "units"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quantity Input */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-zinc-700 mb-2">
                    Quantity
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setAddProductQuantity(q => Math.max(1, q - 1))}
                      disabled={addProductQuantity <= 1}
                      className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center text-xl font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      max={selectedProductForAdd.currentStock || 999}
                      value={addProductQuantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setAddProductQuantity(Math.min(Math.max(1, val), selectedProductForAdd.currentStock || 999));
                      }}
                      className="flex-1 h-12 rounded-xl border-zinc-300 text-center text-lg font-semibold focus:border-emerald-500 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => setAddProductQuantity(q => Math.min((selectedProductForAdd.currentStock || 999), q + 1))}
                      disabled={addProductQuantity >= (selectedProductForAdd.currentStock || 999)}
                      className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center text-xl font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProductForAdd(null);
                      setAddProductQuantity(1);
                    }}
                    className="flex-1 px-4 py-3 rounded-2xl bg-zinc-100 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      addProduct(selectedProductForAdd, addProductQuantity);
                    }}
                    className="flex-1 px-4 py-3 rounded-2xl text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: BRAND }}
                  >
                    Add to List
                  </button>
                </div>
              </div>
            ) : (
              // Product Selection View
              <div className="p-6 pt-4">
                {/* Search */}
                <input
                  type="text"
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  placeholder="Search by name or SKU..."
                  className="w-full rounded-xl border-zinc-300 text-sm mb-4 focus:border-emerald-500 focus:ring-emerald-500"
                  autoFocus
                />

                {/* Products List */}
                <div className="overflow-y-auto space-y-2 max-h-80">
                  {filteredAvailableProducts.length === 0 ? (
                    <div className="text-center py-8 text-sm text-zinc-500">
                      {productSearchQuery ? "No products found matching your search" : availableProducts.length === 0 ? "No products available" : "Loading products..."}
                    </div>
                  ) : (
                    filteredAvailableProducts.map((product) => {
                      // Check if product is already in the list
                      const inTechEmployeeList = techEmployeeProducts.some(p => p.productId === product.id);
                      const inModifiedList = modifiedProducts.some(p => p.productId === product.id && p.quantity > 0);
                      const alreadyAdded = inTechEmployeeList || inModifiedList;
                      const existingQty = inTechEmployeeList 
                        ? techEmployeeProducts.find(p => p.productId === product.id)?.quantity || 0
                        : inModifiedList
                        ? modifiedProducts.find(p => p.productId === product.id)?.quantity || 0
                        : 0;
                      
                      return (
                        <div
                          key={product.id}
                          className={`w-full flex items-center justify-between p-3 rounded-2xl ring-1 transition ${
                            alreadyAdded
                              ? "bg-zinc-100 ring-zinc-200 opacity-60 cursor-not-allowed"
                              : "bg-zinc-50 ring-zinc-200 hover:bg-emerald-50 hover:ring-emerald-300 cursor-pointer"
                          }`}
                          onClick={() => {
                            if (!alreadyAdded) {
                              setSelectedProductForAdd(product);
                              setAddProductQuantity(1);
                            }
                          }}
                        >
                          <div className="flex-1 text-left">
                            <div className="text-sm font-semibold text-zinc-900">{product.name}</div>
                            <div className="text-xs text-zinc-500">{product.sku}</div>
                            <div className="text-xs text-zinc-400 mt-1">
                              Stock: {product.currentStock || 0} {product.unit || "units"}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {alreadyAdded ? (
                              <span className="text-xs font-semibold text-zinc-500 bg-zinc-200 px-2 py-1 rounded-lg">
                                Added (Qty: {existingQty})
                              </span>
                            ) : (
                              <>
                                <span className="text-xs font-semibold text-emerald-600">
                                  Select
                                </span>
                                <span className="text-emerald-600">→</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
      
    </div>
  );
}
