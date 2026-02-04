"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiPatch, apiDelete, ApiError } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Department = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  parent: {
    id: string;
    name: string;
    code: string;
  } | null;
  head: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  _count: {
    employees: number;
    children: number;
  };
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

interface EditDepartmentModalProps {
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  department: Department | null;
  departments: Department[];
  employees: Employee[];
}

export default function EditDepartmentModal({
  open,
  onClose,
  onUpdated,
  department,
  departments,
  employees,
}: EditDepartmentModalProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const [headId, setHeadId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "parent" | "head">("details");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (department) {
      setName(department.name);
      setCode(department.code);
      setDescription(department.description || "");
      setParentId(department.parent?.id || null);
      setHeadId(department.head?.id || null);
      setIsActive(department.isActive);
      setError(null);
    }
  }, [department]);

  // Get available parents (exclude self and descendants)
  function getAvailableParents(): Department[] {
    if (!department) return departments;
    
    // Get all descendants of current department
    const descendants = new Set<string>();
    function collectDescendants(deptId: string) {
      descendants.add(deptId);
      departments.forEach((d) => {
        if (d.parent?.id === deptId) {
          collectDescendants(d.id);
        }
      });
    }
    collectDescendants(department.id);

    return departments.filter((d) => !descendants.has(d.id));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!department) return;

    setLoading(true);
    setError(null);

    try {
      await apiPatch(`/v1/departments/${department.id}`, {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        parentId: parentId || null,
        headId: headId || null,
        isActive,
      });
      onUpdated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to update department");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!department) return;
    
    const hasEmployees = department._count.employees > 0;
    const hasChildren = department._count.children > 0;
    
    if (hasChildren) {
      setError("Cannot delete department with sub-departments. Move or delete them first.");
      return;
    }

    if (hasEmployees) {
      const confirmDelete = window.confirm(
        `This department has ${department._count.employees} employee(s). ` +
        `Deleting will unassign them from this department. Continue?`
      );
      if (!confirmDelete) return;
    }

    const confirmFinal = window.confirm(
      `Are you sure you want to delete "${department.name}"? This action cannot be undone.`
    );
    if (!confirmFinal) return;

    setLoading(true);
    setError(null);

    try {
      await apiDelete(`/v1/departments/${department.id}`);
      onUpdated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to delete department");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !department) return null;

  const availableParents = getAvailableParents();

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-zinc-900">Edit Department</h2>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex gap-2">
            {[
              { id: "details", label: "Details" },
              { id: "parent", label: "Parent Dept" },
              { id: "head", label: "Department Head" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${
                  activeTab === tab.id
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
            {error && (
              <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
                {error}
              </div>
            )}

            {activeTab === "details" && (
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Department Name *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="e.g., Sales Department"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Code *
                  </label>
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    required
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm uppercase focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="e.g., SALES"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Brief description of the department..."
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <label htmlFor="isActive" className="text-sm text-zinc-700">
                    Department is active
                  </label>
                </div>
              </div>
            )}

            {activeTab === "parent" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
                  <strong>Move this department</strong> under another department to create a hierarchy.
                  Select "None" to make it a top-level department.
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Parent Department
                  </label>
                  <select
                    value={parentId || ""}
                    onChange={(e) => setParentId(e.target.value || null)}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">None (Top-level department)</option>
                    {availableParents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.code})
                      </option>
                    ))}
                  </select>
                </div>

                {parentId && (
                  <div className="rounded-xl bg-emerald-50 p-4">
                    <div className="text-sm font-medium text-emerald-800">New hierarchy:</div>
                    <div className="mt-2 text-sm text-emerald-700">
                      {availableParents.find((d) => d.id === parentId)?.name} → {name}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "head" && (
              <div className="space-y-4">
                <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-700">
                  Assign an employee as the head of this department.
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Department Head
                  </label>
                  <select
                    value={headId || ""}
                    onChange={(e) => setHeadId(e.target.value || null)}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Not assigned</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.firstName} {emp.lastName} ({emp.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleDelete}
                disabled={loading}
                className="rounded-xl bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                Delete Department
              </button>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !name.trim() || !code.trim()}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {loading ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
