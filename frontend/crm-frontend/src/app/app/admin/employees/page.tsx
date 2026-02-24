"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import AddEmployeeModal from "../../employees/add-employee-modal";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";

const BRAND = "rgb(8, 117, 56)";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeId: string;
  jobTitle?: string | null;
  extensionNumber?: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
  avatar: string | null;
  position?: {
    id: string;
    name: string;
    code: string;
  } | null;
  hireDate?: string | null;
  createdAt: string;
};

export default function EmployeesPage() {
  const { hasPermission } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showAddModal, setShowAddModal] = useState(false);

  async function fetchEmployees() {
    try {
      setLoading(true);
      const data = await apiGet<Employee[]>(
        "/v1/employees?includeTerminated=true"
      );
      setEmployees(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load employees");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEmployees();
  }, []);

  const filtered = useMemo(() => {
    return employees.filter((emp) => {
      const matchesSearch =
        emp.firstName.toLowerCase().includes(q.toLowerCase()) ||
        emp.lastName.toLowerCase().includes(q.toLowerCase()) ||
        emp.email.toLowerCase().includes(q.toLowerCase()) ||
        emp.employeeId.toLowerCase().includes(q.toLowerCase());

      const matchesStatus = statusFilter === "ALL" || emp.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [employees, q, statusFilter]);

  function getStatusBadge(status: Employee["status"]) {
    const styles = {
      ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      INACTIVE: "bg-zinc-50 text-zinc-700 ring-zinc-200",
      ON_LEAVE: "bg-amber-50 text-amber-700 ring-amber-200",
      TERMINATED: "bg-rose-50 text-rose-700 ring-rose-200",
    };
    return styles[status];
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-600">Loading employees...</div>
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
      <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Employees</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage your organization's employees
          </p>
        </div>
        {hasPermission("employees.create") && (
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            Add Employee
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[300px]">
          <input
            type="search"
            placeholder="Search employees..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="flex gap-2">
          {["ALL", "ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                statusFilter === status
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {status.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Employee List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-12 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">
            {q || statusFilter !== "ALL" ? "No employees match your filters" : "No employees yet"}
          </div>
          {!q && statusFilter === "ALL" && hasPermission("employees.create") && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Add your first employee
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow ring-1 ring-zinc-200">
          <table className="min-w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Employee
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Employee ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Position
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
                  Extension
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-900">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-zinc-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <div>
                      <div className="font-semibold text-zinc-900">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-sm text-zinc-600">{emp.email}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                    {emp.employeeId}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                    {emp.position?.name || emp.jobTitle || "No position"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                    {emp.extensionNumber ? (
                      <a
                        href={`tel:${emp.extensionNumber}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                      >
                        Ext: {emp.extensionNumber}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(
                        emp.status
                      )}`}
                    >
                      {emp.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                    {emp.hireDate ? new Date(emp.hireDate).toLocaleDateString() : "—"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <Link
                      href={`/app/employees?employee=${emp.id}`}
                      className="font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Employee Modal */}
      <AddEmployeeModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          fetchEmployees();
        }}
      />
    </div>
    </PermissionGuard>
  );
}
