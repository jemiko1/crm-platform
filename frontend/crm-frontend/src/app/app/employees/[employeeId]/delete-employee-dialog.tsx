"use client";

import { useState, useEffect } from "react";
import { apiGet, apiGetList, apiDelete } from "@/lib/api";
import { createPortal } from "react-dom";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string;
  status: string;
  user?: {
    id: string;
    isActive: boolean;
  } | null;
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

type DeleteEmployeeDialogProps = {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function DeleteEmployeeDialog({
  employee,
  open,
  onClose,
  onSuccess,
}: DeleteEmployeeDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [constraints, setConstraints] = useState<DeletionConstraints | null>(null);
  const [allEmployees, setAllEmployees] = useState<Employee[]>([]);
  const [delegateToId, setDelegateToId] = useState<string>("");
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setConfirmText("");
      setDelegateToId("");
      setError(null);
    }
  }, [open]);

  // Load deletion constraints and all employees when dialog opens
  useEffect(() => {
    if (open && employee) {
      setLoadingDetails(true);
      Promise.all([
        apiGet<DeletionConstraints>(`/v1/employees/${employee.id}/deletion-constraints`),
        apiGetList<Employee>("/v1/employees?status=ACTIVE"),
      ])
        .then(([constraintsData, employees]) => {
          setConstraints(constraintsData);
          // Filter out the current employee and terminated employees
          setAllEmployees(
            employees.filter((emp) => emp.id !== employee.id && emp.status === "ACTIVE")
          );
          setLoadingDetails(false);
        })
        .catch((err) => {
          setError(err.message || "Failed to load deletion constraints");
          setLoadingDetails(false);
        });
    }
  }, [open, employee]);

  async function handleDelete() {
    if (!employee || !constraints) return;

    if (confirmText !== "DELETE") {
      setError("Please type DELETE to confirm");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const body = !constraints.canDelete && delegateToId
        ? { delegateToEmployeeId: delegateToId }
        : undefined;

      await apiDelete(`/v1/employees/${employee.id}/hard-delete`, body);

      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to delete employee");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !employee) return null;

  // For employees with user accounts, they must be terminated first
  const needsDismissFirst = employee.user && employee.status !== "TERMINATED";
  
  // Check if there are active items that need delegation
  const hasActiveItems = constraints && !constraints.canDelete;
  const canProceed = !needsDismissFirst && (!hasActiveItems || delegateToId !== "") && confirmText === "DELETE";

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                  <IconTrash />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">
                    {employee.status === "TERMINATED" ? "Delete Permanently" : "Delete Employee"}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-600">
                    {employee.firstName} {employee.lastName} ({employee.employeeId})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
              >
                <IconClose />
              </button>
            </div>
          </div>

          <div className="p-6">
            {error && (
              <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
                {error}
              </div>
            )}

            {loadingDetails ? (
              <div className="text-center py-8 text-zinc-600">
                Checking deletion constraints...
              </div>
            ) : needsDismissFirst ? (
              <div className="space-y-4">
                <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <div className="text-sm font-semibold text-amber-900 mb-1">
                    Dismiss Required First
                  </div>
                  <div className="text-sm text-amber-800">
                    This employee has a login account. You must dismiss them first before permanent deletion.
                    This will deactivate their account and prevent login.
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Permanent deletion warning */}
                <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
                  <div className="text-sm font-semibold text-rose-900 mb-1">
                    Permanent Deletion
                  </div>
                  <div className="text-sm text-rose-800">
                    This action <strong>cannot be undone</strong>. The employee record
                    {employee.user && " and their user account"} will be permanently deleted.
                    Historical references in completed items will show the employee name.
                  </div>
                </div>

                {/* Active Leads */}
                {constraints && constraints.activeLeadsCount > 0 && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className="text-sm font-semibold text-amber-900 mb-3">
                      Active Leads ({constraints.activeLeadsCount})
                    </div>
                    <div className="text-sm text-amber-800 mb-3">
                      These active leads will be delegated to the selected employee:
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
                      These work order assignments will be delegated:
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
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Select an employee...</option>
                      {allEmployees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.firstName} {emp.lastName} ({emp.employeeId})
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-zinc-600">
                      Active leads and work order assignments will be delegated to this employee.
                    </div>
                  </div>
                )}

                {/* Confirmation Input */}
                <div>
                  <label className="block text-sm font-semibold text-zinc-900">
                    Type <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-rose-600">DELETE</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                    placeholder="DELETE"
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
                    onClick={handleDelete}
                    disabled={loading || !canProceed}
                    className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                  >
                    {loading
                      ? "Deleting..."
                      : hasActiveItems
                      ? "Delegate & Delete"
                      : "Delete Permanently"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-rose-600">
      <path
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
