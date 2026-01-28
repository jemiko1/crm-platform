"use client";

import React, { useState } from "react";
import { apiGet } from "@/lib/api";
import EditEmployeeModal from "./edit-employee-modal";

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
  birthday?: string | null;
  status: "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";
  avatar: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  user: {
    id: string;
    email: string;
    role: string;
    isActive: boolean;
  } | null;
  department: {
    id: string;
    name: string;
    code: string;
  } | null;
  position: {
    id: string;
    name: string;
    code: string;
  } | null;
  role: {
    id: string;
    name: string;
    code: string;
    permissions?: Array<{
      permission: {
        resource: string;
        action: string;
        description: string | null;
      };
    }>;
  } | null;
  manager: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  subordinates: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  }>;
  workOrderAssignments: Array<{
    id: string;
    assignedAt: string;
    workOrder: {
      id: string;
      title: string;
      status: string;
      type: string;
      building: {
        name: string;
      };
    };
  }>;
  hireDate?: string;
  exitDate?: string | null;
};

type Tab = "personal" | "employment" | "permissions" | "work-orders";

function getStatusBadge(status: Employee["status"]) {
  const styles = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    INACTIVE: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    ON_LEAVE: "bg-amber-50 text-amber-700 ring-amber-200",
    TERMINATED: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return styles[status];
}

function safeText(v?: string | null) {
  const s = (v ?? "").trim();
  return s || "—";
}

type Props = {
  employee: Employee;
  employeeId: string;
  onUpdate?: () => void;
};

