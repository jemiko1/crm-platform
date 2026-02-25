"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

const BRAND = "rgb(8, 117, 56)";

// ─── Types ───────────────────────────────────────────────

type Position = { id: string; name: string; code: string };

type AssignedPosition = {
  id: string;
  positionId: string;
  isPrimaryAssignee: boolean;
  notificationType: string;
  position: Position;
};

type WorkflowStep = {
  id: string;
  stepKey: string;
  stepName: string;
  description: string | null;
  stepOrder: number;
  triggerStatus: string | null;
  condition: string | null;
  requiredAction: string | null;
  workOrderTypes: string[] | null;
  isActive: boolean;
  assignedPositions: AssignedPosition[];
};

type TriggerAction = {
  id: string;
  triggerId: string;
  actionType: "SYSTEM_NOTIFICATION" | "EMAIL" | "SMS";
  targetType: string;
  targetPositionIds: string[] | null;
  templateCode: string | null;
  customSubject: string | null;
  customBody: string | null;
  sortOrder: number;
  isActive: boolean;
};

type Trigger = {
  id: string;
  name: string;
  workOrderType: string | null;
  triggerType: "STATUS_CHANGE" | "FIELD_CHANGE" | "INACTIVITY" | "DEADLINE_PROXIMITY";
  condition: any;
  isActive: boolean;
  actions: TriggerAction[];
};

type TriggerOverview = {
  statusChangeTriggers: Trigger[];
  fieldChangeTriggers: Trigger[];
  inactivityTriggers: Trigger[];
  deadlineTriggers: Trigger[];
};

const WORK_ORDER_TYPES = [
  { value: "ALL", label: "All Types" },
  { value: "INSTALLATION", label: "Installation" },
  { value: "DIAGNOSTIC", label: "Diagnostic" },
  { value: "RESEARCH", label: "Research" },
  { value: "DEACTIVATE", label: "Deactivate" },
  { value: "REPAIR_CHANGE", label: "Repair / Change" },
  { value: "ACTIVATE", label: "Activate" },
];

const STAGES = [
  { key: "CREATED", label: "Created", color: "bg-blue-500" },
  { key: "LINKED_TO_GROUP", label: "Technicians Assigned", color: "bg-purple-500" },
  { key: "IN_PROGRESS", label: "Working", color: "bg-amber-500" },
  { key: "WAITING_APPROVAL", label: "Waiting For Approval", color: "bg-orange-500" },
  { key: "COMPLETED_OR_CANCELED", label: "Completed / Canceled", color: "bg-emerald-500" },
];

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  STATUS_CHANGE: "Status Change",
  FIELD_CHANGE: "Field Change",
  INACTIVITY: "Inactivity Timer",
  DEADLINE_PROXIMITY: "Deadline Proximity",
};

const ACTION_TYPE_OPTIONS = [
  { value: "SYSTEM_NOTIFICATION", label: "System Notification" },
  { value: "EMAIL", label: "Email" },
  { value: "SMS", label: "SMS" },
];

const TARGET_TYPE_OPTIONS = [
  { value: "ASSIGNED_EMPLOYEES", label: "Assigned Employees" },
  { value: "POSITION", label: "Specific Positions" },
  { value: "RESPONSIBLE", label: "All Workflow Responsible" },
];

// ─── Main Component ──────────────────────────────────────

