"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const BRAND = "rgb(8, 117, 56)";

type Building = {
  coreId: number;
  name: string;
  city: string;
  address: string;
};

type EditBuildingModalProps = {
  building: Building | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function EditBuildingModal({
  building,
  open,
  onClose,
  onSuccess,
}: EditBuildingModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    city: "",
    address: "",
  });

  // Populate form when building changes
  useEffect(() => {
    if (building) {
      setFormData({
        name: building.name,
        city: building.city,
        address: building.address,
      });
    }
  }, [building]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!building) return;

    setLoading(true);
    setError(null);

    try {
      // NOTE: You'll need to create a PATCH endpoint on your backend
      // For now, this assumes: PATCH /v1/admin/buildings/:coreId
      const res = await fetch(
        `http://localhost:3000/v1/admin/buildings/${building.coreId}`,
        {
          method: "PATCH",
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
      onSuccess();
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update building");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !building) return null;

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
          className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Edit Building
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Update building #{building.coreId} information
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
              {/* Building Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Building Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Green Tower"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* City */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  City <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Tbilisi"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Address */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Address <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  required
                  placeholder="e.g., 12 Tsereteli Ave"
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

            {/* Info Box */}
            <div className="mt-4 rounded-2xl bg-blue-50 p-3 ring-1 ring-blue-200">
              <div className="text-xs text-blue-900">
                <strong>Note:</strong> This requires a PATCH endpoint on your backend:
                <code className="mt-1 block rounded bg-blue-100 px-2 py-1 font-mono text-[10px]">
                  PATCH /v1/admin/buildings/{building.coreId}
                </code>
              </div>
            </div>

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
                {loading ? "Saving..." : "Save Changes"}
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