"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiGet, apiGetList, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

// ─── Types ───────────────────────────────────────────────

type NotificationTemplate = {
  id: string;
  name: string;
  code: string;
  type: "EMAIL" | "SMS";
  subject: string | null;
  body: string;
  isActive: boolean;
  createdAt: string;
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeId: string;
};

type LogEntry = {
  id: string;
  type: "EMAIL" | "SMS";
  subject: string | null;
  body: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
  recipient: { id: string; firstName: string; lastName: string; email: string; phone: string | null };
};

type LogsResponse = { items: LogEntry[]; total: number; page: number; limit: number; totalPages: number };

const TABS = ["Templates", "Send Notification", "Logs"] as const;
type Tab = (typeof TABS)[number];

// ─── Main Page ───────────────────────────────────────────

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Templates");

  return (
    <PermissionGuard permission="admin.access">
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/app/admin"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Notifications</h1>
            <p className="mt-1 text-sm text-zinc-500">Manage templates, send notifications, and view delivery logs</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl border border-zinc-200 bg-zinc-100 p-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition ${
                activeTab === tab ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Templates" && <TemplatesTab />}
        {activeTab === "Send Notification" && <SendTab />}
        {activeTab === "Logs" && <LogsTab />}
      </div>
    </PermissionGuard>
  );
}