export default function WorkflowConfigPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Existing steps/positions
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [savingPositions, setSavingPositions] = useState(false);

  // Trigger system
  const [activeType, setActiveType] = useState("ALL");
  const [overview, setOverview] = useState<TriggerOverview | null>(null);
  const [activeTab, setActiveTab] = useState<"flow" | "triggers">("flow");

  // Trigger modal
  const [showTriggerModal, setShowTriggerModal] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | null>(null);
  const [triggerForm, setTriggerForm] = useState({
    name: "",
    triggerType: "STATUS_CHANGE" as Trigger["triggerType"],
    workOrderType: null as string | null,
    isActive: true,
    condFromStatus: "",
    condToStatus: "",
    condField: "",
    condMinutes: 120,
    condMinutesBefore: 180,
    condInStatus: "",
  });
  const [savingTrigger, setSavingTrigger] = useState(false);

  // Action modal
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionTriggerId, setActionTriggerId] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<TriggerAction | null>(null);
  const [actionForm, setActionForm] = useState({
    actionType: "SYSTEM_NOTIFICATION" as TriggerAction["actionType"],
    targetType: "ASSIGNED_EMPLOYEES",
    targetPositionIds: [] as string[],
    templateCode: "",
    customSubject: "",
    customBody: "",
  });
  const [savingAction, setSavingAction] = useState(false);

  // ─── Data Loading ────────────────────────────────────

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [stepsData, positionsData, overviewData] = await Promise.all([
        apiGet<WorkflowStep[]>("/v1/workflow/steps"),
        apiGet<Position[]>("/v1/workflow/positions"),
        apiGet<TriggerOverview>(
          `/v1/workflow/triggers/overview${activeType !== "ALL" ? `?workOrderType=${activeType}` : ""}`,
        ),
      ]);
      const configurableSteps = stepsData.filter((s) =>
        ["ASSIGN_EMPLOYEES", "FINAL_APPROVAL"].includes(s.stepKey),
      );
      setSteps(configurableSteps);
      setPositions(positionsData);
      setOverview(overviewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => {
    load();
  }, [load]);

  // ─── Step Position Editing (preserved logic) ────────

  function handleEditStep(step: WorkflowStep) {
    setSelectedStep(step);
    setSelectedPositions(step.assignedPositions.map((ap) => ap.position.id));
  }

  async function handleSavePositions() {
    if (!selectedStep) return;
    setSavingPositions(true);
    try {
      await apiPatch(`/v1/workflow/steps/${selectedStep.id}/positions`, {
        positionIds: selectedPositions,
      });
      await load();
      setSelectedStep(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingPositions(false);
    }
  }

  async function toggleStepActive(stepId: string, isActive: boolean) {
    try {
      await apiPatch(`/v1/workflow/steps/${stepId}`, { isActive });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  }

  // ─── Trigger CRUD ──────────────────────────────────

  function openCreateTrigger() {
    setEditingTrigger(null);
    setTriggerForm({
      name: "",
      triggerType: "STATUS_CHANGE",
      workOrderType: activeType !== "ALL" ? activeType : null,
      isActive: true,
      condFromStatus: "",
      condToStatus: "",
      condField: "",
      condMinutes: 120,
      condMinutesBefore: 180,
      condInStatus: "",
    });
    setShowTriggerModal(true);
  }

  function openEditTrigger(trigger: Trigger) {
    setEditingTrigger(trigger);
    const c = trigger.condition || {};
    setTriggerForm({
      name: trigger.name,
      triggerType: trigger.triggerType,
      workOrderType: trigger.workOrderType,
      isActive: trigger.isActive,
      condFromStatus: c.fromStatus || "",
      condToStatus: c.toStatus || "",
      condField: c.field || "",
      condMinutes: c.minutes || 120,
      condMinutesBefore: c.minutesBefore || 180,
      condInStatus: c.inStatus || "",
    });
    setShowTriggerModal(true);
  }

  function buildCondition() {
    switch (triggerForm.triggerType) {
      case "STATUS_CHANGE":
        return {
          ...(triggerForm.condFromStatus && { fromStatus: triggerForm.condFromStatus }),
          ...(triggerForm.condToStatus && { toStatus: triggerForm.condToStatus }),
        };
      case "FIELD_CHANGE":
        return { field: triggerForm.condField };
      case "INACTIVITY":
        return { minutes: triggerForm.condMinutes, inStatus: triggerForm.condInStatus };
      case "DEADLINE_PROXIMITY":
        return { minutesBefore: triggerForm.condMinutesBefore };
    }
  }

  async function handleSaveTrigger() {
    setSavingTrigger(true);
    try {
      const payload = {
        name: triggerForm.name,
        triggerType: triggerForm.triggerType,
        workOrderType: triggerForm.workOrderType || undefined,
        isActive: triggerForm.isActive,
        condition: buildCondition(),
      };
      if (editingTrigger) {
        await apiPatch(`/v1/workflow/triggers/${editingTrigger.id}`, payload);
      } else {
        await apiPost("/v1/workflow/triggers", payload);
      }
      setShowTriggerModal(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save trigger");
    } finally {
      setSavingTrigger(false);
    }
  }

  async function handleDeleteTrigger(id: string) {
    if (!confirm("Delete this trigger and all its actions?")) return;
    try {
      await apiDelete(`/v1/workflow/triggers/${id}`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleToggleTrigger(trigger: Trigger) {
    try {
      await apiPatch(`/v1/workflow/triggers/${trigger.id}`, { isActive: !trigger.isActive });
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update");
    }
  }

  // ─── Action CRUD ───────────────────────────────────

  function openCreateAction(triggerId: string) {
    setActionTriggerId(triggerId);
    setEditingAction(null);
    setActionForm({
      actionType: "SYSTEM_NOTIFICATION",
      targetType: "ASSIGNED_EMPLOYEES",
      targetPositionIds: [],
      templateCode: "",
      customSubject: "",
      customBody: "",
    });
    setShowActionModal(true);
  }

  function openEditAction(triggerId: string, action: TriggerAction) {
    setActionTriggerId(triggerId);
    setEditingAction(action);
    setActionForm({
      actionType: action.actionType,
      targetType: action.targetType,
      targetPositionIds: (action.targetPositionIds as string[]) || [],
      templateCode: action.templateCode || "",
      customSubject: action.customSubject || "",
      customBody: action.customBody || "",
    });
    setShowActionModal(true);
  }

  async function handleSaveAction() {
    if (!actionTriggerId) return;
    setSavingAction(true);
    try {
      const payload = {
        actionType: actionForm.actionType,
        targetType: actionForm.targetType,
        targetPositionIds: actionForm.targetType === "POSITION" ? actionForm.targetPositionIds : undefined,
        templateCode: actionForm.templateCode || undefined,
        customSubject: actionForm.customSubject || undefined,
        customBody: actionForm.customBody || undefined,
      };
      if (editingAction) {
        await apiPatch(`/v1/workflow/triggers/actions/${editingAction.id}`, payload);
      } else {
        await apiPost(`/v1/workflow/triggers/${actionTriggerId}/actions`, payload);
      }
      setShowActionModal(false);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save action");
    } finally {
      setSavingAction(false);
    }
  }

  async function handleDeleteAction(actionId: string) {
    if (!confirm("Delete this action?")) return;
    try {
      await apiDelete(`/v1/workflow/triggers/actions/${actionId}`);
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  // ─── Helpers ───────────────────────────────────────

  function allTriggers(): Trigger[] {
    if (!overview) return [];
    return [
      ...overview.statusChangeTriggers,
      ...overview.fieldChangeTriggers,
      ...overview.inactivityTriggers,
      ...overview.deadlineTriggers,
    ];
  }

  function triggersForStage(stageKey: string): Trigger[] {
    if (!overview) return [];
    return overview.statusChangeTriggers.filter((t) => {
      const c = t.condition as any;
      if (stageKey === "WAITING_APPROVAL") return c.field === "techEmployeeComment";
      if (stageKey === "COMPLETED_OR_CANCELED") return c.toStatus === "COMPLETED" || c.toStatus === "CANCELED";
      return c.toStatus === stageKey || c.fromStatus === stageKey;
    });
  }

  function describeCondition(trigger: Trigger): string {
    const c = trigger.condition as any;
    switch (trigger.triggerType) {
      case "STATUS_CHANGE": {
        const from = c.fromStatus ? STAGES.find((s) => s.key === c.fromStatus)?.label || c.fromStatus : "Any";
        const to = c.toStatus ? STAGES.find((s) => s.key === c.toStatus)?.label || c.toStatus : "Any";
        return `${from} -> ${to}`;
      }
      case "FIELD_CHANGE":
        return `Field "${c.field}" changed`;
      case "INACTIVITY":
        return `No action for ${c.minutes || 120} min in ${c.inStatus || "any status"}`;
      case "DEADLINE_PROXIMITY":
        return `< ${c.minutesBefore || 180} min before deadline`;
    }
  }

  function actionBadgeColor(type: string) {
    switch (type) {
      case "EMAIL": return "bg-sky-100 text-sky-800 ring-sky-200";
      case "SMS": return "bg-violet-100 text-violet-800 ring-violet-200";
      default: return "bg-zinc-100 text-zinc-800 ring-zinc-200";
    }
  }

  // ─── Render ────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-zinc-600">Loading workflow configuration...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-3xl bg-red-50 p-6 ring-1 ring-red-200">
        <div className="text-sm font-semibold text-red-900">Error</div>
        <div className="mt-1 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <PermissionGuard permission="admin.access">
      <div className="w-full">
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
            Admin Panel
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
            Workflow Configuration
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Configure work order workflow, notification triggers, and automated actions
          </p>
        </div>

        {/* Work Order Type Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {WORK_ORDER_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setActiveType(t.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ring-1 ${
                activeType === t.value
                  ? "text-white ring-transparent"
                  : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50"
              }`}
              style={activeType === t.value ? { backgroundColor: BRAND } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Flow / Triggers toggle */}
        <div className="mb-6 flex gap-1 rounded-2xl bg-zinc-100 p-1 w-fit">
          {(["flow", "triggers"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-xl px-5 py-2 text-xs font-semibold transition ${
                activeTab === tab ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {tab === "flow" ? "Visual Flow & Steps" : "Triggers & Actions"}
            </button>
          ))}
        </div>

        {activeTab === "flow" && (
          <>
            {/* Visual 5-Stage Flow */}
            <div className="mb-8 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Work Order Stage Flow</h2>
              <div className="flex flex-wrap items-center gap-2">
                {STAGES.map((stage, i) => (
                  <React.Fragment key={stage.key}>
                    <div className="flex flex-col items-center gap-1.5 min-w-[120px]">
                      <div className={`h-2 w-full rounded-full ${stage.color} opacity-80`} />
                      <span className="text-xs font-semibold text-zinc-800 text-center">
                        {i + 1}. {stage.label}
                      </span>
                      {/* Show count of triggers for this stage */}
                      {triggersForStage(stage.key).length > 0 && (
                        <span className="text-[10px] text-zinc-500">
                          {triggersForStage(stage.key).length} trigger(s)
                        </span>
                      )}
                    </div>
                    {i < STAGES.length - 1 && (
                      <svg className="h-4 w-4 text-zinc-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Workflow Steps (position assignments) */}
            <div className="space-y-4">
              <h2 className="text-sm font-semibold text-zinc-900">Position Assignments</h2>
              <div className="rounded-3xl bg-blue-50 p-5 ring-1 ring-blue-200">
                <p className="text-xs text-blue-700">
                  <strong>Step 1 (Assign Employees)</strong> receives new work orders.{" "}
                  <strong>Step 5 (Final Approval)</strong> reviews completed work.
                  Steps 2-4 are handled by the employees assigned in Step 1.
                </p>
              </div>
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ${
                    step.isActive ? "ring-zinc-200" : "ring-zinc-100 opacity-60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-zinc-900">
                          Step {step.stepOrder}: {step.stepName}
                        </h3>
                        {step.triggerStatus && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-200">
                            {step.triggerStatus}
                          </span>
                        )}
                        {!step.isActive && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-200">
                            Disabled
                          </span>
                        )}
                      </div>
                      {step.description && <p className="mt-1 text-xs text-zinc-600">{step.description}</p>}

                      <div className="mt-2">
                        {step.assignedPositions.length === 0 ? (
                          <span className="text-xs text-amber-600">No positions assigned</span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {step.assignedPositions.map((ap) => (
                              <span
                                key={ap.id}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1"
                                style={{ backgroundColor: `${BRAND}10`, color: BRAND, borderColor: `${BRAND}30` }}
                              >
                                {ap.position.name}
                                {ap.isPrimaryAssignee && <span className="text-emerald-600">*</span>}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleStepActive(step.id, !step.isActive)}
                        className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                          step.isActive
                            ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                      >
                        {step.isActive ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => handleEditStep(step)}
                        className="rounded-xl px-3 py-1.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: BRAND }}
                      >
                        Edit Positions
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {activeTab === "triggers" && (
          <>
            {/* Add Trigger button */}
            <div className="mb-4 flex justify-end">
              <button
                onClick={openCreateTrigger}
                className="rounded-xl px-4 py-2 text-xs font-semibold text-white"
                style={{ backgroundColor: BRAND }}
              >
                + New Trigger
              </button>
            </div>

            {/* Trigger groups */}
            {overview &&
              (["STATUS_CHANGE", "FIELD_CHANGE", "INACTIVITY", "DEADLINE_PROXIMITY"] as const).map((triggerType) => {
                const group =
                  triggerType === "STATUS_CHANGE"
                    ? overview.statusChangeTriggers
                    : triggerType === "FIELD_CHANGE"
                      ? overview.fieldChangeTriggers
                      : triggerType === "INACTIVITY"
                        ? overview.inactivityTriggers
                        : overview.deadlineTriggers;

                return (
                  <div key={triggerType} className="mb-6">
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                      {TRIGGER_TYPE_LABELS[triggerType]} ({group.length})
                    </h3>

                    {group.length === 0 && (
                      <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500 ring-1 ring-zinc-200">
                        No triggers configured
                      </div>
                    )}

                    <div className="space-y-3">
                      {group.map((trigger) => (
                        <div
                          key={trigger.id}
                          className={`rounded-3xl bg-white p-5 shadow-sm ring-1 ${
                            trigger.isActive ? "ring-zinc-200" : "ring-zinc-100 opacity-60"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-sm font-semibold text-zinc-900">{trigger.name}</h4>
                                {trigger.workOrderType && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-zinc-200">
                                    {trigger.workOrderType}
                                  </span>
                                )}
                                {!trigger.isActive && (
                                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500 ring-1 ring-zinc-200">
                                    Disabled
                                  </span>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-zinc-500">{describeCondition(trigger)}</p>

                              {/* Actions */}
                              <div className="mt-3 space-y-1.5">
                                {trigger.actions.length === 0 && (
                                  <span className="text-xs text-amber-600">No actions configured</span>
                                )}
                                {trigger.actions.map((action) => (
                                  <div
                                    key={action.id}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <span className={`rounded-full px-2 py-0.5 font-medium ring-1 ${actionBadgeColor(action.actionType)}`}>
                                      {action.actionType}
                                    </span>
                                    <span className="text-zinc-600">
                                      to {action.targetType === "POSITION" ? "specific positions" : action.targetType.toLowerCase().replace(/_/g, " ")}
                                    </span>
                                    {action.templateCode && (
                                      <span className="text-zinc-400">({action.templateCode})</span>
                                    )}
                                    <button
                                      onClick={() => openEditAction(trigger.id, action)}
                                      className="text-zinc-400 hover:text-zinc-700 ml-1"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                      </svg>
                                    </button>
                                    <button
                                      onClick={() => handleDeleteAction(action.id)}
                                      className="text-zinc-400 hover:text-red-600"
                                    >
                                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                ))}
                                <button
                                  onClick={() => openCreateAction(trigger.id)}
                                  className="text-xs font-medium hover:underline mt-1"
                                  style={{ color: BRAND }}
                                >
                                  + Add Action
                                </button>
                              </div>
                            </div>

                            {/* Trigger actions */}
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={() => handleToggleTrigger(trigger)}
                                className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                                  trigger.isActive
                                    ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                                    : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                                }`}
                              >
                                {trigger.isActive ? "Disable" : "Enable"}
                              </button>
                              <button
                                onClick={() => openEditTrigger(trigger)}
                                className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteTrigger(trigger.id)}
                                className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </>
        )}

        {/* ── Edit Positions Modal ──────────────────────── */}
        {selectedStep && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl mx-4">
              <h2 className="text-lg font-semibold text-zinc-900 mb-1">
                Edit Positions: {selectedStep.stepName}
              </h2>
              <p className="text-sm text-zinc-600 mb-4">Select positions for this step</p>

              <div className="max-h-80 overflow-y-auto space-y-2 mb-6">
                {positions.map((pos) => {
                  const sel = selectedPositions.includes(pos.id);
                  return (
                    <button
                      key={pos.id}
                      onClick={() =>
                        setSelectedPositions((prev) =>
                          sel ? prev.filter((id) => id !== pos.id) : [...prev, pos.id],
                        )
                      }
                      className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition ring-1 ${
                        sel ? "bg-emerald-50 ring-emerald-300" : "bg-zinc-50 ring-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 items-center justify-center rounded-md ${
                          sel ? "bg-emerald-600" : "bg-white ring-1 ring-zinc-300"
                        }`}
                      >
                        {sel && (
                          <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                            <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-zinc-900">{pos.name}</div>
                        <div className="text-xs text-zinc-500">{pos.code}</div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setSelectedStep(null)}
                  className="flex-1 rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePositions}
                  disabled={savingPositions}
                  className="flex-1 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {savingPositions ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Create/Edit Trigger Modal ─────────────────── */}
        {showTriggerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                {editingTrigger ? "Edit Trigger" : "New Trigger"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Name</label>
                  <input
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    value={triggerForm.name}
                    onChange={(e) => setTriggerForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Notify on creation"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Trigger Type</label>
                  <select
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    value={triggerForm.triggerType}
                    onChange={(e) =>
                      setTriggerForm((f) => ({ ...f, triggerType: e.target.value as any }))
                    }
                  >
                    <option value="STATUS_CHANGE">Status Change</option>
                    <option value="FIELD_CHANGE">Field Change</option>
                    <option value="INACTIVITY">Inactivity Timer</option>
                    <option value="DEADLINE_PROXIMITY">Deadline Proximity</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Work Order Type (leave empty for all)
                  </label>
                  <select
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    value={triggerForm.workOrderType || ""}
                    onChange={(e) =>
                      setTriggerForm((f) => ({ ...f, workOrderType: e.target.value || null }))
                    }
                  >
                    <option value="">All Types</option>
                    {WORK_ORDER_TYPES.filter((t) => t.value !== "ALL").map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {/* Condition fields per trigger type */}
                {triggerForm.triggerType === "STATUS_CHANGE" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">From Status</label>
                      <select
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                        value={triggerForm.condFromStatus}
                        onChange={(e) => setTriggerForm((f) => ({ ...f, condFromStatus: e.target.value }))}
                      >
                        <option value="">Any</option>
                        <option value="CREATED">Created</option>
                        <option value="LINKED_TO_GROUP">Technicians Assigned</option>
                        <option value="IN_PROGRESS">Working</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELED">Canceled</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">To Status</label>
                      <select
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                        value={triggerForm.condToStatus}
                        onChange={(e) => setTriggerForm((f) => ({ ...f, condToStatus: e.target.value }))}
                      >
                        <option value="">Any</option>
                        <option value="CREATED">Created</option>
                        <option value="LINKED_TO_GROUP">Technicians Assigned</option>
                        <option value="IN_PROGRESS">Working</option>
                        <option value="COMPLETED">Completed</option>
                        <option value="CANCELED">Canceled</option>
                      </select>
                    </div>
                  </div>
                )}

                {triggerForm.triggerType === "FIELD_CHANGE" && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Field Name</label>
                    <select
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                      value={triggerForm.condField}
                      onChange={(e) => setTriggerForm((f) => ({ ...f, condField: e.target.value }))}
                    >
                      <option value="">Select field</option>
                      <option value="techEmployeeComment">Tech Employee Comment (Waiting For Approval)</option>
                      <option value="techHeadComment">Tech Head Comment</option>
                      <option value="notes">Notes</option>
                      <option value="deadline">Deadline</option>
                      <option value="cancelReason">Cancel Reason</option>
                    </select>
                  </div>
                )}

                {triggerForm.triggerType === "INACTIVITY" && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">Minutes of Inactivity</label>
                      <input
                        type="number"
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                        value={triggerForm.condMinutes}
                        onChange={(e) =>
                          setTriggerForm((f) => ({ ...f, condMinutes: Number(e.target.value) }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-700 mb-1">While In Status</label>
                      <select
                        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                        value={triggerForm.condInStatus}
                        onChange={(e) => setTriggerForm((f) => ({ ...f, condInStatus: e.target.value }))}
                      >
                        <option value="">Select status</option>
                        <option value="CREATED">Created</option>
                        <option value="LINKED_TO_GROUP">Technicians Assigned</option>
                        <option value="IN_PROGRESS">Working</option>
                      </select>
                    </div>
                  </div>
                )}

                {triggerForm.triggerType === "DEADLINE_PROXIMITY" && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Minutes Before Deadline
                    </label>
                    <input
                      type="number"
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                      value={triggerForm.condMinutesBefore}
                      onChange={(e) =>
                        setTriggerForm((f) => ({ ...f, condMinutesBefore: Number(e.target.value) }))
                      }
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="triggerActive"
                    checked={triggerForm.isActive}
                    onChange={(e) => setTriggerForm((f) => ({ ...f, isActive: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-400"
                  />
                  <label htmlFor="triggerActive" className="text-sm text-zinc-700">Active</label>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowTriggerModal(false)}
                  className="flex-1 rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTrigger}
                  disabled={savingTrigger || !triggerForm.name}
                  className="flex-1 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {savingTrigger ? "Saving..." : editingTrigger ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Create/Edit Action Modal ──────────────────── */}
        {showActionModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                {editingAction ? "Edit Action" : "New Action"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Action Type</label>
                  <select
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                    value={actionForm.actionType}
                    onChange={(e) =>
                      setActionForm((f) => ({ ...f, actionType: e.target.value as any }))
                    }
                  >
                    {ACTION_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Target</label>
                  <select
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                    value={actionForm.targetType}
                    onChange={(e) => setActionForm((f) => ({ ...f, targetType: e.target.value }))}
                  >
                    {TARGET_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                {actionForm.targetType === "POSITION" && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">Select Positions</label>
                    <div className="max-h-40 overflow-y-auto space-y-1 rounded-xl border border-zinc-200 p-2">
                      {positions.map((pos) => {
                        const sel = actionForm.targetPositionIds.includes(pos.id);
                        return (
                          <button
                            key={pos.id}
                            onClick={() =>
                              setActionForm((f) => ({
                                ...f,
                                targetPositionIds: sel
                                  ? f.targetPositionIds.filter((id) => id !== pos.id)
                                  : [...f.targetPositionIds, pos.id],
                              }))
                            }
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-xs ${
                              sel ? "bg-emerald-50 text-emerald-800" : "hover:bg-zinc-50 text-zinc-700"
                            }`}
                          >
                            <div
                              className={`h-3.5 w-3.5 rounded flex-shrink-0 ${
                                sel ? "bg-emerald-600" : "ring-1 ring-zinc-300"
                              }`}
                            />
                            {pos.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Template Code (optional)
                  </label>
                  <input
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                    value={actionForm.templateCode}
                    onChange={(e) => setActionForm((f) => ({ ...f, templateCode: e.target.value }))}
                    placeholder="e.g. WO_CREATED_NOTIFY"
                  />
                </div>

                {actionForm.actionType === "EMAIL" && (
                  <div>
                    <label className="block text-xs font-medium text-zinc-700 mb-1">
                      Custom Subject (if no template)
                    </label>
                    <input
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                      value={actionForm.customSubject}
                      onChange={(e) =>
                        setActionForm((f) => ({ ...f, customSubject: e.target.value }))
                      }
                      placeholder="Work Order #{{workOrderNumber}} Update"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">
                    Custom Body (if no template)
                  </label>
                  <textarea
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm h-20 resize-none"
                    value={actionForm.customBody}
                    onChange={(e) => setActionForm((f) => ({ ...f, customBody: e.target.value }))}
                    placeholder="Work Order #{{workOrderNumber}}: {{title}} ..."
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">
                    {"Available variables: {{workOrderNumber}}, {{title}}, {{type}}"}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowActionModal(false)}
                  className="flex-1 rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveAction}
                  disabled={savingAction}
                  className="flex-1 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {savingAction ? "Saving..." : editingAction ? "Update" : "Add Action"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
