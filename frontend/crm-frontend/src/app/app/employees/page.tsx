"use client";

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGetList, apiPost } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import AddEmployeeModal from "./add-employee-modal";
import { useModalContext } from "../modal-manager";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(0, 86, 83)";

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

function EmployeesPageContent() {
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ type: string; dismissed?: number; deleted?: number; failed?: number; results?: { id: string; name: string; success: boolean; error?: string }[] } | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  const { openModal } = useModalContext();

  function openEmployeeModal(employeeId: string) {
    openModal("employee", employeeId);
  }

  async function fetchEmployees() {
    try {
      setLoading(true);
      const data = await apiGetList<Employee>(
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
      ACTIVE: "bg-teal-50 text-teal-800 ring-teal-200",
      INACTIVE: "bg-zinc-50 text-zinc-700 ring-zinc-200",
      ON_LEAVE: "bg-amber-50 text-amber-700 ring-amber-200",
      TERMINATED: "bg-rose-50 text-rose-700 ring-rose-200",
    };
    return styles[status];
  }

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === filtered.length) return new Set();
      return new Set(filtered.map((e) => e.id));
    });
  }, [filtered]);

  const allSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter]);

  const canDismiss = hasPermission("employee.dismiss");
  const canHardDelete = hasPermission("employee.hard_delete");

  async function handleBulkDismiss() {
    if (!confirm(t("employees.bulk.confirmDismiss", `Dismiss ${selectedIds.size} selected employees? They will be terminated and their login accounts disabled.`))) return;
    setBulkLoading(true);
    try {
      const result = await apiPost<{ dismissed: number; failed: number; results: { id: string; name: string; success: boolean; error?: string }[] }>(
        "/v1/employees/bulk-dismiss",
        { ids: Array.from(selectedIds) }
      );
      setBulkResult({ type: "dismiss", dismissed: result.dismissed, failed: result.failed, results: result.results });
      setSelectedIds(new Set());
      fetchEmployees();
    } catch (err: any) {
      alert(err.message || "Bulk dismiss failed");
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (!confirm(t("employees.bulk.confirmDelete", `PERMANENTLY delete ${selectedIds.size} selected employees? This cannot be undone.`))) return;
    setBulkLoading(true);
    try {
      const result = await apiPost<{ deleted: number; failed: number; results: { id: string; name: string; success: boolean; error?: string }[] }>(
        "/v1/employees/bulk-hard-delete",
        { ids: Array.from(selectedIds) }
      );
      setBulkResult({ type: "delete", deleted: result.deleted, failed: result.failed, results: result.results });
      setSelectedIds(new Set());
      fetchEmployees();
    } catch (err: any) {
      alert(err.message || "Bulk delete failed");
    } finally {
      setBulkLoading(false);
    }
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
      <div className="p-4 sm:p-6 lg:p-8">
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
            className="w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </div>

        <div className="flex gap-2">
          {["ALL", "ACTIVE", "INACTIVE", "ON_LEAVE", "TERMINATED"].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
                statusFilter === status
                  ? "bg-teal-800 text-white"
                  : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              }`}
            >
              {status.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-teal-50 px-5 py-3 ring-1 ring-teal-200">
          <span className="text-sm font-semibold text-teal-900">
            {t("employees.bulk.selected", `${selectedIds.size} selected`)}
          </span>
          <div className="flex-1" />
          {canDismiss && (
            <button
              onClick={handleBulkDismiss}
              disabled={bulkLoading}
              className="rounded-full bg-amber-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {t("employees.bulk.dismiss", "Dismiss Selected")}
            </button>
          )}
          {canHardDelete && (
            <button
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {t("employees.bulk.delete", "Delete Selected")}
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded-full bg-zinc-200 px-4 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-300"
          >
            {t("employees.bulk.clear", "Clear")}
          </button>
        </div>
      )}

      {/* Bulk Result Banner */}
      {bulkResult && (
        <div className={`mb-4 rounded-2xl px-5 py-3 ring-1 ${bulkResult.failed ? "bg-amber-50 ring-amber-200" : "bg-teal-50 ring-teal-200"}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-900">
              {bulkResult.type === "dismiss"
                ? t("employees.bulk.dismissResult", `${bulkResult.dismissed} dismissed, ${bulkResult.failed} failed`)
                : t("employees.bulk.deleteResult", `${bulkResult.deleted} deleted, ${bulkResult.failed} failed`)}
            </span>
            <button onClick={() => setBulkResult(null)} className="text-xs text-zinc-500 hover:text-zinc-700">
              {t("common.close", "Close")}
            </button>
          </div>
          {bulkResult.failed! > 0 && bulkResult.results && (
            <ul className="mt-2 space-y-1 text-xs text-rose-700">
              {bulkResult.results.filter((r) => !r.success).map((r) => (
                <li key={r.id}>{r.name}: {r.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Employee List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-12 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">
            {q || statusFilter !== "ALL" ? "No employees match your filters" : "No employees yet"}
          </div>
          {!q && statusFilter === "ALL" && hasPermission("employees.create") && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 text-sm font-semibold text-teal-800 hover:text-teal-900"
            >
              Add your first employee
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-white shadow ring-1 ring-zinc-200 overflow-x-auto lg:overflow-clip -mx-4 sm:mx-0">
          <table className="min-w-[900px] w-full divide-y divide-zinc-200">
            <thead className="bg-zinc-50 relative z-10 shadow-[0_1px_0_rgba(0,0,0,0.08)] md:sticky md:top-[52px] md:z-20">
              <tr>
                {(canDismiss || canHardDelete) && (
                  <th className="w-10 px-3 py-3 bg-zinc-50">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                    />
                  </th>
                )}
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.employee", "Employee")}
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  Employee ID
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.position", "Position")}
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  Login
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.status", "Status")}
                </th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.extension", "Extension")}
                </th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs font-semibold text-zinc-900 bg-zinc-50">
                  {t("employees.columns.actions", "Actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 bg-white">
              {filtered.map((emp) => (
                <tr key={emp.id} className={`hover:bg-zinc-50 ${selectedIds.has(emp.id) ? "bg-teal-50/50" : ""}`}>
                  {(canDismiss || canHardDelete) && (
                    <td className="w-10 px-3 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(emp.id)}
                        onChange={() => toggleSelect(emp.id)}
                        className="h-4 w-4 rounded border-zinc-300 text-teal-600 focus:ring-teal-500"
                      />
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 sm:px-6 py-4">
                    <div>
                      <div className="font-semibold text-zinc-900">
                        {emp.firstName} {emp.lastName}
                      </div>
                      <div className="text-sm text-zinc-600">{emp.email}</div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 sm:px-6 py-4 text-sm text-zinc-900">
                    {emp.employeeId}
                  </td>
                  <td className="whitespace-nowrap px-4 sm:px-6 py-4 text-sm text-zinc-900">
                    {emp.position?.name || emp.jobTitle || t("employees.noPosition", "No position")}
                  </td>
                  <td className="whitespace-nowrap px-4 sm:px-6 py-4">
                    {emp.user ? (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                          emp.user.isActive
                            ? "bg-teal-50 text-teal-900 ring-teal-200"
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
                  <td className="whitespace-nowrap px-4 sm:px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(
                        emp.status
                      )}`}
                    >
                      {emp.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 sm:px-6 py-4 text-sm text-zinc-600">
                    {emp.extensionNumber ? (
                      <a
                        href={`tel:${emp.extensionNumber}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-900 ring-1 ring-teal-200 hover:bg-teal-100"
                      >
                        Ext: {emp.extensionNumber}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 sm:px-6 py-4 text-right text-sm">
                    <button
                      type="button"
                      onClick={() => openEmployeeModal(emp.id)}
                      className="font-semibold text-teal-800 hover:text-teal-900"
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

export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesPageContent />
    </Suspense>
  );
}
