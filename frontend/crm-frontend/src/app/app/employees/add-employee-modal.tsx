"use client";

import React, { useState, useEffect } from "react";
import { apiGet, apiPost } from "@/lib/api";
import { createPortal } from "react-dom";

const BRAND = "rgb(8, 117, 56)";

type AddEmployeeModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function AddEmployeeModal({
  open,
  onClose,
  onSuccess,
}: AddEmployeeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [positions, setPositions] = useState<Array<{ id: string; name: string; code: string; departmentId: string | null }>>([]);
  const [loadingDepartments, setLoadingDepartments] = useState(true);
  const [loadingPositions, setLoadingPositions] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    createUserAccount: false,
    password: "",
    phone: "",
    extensionNumber: "",
    birthday: "",
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

  // Load positions (filtered by department if selected)
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
    : [];

  // Reset position when department changes
  useEffect(() => {
    if (formData.departmentId) {
      setFormData((prev) => ({ ...prev, positionId: "" }));
    }
  }, [formData.departmentId]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate: if creating user account, require position
    if (formData.createUserAccount && !formData.positionId) {
      setError("Position is required when creating a login account (for role-based permissions)");
      setLoading(false);
      return;
    }

    try {
      await apiPost("/v1/employees", {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        createUserAccount: formData.createUserAccount,
        password: formData.createUserAccount ? formData.password : undefined,
        phone: formData.phone || undefined,
        extensionNumber: formData.extensionNumber || undefined,
        birthday: formData.birthday || undefined,
        address: formData.address || undefined,
        city: formData.city || undefined,
        country: formData.country || "Georgia",
        emergencyContact: formData.emergencyContact || undefined,
        emergencyPhone: formData.emergencyPhone || undefined,
        departmentId: formData.departmentId || undefined,
        positionId: formData.positionId || undefined,
      });

      onSuccess();
      setFormData({
        firstName: "",
        lastName: "",
        email: "",
        createUserAccount: false,
        password: "",
        phone: "",
        extensionNumber: "",
        birthday: "",
        address: "",
        city: "",
        country: "Georgia",
        emergencyContact: "",
        emergencyPhone: "",
        departmentId: "",
        positionId: "",
      });
    } catch (err: any) {
      setError(err.message || "Failed to create employee");
    } finally {
      setLoading(false);
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

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 border-b border-zinc-200 bg-white px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Add New Employee
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Create a new employee account in the system
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
                placeholder="გიორგი"
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
                placeholder="ბოდოკია"
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
                placeholder="giorgi@company.ge"
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
                placeholder="+995555123456"
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
          </div>
        </div>

        {/* Employment Details */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Employment Details</h3>
          <div className="grid gap-4 md:grid-cols-2">
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
                  <option value="">Select department...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-900">
                Position
              </label>
              {loadingPositions ? (
                <div className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-500">
                  Loading positions...
                </div>
              ) : (
                <select
                  name="positionId"
                  value={formData.positionId}
                  onChange={handleChange}
                  disabled={!formData.departmentId}
                  className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:bg-zinc-100 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {formData.departmentId ? "Select position..." : "Select department first"}
                  </option>
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

        {/* Login Account */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 mb-4">Login Account</h3>
          
          <div className="rounded-xl bg-blue-50 p-4 ring-1 ring-blue-200 mb-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="createUserAccount"
                checked={formData.createUserAccount}
                onChange={(e) => setFormData((prev) => ({ ...prev, createUserAccount: e.target.checked }))}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="createUserAccount" className="flex-1">
                <span className="text-sm font-semibold text-blue-900">Create login account</span>
                <p className="mt-1 text-xs text-blue-700">
                  Enable this to allow the employee to log into the system. 
                  {!formData.createUserAccount && " You can create a login account later if needed."}
                </p>
              </label>
            </div>
          </div>

          {formData.createUserAccount && (
            <div className="space-y-4">
              {!formData.positionId && (
                <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                  <div className="text-sm text-amber-700">
                    <strong>Note:</strong> Position is required for login accounts. The employee's permissions will be derived from the position's role group.
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-semibold text-zinc-900">
                  Password <span className="text-rose-600">*</span>
                </label>
                <input
                  type="password"
                  name="password"
                  required={formData.createUserAccount}
                  minLength={6}
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Minimum 6 characters"
                  className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
          )}
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
                placeholder="Tbilisi, Vake"
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
                placeholder="თბილისი"
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
                placeholder="Contact name"
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
                placeholder="+995555000000"
                className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>
        </div>

            {/* Error */}
            {error && (
              <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
                <div className="text-sm font-semibold text-rose-900">Error</div>
                <div className="mt-1 text-sm text-rose-700">{error}</div>
              </div>
            )}

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
                {loading ? "Creating..." : "Create Employee"}
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
      />
    </svg>
  );
}
