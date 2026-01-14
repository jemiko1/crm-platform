"use client";

import { useMemo, useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import AddDepartmentModal from "./add-department-modal";

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

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  status: string;
  departmentId?: string | null;
  positionId?: string | null;
  department?: {
    id: string;
    name: string;
    code: string;
  } | null;
  position?: {
    id: string;
    name: string;
    code: string;
    departmentId?: string | null;
    department?: {
      id: string;
      name: string;
      code: string;
    } | null;
  } | null;
};

type Position = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isActive?: boolean;
  departmentId?: string | null;
  department?: {
    id: string;
    name: string;
    code: string;
  } | null;
};

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [hierarchy, setHierarchy] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"split" | "tree">("split");

  async function loadAll() {
    try {
      setLoading(true);
      const [deptList, deptHierarchy, employeeList, positionList] =
        await Promise.all([
          apiGet<Department[]>("/v1/departments"),
          apiGet<Department[]>("/v1/departments/hierarchy"),
          apiGet<Employee[]>("/v1/employees"),
          apiGet<Position[]>("/v1/positions"),
        ]);
      setDepartments(deptList);
      setHierarchy(deptHierarchy);
      setEmployees(employeeList);
      setPositions(positionList);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!selectedId && hierarchy.length > 0) {
      setSelectedId(hierarchy[0]?.id ?? null);
    }
  }, [hierarchy, selectedId]);

  const departmentMap = useMemo(() => {
    const map = new Map<string, Department>();
    departments.forEach((dept) => map.set(dept.id, dept));
    return map;
  }, [departments]);

  const selectedDepartment = useMemo(() => {
    if (!selectedId) return null;
    return departmentMap.get(selectedId) ?? findInHierarchy(selectedId, hierarchy);
  }, [selectedId, departmentMap, hierarchy]);

  const employeesInDepartment = useMemo(() => {
    if (!selectedDepartment) return [];
    return employees.filter(
      (emp) =>
        emp.department?.id === selectedDepartment.id ||
        emp.departmentId === selectedDepartment.id ||
        emp.position?.department?.id === selectedDepartment.id ||
        emp.position?.departmentId === selectedDepartment.id
    );
  }, [employees, selectedDepartment]);

  const positionsInDepartment = useMemo(() => {
    if (!selectedDepartment) return [];

    const departmentPositions = positions.filter(
      (pos) =>
        pos.department?.id === selectedDepartment.id ||
        pos.departmentId === selectedDepartment.id
    );

    const buckets: Array<{ position: Position | null; employees: Employee[] }> =
      departmentPositions.map((pos) => ({ position: pos, employees: [] }));

    const bucketsMap = new Map<string, { position: Position | null; employees: Employee[] }>();
    buckets.forEach((bucket) => {
      if (bucket.position) {
        bucketsMap.set(bucket.position.id, bucket);
      }
    });

    const unassignedBucket = { position: null, employees: [] as Employee[] };

    employeesInDepartment.forEach((emp) => {
      if (emp.positionId && bucketsMap.has(emp.positionId)) {
        bucketsMap.get(emp.positionId)?.employees.push(emp);
      } else {
        unassignedBucket.employees.push(emp);
      }
    });

    const finalBuckets = [...buckets];
    if (unassignedBucket.employees.length > 0) {
      finalBuckets.push(unassignedBucket);
    }

    return finalBuckets.sort((a, b) => {
      const nameA = a.position?.name ?? "Unassigned Position";
      const nameB = b.position?.name ?? "Unassigned Position";
      return nameA.localeCompare(nameB);
    });
  }, [employeesInDepartment, positions, selectedDepartment]);

  function toggleExpand(id: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function getBreadcrumb(dept: Department | null): string[] {
    if (!dept) return [];
    const path: string[] = [];
    let current: Department | null = dept;
    while (current) {
      path.unshift(current.name);
      current = current.parent ? departmentMap.get(current.parent.id) ?? null : null;
    }
    return path;
  }

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

  if (departments.length === 0) {
    return (
      <div className="p-8">
        <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)] p-8 text-center">
          <h1 className="text-2xl font-bold text-zinc-900">Departments</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Start by creating your company structure: a root department (Company),
            then Level 2 departments, then sub-departments.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-6 rounded-2xl px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            + Add Department
          </button>
        </div>
        <AddDepartmentModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onCreated={(dept) => {
            setSelectedId(dept.id);
            setShowAddModal(false);
            loadAll();
          }}
          departments={departments}
          employees={employees}
        />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Company Structure</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Build departments, define positions, and assign employees
          </p>
        </div>
        <button
          onClick={() => {
            setAddParentId(null);
            setShowAddModal(true);
          }}
          className="rounded-2xl px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          + Add Department
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setViewMode("split")}
          className={`rounded-full px-4 py-2 text-xs font-semibold transition ${
            viewMode === "split"
              ? "bg-emerald-600 text-white"
              : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
          }`}
        >
          Split View
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

      {viewMode === "tree" ? (
        <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)] p-6">
          <TreeView
            departments={hierarchy}
            employees={employees}
            expandedNodes={expandedNodes}
            selectedId={selectedId ?? undefined}
            onToggleExpand={toggleExpand}
            onSelect={(dept) => setSelectedId(dept.id)}
            onAddChild={(dept) => {
              setAddParentId(dept.id);
              setShowAddModal(true);
            }}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)] p-5">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Department Hierarchy
            </div>
            <div className="max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              <TreeView
                departments={hierarchy}
                employees={employees}
                expandedNodes={expandedNodes}
                selectedId={selectedId ?? undefined}
                onToggleExpand={toggleExpand}
                onSelect={(dept) => setSelectedId(dept.id)}
                onAddChild={(dept) => {
                  setAddParentId(dept.id);
                  setShowAddModal(true);
                }}
              />
            </div>
          </div>

          <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)] p-6">
            {!selectedDepartment ? (
              <div className="text-sm text-zinc-500">
                Select a department to view its structure.
              </div>
            ) : (
              <div className="space-y-8">
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Department Details
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-zinc-900">
                      {selectedDepartment.name}
                    </h2>
                    {!selectedDepartment.isActive && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-zinc-600">
                    {selectedDepartment.description || "No description yet"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {getBreadcrumb(selectedDepartment).join(" / ")}
                  </div>
                  <div className="text-sm text-zinc-700">
                    Head:{" "}
                    {selectedDepartment.head
                      ? `${selectedDepartment.head.firstName} ${selectedDepartment.head.lastName}`
                      : "Not assigned"}
                  </div>
                  <button
                    onClick={() => {
                      setAddParentId(selectedDepartment.id);
                      setShowAddModal(true);
                    }}
                    className="w-fit rounded-2xl bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
                  >
                    + Add Sub-department
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard label="Employees" value={employeesInDepartment.length} />
                <StatCard
                  label="Positions"
                  value={positionsInDepartment.filter((b) => b.position).length}
                />
                  <StatCard
                    label="Sub-departments"
                    value={selectedDepartment._count?.children ?? 0}
                  />
                </div>

                <div>
                  <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Positions & Employees
                  </div>
                  {employeesInDepartment.length === 0 ? (
                    <div className="rounded-2xl bg-zinc-50 p-6 text-sm text-zinc-600 ring-1 ring-zinc-200">
                      No employees assigned yet. Assign employees to positions to
                      automatically populate this structure.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {positionsInDepartment.map((bucket) => (
                        <div
                          key={bucket.position?.id ?? "unassigned"}
                          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">
                                {bucket.position?.name ?? "Unassigned Position"}
                              </div>
                              {bucket.position?.code && (
                                <div className="text-xs text-zinc-500">
                                  {bucket.position.code}
                                </div>
                              )}
                            </div>
                            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                              {bucket.employees.length} employee
                              {bucket.employees.length === 1 ? "" : "s"}
                            </span>
                          </div>

                          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                            {bucket.employees.map((emp) => (
                              <div
                                key={emp.id}
                                className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3"
                              >
                                <div className="text-sm font-semibold text-zinc-900">
                                  {emp.firstName} {emp.lastName}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {emp.jobTitle}
                                </div>
                                <div className="text-xs text-zinc-500">
                                  {emp.email}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <AddDepartmentModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={(dept) => {
          setSelectedId(dept.id);
          setShowAddModal(false);
          loadAll();
        }}
        departments={departments}
        employees={employees}
        initialParentId={addParentId}
        initialParentName={
          addParentId ? departmentMap.get(addParentId)?.name ?? null : null
        }
      />
    </div>
  );
}

function findInHierarchy(id: string, list: Department[]): Department | null {
  for (const dept of list) {
    if (dept.id === id) return dept;
    if (dept.children) {
      const found = findInHierarchy(id, dept.children);
      if (found) return found;
    }
  }
  return null;
}

function TreeView({
  departments,
  employees,
  expandedNodes,
  selectedId,
  onToggleExpand,
  onSelect,
  onAddChild,
}: {
  departments: Department[];
  employees: Employee[];
  expandedNodes: Set<string>;
  selectedId?: string;
  onToggleExpand: (id: string) => void;
  onSelect: (dept: Department) => void;
  onAddChild?: (dept: Department) => void;
}) {
  function getEmployeeCount(deptId: string): number {
    return employees.filter(
      (emp) =>
        emp.department?.id === deptId ||
        emp.departmentId === deptId ||
        emp.position?.department?.id === deptId ||
        emp.position?.departmentId === deptId
    ).length;
  }

  function renderDepartment(dept: Department, level: number = 0) {
    const hasChildren = dept.children && dept.children.length > 0;
    const isExpanded = expandedNodes.has(dept.id);
    const isSelected = selectedId === dept.id;
    const employeeCount = getEmployeeCount(dept.id);

    return (
      <div key={dept.id} className="space-y-1">
        <div
          className={`flex items-center gap-2 rounded-xl p-3 transition cursor-pointer ${
            isSelected
              ? "bg-emerald-50 ring-2 ring-emerald-500"
              : "bg-white hover:bg-zinc-50 ring-1 ring-zinc-200"
          }`}
          style={{ marginLeft: `${level * 20}px` }}
          onClick={() => onSelect(dept)}
        >
          {hasChildren ? (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onToggleExpand(dept.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-zinc-600 hover:bg-zinc-100"
            >
              {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
            </button>
          ) : (
            <div className="w-6" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate font-semibold text-zinc-900">
                {dept.name}
              </span>
              {!dept.isActive && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                  Inactive
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
              <span>{employeeCount} employees</span>
              {hasChildren && <span>{dept._count?.children ?? 0} sub</span>}
            </div>
          </div>

          {onAddChild && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAddChild(dept);
              }}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              + Sub
            </button>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {dept.children!.map((child) => renderDepartment(child, level + 1))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {departments.map((dept) => renderDepartment(dept))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-bold text-zinc-900">{value}</div>
    </div>
  );
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 18l6-6-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
