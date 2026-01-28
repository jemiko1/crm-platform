"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import { createPortal } from "react-dom";

const BRAND = "rgb(8, 117, 56)";

type RoleGroup = {
  id: string;
  name: string;
  code: string;
};

type Department = {
  id: string;
  name: string;
  code: string;
};

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
  code: string;
  description: string | null;
  level: number | null;
  roleGroupId: string;
  departmentId?: string | null;
  isActive: boolean;
  employees?: Employee[];
};

type EditPositionModalProps = {
  position: Position | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function EditPositionModal({
  position,
  open,
  onClose,
  onSuccess,
}: EditPositionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roleGroups, setRoleGroups] = useState<RoleGroup[]>([]);
  const [loadingRoleGroups, setLoadingRoleGroups] = useState(true);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [employees, setEmployees] = useState<Employee[]>([]);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    level: "",
    roleGroupId: "",
    departmentId: "",
    isActive: true,
  });

  // Load role groups and departments
  useEffect(() => {
    if (open) {
      apiGet<RoleGroup[]>("/v1/role-groups")
        .then((data) => {
          setRoleGroups(data);
          setLoadingRoleGroups(false);
        })
        .catch(() => {
          setLoadingRoleGroups(false);
        });

      apiGet<Department[]>("/v1/departments")
        .then((data) => {
          setDepartments(data);
          setLoadingDepartments(false);
        })
        .catch(() => {
          setLoadingDepartments(false);
        });
    }
  }, [open]);

  // Load position details when modal opens
  useEffect(() => {
    if (open && position) {
      apiGet<Position>(`/v1/positions/${position.id}`)
        .then((data) => {
          setFormData({
            name: data.name,
            code: data.code,
            description: data.description || "",
            level: data.level?.toString() || "",
            roleGroupId: data.roleGroupId,
            departmentId: data.departmentId || "",
            isActive: data.isActive,
          });
          setEmployees(data.employees || []);
        })
        .catch(() => {
          setError("Failed to load position details");
        });
    }
  }, [open, position]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!position) return;

    setLoading(true);
    setError(null);

    try {
      await apiPatch(`/v1/positions/${position.id}`, {
        name: formData.name,
        description: formData.description || undefined,
        level: formData.level ? Number(formData.level) : undefined,
        roleGroupId: formData.roleGroupId,
        departmentId: formData.departmentId || undefined,
        isActive: formData.isActive,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update position");
    } finally {
      setLoading(false);
    }
  }

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted || !position) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Edit Position
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Update position information
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

          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Position Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Code
                </label>
                <input
                  type="text"
                  value={formData.code}
                  disabled
                  className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm font-mono text-zinc-600 cursor-not-allowed"
                />
                <div className="mt-1 text-xs text-zinc-500">
                  Code is auto-generated and cannot be changed
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Description
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={2}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Level
                  </label>
                  <input
                    type="number"
                    name="level"
                    value={formData.level}
                    onChange={handleChange}
                    min="1"
                    max="100"
                    className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Role Group <span className="text-rose-500">*</span>
                  </label>
                  {loadingRoleGroups ? (
                    <div className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-500">
                      Loading...
                    </div>
                  ) : (
                    <select
                      name="roleGroupId"
                      value={formData.roleGroupId}
                      onChange={handleChange}
                      required
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Select role group...</option>
                      {roleGroups.map((rg) => (
                        <option key={rg.id} value={rg.id}>
                          {rg.name} ({rg.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Department
                </label>
                {loadingDepartments ? (
                  <div className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-500">
                    Loading...
                  </div>
                ) : (
                  <select
                    name="departmentId"
                    value={formData.departmentId}
                    onChange={handleChange}
                    className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">No department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="isActive"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={handleChange}
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label htmlFor="isActive" className="text-sm text-zinc-700">
                  Active
                </label>
              </div>
            </div>

            {/* Employees Using This Position */}
            {employees.length > 0 && (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-sm font-semibold text-zinc-900 mb-2">
                  Employees Using This Position ({employees.length})
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {employees
                    .filter((emp) => emp.status === "ACTIVE")
                    .map((emp) => (
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
                <div className="mt-3 text-xs text-zinc-600">
                  Note: Changing the name will not affect these employees. The position code remains unchanged.
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {loading ? "Updating..." : "Update Position"}
              </button>
            </div>
          </form>
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
