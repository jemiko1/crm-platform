"use client";

import { useState, useEffect, useRef } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import { createPortal } from "react-dom";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle?: string | null;
  status: string;
  departmentId?: string | null;
  positionId?: string | null;
  position?: {
    id: string;
    name: string;
    code: string;
    departmentId?: string | null;
  } | null;
};

type Position = {
  id: string;
  name: string;
  code: string;
  departmentId?: string | null;
  isActive?: boolean;
};

type Department = {
  id: string;
  name: string;
  code: string;
};

type EmployeePopupProps = {
  open: boolean;
  onClose: () => void;
  departmentId: string;
  departmentName: string;
  employees: Employee[];
  positions: Position[];
  allDepartments: Department[];
  onUpdate: () => void;
};

export default function EmployeePopup({
  open,
  onClose,
  departmentId,
  departmentName,
  employees,
  positions,
  allDepartments,
  onUpdate,
}: EmployeePopupProps) {
  const [mounted, setMounted] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<string | null>(null);
  const [transferringEmployee, setTransferringEmployee] = useState<string | null>(null);
  const [selectedPositionId, setSelectedPositionId] = useState<string>("");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>("");
  const [departmentPositions, setDepartmentPositions] = useState<Position[]>([]);
  const [selectedTransferPositionId, setSelectedTransferPositionId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter positions for current department
  const currentDeptPositions = positions.filter(
    (p) => p.departmentId === departmentId && p.isActive !== false
  );

  // Load positions when selecting a department for transfer
  useEffect(() => {
    if (selectedDepartmentId && selectedDepartmentId !== departmentId) {
      apiGet<Position[]>(`/v1/positions`)
        .then((data) => {
          const deptPositions = data.filter(
            (p) => p.departmentId === selectedDepartmentId && p.isActive !== false
          );
          setDepartmentPositions(deptPositions);
        })
        .catch(() => setDepartmentPositions([]));
    } else {
      setDepartmentPositions([]);
    }
  }, [selectedDepartmentId, departmentId]);

  // Check if employee can change department
  function canChangeEmployee(emp: Employee): { canChange: boolean; reason?: string } {
    if (emp.position && emp.position.departmentId && emp.position.departmentId !== departmentId) {
      return {
        canChange: false,
        reason: `Employee has a position (${emp.position.name}) linked to a different department`,
      };
    }
    return { canChange: true };
  }

  async function handlePositionChange(employeeId: string) {
    if (!selectedPositionId) return;
    setLoading(true);
    setError(null);

    try {
      await apiPatch(`/v1/employees/${employeeId}`, {
        positionId: selectedPositionId || null,
      });
      onUpdate();
      setEditingEmployee(null);
      setSelectedPositionId("");
    } catch (err: any) {
      setError(err.message || "Failed to update position");
    } finally {
      setLoading(false);
    }
  }

  async function handleDepartmentTransfer(employeeId: string) {
    if (!selectedDepartmentId || !selectedTransferPositionId) return;
    setLoading(true);
    setError(null);

    try {
      await apiPatch(`/v1/employees/${employeeId}`, {
        departmentId: selectedDepartmentId,
        positionId: selectedTransferPositionId,
      });
      onUpdate();
      setTransferringEmployee(null);
      setSelectedDepartmentId("");
      setSelectedTransferPositionId("");
      setDepartmentPositions([]);
    } catch (err: any) {
      setError(err.message || "Failed to transfer employee");
    } finally {
      setLoading(false);
    }
  }

  function handleCancel() {
    setEditingEmployee(null);
    setTransferringEmployee(null);
    setSelectedPositionId("");
    setSelectedDepartmentId("");
    setSelectedTransferPositionId("");
    setDepartmentPositions([]);
    setError(null);
  }

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200">
        {/* Header */}
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Employees in {departmentName}
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                {employees.length} employee{employees.length !== 1 ? "s" : ""}
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

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-80px)] p-6">
          {error && (
            <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          {employees.length === 0 ? (
            <div className="text-center py-8 text-zinc-500">
              No employees in this department
            </div>
          ) : (
            <div className="space-y-4">
              {employees.map((emp) => {
                const { canChange, reason } = canChangeEmployee(emp);
                const isEditing = editingEmployee === emp.id;
                const isTransferring = transferringEmployee === emp.id;

                return (
                  <div
                    key={emp.id}
                    className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-zinc-900">
                            {emp.firstName} {emp.lastName}
                          </div>
                          {emp.status === "TERMINATED" && (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                              Terminated
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500">{emp.email}</div>
                        <div className="mt-1 text-xs text-zinc-600">
                          Position:{" "}
                          <span className="font-medium">
                            {emp.position?.name || "Not assigned"}
                          </span>
                        </div>
                      </div>

                      {!isEditing && !isTransferring && emp.status !== "TERMINATED" && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingEmployee(emp.id);
                              setSelectedPositionId(emp.positionId || "");
                            }}
                            className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
                          >
                            Change Position
                          </button>
                          <button
                            onClick={() => {
                              if (!canChange) {
                                setError(reason || "Cannot transfer this employee");
                                return;
                              }
                              setTransferringEmployee(emp.id);
                            }}
                            disabled={!canChange}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 ${
                              canChange
                                ? "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100"
                                : "bg-zinc-100 text-zinc-400 ring-zinc-200 cursor-not-allowed"
                            }`}
                            title={!canChange ? reason : "Transfer to another department"}
                          >
                            Transfer
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Position Change Form */}
                    {isEditing && (
                      <div className="mt-4 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-200">
                        <div className="text-xs font-semibold text-blue-900 mb-2">
                          Change Position
                        </div>
                        <select
                          value={selectedPositionId}
                          onChange={(e) => setSelectedPositionId(e.target.value)}
                          className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-zinc-900"
                        >
                          <option value="">No position</option>
                          {currentDeptPositions.map((pos) => (
                            <option key={pos.id} value={pos.id}>
                              {pos.name}
                            </option>
                          ))}
                        </select>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={handleCancel}
                            className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handlePositionChange(emp.id)}
                            disabled={loading}
                            className="flex-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {loading ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Department Transfer Form */}
                    {isTransferring && (
                      <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                        <div className="text-xs font-semibold text-amber-900 mb-2">
                          Transfer to Department
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className="text-xs text-amber-800 mb-1 block">
                              Select Department
                            </label>
                            <select
                              value={selectedDepartmentId}
                              onChange={(e) => {
                                setSelectedDepartmentId(e.target.value);
                                setSelectedTransferPositionId("");
                              }}
                              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-zinc-900"
                            >
                              <option value="">Select department...</option>
                              {allDepartments
                                .filter((d) => d.id !== departmentId)
                                .map((dept) => (
                                  <option key={dept.id} value={dept.id}>
                                    {dept.name}
                                  </option>
                                ))}
                            </select>
                          </div>

                          {selectedDepartmentId && (
                            <div>
                              <label className="text-xs text-amber-800 mb-1 block">
                                Select Position in New Department{" "}
                                <span className="text-rose-500">*</span>
                              </label>
                              {departmentPositions.length === 0 ? (
                                <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-700">
                                  No positions available in this department
                                </div>
                              ) : (
                                <select
                                  value={selectedTransferPositionId}
                                  onChange={(e) =>
                                    setSelectedTransferPositionId(e.target.value)
                                  }
                                  className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-zinc-900"
                                >
                                  <option value="">Select position...</option>
                                  {departmentPositions.map((pos) => (
                                    <option key={pos.id} value={pos.id}>
                                      {pos.name}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={handleCancel}
                              className="flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleDepartmentTransfer(emp.id)}
                              disabled={
                                loading ||
                                !selectedDepartmentId ||
                                !selectedTransferPositionId
                              }
                              className="flex-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                            >
                              {loading ? "Transferring..." : "Transfer"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Warning for employees that can't be transferred */}
                    {!canChange && !isEditing && !isTransferring && (
                      <div className="mt-2 text-xs text-amber-600">
                        ⚠️ {reason}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
        strokeLinejoin="round"
      />
    </svg>
  );
}
