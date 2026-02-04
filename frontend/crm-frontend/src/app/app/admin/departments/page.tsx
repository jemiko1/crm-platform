"use client";

import { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import AddDepartmentModal from "./add-department-modal";
import EditDepartmentModal from "./edit-department-modal";
import AddPositionModal from "../positions/add-position-modal";
import EmployeePopup from "./employee-popup";

const BRAND = "rgb(8, 117, 56)";

type Department = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  parentId?: string | null;
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
  jobTitle?: string | null;
  extensionNumber?: string | null;
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddPositionModal, setShowAddPositionModal] = useState(false);
  const [showEmployeePopup, setShowEmployeePopup] = useState(false);
  const [employeePopupDeptId, setEmployeePopupDeptId] = useState<string | null>(null);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"split" | "tree">("split");

  // Drag and drop state
  const [draggedDept, setDraggedDept] = useState<Department | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
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

      // Auto-expand all nodes for better visibility
      const allIds = new Set<string>();
      function collectIds(list: Department[]) {
        list.forEach((d) => {
          allIds.add(d.id);
          if (d.children) collectIds(d.children);
        });
      }
      collectIds(deptHierarchy);
      setExpandedNodes(allIds);
    } catch (err: any) {
      setError(err.message || "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

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

  // Available positions for selected department (including inherited)
  const [availablePositions, setAvailablePositions] = useState<(Position & { isInherited?: boolean; inheritedFrom?: string | null })[]>([]);

  useEffect(() => {
    if (selectedDepartment) {
      apiGet<(Position & { isInherited?: boolean; inheritedFrom?: string | null })[]>(
        `/v1/positions/department/${selectedDepartment.id}/available`
      )
        .then((data) => setAvailablePositions(data))
        .catch(() => {
          // Fallback to direct positions
          setAvailablePositions(
            positions.filter(
              (pos) =>
                pos.department?.id === selectedDepartment.id ||
                pos.departmentId === selectedDepartment.id
            )
          );
        });
    } else {
      setAvailablePositions([]);
    }
  }, [selectedDepartment, positions]);

  const positionsInDepartment = useMemo(() => {
    if (!selectedDepartment) return [];

    // Use available positions (with inheritance) 
    const departmentPositions = availablePositions.length > 0 
      ? availablePositions 
      : positions.filter(
          (pos) =>
            pos.department?.id === selectedDepartment.id ||
            pos.departmentId === selectedDepartment.id
        );

    const buckets: Array<{ position: (Position & { isInherited?: boolean; inheritedFrom?: string | null }) | null; employees: Employee[] }> =
      departmentPositions.map((pos) => ({ position: pos, employees: [] }));

    const bucketsMap = new Map<string, { position: (Position & { isInherited?: boolean; inheritedFrom?: string | null }) | null; employees: Employee[] }>();
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
  }, [employeesInDepartment, positions, selectedDepartment, availablePositions]);

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

  function expandAll() {
    const allIds = new Set<string>();
    function collectIds(list: Department[]) {
      list.forEach((d) => {
        allIds.add(d.id);
        if (d.children) collectIds(d.children);
      });
    }
    collectIds(hierarchy);
    setExpandedNodes(allIds);
  }

  function collapseAll() {
    setExpandedNodes(new Set());
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

  // Check if a department is root level (no parent)
  function isRootLevel(dept: Department): boolean {
    // Check parentId first (for hierarchy data), then parent object (for list data)
    if ('parentId' in dept) {
      return dept.parentId === null;
    }
    return dept.parent === null;
  }

  // Drag and drop handlers
  async function handleDrop(targetId: string | null) {
    if (!draggedDept || draggedDept.id === targetId) {
      setDraggedDept(null);
      setDropTargetId(null);
      return;
    }

    // If dropping to root and department is already root-level, show message
    if (targetId === null && isRootLevel(draggedDept)) {
      alert(`"${draggedDept.name}" is already a root-level department`);
      setDraggedDept(null);
      setDropTargetId(null);
      return;
    }

    // Prevent dropping on a descendant
    function isDescendant(parentId: string, checkId: string): boolean {
      const parent = departmentMap.get(parentId);
      if (!parent) return false;
      const children = departments.filter((d) => d.parent?.id === parentId);
      for (const child of children) {
        if (child.id === checkId) return true;
        if (isDescendant(child.id, checkId)) return true;
      }
      return false;
    }

    if (targetId && isDescendant(draggedDept.id, targetId)) {
      alert("Cannot move a department under its own descendant");
      setDraggedDept(null);
      setDropTargetId(null);
      return;
    }

    try {
      await apiPatch(`/v1/departments/${draggedDept.id}`, {
        parentId: targetId,
      });
      await loadAll();
    } catch (err: any) {
      alert(err.message || "Failed to move department");
    }

    setDraggedDept(null);
    setDropTargetId(null);
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

        <div className="mx-2 h-5 w-px bg-zinc-300" />

        <button
          onClick={expandAll}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
        >
          Expand All
        </button>
        <button
          onClick={collapseAll}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-200"
        >
          Collapse All
        </button>
      </div>

      {viewMode === "tree" ? (
        <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)] p-6 overflow-auto">
          <div className="mb-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-700">
            <strong>Tip:</strong> Drag and drop departments to reorganize the hierarchy. Click on a department to view details.
          </div>
          <div className="min-w-max">
            <OrgChartView
              departments={hierarchy}
              employees={employees}
              selectedId={selectedId ?? undefined}
              onSelect={(dept) => setSelectedId(dept.id)}
              onEdit={(dept) => {
                setSelectedId(dept.id);
                setShowEditModal(true);
              }}
              onAddChild={(dept) => {
                setAddParentId(dept.id);
                setShowAddModal(true);
              }}
              onEmployeeClick={(deptId) => {
                setEmployeePopupDeptId(deptId);
                setShowEmployeePopup(true);
              }}
              draggedDept={draggedDept}
              dropTargetId={dropTargetId}
              onDragStart={setDraggedDept}
              onDragOver={setDropTargetId}
              onDrop={handleDrop}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
          <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)] p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Department Hierarchy
              </div>
              <div className="text-xs text-zinc-400">
                Drag to reorganize
              </div>
            </div>

            {/* Drop zone for making items root-level */}
            <div
              className={`mb-3 rounded-xl border-2 border-dashed p-3 text-center text-xs transition ${
                dropTargetId === "root"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-zinc-300 text-zinc-400"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDropTargetId("root");
              }}
              onDragLeave={() => setDropTargetId(null)}
              onDrop={() => handleDrop(null)}
            >
              Drop here to make root-level
            </div>

            <div className="max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              <TreeView
                departments={hierarchy}
                employees={employees}
                expandedNodes={expandedNodes}
                selectedId={selectedId ?? undefined}
                onToggleExpand={toggleExpand}
                onSelect={(dept) => setSelectedId(dept.id)}
                onEdit={(dept) => {
                  setSelectedId(dept.id);
                  setShowEditModal(true);
                }}
                onAddChild={(dept) => {
                  setAddParentId(dept.id);
                  setShowAddModal(true);
                }}
                onEmployeeClick={(deptId) => {
                  setEmployeePopupDeptId(deptId);
                  setShowEmployeePopup(true);
                }}
                draggedDept={draggedDept}
                dropTargetId={dropTargetId}
                onDragStart={setDraggedDept}
                onDragOver={setDropTargetId}
                onDrop={handleDrop}
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
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                      Department Details
                    </div>
                    <button
                      onClick={() => setShowEditModal(true)}
                      className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200"
                    >
                      Edit Department
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold text-zinc-900">
                      {selectedDepartment.name}
                    </h2>
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {selectedDepartment.code}
                    </span>
                    {isRootLevel(selectedDepartment) && (
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 ring-1 ring-purple-200">
                        Root Level
                      </span>
                    )}
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
                    {getBreadcrumb(selectedDepartment).join(" → ")}
                  </div>
                  <div className="text-sm text-zinc-700">
                    <span className="font-medium">Head:</span>{" "}
                    {selectedDepartment.head
                      ? `${selectedDepartment.head.firstName} ${selectedDepartment.head.lastName}`
                      : "Not assigned"}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setAddParentId(selectedDepartment.id);
                        setShowAddModal(true);
                      }}
                      className="w-fit rounded-2xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                    >
                      + Add Sub-department
                    </button>
                    <button
                      onClick={() => setShowAddPositionModal(true)}
                      className="w-fit rounded-2xl bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100"
                    >
                      + Add Position
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard
                    label="Employees"
                    value={employeesInDepartment.length}
                    clickable={employeesInDepartment.length > 0}
                    onClick={() => {
                      if (employeesInDepartment.length > 0) {
                        setEmployeePopupDeptId(selectedDepartment.id);
                        setShowEmployeePopup(true);
                      }
                    }}
                  />
                  <StatCard
                    label="Positions"
                    value={positionsInDepartment.filter((b) => b.position).length}
                    subtitle={
                      availablePositions.filter(p => p.isInherited).length > 0
                        ? `(${availablePositions.filter(p => !p.isInherited).length} own, ${availablePositions.filter(p => p.isInherited).length} inherited)`
                        : undefined
                    }
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
                                          <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-zinc-900">
                                              {bucket.position?.name ?? "Unassigned Position"}
                                            </span>
                                            {bucket.position?.isInherited && (
                                              <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-200">
                                                Inherited
                                              </span>
                                            )}
                                          </div>
                                          {bucket.position?.code && (
                                            <div className="text-xs text-zinc-500">
                                              {bucket.position.code}
                                              {bucket.position?.isInherited && bucket.position?.inheritedFrom && (
                                                <span className="ml-1 text-blue-600">
                                                  (from {bucket.position.inheritedFrom})
                                                </span>
                                              )}
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
                                  {emp.position?.name || emp.jobTitle || "No position"}
                                </div>
                                {emp.extensionNumber && (
                                  <div className="mt-1">
                                    <a
                                      href={`tel:${emp.extensionNumber}`}
                                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                                    >
                                      Ext: {emp.extensionNumber}
                                    </a>
                                  </div>
                                )}
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

      <EditDepartmentModal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onUpdated={() => {
          loadAll();
          setShowEditModal(false);
        }}
        department={selectedDepartment}
        departments={departments}
        employees={employees}
      />

      {selectedDepartment && (
        <AddPositionModal
          open={showAddPositionModal}
          onClose={() => setShowAddPositionModal(false)}
          onSuccess={() => {
            loadAll();
            setShowAddPositionModal(false);
          }}
          defaultDepartmentId={selectedDepartment.id}
          defaultDepartmentName={selectedDepartment.name}
        />
      )}

      {/* Employee Popup for managing employees */}
      {employeePopupDeptId && (
        <EmployeePopup
          open={showEmployeePopup}
          onClose={() => {
            setShowEmployeePopup(false);
            setEmployeePopupDeptId(null);
          }}
          departmentId={employeePopupDeptId}
          departmentName={departmentMap.get(employeePopupDeptId)?.name || "Department"}
          employees={employees.filter(
            (emp) =>
              emp.department?.id === employeePopupDeptId ||
              emp.departmentId === employeePopupDeptId ||
              emp.position?.department?.id === employeePopupDeptId ||
              emp.position?.departmentId === employeePopupDeptId
          )}
          positions={positions}
          allDepartments={departments}
          onUpdate={loadAll}
        />
      )}
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
  onEdit,
  onAddChild,
  onEmployeeClick,
  draggedDept,
  dropTargetId,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  departments: Department[];
  employees: Employee[];
  expandedNodes: Set<string>;
  selectedId?: string;
  onToggleExpand: (id: string) => void;
  onSelect: (dept: Department) => void;
  onEdit?: (dept: Department) => void;
  onAddChild?: (dept: Department) => void;
  onEmployeeClick?: (deptId: string) => void;
  draggedDept: Department | null;
  dropTargetId: string | null;
  onDragStart: (dept: Department | null) => void;
  onDragOver: (id: string | null) => void;
  onDrop: (targetId: string | null) => void;
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
    const isDragging = draggedDept?.id === dept.id;
    const isDropTarget = dropTargetId === dept.id;

    return (
      <div key={dept.id} className="space-y-1">
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onDragStart(dept);
          }}
          onDragEnd={() => {
            onDragStart(null);
            onDragOver(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (draggedDept && draggedDept.id !== dept.id) {
              onDragOver(dept.id);
            }
          }}
          onDragLeave={() => onDragOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(dept.id);
          }}
          className={`flex items-center gap-2 rounded-xl p-3 transition cursor-grab active:cursor-grabbing ${
            isDragging
              ? "opacity-50 ring-2 ring-blue-500"
              : isDropTarget
              ? "bg-emerald-100 ring-2 ring-emerald-500"
              : isSelected
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
                              {level === 0 && (
                                <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 ring-1 ring-purple-200">
                                  ROOT
                                </span>
                              )}
                              {!dept.isActive && (
                                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                                  Inactive
                                </span>
                              )}
                            </div>
            <div className="mt-1 flex items-center gap-3 text-xs text-zinc-500">
              <span
                onClick={(e) => {
                  if (employeeCount > 0 && onEmployeeClick) {
                    e.stopPropagation();
                    onEmployeeClick(dept.id);
                  }
                }}
                className={employeeCount > 0 ? "text-emerald-600 font-semibold cursor-pointer hover:underline" : ""}
              >
                {employeeCount} emp
              </span>
              {hasChildren && <span>{dept._count?.children ?? 0} sub</span>}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {onEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(dept);
                }}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                title="Edit department"
              >
                <IconEdit />
              </button>
            )}
            {onAddChild && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onAddChild(dept);
                }}
                className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                +
              </button>
            )}
          </div>
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

