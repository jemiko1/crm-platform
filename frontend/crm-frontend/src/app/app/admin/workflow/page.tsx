"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPatch, apiPost, apiDelete, ApiError } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Position = {
  id: string;
  name: string;
  code: string;
  level?: number;
};

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

function getStepIcon(stepKey: string) {
  const icons: Record<string, string> = {
    ASSIGN_EMPLOYEES: "👥",
    START_WORK: "▶️",
    SUBMIT_PRODUCTS: "📦",
    SUBMIT_DEVICES: "📱",
    SUBMIT_COMPLETION: "📤",
    FINAL_APPROVAL: "✅",
  };
  return icons[stepKey] || "📋";
}

function getStatusColor(status: string | null) {
  const colors: Record<string, string> = {
    CREATED: "bg-blue-100 text-blue-800 ring-blue-200",
    LINKED_TO_GROUP: "bg-purple-100 text-purple-800 ring-purple-200",
    IN_PROGRESS: "bg-amber-100 text-amber-800 ring-amber-200",
  };
  return colors[status || ""] || "bg-zinc-100 text-zinc-800 ring-zinc-200";
}

export default function WorkflowConfigPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Fetch workflow steps and positions
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [stepsData, positionsData] = await Promise.all([
          apiGet<WorkflowStep[]>("/v1/workflow/steps"),
          apiGet<Position[]>("/v1/workflow/positions"),
        ]);

        // Only show Step 1 (ASSIGN_EMPLOYEES) and Step 5 (FINAL_APPROVAL)
        // These are the only configurable steps - other steps are handled by assigned employees
        const configurableSteps = stepsData.filter((step) =>
          ["ASSIGN_EMPLOYEES", "FINAL_APPROVAL"].includes(step.stepKey)
        );

        setSteps(configurableSteps);
        setPositions(positionsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load workflow configuration");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function handleEditStep(step: WorkflowStep) {
    setSelectedStep(step);
    setSelectedPositions(step.assignedPositions.map((ap) => ap.position.id));
  }

  function handleCloseEdit() {
    setSelectedStep(null);
    setSelectedPositions([]);
  }

  function togglePosition(positionId: string) {
    if (selectedPositions.includes(positionId)) {
      setSelectedPositions(selectedPositions.filter((id) => id !== positionId));
    } else {
      setSelectedPositions([...selectedPositions, positionId]);
    }
  }

  // Helper to filter to only configurable steps (Step 1 and Step 5)
  function filterConfigurableSteps(allSteps: WorkflowStep[]) {
    return allSteps.filter((step) =>
      ["ASSIGN_EMPLOYEES", "FINAL_APPROVAL"].includes(step.stepKey)
    );
  }

  async function handleSavePositions() {
    if (!selectedStep) return;

    setSaving(true);
    try {
      await apiPatch(`/v1/workflow/steps/${selectedStep.id}/positions`, {
        positionIds: selectedPositions,
      });

      // Refresh steps (filtered)
      const stepsData = await apiGet<WorkflowStep[]>("/v1/workflow/steps");
      setSteps(filterConfigurableSteps(stepsData));

      handleCloseEdit();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save positions");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStepActive(stepId: string, isActive: boolean) {
    try {
      await apiPatch(`/v1/workflow/steps/${stepId}`, { isActive });
      
      // Refresh steps (filtered)
      const stepsData = await apiGet<WorkflowStep[]>("/v1/workflow/steps");
      setSteps(filterConfigurableSteps(stepsData));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update step");
    }
  }

  if (loading) {
    return (
      <div className="w-full">
        <div className="flex items-center justify-center py-12">
          <div className="text-sm text-zinc-600">Loading workflow configuration...</div>
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
          Admin Panel
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
          Workflow Configuration
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          Configure which positions receive tasks at each step of the work order workflow
        </p>
      </div>

      {/* Info Banner */}
      <div className="mb-6 rounded-3xl bg-blue-50 p-6 ring-1 ring-blue-200">
        <h2 className="text-sm font-semibold text-blue-900 mb-2">📋 Work Order Workflow Configuration</h2>
        <p className="text-sm text-blue-700 mb-3">
          Configure which positions receive tasks at each workflow step:
        </p>
        <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
          <li><strong>Step 1 - Assign Employees:</strong> Receives new work orders and assigns technical employees</li>
          <li><strong>Step 5 - Final Approval:</strong> Reviews completed work, approves products used, and finalizes the order</li>
        </ul>
        <p className="text-xs text-blue-600 mt-3">
          💡 Steps 2-4 (Start Work, Submit Products, Submit Completion) are handled by the employees assigned in Step 1.
        </p>
      </div>

      {/* Workflow Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div
            key={step.id}
            className={`rounded-3xl bg-white p-6 shadow-sm ring-1 ${
              step.isActive ? "ring-zinc-200" : "ring-zinc-100 opacity-60"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* Step Number */}
                <div
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg"
                  style={{ backgroundColor: `${BRAND}15`, color: BRAND }}
                >
                  {getStepIcon(step.stepKey)}
                </div>

                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-zinc-900">
                      Step {step.stepOrder}: {step.stepName}
                    </h3>
                    {step.triggerStatus && (
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${getStatusColor(step.triggerStatus)}`}
                      >
                        {step.triggerStatus}
                      </span>
                    )}
                    {!step.isActive && (
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-500 ring-1 ring-zinc-200">
                        Disabled
                      </span>
                    )}
                  </div>
                  {step.description && (
                    <p className="mt-1 text-sm text-zinc-600">{step.description}</p>
                  )}

                  {/* Work Order Types */}
                  {step.workOrderTypes && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-xs text-zinc-500">Applies to:</span>
                      {(step.workOrderTypes as string[]).map((type) => (
                        <span
                          key={type}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200"
                        >
                          {type}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Assigned Positions */}
                  <div className="mt-3">
                    <div className="text-xs font-medium text-zinc-500 mb-2">
                      Assigned Positions ({step.assignedPositions.length})
                    </div>
                    {step.assignedPositions.length === 0 ? (
                      <div className="text-xs text-amber-600">
                        ⚠️ No positions assigned - no one will receive this task
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {step.assignedPositions.map((ap) => (
                          <span
                            key={ap.id}
                            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ring-1"
                            style={{
                              backgroundColor: `${BRAND}10`,
                              color: BRAND,
                              borderColor: `${BRAND}30`,
                            }}
                          >
                            👤 {ap.position.name}
                            {ap.isPrimaryAssignee && (
                              <span className="text-emerald-600">★</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
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
                  type="button"
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

      {/* Edit Modal */}
      {selectedStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl mx-4">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-zinc-900">
                Edit Positions for: {selectedStep.stepName}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                Select which positions should receive tasks at this workflow step
              </p>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 mb-6">
              {positions.map((position) => {
                const isSelected = selectedPositions.includes(position.id);
                return (
                  <button
                    key={position.id}
                    type="button"
                    onClick={() => togglePosition(position.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition ring-1 ${
                      isSelected
                        ? "bg-emerald-50 ring-emerald-300"
                        : "bg-zinc-50 ring-zinc-200 hover:bg-zinc-100"
                    }`}
                  >
                    <div
                      className={`flex h-5 w-5 items-center justify-center rounded-md ${
                        isSelected ? "bg-emerald-600" : "bg-white ring-1 ring-zinc-300"
                      }`}
                    >
                      {isSelected && (
                        <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                          <path d="M10.28 2.28L3.989 8.575 1.695 6.28A1 1 0 00.28 7.695l3 3a1 1 0 001.414 0l7-7A1 1 0 0010.28 2.28z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-zinc-900">{position.name}</div>
                      <div className="text-xs text-zinc-500">{position.code}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCloseEdit}
                className="flex-1 rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePositions}
                disabled={saving}
                className="flex-1 rounded-2xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
