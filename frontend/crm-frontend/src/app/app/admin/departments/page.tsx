"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Department = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  parent: {
    id: string;
    name: string;
    code: string;
  } | null;
  head: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  _count: {
    employees: number;
    children: number;
  };
  children?: Department[];
};

type ViewMode = "list" | "tree";

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [hierarchy, setHierarchy] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [search, setSearch] = useState("");

  async function fetchDepartments() {
    try {
      setLoading(true);
      const data = await apiGet<Department[]>("/v1/departments");
      setDepartments(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  async function fetchHierarchy() {
    try {
      const data = await apiGet<Department[]>("/v1/departments/hierarchy");
      setHierarchy(data);
    } catch (err: any) {
      console.error("Failed to load hierarchy:", err);
    }
  }

  useEffect(() => {
    fetchDepartments();
    fetchHierarchy();
  }, []);

  const filtered = departments.filter((dept) => {
    const matchesSearch =
      dept.name.toLowerCase().includes(search.toLowerCase()) ||
      dept.code.toLowerCase().includes(search.toLowerCase()) ||
      (dept.description?.toLowerCase().includes(search.toLowerCase()) ?? false);
    return matchesSearch;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-zinc-600">Loading departments...</div>
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
          <h1 className="text-2xl font-bold text-zinc-900">Departments</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Manage your organization's department structure
          </p>
        </div>
        <button
          onClick={() => alert("Add Department - coming soon")}
          className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          Add Department
        </button>
      </div>

      {/* View Mode Toggle & Search */}
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-[300px]">
          <input
            type="search"
            placeholder="Search departments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setViewMode("list")}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              viewMode === "list"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            List View
          </button>
          <button
            onClick={() => setViewMode("tree")}
            className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
              viewMode === "tree"
                ? "bg-emerald-600 text-white"
                : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
            }`}
          >
            Tree View
          </button>
        </div>
      </div>

      {/* Content */}
      {viewMode === "list" ? (
        <ListView departments={filtered} />
      ) : (
        <TreeView departments={hierarchy} />
      )}
    </div>
  );
}

function ListView({ departments }: { departments: Department[] }) {
  if (departments.length === 0) {
    return (
      <div className="rounded-2xl bg-zinc-50 p-12 text-center ring-1 ring-zinc-200">
        <div className="text-sm text-zinc-600">No departments found</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow ring-1 ring-zinc-200">
      <table className="min-w-full divide-y divide-zinc-200">
        <thead className="bg-zinc-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
              Department
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
              Code
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
              Parent
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
              Head
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
              Employees
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-zinc-900">
              Sub-departments
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-zinc-900">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 bg-white">
          {departments.map((dept) => (
            <tr key={dept.id} className="hover:bg-zinc-50 transition">
              <td className="whitespace-nowrap px-6 py-4">
                <div>
                  <div className="font-semibold text-zinc-900">{dept.name}</div>
                  {dept.description && (
                    <div className="text-sm text-zinc-600">{dept.description}</div>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
                  {dept.code}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                {dept.parent ? dept.parent.name : "—"}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-600">
                {dept.head
                  ? `${dept.head.firstName} ${dept.head.lastName}`
                  : "—"}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                {dept._count.employees}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-zinc-900">
                {dept._count.children}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                <button className="font-semibold text-emerald-600 hover:text-emerald-700">
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TreeView({ departments }: { departments: Department[] }) {
  function renderDepartment(dept: Department, level: number = 0) {
    const hasChildren = dept.children && dept.children.length > 0;

    return (
      <div key={dept.id} className="mb-2">
        <div
          className="flex items-center gap-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200 hover:bg-zinc-50 transition"
          style={{ marginLeft: `${level * 32}px` }}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900">{dept.name}</span>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                {dept.code}
              </span>
              {!dept.isActive && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                  Inactive
                </span>
              )}
            </div>
            {dept.head && (
              <div className="mt-1 text-xs text-zinc-600">
                Head: {dept.head.firstName} {dept.head.lastName}
              </div>
            )}
            <div className="mt-1 flex items-center gap-4 text-xs text-zinc-500">
              <span>{dept._count.employees} employees</span>
              {hasChildren && <span>{dept._count.children} sub-departments</span>}
            </div>
          </div>
        </div>
        {hasChildren &&
          dept.children!.map((child) => renderDepartment(child, level + 1))}
      </div>
    );
  }

  if (departments.length === 0) {
    return (
      <div className="rounded-2xl bg-zinc-50 p-12 text-center ring-1 ring-zinc-200">
        <div className="text-sm text-zinc-600">No departments found</div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {departments.map((dept) => renderDepartment(dept))}
    </div>
  );
}
