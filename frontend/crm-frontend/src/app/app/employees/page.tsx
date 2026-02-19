"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import AddEmployeeModal from "./add-employee-modal";
import { useModalContext } from "../modal-manager";
import { useI18n } from "@/hooks/useI18n";

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
  birthday?: string | null;
  avatar: string | null;
  user?: {
    id: string;
    isActive: boolean;
  } | null;
  position?: {
    id: string;
    name: string;
    code: string;
  } | null;
  createdAt: string;
};

export default function EmployeesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const { t } = useI18n();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showAddModal, setShowAddModal] = useState(false);

  const { openModal } = useModalContext();

  function openEmployeeModal(employeeId: string) {
    openModal("employee", employeeId);
  }

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
    <PermissionGuard permission="employees.menu">
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
            placeholder={t("employees.searchPlaceholder", "Search employees...")}
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
            <thead className="bg-zinc-50 sticky top-[52px] z-20 shadow-[0_1px_0_rgba(0,0,0,0.08)]">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.employee", "Employee")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  Employee ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.position", "Position")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  Login
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.status", "Status")}
                </th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.extension", "Extension")}
                </th>
                <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.actions", "Actions")}
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
                    {emp.position?.name || emp.jobTitle || t("employees.noPosition", "No position")}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    {emp.user ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                          emp.user.isActive
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
                        }`}
                        title={emp.user.isActive ? "Active login account" : "Login account disabled"}
                      >
                        <IconUser />
                        {emp.user.isActive ? "Active" : "Disabled"}
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500 ring-1 ring-zinc-200"
                        title="No login account"
                      >
                        <IconUserOff />
                        None
                      </span>
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
                  <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                    <button
                      type="button"
                      onClick={() => openEmployeeModal(emp.id)}
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

function IconUser() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconUserOff() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <line x1="18" y1="8" x2="23" y2="13" />
      <line x1="23" y1="8" x2="18" y2="13" />
    </svg>
  );
}