// ─── Templates Tab ───────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<NotificationTemplate[]>("/v1/admin/notifications/templates");
      setTemplates(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this template?")) return;
    await apiDelete(`/v1/admin/notifications/templates/${id}`);
    load();
  }

  function openCreate() {
    setEditing(null);
    setShowModal(true);
  }

  function openEdit(tpl: NotificationTemplate) {
    setEditing(tpl);
    setShowModal(true);
  }

  if (loading) return <Spinner />;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">{templates.length} template(s)</p>
        <button
          onClick={openCreate}
          className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
        >
          + New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-zinc-200 py-16 text-center text-zinc-400">
          No templates yet. Create your first notification template.
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map((tpl) => (
            <div key={tpl.id} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-zinc-900">{tpl.name}</span>
                  <TypeBadge type={tpl.type} />
                  {!tpl.isActive && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">Inactive</span>}
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">Code: {tpl.code}{tpl.subject ? ` | Subject: ${tpl.subject}` : ""}</p>
                <p className="mt-1 line-clamp-1 text-sm text-zinc-600">{tpl.body}</p>
              </div>
              <div className="ml-4 flex gap-2">
                <button onClick={() => openEdit(tpl)} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50">
                  Edit
                </button>
                <button onClick={() => handleDelete(tpl.id)} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50">
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <TemplateModal
          template={editing}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </>
  );
}

// ─── Template Modal ──────────────────────────────────────

function TemplateModal({
  template,
  onClose,
  onSaved,
}: {
  template: NotificationTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!template;
  const [name, setName] = useState(template?.name ?? "");
  const [code, setCode] = useState(template?.code ?? "");
  const [type, setType] = useState<"EMAIL" | "SMS">(template?.type ?? "EMAIL");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [body, setBody] = useState(template?.body ?? "");
  const [isActive, setIsActive] = useState(template?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = { name, code, type, subject: type === "EMAIL" ? subject : undefined, body, isActive };
      if (isEdit) {
        await apiPatch(`/v1/admin/notifications/templates/${template!.id}`, payload);
      } else {
        await apiPost("/v1/admin/notifications/templates", payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="mx-4 w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
      >
        <h2 className="mb-4 text-lg font-bold text-zinc-900">{isEdit ? "Edit Template" : "New Template"}</h2>
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <ModalField label="Name" value={name} onChange={setName} required />
            <ModalField label="Code" value={code} onChange={setCode} placeholder="WORK_ORDER_ASSIGNED" required disabled={isEdit} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Type</label>
            <div className="flex gap-3">
              {(["EMAIL", "SMS"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition ${type === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {type === "EMAIL" && <ModalField label="Subject" value={subject} onChange={setSubject} placeholder="Work Order #{{workOrderNumber}} - {{title}}" />}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Body</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              required
              placeholder="Hello {{firstName}}, you have been assigned..."
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <p className="mt-1 text-xs text-zinc-400">Use {"{{variable}}"} syntax for dynamic content</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-emerald-600" />
            <label className="text-sm text-zinc-700">Active</label>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-xl border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Saving..." : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Send Tab ────────────────────────────────────────────

function SendTab() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [type, setType] = useState<"EMAIL" | "SMS">("EMAIL");
  const [templateCode, setTemplateCode] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [empData, tplData] = await Promise.all([
          apiGetList<Employee>("/v1/employees"),
          apiGet<NotificationTemplate[]>("/v1/admin/notifications/templates"),
        ]);
        setEmployees(empData);
        setTemplates(tplData);
      } catch { /* ignore */ }
    })();
  }, []);

  function toggleEmployee(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((e) => e.id)));
  }

  const filtered = employees.filter((e) => {
    const q = search.toLowerCase();
    return !q || `${e.firstName} ${e.lastName} ${e.email} ${e.employeeId}`.toLowerCase().includes(q);
  });

  async function handleSend() {
    if (selected.size === 0) return;
    setSending(true);
    setResult(null);
    try {
      const payload: any = {
        employeeIds: Array.from(selected),
        type,
      };
      if (templateCode) {
        payload.templateCode = templateCode;
      } else {
        payload.subject = subject;
        payload.body = body;
      }
      const res = await apiPost<{ sent: number; failed: number }>("/v1/admin/notifications/send", payload);
      setResult(res);
    } catch (err: any) {
      setResult({ sent: 0, failed: selected.size });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Channel & Template */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <h3 className="mb-3 font-semibold text-zinc-900">Notification Settings</h3>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Channel</label>
            <div className="flex gap-2">
              {(["EMAIL", "SMS"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${type === t ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-zinc-700">Template (optional)</label>
            <select
              value={templateCode}
              onChange={(e) => setTemplateCode(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Custom message</option>
              {templates
                .filter((t) => t.type === type && t.isActive)
                .map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.name} ({t.code})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {!templateCode && (
          <div className="mt-4 space-y-3">
            {type === "EMAIL" && (
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Notification subject"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Message Body</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                placeholder="Type your message here..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Employee Picker */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-zinc-900">Select Recipients ({selected.size} selected)</h3>
          <button onClick={toggleAll} className="text-xs font-medium text-emerald-600 hover:underline">
            {selected.size === filtered.length ? "Deselect All" : "Select All"}
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employees..."
          className="mb-3 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.map((emp) => (
            <label
              key={emp.id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition ${selected.has(emp.id) ? "bg-emerald-50" : "hover:bg-zinc-50"}`}
            >
              <input
                type="checkbox"
                checked={selected.has(emp.id)}
                onChange={() => toggleEmployee(emp.id)}
                className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">{emp.firstName} {emp.lastName}</p>
                <p className="text-xs text-zinc-400">{emp.email}{emp.phone ? ` | ${emp.phone}` : ""}</p>
              </div>
            </label>
          ))}
          {filtered.length === 0 && <p className="py-4 text-center text-sm text-zinc-400">No employees found</p>}
        </div>
      </div>

      {/* Send */}
      {result && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium ${result.failed === 0 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          Sent: {result.sent} | Failed: {result.failed}
        </div>
      )}
      <button
        onClick={handleSend}
        disabled={sending || selected.size === 0 || (!templateCode && !body)}
        className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50"
      >
        {sending ? "Sending..." : `Send to ${selected.size} recipient(s)`}
      </button>
    </div>
  );
}

// ─── Logs Tab ────────────────────────────────────────────

function LogsTab() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<"" | "EMAIL" | "SMS">("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (typeFilter) params.set("type", typeFilter);
      const data = await apiGet<LogsResponse>(`/v1/admin/notifications/logs?${params}`);
      setLogs(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, typeFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-zinc-500">{total} log(s)</p>
        <div className="flex gap-2">
          {(["", "EMAIL", "SMS"] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setTypeFilter(f); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${typeFilter === f ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}
            >
              {f || "All"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-zinc-200 py-16 text-center text-zinc-400">
          No notification logs yet.
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <TypeBadge type={log.type} />
                <StatusBadge status={log.status} />
                <span className="text-xs text-zinc-400">{new Date(log.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-sm font-medium text-zinc-800">
                To: {log.recipient.firstName} {log.recipient.lastName} ({log.recipient.email})
              </p>
              {log.subject && <p className="text-sm text-zinc-600">Subject: {log.subject}</p>}
              <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{log.body}</p>
              {log.errorMessage && <p className="mt-1 text-xs text-red-500">Error: {log.errorMessage}</p>}
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-zinc-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ───────────────────────────────────

function Spinner() {
  return (
    <div className="flex h-32 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
    </div>
  );
}

function TypeBadge({ type }: { type: "EMAIL" | "SMS" }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        type === "EMAIL" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
      }`}
    >
      {type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SENT: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-red-100 text-red-700",
    PENDING: "bg-amber-100 text-amber-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[status] ?? "bg-zinc-100 text-zinc-600"}`}>{status}</span>;
}

function ModalField({
  label,
  value,
  onChange,
  placeholder,
  required,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:bg-zinc-100"
      />
    </div>
  );
}
