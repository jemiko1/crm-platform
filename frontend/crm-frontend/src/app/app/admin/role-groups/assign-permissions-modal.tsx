"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Permission = {
  id: string;
  resource: string;
  action: string;
  description: string | null;
  category: string;
};

type RoleGroup = {
  id: string;
  name: string;
  permissions: Array<{
    permission: Permission;
  }>;
};

type AssignPermissionsModalProps = {
  roleGroup: RoleGroup | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function AssignPermissionsModal({
  roleGroup,
  open,
  onClose,
  onSuccess,
}: AssignPermissionsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allPermissions, setAllPermissions] = useState<Permission[]>([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(
    new Set()
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Load all permissions
  useEffect(() => {
    if (open) {
      apiGet<Permission[]>("/v1/permissions")
        .then((data) => {
          setAllPermissions(data);
          setLoadingPermissions(false);
        })
        .catch(() => {
          setLoadingPermissions(false);
        });
    }
  }, [open]);

  // Populate selected permissions when role group changes
  useEffect(() => {
    if (roleGroup && open) {
      const selected = new Set(
        roleGroup.permissions.map((rp) => rp.permission.id)
      );
      setSelectedPermissions(selected);
    }
  }, [roleGroup, open]);

  function togglePermission(permissionId: string) {
    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) {
        next.delete(permissionId);
      } else {
        next.add(permissionId);
      }
      return next;
    });
  }

  function toggleCategory(category: string) {
    const categoryPerms = allPermissions.filter((p) => p.category === category);
    const allSelected = categoryPerms.every((p) =>
      selectedPermissions.has(p.id)
    );

    setSelectedPermissions((prev) => {
      const next = new Set(prev);
      categoryPerms.forEach((p) => {
        if (allSelected) {
          next.delete(p.id);
        } else {
          next.add(p.id);
        }
      });
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!roleGroup) return;

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/role-groups/${roleGroup.id}/permissions`, {
        permissionIds: Array.from(selectedPermissions),
      });

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to assign permissions");
    } finally {
      setLoading(false);
    }
  }

  if (!open || !roleGroup) return null;

  // Filter permissions by search query
  const filteredPermissions = allPermissions.filter((perm) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      perm.resource.toLowerCase().includes(query) ||
      perm.action.toLowerCase().includes(query) ||
      perm.description?.toLowerCase().includes(query) ||
      perm.category.toLowerCase().includes(query) ||
      `${perm.resource}.${perm.action}`.toLowerCase().includes(query)
    );
  });

  // Group filtered permissions by category
  const permissionsByCategory = filteredPermissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<string, Permission[]>);

  const categories = Object.keys(permissionsByCategory).sort();

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
        <div
          className="w-full max-w-6xl max-h-[90vh] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 border-b border-zinc-200 bg-white px-6 py-4 z-10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Assign Permissions
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  {roleGroup.name} - Select permissions for this role group
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
            {/* Search Box */}
            <input
              type="search"
              placeholder="Search permissions by resource, action, or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Content - 2 Column Layout */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
            {error && (
              <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700 ring-1 ring-rose-200">
                {error}
              </div>
            )}

            {loadingPermissions ? (
              <div className="text-center py-8 text-zinc-600">Loading permissions...</div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8 text-zinc-600">
                No permissions found matching "{searchQuery}"
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {categories.map((category) => {
                  const perms = permissionsByCategory[category];
                  const allSelected = perms.every((p) =>
                    selectedPermissions.has(p.id)
                  );

                  return (
                    <div key={category} className="rounded-xl border border-zinc-200">
                      <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-semibold text-zinc-900 capitalize">
                            {category.replace(/_/g, " ")}
                          </h3>
                          <button
                            type="button"
                            onClick={() => toggleCategory(category)}
                            className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                          >
                            {allSelected ? "Deselect" : "Select All"}
                          </button>
                        </div>
                      </div>
                      <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
                        {perms.map((perm) => (
                          <label
                            key={perm.id}
                            className="flex items-start gap-2 p-1.5 rounded-lg hover:bg-zinc-50 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedPermissions.has(perm.id)}
                              onChange={() => togglePermission(perm.id)}
                              className="mt-0.5 h-3.5 w-3.5 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-zinc-900 truncate">
                                {perm.resource}.{perm.action}
                              </div>
                              {perm.description && (
                                <div className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
                                  {perm.description}
                                </div>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </form>

          {/* Footer */}
          <div className="sticky bottom-0 border-t border-zinc-200 bg-white px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-zinc-600">
                <strong className="text-zinc-900">
                  {selectedPermissions.size}
                </strong>{" "}
                permission{selectedPermissions.size !== 1 ? "s" : ""} selected
              </div>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {loading ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
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
        strokeLinejoin="round"
      />
    </svg>
  );
}
