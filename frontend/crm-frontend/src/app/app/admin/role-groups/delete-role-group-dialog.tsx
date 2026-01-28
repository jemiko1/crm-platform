"use client";

import { useState, useEffect } from "react";
import { apiGet, apiDelete } from "@/lib/api";
import { createPortal } from "react-dom";

const BRAND = "rgb(8, 117, 56)";

type Position = {
  id: string;
  name: string;
  code: string;
};

type RoleGroup = {
  id: string;
  name: string;
  positions?: Position[];
  _count?: {
    positions: number;
  };
};

type DeleteRoleGroupDialogProps = {
  roleGroup: RoleGroup | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function DeleteRoleGroupDialog({
  roleGroup,
  open,
  onClose,
  onSuccess,
}: DeleteRoleGroupDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);
  const [allRoleGroups, setAllRoleGroups] = useState<RoleGroup[]>([]);
  const [replacementId, setReplacementId] = useState<string>("");
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load role group details and all role groups when dialog opens
  useEffect(() => {
    if (open && roleGroup) {
      setLoadingDetails(true);
      Promise.all([
        apiGet<RoleGroup>(`/v1/role-groups/${roleGroup.id}`),
        apiGet<RoleGroup[]>("/v1/role-groups"),
      ])
        .then(([details, allGroups]) => {
          setPositions(details.positions || []);
          // Filter out the current role group from replacement options
          setAllRoleGroups(
            allGroups.filter((rg) => rg.id !== roleGroup.id)
          );
          setLoadingDetails(false);
        })
        .catch(() => {
          setError("Failed to load role group details");
          setLoadingDetails(false);
        });
    }
  }, [open, roleGroup]);

  async function handleDelete() {
    if (!roleGroup) return;

    setLoading(true);
    setError(null);

    try {
      const body =
        positions.length > 0 && replacementId
          ? { replacementRoleGroupId: replacementId }
          : undefined;

      await apiDelete(`/v1/role-groups/${roleGroup.id}`, body);

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to delete role group");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !roleGroup) return null;

  const hasPositions = positions.length > 0;
  const canDelete = !hasPositions || replacementId !== "";

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Delete Role Group
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  {hasPositions
                    ? "This role group is in use. Assign a replacement before deleting."
                    : "Are you sure you want to delete this role group?"}
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

          <div className="p-6">
            {error && (
              <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
                {error}
              </div>
            )}

            {loadingDetails ? (
              <div className="text-center py-8 text-zinc-600">
                Loading details...
              </div>
            ) : (
              <div className="space-y-6">
                {/* Warning */}
                <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                  <div className="text-sm font-semibold text-amber-900 mb-1">
                    Warning
                  </div>
                  <div className="text-sm text-amber-800">
                    {hasPositions
                      ? `This role group is currently used by ${positions.length} position(s). You must assign a replacement role group before deleting.`
                      : "This action cannot be undone. All permissions assigned to this role group will be lost."}
                  </div>
                </div>

                {/* Positions List */}
                {hasPositions && (
                  <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="text-sm font-semibold text-zinc-900 mb-3">
                      Positions Using This Role Group ({positions.length})
                    </div>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {positions.map((pos) => (
                        <div
                          key={pos.id}
                          className="rounded-lg bg-white px-3 py-2 text-sm text-zinc-700 border border-zinc-200"
                        >
                          <span className="font-medium">{pos.name}</span>
                          <span className="text-zinc-500 ml-2">({pos.code})</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Replacement Selection */}
                {hasPositions && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-700">
                      Replacement Role Group{" "}
                      <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={replacementId}
                      onChange={(e) => setReplacementId(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    >
                      <option value="">Select a replacement role group...</option>
                      {allRoleGroups.map((rg) => (
                        <option key={rg.id} value={rg.id}>
                          {rg.name} ({rg._count?.positions || 0} positions)
                        </option>
                      ))}
                    </select>
                    <div className="mt-2 text-xs text-zinc-600">
                      All positions using this role group will be reassigned to the selected replacement.
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t border-zinc-200">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={loading || !canDelete}
                    className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: BRAND }}
                  >
                    {loading
                      ? "Deleting..."
                      : hasPositions
                      ? "Reassign & Delete"
                      : "Delete Role Group"}
                  </button>
                </div>
              </div>
            )}
          </div>
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