function OrgChartView({
  departments,
  employees,
  selectedId,
  onSelect,
  onEdit,
  onAddChild,
  onEmployeeClick,
  draggedDept,
  dropTargetId,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  departments: Department[];
  employees: Employee[];
  selectedId?: string;
  onSelect: (dept: Department) => void;
  onEdit?: (dept: Department) => void;
  onAddChild?: (dept: Department) => void;
  onEmployeeClick?: (deptId: string) => void;
  draggedDept: Department | null;
  dropTargetId: string | null;
  onDragStart: (dept: Department | null) => void;
  onDragOver: (id: string | null) => void;
  onDrop: (targetId: string | null) => void;
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

  function renderOrgNode(dept: Department, level: number = 0): React.ReactNode {
    const hasChildren = dept.children && dept.children.length > 0;
    const isSelected = selectedId === dept.id;
    const employeeCount = getEmployeeCount(dept.id);
    const children = dept.children || [];
    const isDragging = draggedDept?.id === dept.id;
    const isDropTarget = dropTargetId === dept.id;

    return (
      <div className="flex flex-col items-center" key={dept.id}>
        {/* Department Card */}
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = "move";
            onDragStart(dept);
          }}
          onDragEnd={() => {
            onDragStart(null);
            onDragOver(null);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (draggedDept && draggedDept.id !== dept.id) {
              onDragOver(dept.id);
            }
          }}
          onDragLeave={() => onDragOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            onDrop(dept.id);
          }}
          className={`relative rounded-2xl border-2 p-4 min-w-[200px] max-w-[260px] cursor-grab active:cursor-grabbing transition-all ${
            isDragging
              ? "opacity-50 ring-4 ring-blue-500"
              : isDropTarget
              ? "bg-emerald-100 border-emerald-500 ring-4 ring-emerald-300"
              : isSelected
              ? "bg-emerald-50 border-emerald-500 shadow-xl ring-4 ring-emerald-500/20"
              : "bg-white border-zinc-300 shadow-lg hover:shadow-xl hover:border-emerald-300"
          }`}
          onClick={() => onSelect(dept)}
        >
          {/* Edit button */}
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(dept);
              }}
              className="absolute top-2 right-2 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              title="Edit department"
            >
              <IconEdit />
            </button>
          )}

          <div className="text-center">
            <div className="font-bold text-base text-zinc-900 mb-1 pr-6">
              {dept.name}
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500 mb-2">
              <span>{dept.code}</span>
              {level === 0 && (
                <span className="rounded-full bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 ring-1 ring-purple-200">
                  ROOT
                </span>
              )}
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-zinc-600 pt-2 border-t border-zinc-200">
              <span
                onClick={(e) => {
                  if (employeeCount > 0 && onEmployeeClick) {
                    e.stopPropagation();
                    onEmployeeClick(dept.id);
                  }
                }}
                className={`font-semibold ${
                  employeeCount > 0
                    ? "text-emerald-700 cursor-pointer hover:underline"
                    : "text-zinc-500"
                }`}
              >
                {employeeCount} emp
              </span>
              {hasChildren && (
                <>
                  <span className="text-zinc-300">•</span>
                  <span className="text-zinc-500">
                    {dept._count?.children ?? 0} sub
                  </span>
                </>
              )}
            </div>
            {!dept.isActive && (
              <div className="mt-2">
                <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                  Inactive
                </span>
              </div>
            )}
          </div>

          {/* Add Sub-department Button */}
          {onAddChild && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddChild(dept);
              }}
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 rounded-full border-2 border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 shadow-md z-10"
            >
              + Sub
            </button>
          )}
        </div>

        {/* Connecting Lines and Children */}
        {hasChildren && (
          <div className="flex flex-col items-center w-full mt-6">
            {/* Vertical Line Down from Parent */}
            <div className="w-0.5 h-6 bg-zinc-300"></div>

            {/* Horizontal Line and Children Container */}
            <div className="relative flex items-start justify-center">
              {/* Horizontal Connecting Line */}
              {children.length > 1 && (
                <div
                  className="absolute top-0 h-0.5 bg-zinc-300"
                  style={{
                    left: `calc(50% - ${(children.length - 1) * 130}px)`,
                    width: `${(children.length - 1) * 260}px`,
                  }}
                ></div>
              )}

              {/* Children Nodes */}
              <div className="flex items-start justify-center gap-6">
                {children.map((child) => (
                  <div key={child.id} className="flex flex-col items-center">
                    {/* Vertical Line Up to Horizontal */}
                    <div className="w-0.5 h-6 bg-zinc-300 mb-2"></div>
                    {/* Recursive render child */}
                    {renderOrgNode(child, level + 1)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="py-8">
      {/* Drop zone for making items root-level */}
      <div
        className={`mb-6 mx-auto max-w-xs rounded-xl border-2 border-dashed p-3 text-center text-xs transition ${
          dropTargetId === "root"
            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
            : "border-zinc-300 text-zinc-400"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          onDragOver("root");
        }}
        onDragLeave={() => onDragOver(null)}
        onDrop={() => onDrop(null)}
      >
        Drop here to make root-level department
      </div>

      <div className="flex flex-wrap justify-center gap-8">
        {departments.map((dept) => (
          <div key={dept.id}>
            {renderOrgNode(dept)}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  onClick,
  clickable,
  subtitle,
}: {
  label: string;
  value: number;
  onClick?: () => void;
  clickable?: boolean;
  subtitle?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-zinc-200 bg-white px-4 py-3 shadow-sm ${
        clickable
          ? "cursor-pointer hover:border-emerald-300 hover:bg-emerald-50 transition-colors"
          : ""
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className={`mt-2 text-2xl font-bold ${clickable ? "text-emerald-700" : "text-zinc-900"}`}>
        {value}
        {clickable && (
          <span className="ml-2 text-xs font-normal text-emerald-600">
            (click to manage)
          </span>
        )}
      </div>
      {subtitle && (
        <div className="mt-1 text-xs text-blue-600">{subtitle}</div>
      )}
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

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
