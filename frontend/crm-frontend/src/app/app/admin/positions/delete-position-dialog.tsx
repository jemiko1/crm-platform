"use client";

import { useState, useEffect } from "react";
import { apiGet, apiDelete } from "@/lib/api";
import { createPortal } from "react-dom";

const BRAND = "rgb(8, 117, 56)";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string;
  status: string;
};

type Position = {
  id: string;
  name: string;
  employees?: Employee[];
  _count?: {
    employees: number;
  };
};

type DeletePositionDialogProps = {
  position: Position | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function DeletePositionDialog({
  position,
  open,
  onClose,
  onSuccess,
}: DeletePositionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allPositions, setAllPositions] = useState<Position[]>([]);
  const [replacementId, setReplacementId] = useState<string>("");
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load position details and all positions when dialog opens
  useEffect(() => {
    if (open && position) {
      setLoadingDetails(true);
      Promise.all([
        apiGet<Position>(`/v1/positions/${position.id}`),
        apiGet<Position[]>("/v1/positions"),
      ])
        .then(([details, allPositions]) => {
          // Filter to only active employees
          const activeEmployees = (details.employees || []).filter(
            (emp) => emp.status === "ACTIVE"
          );
          setEmployees(activeEmployees);
          // Filter out the current position from replacement options
          setAllPositions(
            allPositions.filter((pos) => pos.id !== position.id)
          );
          setLoadingDetails(false);
        })
        .catch(() => {
          setError("Failed to load position details");
          setLoadingDetails(false);
        });
    }
  }, [open, position]);

  async function handleDelete() {
    if (!position) return;

    setLoading(true);
    setError(null);

    try {
      const body =
        employees.length > 0 && replacementId
          ? { replacementPositionId: replacementId }
          : undefined;

      await apiDelete(`/v1/positions/${position.id}`, body);

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete position");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !position) return null;

  const hasActiveEmployees = employees.length > 0;
  const canDelete = !hasActiveEmployees || replacementId !== "";

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
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Delete Position
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  {hasActiveEmployees
                    ? "This position is in use by active employees. Assign a replacement before deleting."
                    : "Are you sure you want to delete this position?"}
                </p>
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
                Loading details...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Warning */}
                <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <div className="text-sm font-semibold text-amber-900 mb-1">
                    Warning
                  </div>
                  <div className="text-sm text-amber-800">
                    {hasActiveEmployees
                      ? `This position is currently used by ${employees.length} active employee(s). You must assign a replacement position before deleting.`
                      : "This action cannot be undone. All permissions assigned to this position will be lost."}
                  </div>
                </div>

                {/* Employees List */}
                {hasActiveEmployees && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900 mb-3">
                      Active Employees Using This Position ({employees.length})
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {employees.map((emp) => (
                        <div
                          key={emp.id}
                          className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-700 border border-zinc-200"
                        >
                          <span className="font-medium">
                            {emp.firstName} {emp.lastName}
                          </span>
                          <span className="text-zinc-500 ml-2">
                            ({emp.employeeId})
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Replacement Selection */}
                {hasActiveEmployees && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Replacement Position{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={replacementId}
                      onChange={(e) => setReplacementId(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Select a replacement position...</option>
                      {allPositions.map((pos) => (
                        <option key={pos.id} value={pos.id}>
                          {pos.name} ({pos._count?.employees || 0} employees)
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-zinc-600">
                      All active employees using this position will be reassigned to the selected replacement.
                    </div>
                  </div>
                )}

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
                    disabled={loading || !canDelete}
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: BRAND }}
                  >
                    {loading
                      ? "Deleting..."
                      : hasActiveEmployees
                      ? "Reassign & Delete"
                      : "Delete Position"}
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
