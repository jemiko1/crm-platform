"use client";

import React, { useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(8, 117, 56)";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string;
  status: string;
  position?: {
    id: string;
    name: string;
    code: string;
  } | null;
};

type AssignEmployeesModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  workOrderId: string;
  existingAssignments?: string[]; // Employee IDs already assigned
};

export default function AssignEmployeesModal({
  open,
  onClose,
  onSuccess,
  workOrderId,
  existingAssignments = [],
}: AssignEmployeesModalProps) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch employees
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function fetchEmployees() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiGet<Employee[]>("/v1/employees?status=ACTIVE");
        if (!cancelled) {
          setEmployees(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load employees");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEmployees();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Initialize on open
  useEffect(() => {
    if (!open) return;

    setEmployeeSearch("");
    setSelectedEmployees([]);
    setError(null);
  }, [open]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees;
    const query = employeeSearch.toLowerCase();
    return employees.filter(
      (e) =>
        e.firstName.toLowerCase().includes(query) ||
        e.lastName.toLowerCase().includes(query) ||
        e.email.toLowerCase().includes(query) ||
        e.employeeId.toLowerCase().includes(query),
    );
  }, [employees, employeeSearch]);

  // Filter out already assigned employees
  const availableEmployees = useMemo(() => {
    return filteredEmployees.filter((e) => !existingAssignments.includes(e.id));
  }, [filteredEmployees, existingAssignments]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedEmployees.length === 0) {
      setError("Please select at least one employee");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await apiPost(`/v1/work-orders/${workOrderId}/assign`, {
        employeeIds: selectedEmployees,
      });

      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to assign employees");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {t("workOrders.actions.assign", "Assign Employees")}
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Select employees to assign to this work order
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* Search */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-900">
                  Search Employees
                </label>
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Search by name, email, or employee ID..."
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Employee List */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-900">
                  Select Employees <span className="text-red-600">*</span>
                </label>
                {loading ? (
                  <div className="rounded-2xl bg-zinc-50 p-8 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
                    Loading employees...
                  </div>
                ) : availableEmployees.length === 0 ? (
                  <div className="rounded-2xl bg-zinc-50 p-8 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
                    {employeeSearch
                      ? "No employees found matching your search"
                      : "No available employees to assign"}
                  </div>
                ) : (
                  <div className="max-h-96 space-y-2 overflow-y-auto">
                    {availableEmployees.map((employee) => {
                      const isSelected = selectedEmployees.includes(employee.id);
                      return (
                        <label
                          key={employee.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 ring-1 transition ${
                            isSelected
                              ? "bg-emerald-50 ring-emerald-300"
                              : "bg-white ring-zinc-200 hover:bg-zinc-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              if (isSelected) {
                                setSelectedEmployees((prev) =>
                                  prev.filter((id) => id !== employee.id),
                                );
                              } else {
                                setSelectedEmployees((prev) => [...prev, employee.id]);
                              }
                            }}
                            className="h-5 w-5 rounded border-zinc-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-semibold text-zinc-900">
                              {employee.firstName} {employee.lastName}
                            </div>
                            <div className="mt-0.5 text-xs text-zinc-500">
                              {employee.email} • {employee.employeeId}
                            </div>
                            {employee.position && (
                              <div className="mt-0.5 text-xs text-zinc-400">
                                {employee.position.name}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Count */}
              {selectedEmployees.length > 0 && (
                <div className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                  <div className="text-sm font-semibold text-emerald-900">
                    {selectedEmployees.length} employee{selectedEmployees.length !== 1 ? "s" : ""}{" "}
                    selected
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                  <div className="text-sm text-red-900">{error}</div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={submitting}
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedEmployees.length === 0}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {submitting ? "Assigning..." : "Assign Employees"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
