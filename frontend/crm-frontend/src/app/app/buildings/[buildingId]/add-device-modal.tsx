"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useListItems } from "@/hooks/useListItems";
import { API_BASE } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type AddDeviceModalProps = {
  buildingCoreId: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function AddDeviceModal({
  buildingCoreId,
  open,
  onClose,
  onSuccess,
}: AddDeviceModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { items: assetTypes, loading: loadingAssetTypes } = useListItems("ASSET_TYPE", open);
  const { items: deviceStatuses, loading: loadingStatuses } = useListItems("DEVICE_STATUS", open);

  const [formData, setFormData] = useState({
    type: "",
    name: "",
    ip: "",
    status: "",
  });

  // Set default values when lists load
  useEffect(() => {
    if (!loadingAssetTypes && !loadingStatuses && assetTypes.length > 0 && deviceStatuses.length > 0) {
      const defaultType = assetTypes.find((t) => t.isDefault) || assetTypes[0];
      const defaultStatus = deviceStatuses.find((s) => s.isDefault) || deviceStatuses[0];

      setFormData((prev) => ({
        ...prev,
        type: defaultType?.value || "",
        status: defaultStatus?.value || "",
      }));
    }
  }, [loadingAssetTypes, loadingStatuses, assetTypes, deviceStatuses]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${API_BASE}/v1/admin/buildings/${buildingCoreId}/assets`,
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

      // Success - reset form
      const defaultType = assetTypes.find((t) => t.isDefault) || assetTypes[0];
      const defaultStatus = deviceStatuses.find((s) => s.isDefault) || deviceStatuses[0];
      setFormData({
        type: defaultType?.value || "",
        name: "",
        ip: "",
        status: defaultStatus?.value || "",
      });
      onSuccess();
      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create device");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const isLoadingLists = loadingAssetTypes || loadingStatuses;

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
                  Add New Device
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Create a new device for Building #{buildingCoreId}
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
              {/* Device Type */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Device Type <span className="text-red-600">*</span>
                </label>
                <select
                  name="type"
                  value={formData.type}
                  onChange={handleChange}
                  required
                  disabled={isLoadingLists}
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
                >
                  {isLoadingLists ? (
                    <option>Loading...</option>
                  ) : (
                    assetTypes.map((t) => (
                      <option key={t.id} value={t.value}>
                        {t.displayName}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Device Name */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Device Name <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="e.g., Small Lift, Main Entrance Door"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* IP Address */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  IP Address
                </label>
                <input
                  type="text"
                  name="ip"
                  value={formData.ip}
                  onChange={handleChange}
                  placeholder="e.g., 10.0.0.10"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Device Status */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Device Status <span className="text-red-600">*</span>
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  required
                  disabled={isLoadingLists}
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:opacity-50"
                >
                  {isLoadingLists ? (
                    <option>Loading...</option>
                  ) : (
                    deviceStatuses.map((s) => (
                      <option key={s.id} value={s.value}>
                        {s.displayName}
                      </option>
                    ))
                  )}
                </select>
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
                disabled={loading || isLoadingLists}
                className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {loading ? "Creating..." : "Create Device"}
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
