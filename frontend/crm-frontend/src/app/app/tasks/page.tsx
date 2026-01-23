"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch, ApiError } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import AssignEmployeesModal from "../work-orders/[id]/assign-employees-modal";

const BRAND = "rgb(8, 117, 56)";

type WorkOrderTask = {
  id: string;
  workOrderNumber: number;
  title: string;
  type: string;
  status: string;
  building: {
    coreId: number;
    name: string;
  };
  workOrderAssets?: Array<{
    asset: {
      coreId: number;
      name: string;
      type: string;
    };
  }>;
  assignments?: Array<{
    id: string;
    employee: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
    };
    assignedAt: string;
  }>;
  contactNumber?: string;
  deadline?: string;
  description?: string;
  amountGel?: number;
  inventoryProcessingType?: string;
  techEmployeeComment?: string | null;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
};

type TaskFilter = "all" | "unassigned" | "in_progress" | "waiting_approval";

export default function TasksPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<WorkOrderTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentEmployee, setCurrentEmployee] = useState<any>(null);
  const [canAssignEmployees, setCanAssignEmployees] = useState(false); // Step 1: Can assign employees
  const [canApprove, setCanApprove] = useState(false); // Step 5: Can approve/reject
  const [isWorkflowManager, setIsWorkflowManager] = useState(false); // Either Step 1 or Step 5
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [workflowPositions, setWorkflowPositions] = useState<{step1: string[], step5: string[]}>({ step1: [], step5: [] });

  // Helper functions for labels
  function getTypeLabel(type: string): string {
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

  function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      CREATED: "Created",
      LINKED_TO_GROUP: "Linked To a Group",
      IN_PROGRESS: "In Progress",
      COMPLETED: "Completed",
      CANCELED: "Canceled",
    };
    return labels[status] || status;
  }

  // Fetch workflow positions and current employee in parallel
  useEffect(() => {
    let cancelled = false;

    async function loadInitialData() {
      try {
        // Fetch workflow steps and user data in parallel
        const [steps, authData] = await Promise.all([
          apiGet<any[]>("/v1/workflow/steps").catch(() => []),
          apiGet<any>("/auth/me").catch(() => null),
        ]);

        if (cancelled) return;

        // Process workflow positions
        const step1 = steps.find((s: any) => s.stepKey === "ASSIGN_EMPLOYEES");
        const step5 = steps.find((s: any) => s.stepKey === "FINAL_APPROVAL");

        setWorkflowPositions({
          step1: step1?.assignedPositions?.map((ap: any) => ap.position?.id) || [],
          step5: step5?.assignedPositions?.map((ap: any) => ap.position?.id) || [],
        });

        // Process employee data
        const userData = authData?.user || authData;
        if (userData?.email) {
          try {
            const employees = await apiGet<any[]>(`/v1/employees?search=${userData.email}`);
            if (employees && employees.length > 0 && !cancelled) {
              setCurrentEmployee(employees[0]);
            }
          } catch {
            // Ignore employee lookup errors
          }
        }
      } catch {
        // Ignore - workflow may not be configured
      }
    }

    loadInitialData();

    return () => {
      cancelled = true;
    };
  }, []);

  // Check if current employee's position is assigned to workflow steps
  useEffect(() => {
    if (!currentEmployee?.position?.id) return;
    
    const positionId = currentEmployee.position.id;
    const isInStep1 = workflowPositions.step1.includes(positionId);
    const isInStep5 = workflowPositions.step5.includes(positionId);
    
    setCanAssignEmployees(isInStep1);
    setCanApprove(isInStep5);
    setIsWorkflowManager(isInStep1 || isInStep5);
  }, [currentEmployee, workflowPositions]);

  // Fetch tasks
  useEffect(() => {
    if (!currentEmployee) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchTasks() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiGet<{ data: WorkOrderTask[] }>("/v1/work-orders/my-tasks");
        if (!cancelled) {
          console.log("📋 Tasks fetched:", data);
          console.log("📋 Tasks count:", data.data?.length || 0);
          setTasks(data.data || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("❌ Error fetching tasks:", err);
          setError(err instanceof Error ? err.message : "Failed to load tasks");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchTasks();

    const interval = setInterval(fetchTasks, 30000); // Refresh every 30 seconds

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentEmployee]);

  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedTaskForAssign, setSelectedTaskForAssign] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"open" | "closed">("open");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");

  async function handleAssignEmployees(workOrderId: string) {
    // Use workOrderNumber if available, otherwise use the provided ID
    const task = tasks.find(t => t.id === workOrderId);
    const idToUse = task?.workOrderNumber?.toString() || workOrderId;
    setSelectedTaskForAssign(idToUse);
    setShowAssignModal(true);
  }

  async function handleStartWork(workOrderId: string) {
    // Use workOrderNumber if available, otherwise use the provided ID
    const task = tasks.find(t => t.id === workOrderId);
    const idToUse = task?.workOrderNumber?.toString() || workOrderId;
    setActionLoading(workOrderId);
    try {
      await apiPost(`/v1/work-orders/${idToUse}/start`, {});
      window.location.reload();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      } else {
        alert("Failed to start work");
      }
    } finally {
      setActionLoading(null);
    }
  }

  // Filter tasks based on status
  const openTasks = tasks.filter(
    (t) => t.status !== "COMPLETED" && t.status !== "CANCELED",
  );
  const closedTasks = tasks.filter(
    (t) => t.status === "COMPLETED" || t.status === "CANCELED",
  );

  // Sub-filters for open tasks (mainly for Head of Technical)
  const unassignedTasks = openTasks.filter(
    (t) => t.status === "CREATED",
  );
  const assignedInProgressTasks = openTasks.filter(
    (t) => (t.status === "LINKED_TO_GROUP" || t.status === "IN_PROGRESS") && !t.techEmployeeComment,
  );
  const waitingApprovalTasks = openTasks.filter(
    (t) => t.status === "IN_PROGRESS" && !!t.techEmployeeComment,
  );

  // Apply filter to get displayed tasks
  const getFilteredTasks = () => {
    if (activeTab === "closed") return closedTasks;
    
    switch (taskFilter) {
      case "unassigned":
        return unassignedTasks;
      case "in_progress":
        return assignedInProgressTasks;
      case "waiting_approval":
        return waitingApprovalTasks;
      default:
        return openTasks;
    }
  };

  const filteredTasks = getFilteredTasks();

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-zinc-600">Loading tasks...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="rounded-3xl bg-red-50 p-6 ring-1 ring-red-200">
          <div className="text-sm font-semibold text-red-900">Error</div>
          <div className="mt-1 text-sm text-red-700">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
          My Tasks
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
          My Workspace
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {isWorkflowManager
            ? "Review and assign work orders to employees"
            : "View and manage your assigned tasks"}
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4">
        <div className="flex border-b border-zinc-200">
          <button
            type="button"
            onClick={() => { setActiveTab("open"); setTaskFilter("all"); }}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === "open"
                ? "text-emerald-700"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <span className="flex items-center gap-2">
              Open Tasks
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  activeTab === "open"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {openTasks.length}
              </span>
            </span>
            {activeTab === "open" && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ backgroundColor: BRAND }}
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("closed"); setTaskFilter("all"); }}
            className={`relative px-4 py-3 text-sm font-semibold transition-colors ${
              activeTab === "closed"
                ? "text-emerald-700"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            <span className="flex items-center gap-2">
              Closed Tasks
              <span
                className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                  activeTab === "closed"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {closedTasks.length}
              </span>
            </span>
            {activeTab === "closed" && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5"
                style={{ backgroundColor: BRAND }}
              />
            )}
          </button>
        </div>
      </div>

      {/* Filter Buttons (for Open Tasks, mainly useful for workflow managers) */}
      {activeTab === "open" && isWorkflowManager && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTaskFilter("all")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              taskFilter === "all"
                ? "bg-zinc-900 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            All ({openTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setTaskFilter("unassigned")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              taskFilter === "unassigned"
                ? "bg-blue-600 text-white"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100 ring-1 ring-blue-200"
            }`}
          >
            🆕 Unassigned ({unassignedTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setTaskFilter("in_progress")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              taskFilter === "in_progress"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100 ring-1 ring-amber-200"
            }`}
          >
            ⏳ In Progress ({assignedInProgressTasks.length})
          </button>
          <button
            type="button"
            onClick={() => setTaskFilter("waiting_approval")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              taskFilter === "waiting_approval"
                ? "bg-purple-600 text-white"
                : "bg-purple-50 text-purple-700 hover:bg-purple-100 ring-1 ring-purple-200"
            }`}
          >
            ✅ Waiting Approval ({waitingApprovalTasks.length})
          </button>
        </div>
      )}

      {/* Tasks List */}
      <div>
        {filteredTasks.length === 0 ? (
          <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-zinc-200">
            {activeTab === "open" ? (
              <>
                <div className="text-4xl mb-3">✅</div>
                <div className="text-sm font-medium text-zinc-900">
                  {taskFilter === "all" && "All caught up!"}
                  {taskFilter === "unassigned" && "No unassigned tasks"}
                  {taskFilter === "in_progress" && "No tasks in progress"}
                  {taskFilter === "waiting_approval" && "No tasks waiting for approval"}
                </div>
                <div className="text-sm text-zinc-600 mt-1">
                  {taskFilter === "all" && "No open tasks at the moment"}
                  {taskFilter === "unassigned" && "All tasks have been assigned"}
                  {taskFilter === "in_progress" && "No tasks are currently being worked on"}
                  {taskFilter === "waiting_approval" && "No tasks are waiting for your approval"}
                </div>
              </>
            ) : (
              <>
                <div className="text-4xl mb-3">📋</div>
                <div className="text-sm font-medium text-zinc-900">No closed tasks yet</div>
                <div className="text-sm text-zinc-600 mt-1">Completed and canceled tasks will appear here</div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                canAssignEmployees={canAssignEmployees}
                canApprove={canApprove}
                onAssign={activeTab === "open" ? () => handleAssignEmployees(task.id) : undefined}
                onStart={activeTab === "open" ? () => handleStartWork(task.id) : undefined}
                actionLoading={actionLoading === task.id}
                getTypeLabel={getTypeLabel}
                getStatusLabel={getStatusLabel}
              />
            ))}
          </div>
        )}
      </div>

      {/* Assign Employees Modal */}
      {selectedTaskForAssign && (
        <AssignEmployeesModal
          open={showAssignModal}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedTaskForAssign(null);
          }}
          onSuccess={() => {
            setShowAssignModal(false);
            setSelectedTaskForAssign(null);
            window.location.reload();
          }}
          workOrderId={selectedTaskForAssign}
          existingAssignments={
            tasks.find((t) => t.id === selectedTaskForAssign)?.assignments?.map((a) => a.employee.id) || []
          }
        />
      )}
    </div>
  );
}

