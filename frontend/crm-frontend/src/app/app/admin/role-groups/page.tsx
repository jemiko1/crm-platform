"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import Link from "next/link";
import AddRoleGroupModal from "./add-role-group-modal";
import AssignPermissionsModal from "./assign-permissions-modal";

const BRAND = "rgb(8, 117, 56)";

type RoleGroup = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  permissions: Array<{
    permission: {
      id: string;
      resource: string;
      action: string;
      description: string | null;
    };
  }>;
  _count: {
    positions: number;
  };
};

export default function RoleGroupsPage() {
  const [roleGroups, setRoleGroups] = useState<RoleGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedRoleGroup, setSelectedRoleGroup] = useState<RoleGroup | null>(null);

  async function fetchRoleGroups() {
    try {
      setLoading(true);
      const data = await apiGet<RoleGroup[]>("/v1/role-groups");
      setRoleGroups(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load role groups");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoleGroups();
  }, []);

  const filtered = roleGroups.filter((rg) => {
    const matchesSearch =
      rg.name.toLowerCase().includes(search.toLowerCase()) ||
      rg.code.toLowerCase().includes(search.toLowerCase()) ||
      (rg.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-600">Loading role groups...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-200">
          <div className="text-sm font-semibold text-rose-900">Error</div>
          <div className="mt-1 text-sm text-rose-700">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/app/admin"
            className="mb-2 inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to Admin Panel
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">Role Groups</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage permission bundles assigned to positions
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          Add Role Group
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="search"
          placeholder="Search role groups..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {/* Role Groups Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-12 text-center">
          <div className="text-sm font-medium text-zinc-600">
            {search ? "No role groups found" : "No role groups yet"}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Role Group
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Code
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Permissions
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Positions
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((roleGroup) => (
                <tr
                  key={roleGroup.id}
                  className="transition hover:bg-zinc-50/50"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-zinc-900">{roleGroup.name}</div>
                    {roleGroup.description && (
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {roleGroup.description}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-mono text-zinc-600">{roleGroup.code}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-zinc-900">
                      {roleGroup.permissions.length} permission
                      {roleGroup.permissions.length !== 1 ? "s" : ""}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {roleGroup.permissions.slice(0, 3).map((rp) => (
                        <span
                          key={rp.permission.id}
                          className="inline-flex rounded px-1.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-700"
                        >
                          {rp.permission.resource}.{rp.permission.action}
                        </span>
                      ))}
                      {roleGroup.permissions.length > 3 && (
                        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-zinc-100 text-zinc-600">
                          +{roleGroup.permissions.length - 3} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-zinc-600">
                      {roleGroup._count.positions} position
                      {roleGroup._count.positions !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                          roleGroup.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-zinc-50 text-zinc-700 ring-zinc-200"
                        }`}
                      >
                        {roleGroup.isActive ? "Active" : "Inactive"}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRoleGroup(roleGroup);
                          setShowPermissionsModal(true);
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90"
                        style={{ backgroundColor: BRAND }}
                      >
                        Permissions
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      <AddRoleGroupModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          fetchRoleGroups();
          setShowAddModal(false);
        }}
      />

      <AssignPermissionsModal
        roleGroup={selectedRoleGroup}
        open={showPermissionsModal}
        onClose={() => {
          setShowPermissionsModal(false);
          setSelectedRoleGroup(null);
        }}
        onSuccess={() => {
          fetchRoleGroups();
          setShowPermissionsModal(false);
          setSelectedRoleGroup(null);
        }}
      />
    </div>
  );
}
