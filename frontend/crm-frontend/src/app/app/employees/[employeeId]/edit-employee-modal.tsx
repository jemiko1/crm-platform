"use client";

import React, { useState, useEffect } from "react";
import { apiGet, apiPatch } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeId: string;
  extensionNumber?: string | null;
  birthday?: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
  address: string | null;
  city: string | null;
  country: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  positionId?: string | null;
  departmentId: string | null;
  roleId: string | null;
  managerId: string | null;
};

type EditEmployeeModalProps = {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function EditEmployeeModal({
  employee,
  open,
  onClose,
  onSuccess,
}: EditEmployeeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [positions, setPositions] = useState<Array<{ id: string; name: string; code: string; departmentId: string | null }>>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(true);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    phone: "",
    extensionNumber: "",
    birthday: "",
    status: "ACTIVE" as Employee["status"],
    address: "",
    city: "",
    country: "Georgia",
    emergencyContact: "",
    emergencyPhone: "",
    departmentId: "",
    positionId: "",
  });

  // Load departments
  useEffect(() => {
    if (open) {
      apiGet<Array<{ id: string; name: string; code: string }>>("/v1/departments")
        .then((data) => {
          setDepartments(data);
          setLoadingDepartments(false);
        })
        .catch(() => {
          setLoadingDepartments(false);
        });
    }
  }, [open]);

  // Load positions
  useEffect(() => {
    if (open) {
      apiGet<Array<{ id: string; name: string; code: string; departmentId: string | null }>>("/v1/positions")
        .then((data) => {
          setPositions(data);
          setLoadingPositions(false);
        })
        .catch(() => {
          setLoadingPositions(false);
        });
    }
  }, [open]);

  // Filter positions by selected department
  const availablePositions = formData.departmentId
    ? positions.filter((pos) => pos.departmentId === formData.departmentId)
    : positions;

  // Populate form when employee changes
  useEffect(() => {
    if (employee) {
      setFormData({
        firstName: employee.firstName,
        lastName: employee.lastName,
        email: employee.email,
        password: "", // Don't pre-fill password
        phone: employee.phone || "",
        extensionNumber: (employee as any).extensionNumber || "",
        birthday: (employee as any).birthday ? new Date((employee as any).birthday).toISOString().split("T")[0] : "",
        status: employee.status,
        address: employee.address || "",
        city: employee.city || "",
        country: employee.country || "Georgia",
        emergencyContact: employee.emergencyContact || "",
        emergencyPhone: employee.emergencyPhone || "",
        departmentId: employee.departmentId || "",
        positionId: employee.positionId || "",
      });
    }
  }, [employee]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;

    setLoading(true);
    setError(null);

    try {
      const updateData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone || undefined,
        extensionNumber: formData.extensionNumber || undefined,
        birthday: formData.birthday || undefined,
        status: formData.status,
        address: formData.address || undefined,
        city: formData.city || undefined,
        country: formData.country || "Georgia",
        emergencyContact: formData.emergencyContact || undefined,
        emergencyPhone: formData.emergencyPhone || undefined,
        departmentId: formData.departmentId || undefined,
        positionId: formData.positionId || undefined,
      };

      // Only include password if provided
      if (formData.password) {
        updateData.password = formData.password;
      }

      await apiPatch(`/v1/employees/${employee.id}`, updateData);

      onSuccess();
      setFormData((prev) => ({ ...prev, password: "" })); // Clear password field
    } catch (err: any) {
      setError(err.message || "Failed to update employee");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !employee) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
        <div
          className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 border-b border-zinc-200 bg-white px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Edit Employee
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Update employee information
                </p>
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

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {error && (
              <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
                <div className="text-sm font-semibold text-rose-900">Error</div>
                <div className="mt-1 text-sm text-rose-700">{error}</div>
              </div>
            )}

            {/* Personal Information */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Personal Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-zinc-900">
                    First Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    required
                    value={formData.firstName}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">
                    Last Name <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    required
                    value={formData.lastName}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">
                    Email <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">
                    Password <span className="text-zinc-500 text-xs">(leave blank to keep current)</span>
                  </label>
                  <input
                    type="password"
                    name="password"
                    minLength={6}
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="New password (min 6 characters)"
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Extension Number</label>
                  <input
                    type="text"
                    name="extensionNumber"
                    value={formData.extensionNumber}
                    onChange={handleChange}
                    placeholder="1234"
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Birthday</label>
                  <input
                    type="date"
                    name="birthday"
                    value={formData.birthday}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                    <option value="ON_LEAVE">On Leave</option>
                    <option value="TERMINATED">Terminated</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Employment Details */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Employment Details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-zinc-900">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    value={employee.employeeId}
                    disabled
                    className="mt-2 w-full rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm text-zinc-600 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">
                    Department
                  </label>
                  {loadingDepartments ? (
                    <div className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-500">
                      Loading departments...
                    </div>
                  ) : (
                    <select
                      name="departmentId"
                      value={formData.departmentId}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">No department</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name} ({dept.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Position</label>
                  {loadingPositions ? (
                    <div className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-500">
                      Loading positions...
                    </div>
                  ) : (
                    <select
                      name="positionId"
                      value={formData.positionId}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">No position</option>
                      {availablePositions.map((pos) => (
                        <option key={pos.id} value={pos.id}>
                          {pos.name} ({pos.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Contact Information</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Address</label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">City</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Country</label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Emergency Contact Name</label>
                  <input
                    type="text"
                    name="emergencyContact"
                    value={formData.emergencyContact}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-zinc-900">Emergency Contact Phone</label>
                  <input
                    type="tel"
                    name="emergencyPhone"
                    value={formData.emergencyPhone}
                    onChange={handleChange}
                    className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="sticky bottom-0 flex items-center justify-end gap-3 pt-4 bg-white border-t border-zinc-200 -mx-6 px-6 pb-6">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {loading ? "Updating..." : "Update Employee"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
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