export default function EmployeeDetailContent({ employee, employeeId, onUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("personal");
  const [showEditModal, setShowEditModal] = useState(false);

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "personal", label: "Personal" },
    { id: "employment", label: "Employment" },
    { id: "permissions", label: "Permissions" },
    { id: "work-orders", label: "Work Orders" },
  ];

  return (
    <div className="p-6 bg-emerald-50/30 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none lg:rounded-br-none">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-4">
          {employee.avatar ? (
            <img
              src={employee.avatar}
              alt={`${employee.firstName} ${employee.lastName}`}
              className="h-16 w-16 rounded-full ring-2 ring-zinc-200"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white"
              style={{ backgroundColor: BRAND }}
            >
              {employee.firstName[0]}{employee.lastName[0]}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">
              {employee.firstName} {employee.lastName}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">{employee.email}</p>
            <p className="mt-1 text-sm text-zinc-600">{employee.employeeId}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(employee.status)}`}
          >
            {employee.status.replace("_", " ")}
          </span>
          <button
            onClick={() => setShowEditModal(true)}
            className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
          >
            Edit
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-zinc-200">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "border-b-2 text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
              style={activeTab === tab.id ? { borderBottomColor: BRAND } : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl bg-white shadow ring-1 ring-zinc-200 p-6">
        {activeTab === "personal" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900">Personal Information</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-zinc-500">First Name</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{employee.firstName}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Last Name</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{employee.lastName}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Email</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{employee.email}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Phone</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{safeText(employee.phone)}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Address</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{safeText(employee.address)}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">City</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{safeText(employee.city)}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Country</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{safeText(employee.country)}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Emergency Contact</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{safeText(employee.emergencyContact)}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Emergency Phone</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{safeText(employee.emergencyPhone)}</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "employment" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900">Employment Information</h2>
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-zinc-500">Employee ID</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">{employee.employeeId}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Position</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {employee.position?.name || employee.jobTitle || "—"}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Department</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {employee.department ? employee.department.name : "—"}
                </div>
              </div>
              {employee.extensionNumber && (
                <div>
                  <label className="text-xs font-medium text-zinc-500">Extension</label>
                  <div className="mt-1">
                    <a
                      href={`tel:${employee.extensionNumber}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100"
                    >
                      {employee.extensionNumber}
                    </a>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-zinc-500">Role</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {employee.role ? employee.role.name : "—"}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Manager</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {employee.manager
                    ? `${employee.manager.firstName} ${employee.manager.lastName}`
                    : "—"}
                </div>
              </div>
              {employee.hireDate && (
                <div>
                  <label className="text-xs font-medium text-zinc-500">Hire Date</label>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {new Date(employee.hireDate).toLocaleDateString()}
                  </div>
                </div>
              )}
              {employee.exitDate && (
                <div>
                  <label className="text-xs font-medium text-zinc-500">Exit Date</label>
                  <div className="mt-1 text-sm font-semibold text-zinc-900">
                    {new Date(employee.exitDate).toLocaleDateString()}
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-zinc-500">User Account</label>
                <div className="mt-1 text-sm font-semibold text-zinc-900">
                  {employee.user ? (
                    <span className={employee.user.isActive ? "text-emerald-600" : "text-zinc-400"}>
                      {employee.user.isActive ? "Active" : "Inactive"} ({employee.user.role})
                    </span>
                  ) : (
                    "No account"
                  )}
                </div>
              </div>
            </div>

            {employee.subordinates && Array.isArray(employee.subordinates) && employee.subordinates.length > 0 && (
              <div className="mt-8">
                <h3 className="text-sm font-semibold text-zinc-900 mb-3">Direct Reports</h3>
                <div className="space-y-2">
                  {employee.subordinates.map((sub: any) => (
                    <div key={sub.id} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                      <div className="font-semibold text-zinc-900">
                        {sub.firstName} {sub.lastName}
                      </div>
                      <div className="text-xs text-zinc-600">{sub.email}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "permissions" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900">Permissions</h2>
            {employee.role?.permissions && Array.isArray(employee.role.permissions) && employee.role.permissions.length > 0 ? (
              <div className="space-y-2">
                {employee.role.permissions.map((rp: any, idx: number) => (
                  <div key={idx} className="rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                    <div className="font-semibold text-zinc-900">
                      {rp?.permission?.resource || 'unknown'}.{rp?.permission?.action || 'unknown'}
                    </div>
                    {rp?.permission?.description && (
                      <div className="mt-1 text-xs text-zinc-600">{rp.permission.description}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-600">
                {employee.role 
                  ? "No permissions assigned to this role. Permissions come from the employee's role."
                  : "No role assigned. Assign a role to see permissions."}
              </div>
            )}
          </div>
        )}

        {activeTab === "work-orders" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900">Assigned Work Orders</h2>
            {employee.workOrderAssignments && Array.isArray(employee.workOrderAssignments) && employee.workOrderAssignments.length > 0 ? (
              <div className="space-y-2">
                {employee.workOrderAssignments.map((assignment: any) => (
                  <div key={assignment.id} className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold text-zinc-900">{assignment.workOrder?.title || 'Untitled'}</div>
                        <div className="mt-1 text-xs text-zinc-600">
                          {assignment.workOrder?.building?.name || 'Unknown Building'} • {assignment.workOrder?.type || 'Unknown Type'}
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">
                          Assigned: {assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleDateString() : 'Unknown'}
                        </div>
                      </div>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ring-1 ${
                          assignment.workOrder?.status === "DONE"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : assignment.workOrder?.status === "IN_PROGRESS"
                            ? "bg-amber-50 text-amber-700 ring-amber-200"
                            : "bg-zinc-50 text-zinc-700 ring-zinc-200"
                        }`}
                      >
                        {assignment.workOrder?.status?.replace("_", " ") || 'Unknown'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl bg-zinc-50 p-6 text-center text-sm text-zinc-600">
                No work orders assigned yet.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Edit Employee Modal */}
      <EditEmployeeModal
        employee={employee}
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        onSuccess={() => {
          setShowEditModal(false);
          if (onUpdate) {
            onUpdate();
          } else {
            window.location.reload();
          }
        }}
      />
    </div>
  );
}
