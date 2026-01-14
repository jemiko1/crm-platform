"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Role = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  level: number | null;
  legacyRole: string | null;
  isActive: boolean;
  _count: {
    employees: number;
    permissions: number;
  };
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function fetchRoles() {
    try {
      setLoading(true);
      const data = await apiGet<Role[]>("/v1/roles");
      setRoles(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRoles();
  }, []);

  const filtered = roles.filter((role) => {
    const matchesSearch =
      role.name.toLowerCase().includes(search.toLowerCase()) ||
      role.code.toLowerCase().includes(search.toLowerCase()) ||
      (role.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-600">Loading roles...</div>
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
          <h1 className="text-2xl font-bold text-zinc-900">Roles</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage user roles and permissions
          </p>
        </div>
        <button
          onClick={() => alert("Add Role - coming soon")}
          className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          Add Role
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="search"
          placeholder="Search roles..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {/* Roles List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-12 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">
            {search ? "No roles match your search" : "No roles yet"}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow ring-1 ring-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Code
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Legacy Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Employees
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Permissions
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {filtered.map((role) => (
                <tr key={role.id} className="hover:bg-zinc-50 transition">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <div className="font-semibold text-zinc-900">{role.name}</div>
                      {role.description && (
                        <div className="text-sm text-zinc-600">{role.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                    <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                      {role.code}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                    {role.level ? (
                      <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200">
                        Level {role.level}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                    {role.legacyRole ? (
                      <span className="rounded-full bg-purple-50 px-2 py-1 text-xs font-medium text-purple-700 ring-1 ring-purple-200">
                        {role.legacyRole}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                    {role._count.employees}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                    <span className="font-semibold text-emerald-600">
                      {role._count.permissions}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <button
                      onClick={() => alert(`View/Edit Role: ${role.name} - coming soon`)}
                      className="font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
