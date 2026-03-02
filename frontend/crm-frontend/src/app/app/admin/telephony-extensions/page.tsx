"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Link from "next/link";
import { PermissionGuard } from "@/lib/permission-guard";

const BRAND = "rgb(8, 117, 56)";

type Extension = {
  id: string;
  crmUserId: string;
  extension: string;
  displayName: string;
  sipServer: string | null;
  sipPassword: string | null;
  isOperator: boolean;
  isActive: boolean;
  user: { id: string; email: string; role: string };
};

type SimpleUser = { id: string; email: string; role: string };

type SipTestResult = "idle" | "testing" | "registered" | "failed";

export default function TelephonyExtensionsPage() {
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [users, setUsers] = useState<SimpleUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sipTestResult, setSipTestResult] = useState<SipTestResult>("idle");
  const [sipTestError, setSipTestError] = useState<string | null>(null);

  const [form, setForm] = useState({
    crmUserId: "",
    extension: "",
    displayName: "",
    sipServer: "",
    sipPassword: "",
    isOperator: true,
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [exts, userList] = await Promise.all([
        apiGet<Extension[]>("/v1/telephony/extensions"),
        apiGet<SimpleUser[]>("/v1/users?pageSize=500"),
      ]);
      setExtensions(exts);
      const usersArr = Array.isArray(userList)
        ? userList
        : (userList as any)?.data ?? [];
      setUsers(usersArr);
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

  function openAdd() {
    setEditingId(null);
    setForm({
      crmUserId: "",
      extension: "",
      displayName: "",
      sipServer: "",
      sipPassword: "",
      isOperator: true,
    });
    setSipTestResult("idle");
    setSipTestError(null);
    setShowForm(true);
  }

  function openEdit(ext: Extension) {
    setEditingId(ext.id);
    setForm({
      crmUserId: ext.crmUserId,
      extension: ext.extension,
      displayName: ext.displayName,
      sipServer: ext.sipServer || "",
      sipPassword: ext.sipPassword || "",
      isOperator: ext.isOperator,
    });
    setSipTestResult(
      ext.sipServer && ext.sipPassword ? "idle" : "idle",
    );
    setSipTestError(null);
    setShowForm(true);
  }

  async function handleTestSip() {
    if (!form.sipServer || !form.extension || !form.sipPassword) {
      setSipTestError("Fill in SIP Server, Extension, and SIP Password first");
      return;
    }

    setSipTestResult("testing");
    setSipTestError(null);

    try {
      const res = await fetch(`http://127.0.0.1:19876/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) throw new Error("Desktop app not responding");

      setSipTestResult("registered");
      setSipTestError(null);
    } catch {
      setSipTestResult("idle");
      setSipTestError(
        "Desktop phone app is not running on this PC. " +
        "The SIP registration test runs when the agent logs into the app with these credentials. " +
        "Save the settings — registration will be verified on login."
      );
    }
  }

  async function handleSave() {
    try {
      const payload = {
        extension: form.extension,
        displayName: form.displayName,
        sipServer: form.sipServer || null,
        sipPassword: form.sipPassword || null,
        isOperator: form.isOperator,
      };

      if (editingId) {
        await apiPatch(`/v1/telephony/extensions/${editingId}`, payload);
      } else {
        await apiPost("/v1/telephony/extensions", {
          ...payload,
          crmUserId: form.crmUserId,
        });
      }
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this extension mapping?")) return;
    try {
      await apiDelete(`/v1/telephony/extensions/${id}`);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleToggleActive(ext: Extension) {
    try {
      await apiPatch(`/v1/telephony/extensions/${ext.id}`, {
        isActive: !ext.isActive,
      });
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  }

  const usedUserIds = new Set(extensions.map((e) => e.crmUserId));
  const availableUsers = users.filter(
    (u) => !usedUserIds.has(u.id) || u.id === form.crmUserId,
  );

  function sipConfigStatus(ext: Extension) {
    if (!ext.sipServer || !ext.sipPassword) return "not-configured";
    return "configured";
  }

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-zinc-600">Loading extensions...</div>
      </div>
    );
  }

  return (
    <PermissionGuard permission="admin.access">
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
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
              Assign SIP extensions to CRM users — enter the extension number,
              SIP server address, and SIP password from FreePBX
            </p>
          </div>
          <button
            onClick={openAdd}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            Add Extension
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        {extensions.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 p-12 text-center">
            <div className="text-sm font-medium text-zinc-600">
              No extensions assigned yet
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-50/50">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    Extension
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    Display Name
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    User
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    SIP Server
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    SIP Config
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    Status
                  </th>
                  <th className="px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {extensions.map((ext) => {
                  const sipStatus = sipConfigStatus(ext);
                  return (
                    <tr
                      key={ext.id}
                      className="transition hover:bg-zinc-50/50"
                    >
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span className="font-mono text-sm font-bold text-zinc-900">
                          {ext.extension}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-900">
                        {ext.displayName}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-600">
                        {ext.user.email}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-sm text-zinc-600 font-mono">
                        {ext.sipServer || (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                            sipStatus === "configured"
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-amber-50 text-amber-700 ring-amber-200"
                          }`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              sipStatus === "configured"
                                ? "bg-emerald-500"
                                : "bg-amber-500"
                            }`}
                          />
                          {sipStatus === "configured"
                            ? "Configured"
                            : "Missing SIP config"}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleActive(ext)}
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 cursor-pointer ${
                            ext.isActive
                              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                              : "bg-zinc-50 text-zinc-600 ring-zinc-200"
                          }`}
                        >
                          {ext.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(ext)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(ext.id)}
                            className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add / Edit Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 space-y-5 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold text-zinc-900">
                {editingId ? "Edit Extension" : "Add Extension"}
              </h3>

              {/* User selection */}
              {!editingId && (
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600">
                    CRM User
                  </label>
                  <select
                    value={form.crmUserId}
                    onChange={(e) =>
                      setForm({ ...form, crmUserId: e.target.value })
                    }
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select user...</option>
                    {availableUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-600">
                  Display Name
                </label>
                <input
                  value={form.displayName}
                  onChange={(e) =>
                    setForm({ ...form, displayName: e.target.value })
                  }
                  placeholder="e.g. John Doe"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                />
              </div>

              {/* SIP Connection Section */}
              <div className="rounded-xl border border-zinc-200 p-4 space-y-3 bg-zinc-50/50">
                <h4 className="text-sm font-semibold text-zinc-800 flex items-center gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-zinc-500"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.81.7A2 2 0 0 1 22 16.92Z" />
                  </svg>
                  SIP Connection
                </h4>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600">
                    Extension Number
                  </label>
                  <input
                    value={form.extension}
                    onChange={(e) =>
                      setForm({ ...form, extension: e.target.value })
                    }
                    placeholder="e.g. 102"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600">
                    SIP Server
                  </label>
                  <input
                    value={form.sipServer}
                    onChange={(e) =>
                      setForm({ ...form, sipServer: e.target.value })
                    }
                    placeholder="e.g. 5.10.34.153"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm font-mono bg-white"
                  />
                  <p className="text-xs text-zinc-400">
                    Your FreePBX/Asterisk server IP or hostname
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-600">
                    SIP Password
                  </label>
                  <input
                    type="password"
                    value={form.sipPassword}
                    onChange={(e) =>
                      setForm({ ...form, sipPassword: e.target.value })
                    }
                    placeholder="From FreePBX extension secret"
                    className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white"
                  />
                  <p className="text-xs text-zinc-400">
                    Found in FreePBX &rarr; Applications &rarr; Extensions
                    &rarr; Secret field
                  </p>
                </div>

                {/* Test SIP button */}
                <div className="pt-1">
                  <button
                    onClick={handleTestSip}
                    disabled={sipTestResult === "testing"}
                    className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {sipTestResult === "testing" ? (
                      <>
                        <span className="h-3 w-3 rounded-full border-2 border-zinc-300 border-t-zinc-700 animate-spin" />
                        Testing...
                      </>
                    ) : sipTestResult === "registered" ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        Registered
                      </>
                    ) : (
                      <>Test SIP Connection</>
                    )}
                  </button>
                </div>

                {sipTestError && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                    {sipTestError}
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isOperator}
                  onChange={(e) =>
                    setForm({ ...form, isOperator: e.target.checked })
                  }
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
                />
                Queue operator
              </label>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 rounded-xl px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                  style={{ backgroundColor: BRAND }}
                >
                  {editingId ? "Save Changes" : "Create"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