function TaskCard({
  task,
  canAssignEmployees,
  canApprove,
  onAssign,
  onStart,
  actionLoading,
  getTypeLabel,
  getStatusLabel,
}: {
  task: WorkOrderTask;
  canAssignEmployees: boolean;
  canApprove: boolean;
  onAssign?: () => void;
  onStart?: () => void;
  actionLoading?: boolean;
  getTypeLabel: (value: string) => string;
  getStatusLabel: (value: string) => string;
}) {
  const statusColors: Record<string, string> = {
    CREATED: "bg-blue-100 text-blue-800 ring-blue-200",
    LINKED_TO_GROUP: "bg-purple-100 text-purple-800 ring-purple-200",
    IN_PROGRESS: "bg-amber-100 text-amber-800 ring-amber-200",
    COMPLETED: "bg-emerald-100 text-emerald-800 ring-emerald-200",
    CANCELED: "bg-red-100 text-red-800 ring-red-200",
  };

  const typeIcons: Record<string, string> = {
    INSTALLATION: "🔧",
    DIAGNOSTIC: "🔍",
    RESEARCH: "📋",
    DEACTIVATE: "🔌",
    REPAIR_CHANGE: "🛠️",
    ACTIVATE: "⚡",
  };

  const statusColor = statusColors[task.status] || "bg-zinc-100 text-zinc-800 ring-zinc-200";
  const typeIcon = typeIcons[task.type] || "📦";

  // Step 1 positions can assign employees for CREATED tasks
  const canAssign = canAssignEmployees && task.status === "CREATED";
  // Non-workflow managers can start tasks that are LINKED_TO_GROUP
  const canStart = !canAssignEmployees && !canApprove && task.status === "LINKED_TO_GROUP";
  const waitingApproval = task.status === "IN_PROGRESS" && !!task.techEmployeeComment;
  
  // Check if deadline is overdue
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && 
    task.status !== "COMPLETED" && task.status !== "CANCELED";

  return (
    <Link
      href={`/app/tasks/${task.workOrderNumber || task.id}`}
      className={`block rounded-3xl bg-white p-6 shadow-sm ring-1 transition hover:shadow-md ${
        waitingApproval 
          ? "ring-amber-300 bg-amber-50/30" 
          : isOverdue 
            ? "ring-red-300 bg-red-50/30"
            : "ring-zinc-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Waiting for approval badge - only for Step 5 positions */}
          {waitingApproval && canApprove && (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              <span className="animate-pulse">●</span>
              Waiting for your approval
            </div>
          )}
          
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{typeIcon}</span>
            <h3 className="text-lg font-semibold text-zinc-900 truncate">{task.title}</h3>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${statusColor}`}
            >
              {getStatusLabel(task.status)}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="flex items-center gap-2 text-zinc-600">
              <span className="text-zinc-400">📍</span>
              <span className="font-medium text-zinc-700">{task.building.name}</span>
              <span className="text-xs text-zinc-400">#{task.building.coreId}</span>
            </div>
            
            <div className="flex items-center gap-2 text-zinc-600">
              <span className="text-zinc-400">🏷️</span>
              <span>{getTypeLabel(task.type)}</span>
            </div>

            {task.workOrderAssets && task.workOrderAssets.length > 0 && (
              <div className="flex items-center gap-2 text-zinc-600">
                <span className="text-zinc-400">📱</span>
                <span className="truncate">
                  {task.workOrderAssets.map((wa) => wa.asset.name).join(", ")}
                </span>
              </div>
            )}
            
            {task.assignments && task.assignments.length > 0 && (
              <div className="flex items-center gap-2 text-zinc-600">
                <span className="text-zinc-400">👤</span>
                <span className="truncate">
                  {task.assignments.map((a) => `${a.employee.firstName} ${a.employee.lastName}`).join(", ")}
                </span>
              </div>
            )}
            
            {task.contactNumber && (
              <div className="flex items-center gap-2 text-zinc-600">
                <span className="text-zinc-400">📞</span>
                <span>{task.contactNumber}</span>
              </div>
            )}
            
            {task.deadline && (
              <div className={`flex items-center gap-2 ${isOverdue ? "text-red-600 font-semibold" : "text-zinc-600"}`}>
                <span className={isOverdue ? "text-red-500" : "text-zinc-400"}>📅</span>
                <span>
                  {isOverdue && "⚠️ "}
                  {new Date(task.deadline).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                  {isOverdue && " (Overdue)"}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {canAssign && onAssign && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAssign();
              }}
              disabled={actionLoading}
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: BRAND }}
            >
              👥 Assign
            </button>
          )}

          {canStart && onStart && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onStart();
              }}
              disabled={actionLoading}
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: BRAND }}
            >
              {actionLoading ? "Starting..." : "▶️ Start"}
            </button>
          )}

          {waitingApproval && canApprove && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-600"
            >
              Review →
            </button>
          )}

          <div className="text-xs text-zinc-400 mt-1">
            Created {new Date(task.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        </div>
      </div>
    </Link>
  );
}
