"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

const BRAND = "rgb(8, 117, 56)";

type AddClientModalProps = {
  buildingCoreId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function AddClientModal({
  buildingCoreId,
  open,
  onClose,
  onSuccess,
}: AddClientModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    idNumber: "",
    paymentId: "",
    primaryPhone: "",
    secondaryPhone: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `http://localhost:3000/v1/admin/buildings/${buildingCoreId}/clients`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(formData),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || `API error: ${res.status}`);
      }

      // Success
      setFormData({
        firstName: "",
        lastName: "",
        idNumber: "",
        paymentId: "",
        primaryPhone: "",
        secondaryPhone: "",
      });
      onSuccess();
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create client");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Add New Client
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Create a new client for Building #{buildingCoreId}
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
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* First Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  First Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Nika"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Last Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Last Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Beridze"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* ID Number */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  ID Number <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="idNumber"
                  value={formData.idNumber}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 01010101010"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Payment ID */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Payment ID <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="paymentId"
                  value={formData.paymentId}
                  onChange={handleChange}
                  required
                  placeholder="e.g., PAY-001"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Primary Phone */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Primary Phone <span className="text-red-600">*</span>
                </label>
                <input
                  type="tel"
                  name="primaryPhone"
                  value={formData.primaryPhone}
                  onChange={handleChange}
                  required
                  placeholder="e.g., +995599111222"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Secondary Phone */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Secondary Phone
                </label>
                <input
                  type="tel"
                  name="secondaryPhone"
                  value={formData.secondaryPhone}
                  onChange={handleChange}
                  placeholder="e.g., +995555000111"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
                <div className="text-sm text-red-900">{error}</div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
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
                {loading ? "Creating..." : "Create Client"}
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