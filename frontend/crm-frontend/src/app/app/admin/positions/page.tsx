"use client";

import { useState, useEffect } from "react";
import { apiGet, apiDelete } from "@/lib/api";
import Link from "next/link";
import AddPositionModal from "./add-position-modal";
import EditPositionModal from "./edit-position-modal";
import DeletePositionDialog from "./delete-position-dialog";
import { PermissionGuard } from "@/lib/permission-guard";

const BRAND = "rgb(8, 117, 56)";

type Position = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  level: number | null;
  roleGroupId: string;
  isActive: boolean;
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  roleGroup: {
    id: string;
    name: string;
    code: string;
    _count: { permissions: number };
  };
  employees?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    employeeId: string;
    status: string;
  }>;
  _count: {
    employees: number;
  };
};

export default function PositionsPage() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);

  async function fetchPositions() {
    try {
      setLoading(true);
      const data = await apiGet<Position[]>("/v1/positions");
      setPositions(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load positions");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPositions();
  }, []);

  const filtered = positions.filter((pos) => {
    const matchesSearch =
      pos.name.toLowerCase().includes(search.toLowerCase()) ||
      (pos.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-600">Loading positions...</div>
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
    <PermissionGuard permission="admin.access">
      <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href="/app/admin"
            className="mb-2 inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to Admin Panel
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">Positions</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage company positions and their role group assignments
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          Add Position
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="search"
          placeholder="Search positions..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>

      {/* Positions Table */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-12 text-center">
          <div className="text-sm font-medium text-zinc-600">
            {search ? "No positions found" : "No positions yet"}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Position
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Role Group
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Department
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Level
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Employees
                </th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Permissions
                </th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filtered.map((position) => (
                <tr
                  key={position.id}
                  className="transition hover:bg-zinc-50/50"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="font-medium text-zinc-900">{position.name}</div>
                    {position.description && (
                      <div className="text-xs text-zinc-500 mt-0.5">
                        {position.description}
                      </div>
                    )}
                    <div className="mt-1">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${
                          position.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-zinc-50 text-zinc-700 ring-zinc-200"
                        }`}
                      >
                        {position.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-zinc-900">{position.roleGroup.name}</div>
                    <div className="text-xs text-zinc-500 font-mono">
                      {position.roleGroup.code}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {position.department ? (
                      <div className="text-sm text-zinc-900">{position.department.name}</div>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {position.level !== null ? (
                      <span className="text-sm text-zinc-600">{position.level}</span>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="group relative">
                      <span className="text-sm text-zinc-600 cursor-help">
                        {position._count.employees} employee
                        {position._count.employees !== 1 ? "s" : ""}
                      </span>
                      {position.employees && position.employees.length > 0 && (
                        <div className="absolute left-0 top-full mt-2 z-10 hidden group-hover:block">
                          <div className="rounded-lg bg-zinc-900 text-white text-xs p-2 shadow-lg min-w-[200px] max-h-48 overflow-y-auto">
                            <div className="font-semibold mb-1">Active employees:</div>
                            <div className="space-y-1">
                              {position.employees
                                .filter((emp) => emp.status === "ACTIVE")
                                .map((emp) => (
                                  <div key={emp.id} className="text-zinc-300">
                                    {emp.firstName} {emp.lastName} ({emp.employeeId})
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-zinc-600">
                      {position.roleGroup._count.permissions} permissions
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPosition(position);
                          setShowEditModal(true);
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 transition hover:bg-zinc-50"
                      >
                        Edit
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedPosition(position);
                          setShowDeleteDialog(true);
                        }}
                        className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 transition hover:bg-rose-100"
                      >
                        Delete
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
      <AddPositionModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          fetchPositions();
          setShowAddModal(false);
        }}
      />

      <EditPositionModal
        position={selectedPosition}
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setSelectedPosition(null);
        }}
        onSuccess={() => {
          fetchPositions();
          setShowEditModal(false);
          setSelectedPosition(null);
        }}
      />

      <DeletePositionDialog
        position={selectedPosition}
        open={showDeleteDialog}
        onClose={() => {
          setShowDeleteDialog(false);
          setSelectedPosition(null);
        }}
        onSuccess={() => {
          fetchPositions();
          setShowDeleteDialog(false);
          setSelectedPosition(null);
        }}
      />
    </div>
    </PermissionGuard>
  );
}
