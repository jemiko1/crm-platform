"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Link from "next/link";
import { PermissionGuard } from "@/lib/permission-guard";

const BRAND = "rgb(0, 86, 83)";

type ExtConfig = {
  id: string;
  extension: string;
  displayName: string;
  sipServer: string | null;
  sipPassword: string | null;
  isOperator: boolean;
  isActive: boolean;
};

type UserRow = {
  id: string;
  email: string;
  role: string;
  employee: { firstName: string; lastName: string; status: string } | null;
  telephonyExtension: ExtConfig | null;
};

export default function TelephonyExtensionsPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    extension: "",
    displayName: "",
    sipServer: "",
    sipPassword: "",
    isOperator: true,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<UserRow[]>(
        "/v1/telephony/extensions/users-with-config",
      );
      setUsers(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function empName(u: UserRow) {
    if (u.employee) return `${u.employee.firstName} ${u.employee.lastName}`;
    return u.email;
  }

  function toggleExpand(u: UserRow) {
    if (expandedUserId === u.id) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(u.id);
    setError(null);
    if (u.telephonyExtension) {
      setForm({
        extension: u.telephonyExtension.extension,
        displayName: u.telephonyExtension.displayName,
        sipServer: u.telephonyExtension.sipServer || "",
        sipPassword: u.telephonyExtension.sipPassword || "",
        isOperator: u.telephonyExtension.isOperator,
      });
    } else {
      setForm({
        extension: "",
        displayName: empName(u),
        sipServer: "",
        sipPassword: "",
        isOperator: true,
      });
    }
  }

  async function handleSave(u: UserRow) {
    if (!form.extension.trim()) {
      setError("Extension number is required");
      return;
    }
    if (!form.displayName.trim()) {
      setError("Display name is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      if (u.telephonyExtension) {
        await apiPatch(`/v1/telephony/extensions/${u.telephonyExtension.id}`, {
          extension: form.extension,
          displayName: form.displayName,
          sipServer: form.sipServer || null,
          sipPassword: form.sipPassword || null,
          isOperator: form.isOperator,
        });
      } else {
        await apiPost("/v1/telephony/extensions", {
          crmUserId: u.id,
          extension: form.extension,
          displayName: form.displayName,
          sipServer: form.sipServer || null,
          sipPassword: form.sipPassword || null,
          isOperator: form.isOperator,
        });
      }

      setExpandedUserId(null);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(u: UserRow) {
    if (!u.telephonyExtension) return;
    if (!confirm(`Remove SIP extension ${u.telephonyExtension.extension} from ${empName(u)}?`)) return;
    try {
      setError(null);
      await apiDelete(`/v1/telephony/extensions/${u.telephonyExtension.id}`);
      setExpandedUserId(null);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleToggleActive(u: UserRow) {
    if (!u.telephonyExtension) return;
    try {
      await apiPatch(`/v1/telephony/extensions/${u.telephonyExtension.id}`, {
        isActive: !u.telephonyExtension.isActive,
      });
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  function sipBadge(u: UserRow) {
    const ext = u.telephonyExtension;
    if (!ext) return { label: "Not configured", cls: "bg-zinc-50 text-zinc-500 ring-zinc-200", dot: "bg-zinc-400" };
    if (!ext.sipServer || !ext.sipPassword)
      return { label: `Ext ${ext.extension} — missing SIP`, cls: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" };
    if (!ext.isActive)
      return { label: `Ext ${ext.extension} — disabled`, cls: "bg-zinc-50 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400" };
    return { label: `Ext ${ext.extension} — ready`, cls: "bg-teal-50 text-teal-900 ring-teal-200", dot: "bg-teal-500" };
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-zinc-600">Loading...</div>
      </div>
    );
  }

  return (
    <PermissionGuard permission="admin.access">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <Link
            href="/app/admin"
            className="mb-2 inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            &larr; Back to Admin Panel
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">
            Telephony Extensions
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            Configure SIP extensions for employees. Click on an employee to set up their extension, SIP server, and password.
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-zinc-50/50">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Employee
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Email / Login
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  SIP Extension
                </th>
                <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((u) => {
                const badge = sipBadge(u);
                const isExpanded = expandedUserId === u.id;

                return (
                  <tr key={u.id} className="group">
                    <td colSpan={4} className="p-0">
                      {/* Main row */}
                      <div
                        className={`flex items-center cursor-pointer transition hover:bg-zinc-50/80 ${isExpanded ? "bg-zinc-50" : ""}`}
                        onClick={() => toggleExpand(u)}
                      >
                        <div className="px-5 py-4 flex-1 min-w-0">
                          <div className="text-sm font-medium text-zinc-900 truncate">
                            {empName(u)}
                          </div>
                          {u.employee?.status && u.employee.status !== "ACTIVE" && (
                            <span className="text-xs text-zinc-400">{u.employee.status}</span>
                          )}
                        </div>
                        <div className="px-5 py-4 flex-1 min-w-0">
                          <div className="text-sm text-zinc-600 truncate">{u.email}</div>
                          <div className="text-xs text-zinc-400">{u.role}</div>
                        </div>
                        <div className="px-5 py-4 flex-1">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${badge.cls}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
                            {badge.label}
                          </span>
                        </div>
                        <div className="px-5 py-4 text-right shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleExpand(u); }}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50"
                          >
                            {isExpanded ? "Close" : u.telephonyExtension ? "Edit" : "Configure"}
                          </button>
                        </div>
                      </div>

                      {/* Expanded SIP config panel */}
                      {isExpanded && (
                        <div className="border-t border-zinc-100 bg-zinc-50/50 px-5 py-5">
                          <div className="max-w-2xl space-y-4">
                            <h4 className="text-sm font-semibold text-zinc-800">
                              SIP Configuration for {empName(u)}
                            </h4>

                            {error && (
                              <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
                                {error}
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-zinc-600">Extension Number</label>
                                <input
                                  value={form.extension}
                                  onChange={(e) => setForm({ ...form, extension: e.target.value })}
                                  placeholder="e.g. 102"
                                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-zinc-600">Display Name</label>
                                <input
                                  value={form.displayName}
                                  onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                                  placeholder="e.g. John Doe"
                                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-zinc-600">SIP Server</label>
                                <input
                                  value={form.sipServer}
                                  onChange={(e) => setForm({ ...form, sipServer: e.target.value })}
                                  placeholder="e.g. 5.10.34.153"
                                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-mono bg-white"
                                />
                                <p className="text-xs text-zinc-400">FreePBX/Asterisk server IP or hostname</p>
                              </div>
                              <div className="space-y-1">
                                <label className="text-xs font-medium text-zinc-600">SIP Password</label>
                                <input
                                  type="password"
                                  value={form.sipPassword}
                                  onChange={(e) => setForm({ ...form, sipPassword: e.target.value })}
                                  placeholder="Extension secret from FreePBX"
                                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white"
                                />
                                <p className="text-xs text-zinc-400">FreePBX &rarr; Extensions &rarr; Secret</p>
                              </div>
                            </div>

                            <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.isOperator}
                                onChange={(e) => setForm({ ...form, isOperator: e.target.checked })}
                                className="h-4 w-4 rounded border-zinc-300 text-teal-800"
                              />
                              Queue operator (receives calls from queues)
                            </label>

                            <div className="flex items-center gap-3 pt-1">
                              <button
                                onClick={() => handleSave(u)}
                                disabled={saving}
                                className="rounded-xl px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                                style={{ backgroundColor: BRAND }}
                              >
                                {saving ? "Saving..." : u.telephonyExtension ? "Save Changes" : "Save Extension"}
                              </button>
                              <button
                                onClick={() => { setExpandedUserId(null); setError(null); }}
                                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
                              >
                                Cancel
                              </button>
                              {u.telephonyExtension && (
                                <>
                                  <button
                                    onClick={() => handleToggleActive(u)}
                                    className={`ml-auto rounded-xl border px-4 py-2 text-sm font-medium ${
                                      u.telephonyExtension.isActive
                                        ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                        : "border-teal-200 text-teal-900 hover:bg-teal-50"
                                    }`}
                                  >
                                    {u.telephonyExtension.isActive ? "Disable" : "Enable"}
                                  </button>
                                  <button
                                    onClick={() => handleRemove(u)}
                                    className="rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50"
                                  >
                                    Remove
                                  </button>
                                </>
                              )}
                            </div>

                            <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                              SIP registration is verified when the employee logs into the CRM Phone desktop app.
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </PermissionGuard>
  );
}
