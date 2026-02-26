"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiGetList, apiPost, apiDelete, ApiError } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";

const BRAND = "rgb(8, 117, 56)";

type SalesPlan = {
  id: string;
  type: "MONTHLY" | "QUARTERLY" | "ANNUAL";
  year: number;
  month: number | null;
  quarter: number | null;
  name: string | null;
  description: string | null;
  targetRevenue: number | null;
  targetLeadConversions: number | null;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
  } | null;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  targets: Array<{
    id: string;
    targetQuantity: number;
    achievedQuantity: number;
    service: {
      id: string;
      name: string;
      nameKa: string;
    };
  }>;
  _count: { targets: number };
  createdAt: string;
};

type SalesService = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
};

function getStatusBadge(status: SalesPlan["status"]) {
  const styles: Record<string, string> = {
    DRAFT: "bg-zinc-100 text-zinc-700",
    ACTIVE: "bg-emerald-100 text-emerald-700",
    COMPLETED: "bg-blue-100 text-blue-700",
    CANCELLED: "bg-red-100 text-red-700",
  };
  return styles[status] || "bg-zinc-100 text-zinc-700";
}

export default function SalesPlansPage() {
  const { hasPermission } = usePermissions();
  const [plans, setPlans] = useState<SalesPlan[]>([]);
  const [services, setServices] = useState<SalesService[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());
  const [typeFilter, setTypeFilter] = useState<string>("");

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"MONTHLY" | "QUARTERLY" | "ANNUAL">("MONTHLY");
  const [formYear, setFormYear] = useState(new Date().getFullYear());
  const [formMonth, setFormMonth] = useState(new Date().getMonth() + 1);
  const [formQuarter, setFormQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formTargetRevenue, setFormTargetRevenue] = useState("");
  const [formTargetConversions, setFormTargetConversions] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("year", yearFilter.toString());
      if (typeFilter) params.set("type", typeFilter);

      const [plansRes, servicesRes, employeesRes] = await Promise.all([
        apiGet<SalesPlan[]>(`/v1/sales/plans?${params}`),
        apiGet<SalesService[]>("/v1/sales/services"),
        apiGetList<Employee>("/v1/employees?status=ACTIVE"),
      ]);
      setPlans(plansRes);
      setServices(servicesRes);
      setEmployees(employeesRes);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load plans");
      }
    } finally {
      setLoading(false);
    }
  }, [yearFilter, typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    try {
      await apiPost("/v1/sales/plans", {
        type: formType,
        year: formYear,
        month: formType === "MONTHLY" ? formMonth : undefined,
        quarter: formType === "QUARTERLY" ? formQuarter : undefined,
        employeeId: formEmployeeId || undefined,
        targetRevenue: formTargetRevenue ? parseFloat(formTargetRevenue) : undefined,
        targetLeadConversions: formTargetConversions ? parseInt(formTargetConversions) : undefined,
      });
      setShowForm(false);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleActivate = async (planId: string) => {
    try {
      await apiPost(`/v1/sales/plans/${planId}/activate`, {});
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  const handleDelete = async (planId: string) => {
    if (!confirm("Are you sure you want to delete this plan?")) return;

    try {
      await apiDelete(`/v1/sales/plans/${planId}`);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <PermissionGuard permission="sales.read">
      <div className="min-h-screen p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Sales Plans</h1>
            <p className="mt-1 text-sm text-zinc-600">Create and manage sales targets for your team</p>
          </div>
          {hasPermission("plans.create") && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-medium text-white shadow-lg"
              style={{ backgroundColor: BRAND }}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Plan
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center gap-4">
        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(parseInt(e.target.value))}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        >
          {[2024, 2025, 2026, 2027].map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
        >
          <option value="">All Types</option>
          <option value="MONTHLY">Monthly</option>
          <option value="QUARTERLY">Quarterly</option>
          <option value="ANNUAL">Annual</option>
        </select>
      </div>

      {/* Create Plan Form */}
      {showForm && (
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Create Sales Plan</h2>

          {formError && (
            <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{formError}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Plan Type</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as any)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="ANNUAL">Annual</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Year</label>
                <select
                  value={formYear}
                  onChange={(e) => setFormYear(parseInt(e.target.value))}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                >
                  {[2024, 2025, 2026, 2027].map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
              {formType === "MONTHLY" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Month</label>
                  <select
                    value={formMonth}
                    onChange={(e) => setFormMonth(parseInt(e.target.value))}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {new Date(2024, m - 1).toLocaleString("default", { month: "long" })}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {formType === "QUARTERLY" && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Quarter</label>
                  <select
                    value={formQuarter}
                    onChange={(e) => setFormQuarter(parseInt(e.target.value))}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                  >
                    <option value={1}>Q1</option>
                    <option value={2}>Q2</option>
                    <option value={3}>Q3</option>
                    <option value={4}>Q4</option>
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Employee (optional)</label>
                <select
                  value={formEmployeeId}
                  onChange={(e) => setFormEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                >
                  <option value="">Team-wide plan</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Target Revenue (GEL)</label>
                <input
                  type="number"
                  value={formTargetRevenue}
                  onChange={(e) => setFormTargetRevenue(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Target Conversions</label>
                <input
                  type="number"
                  value={formTargetConversions}
                  onChange={(e) => setFormTargetConversions(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: BRAND }}
              >
                {formLoading ? "Creating..." : "Create Plan"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Plans List */}
      <div className="rounded-2xl bg-white shadow-lg ring-1 ring-zinc-200">
        {plans.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-zinc-500">
            No sales plans found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/50">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-zinc-600">Plan</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-zinc-600">Employee</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-zinc-600">Revenue Target</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-zinc-600">Conversions</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase text-zinc-600">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase text-zinc-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {plans.map((plan) => (
                  <tr key={plan.id} className="hover:bg-zinc-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-900">
                        {plan.type} - {plan.year}
                        {plan.month && `/${String(plan.month).padStart(2, "0")}`}
                        {plan.quarter && ` Q${plan.quarter}`}
                      </div>
                      <div className="text-xs text-zinc-500">{plan._count.targets} targets</div>
                    </td>
                    <td className="px-6 py-4">
                      {plan.employee ? (
                        <div className="text-sm text-zinc-900">
                          {plan.employee.firstName} {plan.employee.lastName}
                        </div>
                      ) : (
                        <span className="text-sm text-zinc-500">Team-wide</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-zinc-900">
                      {plan.targetRevenue ? `${plan.targetRevenue} GEL` : "-"}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-zinc-900">
                      {plan.targetLeadConversions || "-"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusBadge(plan.status)}`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        {plan.status === "DRAFT" && (
                          <>
                            <button
                              onClick={() => handleActivate(plan.id)}
                              className="rounded px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50"
                            >
                              Activate
                            </button>
                            <button
                              onClick={() => handleDelete(plan.id)}
                              className="rounded px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
    </PermissionGuard>
  );
}
