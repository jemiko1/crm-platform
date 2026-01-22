"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiDelete, apiPost } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type ListItem = {
  id: string;
  categoryId: string;
  value: string;
  displayName: string;
  description: string | null;
  colorHex: string | null;
  icon: string | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
};

type ListCategory = {
  id: string;
  code: string;
  name: string;
  isUserEditable: boolean;
};

type UsageInfo = {
  usageCount: number;
  details: Array<{
    table: string;
    field: string;
    count: number;
  }>;
};

type DeleteItemModalProps = {
  item: ListItem;
  category: ListCategory;
  availableItems: ListItem[];
  onClose: () => void;
  onSuccess: () => void;
};

export default function DeleteItemModal({
  item,
  category,
  availableItems,
  onClose,
  onSuccess,
}: DeleteItemModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [usageInfo, setUsageInfo] = useState<UsageInfo | null>(null);
  const [loadingUsage, setLoadingUsage] = useState(true);

  const [reassignToItemId, setReassignToItemId] = useState("");
  const [confirmReassign, setConfirmReassign] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchUsage();
  }, [item.id]);

  async function fetchUsage() {
    try {
      setLoadingUsage(true);
      const data = await apiGet<UsageInfo>(`/v1/system-lists/items/${item.id}/usage`);
      setUsageInfo(data);
    } catch (err) {
      console.error("Failed to load usage info:", err);
      setUsageInfo({ usageCount: 0, details: [] });
    } finally {
      setLoadingUsage(false);
    }
  }

  async function handleDirectDelete() {
    if (!confirm(`Are you sure you want to delete "${item.displayName}"?`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiDelete(`/v1/system-lists/items/${item.id}`);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setLoading(false);
    }
  }

  async function handleReassignAndDelete() {
    if (!reassignToItemId) {
      alert("Please select a value to reassign to");
      return;
    }

    if (!confirmReassign) {
      alert("Please confirm the reassignment");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiPost(`/v1/system-lists/items/${item.id}/reassign-and-delete`, {
        targetItemId: reassignToItemId,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reassign and delete");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    if (!confirmDeactivate) {
      alert("Please confirm deactivation");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiPost(`/v1/system-lists/items/${item.id}/deactivate`, {});
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to deactivate item");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  const modalContent = (
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
          className="w-full max-w-3xl max-h-[90vh] overflow-y-auto overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 bg-rose-50 px-6 py-4">
            <h2 className="text-lg font-semibold text-rose-900">
              Delete List Item?
            </h2>
            <p className="mt-1 text-xs text-rose-700">
              {category.name} • {item.displayName}
            </p>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Error */}
            {error && (
              <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
                <div className="text-sm font-semibold text-rose-900">Error</div>
                <div className="mt-1 text-sm text-rose-700">{error}</div>
              </div>
            )}

            {/* Item Info */}
            <div className="flex items-center gap-4 rounded-2xl border-2 border-zinc-200 bg-zinc-50 p-4">
              {item.colorHex && (
                <div
                  className="h-12 w-12 rounded-xl ring-2 ring-zinc-300"
                  style={{ backgroundColor: item.colorHex }}
                />
              )}
              {item.icon && <div className="text-3xl">{item.icon}</div>}
              <div className="flex-1">
                <div className="font-semibold text-zinc-900">{item.displayName}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  <span className="font-mono">{item.value}</span>
                  {item.description && (
                    <>
                      <span> • </span>
                      <span>{item.description}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Usage Info */}
            {loadingUsage ? (
              <div className="rounded-2xl bg-zinc-50 p-6 text-center">
                <div className="text-sm text-zinc-500">Checking usage...</div>
              </div>
            ) : usageInfo && usageInfo.usageCount === 0 ? (
              <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✅</span>
                  <div className="font-semibold text-emerald-900">Safe to Delete</div>
                </div>
                <p className="mt-1 text-sm text-emerald-700">
                  This value is not currently used anywhere in the system.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <div className="font-semibold text-amber-900">Currently In Use</div>
                </div>
                <p className="mt-1 text-sm text-amber-700">
                  This value is used in <span className="font-semibold">{usageInfo?.usageCount}</span> record(s):
                </p>
                {usageInfo && usageInfo.details.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-amber-700">
                    {usageInfo.details.map((detail, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="font-mono rounded bg-amber-200 px-1.5 py-0.5">
                          {detail.table}.{detail.field}
                        </span>
                        <span>({detail.count} records)</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Options */}
            {usageInfo && usageInfo.usageCount > 0 ? (
              <>
                {/* OPTION 1: BULK REASSIGNMENT */}
                <div className="rounded-2xl border-2 border-emerald-200 bg-emerald-50 p-4">
                  <h4 className="font-semibold text-emerald-900">
                    ✨ Option 1: Reassign to Another Value (Recommended)
                  </h4>
                  <p className="mt-1 text-sm text-emerald-700">
                    Move all {usageInfo.usageCount} records to a different value, then delete this one.
                  </p>

                  <div className="mt-4">
                    <label className="block text-sm font-medium text-zinc-900">
                      Reassign to:
                    </label>
                    <select
                      value={reassignToItemId}
                      onChange={(e) => setReassignToItemId(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">-- Select a value --</option>
                      {availableItems.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.displayName} ({i.value})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="confirm-reassign"
                      checked={confirmReassign}
                      onChange={(e) => setConfirmReassign(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="confirm-reassign" className="text-sm text-zinc-700">
                      I understand this will update {usageInfo.usageCount} record(s) and cannot be undone.
                    </label>
                  </div>

                  <button
                    onClick={handleReassignAndDelete}
                    disabled={!reassignToItemId || !confirmReassign || loading}
                    className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                        Reassigning...
                      </span>
                    ) : (
                      `Reassign & Delete "${item.displayName}"`
                    )}
                  </button>
                </div>

                {/* OPTION 2: DEACTIVATE */}
                <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4">
                  <h4 className="font-semibold text-blue-900">
                    🔒 Option 2: Deactivate (Soft Delete)
                  </h4>
                  <p className="mt-1 text-sm text-blue-700">
                    Hide this value from dropdowns but keep it for existing records.
                  </p>

                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="confirm-deactivate"
                      checked={confirmDeactivate}
                      onChange={(e) => setConfirmDeactivate(e.target.checked)}
                      className="rounded"
                    />
                    <label htmlFor="confirm-deactivate" className="text-sm text-zinc-700">
                      I understand this will hide "{item.displayName}" from future selections.
                    </label>
                  </div>

                  <button
                    onClick={handleDeactivate}
                    disabled={!confirmDeactivate || loading}
                    className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                        Deactivating...
                      </span>
                    ) : (
                      `Deactivate "${item.displayName}"`
                    )}
                  </button>
                </div>

                {/* OPTION 3: CANCEL */}
                <div className="rounded-2xl border-2 border-zinc-200 bg-zinc-50 p-4">
                  <h4 className="font-semibold text-zinc-900">
                    ❌ Option 3: Cancel
                  </h4>
                  <p className="mt-1 text-sm text-zinc-700">
                    Keep this value as is and close this dialog.
                  </p>
                </div>
              </>
            ) : (
              /* Direct Delete (Safe) */
              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDirectDelete}
                  disabled={loading}
                  className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                      Deleting...
                    </span>
                  ) : (
                    `Delete "${item.displayName}"`
                  )}
                </button>
              </div>
            )}

            {/* Cancel Button */}
            <div className="border-t border-zinc-200 pt-4">
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}
