"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiPost, apiGet, apiGetList, ApiError } from "@/lib/api";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
  status: string;
  user?: { id: string; isActive: boolean } | null;
};

type ActiveLead = {
  id: string;
  name: string;
  status: string;
  stageName: string;
};

type OpenWorkOrder = {
  id: string;
  workOrderNumber: number;
  status: string;
  buildingName: string;
};

type DeletionConstraints = {
  canDelete: boolean;
  hasUserAccount: boolean;
  isTerminated: boolean;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    status: string;
  };
  activeLeads: ActiveLead[];
  openWorkOrders: OpenWorkOrder[];
  activeLeadsCount: number;
  openWorkOrdersCount: number;
};

type DismissEmployeeModalProps = {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function DismissEmployeeModal({
  employee,
  open,
  onClose,
  onSuccess,
}: DismissEmployeeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [constraints, setConstraints] = useState<DeletionConstraints | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [delegateToId, setDelegateToId] = useState("");
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setConfirmText("");
      setDelegateToId("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (open && employee) {
      setLoadingDetails(true);
      Promise.all([
        apiGet<DeletionConstraints>(`/v1/employees/${employee.id}/deletion-constraints`),
        apiGetList<Employee>("/v1/employees?status=ACTIVE"),
      ])
        .then(([constraintsData, employees]) => {
          setConstraints(constraintsData);
          setAllEmployees(
            employees.filter((emp) => emp.id !== employee.id && emp.status === "ACTIVE" && emp.user)
          );
          setLoadingDetails(false);
        })
        .catch((err) => {
          setError(err.message || "Failed to load employee details");
          setLoadingDetails(false);
        });
    }
  }, [open, employee]);

  async function handleDismiss() {
    if (!employee) return;

    if (confirmText !== "DISMISS") {
      setError("Please type DISMISS to confirm");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body = hasActiveItems && delegateToId
        ? { delegateToEmployeeId: delegateToId }
        : {};

      await apiPost(`/v1/employees/${employee.id}/dismiss`, body);
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to dismiss employee");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !employee) return null;

  const isAlreadyTerminated = employee.status === "TERMINATED";
  const hasActiveItems = constraints && !constraints.canDelete;
  const canProceed =
    !isAlreadyTerminated &&
    (!hasActiveItems || delegateToId !== "") &&
    confirmText === "DISMISS";

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                  <IconAlert />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Dismiss Employee
                  </h2>
                  <p className="mt-1 text-xs text-zinc-600">
                    {employee.firstName} {employee.lastName}
                    {employee.employeeId ? ` (${employee.employeeId})` : ""}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {error && (
              <div className="mb-4 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
                <div className="text-sm text-rose-700">{error}</div>
              </div>
            )}

            {isAlreadyTerminated ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <div className="text-sm text-amber-700">
                    This employee is already terminated.
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : loadingDetails ? (
              <div className="text-center py-8 text-zinc-600">
                Checking active items...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Warning */}
                <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
                  <div className="text-sm font-semibold text-rose-900 mb-1">
                    Warning
                  </div>
                  <div className="text-sm text-rose-800">
                    This action will:
                  </div>
                  <ul className="mt-2 list-disc list-inside text-sm text-rose-800 space-y-1">
                    <li>Set the employee status to <strong>TERMINATED</strong></li>
                    <li>Deactivate their user account (if they have one)</li>
                    {hasActiveItems && (
                      <li>Delegate active items to the selected employee</li>
                    )}
                  </ul>
                </div>

                {/* Active Leads */}
                {constraints && constraints.activeLeadsCount > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-sm font-semibold text-amber-900 mb-3">
                      Active Leads ({constraints.activeLeadsCount})
                    </div>
                    <div className="text-sm text-amber-800 mb-3">
                      These active leads will be reassigned to the selected employee:
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {constraints.activeLeads.map((lead) => (
                        <div
                          key={lead.id}
                          className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-700 border border-amber-200"
                        >
                          <span className="font-medium">{lead.name}</span>
                          <span className="text-zinc-500 ml-2">
                            ({lead.stageName})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Open Work Orders */}
                {constraints && constraints.openWorkOrdersCount > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-sm font-semibold text-amber-900 mb-3">
                      Open Work Orders ({constraints.openWorkOrdersCount})
                    </div>
                    <div className="text-sm text-amber-800 mb-3">
                      These work order assignments will be reassigned:
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {constraints.openWorkOrders.map((wo) => (
                        <div
                          key={wo.id}
                          className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-700 border border-amber-200"
                        >
                          <span className="font-medium">WO-{wo.workOrderNumber}</span>
                          <span className="text-zinc-500 ml-2">
                            {wo.buildingName} ({wo.status})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delegation Selection */}
                {hasActiveItems && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Delegate Active Items To{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={delegateToId}
                      onChange={(e) => setDelegateToId(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                    >
                      <option value="">Select an employee...</option>
                      {allEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName}
                          {emp.employeeId ? ` (${emp.employeeId})` : ""}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-zinc-600">
                      Active leads and work order assignments will be reassigned to this employee.
                    </div>
                  </div>
                )}

                {/* No active items message */}
                {constraints && constraints.canDelete && (
                  <div className="rounded-xl bg-teal-50 p-4 ring-1 ring-teal-200">
                    <div className="text-sm text-teal-800">
                      This employee has no active leads or open work orders. No delegation needed.
                    </div>
                  </div>
                )}

                {/* Confirmation Input */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-900">
                    Type{" "}
                    <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-rose-600">
                      DISMISS
                    </span>{" "}
                    to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="DISMISS"
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDismiss}
                    disabled={loading || !canProceed}
                    className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    {loading
                      ? "Dismissing..."
                      : hasActiveItems
                      ? "Delegate & Dismiss"
                      : "Dismiss Employee"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-rose-600">
      <path
        d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
