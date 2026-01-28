"use client";

import { useState, useEffect } from "react";
import { apiGet, apiPatch } from "@/lib/api";
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
  description: string | null;
  isActive: boolean;
  positions?: Position[];
};

type EditRoleGroupModalProps = {
  roleGroup: RoleGroup | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function EditRoleGroupModal({
  roleGroup,
  open,
  onClose,
  onSuccess,
}: EditRoleGroupModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    isActive: true,
  });

  // Load role group details when modal opens
  useEffect(() => {
    if (open && roleGroup) {
      apiGet<RoleGroup>(`/v1/role-groups/${roleGroup.id}`)
        .then((data) => {
          setFormData({
            name: data.name,
            description: data.description || "",
            isActive: data.isActive,
          });
          setPositions(data.positions || []);
        })
        .catch(() => {
          setError("Failed to load role group details");
        });
    }
  }, [open, roleGroup]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
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
    if (!roleGroup) return;

    setLoading(true);
    setError(null);

    try {
      await apiPatch(`/v1/role-groups/${roleGroup.id}`, {
        name: formData.name,
        description: formData.description || undefined,
        isActive: formData.isActive,
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to update role group");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !roleGroup) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Edit Role Group
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Update role group information
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

            <div className="space-y-6">
              {/* Form Fields */}
              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Role Group Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="e.g., Full Access, Management"
                  />
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
                    placeholder="Brief description of this role group"
                  />
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

              {/* Positions Using This Role Group */}
              {positions.length > 0 && (
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <div className="text-sm font-semibold text-zinc-900 mb-2">
                    Positions Using This Role Group ({positions.length})
                  </div>
                  <div className="space-y-2">
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
                  <div className="mt-3 text-xs text-zinc-600">
                    Note: Changing the name will not affect these positions. The role group code remains unchanged.
                  </div>
                </div>
              )}
            </div>

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
                {loading ? "Updating..." : "Update Role Group"}
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
