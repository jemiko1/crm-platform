"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

type SmsConfig = {
  id: string;
  provider: string;
  apiKey: string;
  fromNumber: string;
  smsNo: number;
  isActive: boolean;
  maxPerMinute: number;
  maxPerHour: number;
  maxPerDay: number;
  recipientCooldownMin: number;
  maxBatchRecipients: number;
  autoDisableOnLimit: boolean;
};

type SmsLogEntry = {
  id: string;
  body: string;
  status: string;
  deliveryStatus: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  senderMessageId: string | null;
  smsCount: number | null;
  destination: string | null;
  recipientDisplay: string;
  recipient: { id: string; firstName: string; lastName: string; phone: string | null } | null;
};

type SmsLogsResponse = {
  items: SmsLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type SmsStats = { total: number; sent: number; delivered: number; failed: number; pending: number };

type Balance = { success: boolean; balance?: number; overdraft?: number; error?: string };

const TABS = ["Configuration", "SMS Logs"] as const;
type Tab = (typeof TABS)[number];

export default function SmsConfigPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Configuration");

  return (
    <PermissionGuard permission="sms_config.access">
      <div className="p-8">
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
            <h1 className="text-2xl font-bold text-zinc-900">SMS Configuration</h1>
            <p className="mt-1 text-sm text-zinc-500">Configure Sender.ge provider and monitor SMS delivery</p>
          </div>
        </div>

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

        {activeTab === "Configuration" && <ConfigTab />}
        {activeTab === "SMS Logs" && <SmsLogsTab />}
      </div>
    </PermissionGuard>
  );
}

// ─── Configuration Tab ─────────────────────────────────────

function ConfigTab() {
  const [config, setConfig] = useState<SmsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [showTestInput, setShowTestInput] = useState(false);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const data = await apiGet<SmsConfig>("/v1/admin/notifications/sms-config");
      setConfig(data);
    } catch {
      setConfig({
        id: "",
        provider: "sender_ge",
        apiKey: "",
        fromNumber: "",
        smsNo: 2,
        isActive: false,
        maxPerMinute: 10,
        maxPerHour: 100,
        maxPerDay: 500,
        recipientCooldownMin: 5,
        maxBatchRecipients: 50,
        autoDisableOnLimit: true,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const updated = await apiPut<SmsConfig>("/v1/admin/notifications/sms-config", config);
      setConfig(updated);
      setSaveMsg("Configuration saved successfully");
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    if (!testNumber.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiPost<{ success: boolean; message: string }>("/v1/admin/notifications/sms-config/test", {
        testNumber: testNumber.trim(),
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function fetchBalance() {
    setLoadingBalance(true);
    try {
      const data = await apiGet<Balance>("/v1/admin/notifications/sms-config/balance");
      setBalance(data);
    } catch (err: any) {
      setBalance({ success: false, error: err.message });
    } finally {
      setLoadingBalance(false);
    }
  }

  function update(field: keyof SmsConfig, value: any) {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) return <Spinner />;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Balance Card */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-zinc-900">Sender.ge Balance</p>
            {balance?.success ? (
              <div className="mt-1 flex items-baseline gap-4">
                <span className="text-2xl font-bold text-emerald-600">{balance.balance?.toFixed(2)}</span>
                <span className="text-sm text-zinc-500">Overdraft: {balance.overdraft?.toFixed(2)}</span>
              </div>
            ) : balance?.error ? (
              <p className="mt-1 text-sm text-red-500">{balance.error}</p>
            ) : (
              <p className="mt-1 text-sm text-zinc-400">Click refresh to check your balance</p>
            )}
          </div>
          <button
            onClick={fetchBalance}
            disabled={loadingBalance}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {loadingBalance ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Active toggle */}
      <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-5">
        <div>
          <p className="font-semibold text-zinc-900">SMS Service</p>
          <p className="text-sm text-zinc-500">Enable or disable SMS sending globally</p>
        </div>
        <button
          onClick={() => update("isActive", !config?.isActive)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${config?.isActive ? "bg-emerald-500" : "bg-zinc-300"}`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${config?.isActive ? "translate-x-6" : "translate-x-1"}`}
          />
        </button>
      </div>

      {/* Provider Settings */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-semibold text-zinc-900">Sender.ge Settings</h2>
          <a
            href="https://sender.ge/docs/api.php"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-emerald-600 hover:underline"
          >
            API Docs
          </a>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="API Key" value={config?.apiKey ?? ""} onChange={(v) => update("apiKey", v)} placeholder="Your Sender.ge API key" type="password" />
          <Field label="From Number" value={config?.fromNumber ?? ""} onChange={(v) => update("fromNumber", v)} placeholder="0322424245" />
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">SMS Type</label>
            <select
              value={config?.smsNo ?? 2}
              onChange={(e) => update("smsNo", parseInt(e.target.value, 10))}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value={1}>Advertising (with sender number)</option>
              <option value={2}>Informational (without sender number)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Spam Protection */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold text-zinc-900">Spam Protection</h2>
        <p className="mb-4 text-sm text-zinc-500">Rate limits to prevent accidental mass sending or workflow loops</p>
        <div className="grid gap-4 md:grid-cols-3">
          <NumberField
            label="Max per minute"
            value={config?.maxPerMinute ?? 10}
            onChange={(v) => update("maxPerMinute", v)}
            min={1}
            max={60}
            hint="Stops loops instantly"
          />
          <NumberField
            label="Max per hour"
            value={config?.maxPerHour ?? 100}
            onChange={(v) => update("maxPerHour", v)}
            min={1}
            max={1000}
            hint="Prevents sustained bursts"
          />
          <NumberField
            label="Max per day"
            value={config?.maxPerDay ?? 500}
            onChange={(v) => update("maxPerDay", v)}
            min={1}
            max={10000}
            hint="Hard daily budget cap"
          />
          <NumberField
            label="Recipient cooldown (min)"
            value={config?.recipientCooldownMin ?? 5}
            onChange={(v) => update("recipientCooldownMin", v)}
            min={1}
            max={60}
            hint="Min wait between SMS to same number"
          />
          <NumberField
            label="Max batch recipients"
            value={config?.maxBatchRecipients ?? 50}
            onChange={(v) => update("maxBatchRecipients", v)}
            min={1}
            max={500}
            hint="Cap per single send action"
          />
          <div className="flex flex-col justify-center">
            <div className="flex items-center gap-3">
              <button
                onClick={() => update("autoDisableOnLimit", !config?.autoDisableOnLimit)}
                className={`relative inline-flex h-6 w-10 items-center rounded-full transition ${config?.autoDisableOnLimit ? "bg-red-500" : "bg-zinc-300"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${config?.autoDisableOnLimit ? "translate-x-5" : "translate-x-1"}`}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-zinc-700">Auto-disable on daily limit</p>
                <p className="text-xs text-zinc-400">Kill switch if daily cap is hit</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test SMS */}
      {showTestInput && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-zinc-900">Send Test SMS</h3>
          <p className="mb-3 text-xs text-zinc-500">Enter a 9-digit Georgian mobile number (without +995)</p>
          <div className="flex gap-3">
            <input
              type="text"
              value={testNumber}
              onChange={(e) => setTestNumber(e.target.value)}
              placeholder="5XXXXXXXX"
              className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              onClick={handleTest}
              disabled={testing || !testNumber.trim()}
              className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {testing ? "Sending..." : "Send"}
            </button>
          </div>
          {testResult && (
            <div className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${testResult.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {testResult.message}
            </div>
          )}
        </div>
      )}

      {saveMsg && (
        <p className={`text-sm font-medium ${saveMsg.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>{saveMsg}</p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Configuration"}
        </button>
        <button
          onClick={() => setShowTestInput(!showTestInput)}
          className="rounded-xl border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50"
        >
          {showTestInput ? "Hide Test" : "Send Test SMS"}
        </button>
      </div>
    </div>
  );
}

// ─── SMS Logs Tab ──────────────────────────────────────────

function SmsLogsTab() {
  const [logs, setLogs] = useState<SmsLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [stats, setStats] = useState<SmsStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      const data = await apiGet<SmsLogsResponse>(`/v1/admin/notifications/sms-logs?${params}`);
      setLogs(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    } catch { /* ignore */ }
    setLoading(false);
  }, [page, statusFilter]);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiGet<SmsStats>("/v1/admin/notifications/sms-logs/stats");
      setStats(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);
  useEffect(() => { loadStats(); }, [loadStats]);

  async function handleRefreshDeliveries() {
    setRefreshing(true);
    try {
      await apiPost<{ checked: number; updated: number }>("/v1/admin/notifications/sms-logs/refresh-deliveries", {});
      await Promise.all([loadLogs(), loadStats()]);
    } catch { /* ignore */ }
    setRefreshing(false);
  }

  async function handleCheckDelivery(logId: string) {
    setCheckingId(logId);
    try {
      await apiPost(`/v1/admin/notifications/sms-logs/${logId}/check-delivery`, {});
      await loadLogs();
    } catch { /* ignore */ }
    setCheckingId(null);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label="Total" value={stats.total} color="zinc" />
          <StatCard label="Sent" value={stats.sent} color="blue" />
          <StatCard label="Delivered" value={stats.delivered} color="emerald" />
          <StatCard label="Failed" value={stats.failed} color="red" />
          <StatCard label="Pending" value={stats.pending} color="amber" />
        </div>
      )}

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {["", "SENT", "DELIVERED", "FAILED", "PENDING"].map((f) => (
            <button
              key={f}
              onClick={() => { setStatusFilter(f); setPage(1); }}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                statusFilter === f ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              {f || "All"}
            </button>
          ))}
        </div>
        <button
          onClick={handleRefreshDeliveries}
          disabled={refreshing}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          {refreshing ? "Refreshing..." : "Refresh All Statuses"}
        </button>
      </div>

      {/* Log List */}
      {loading ? (
        <Spinner />
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-zinc-200 py-16 text-center text-zinc-400">
          No SMS logs found.
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={log.status} />
                    {log.deliveryStatus && <DeliveryBadge status={log.deliveryStatus} />}
                    <span className="text-xs text-zinc-400">{new Date(log.createdAt).toLocaleString()}</span>
                    {log.smsCount && <span className="text-xs text-zinc-400">({log.smsCount} SMS)</span>}
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-800">
                    To: {log.recipientDisplay}
                    {log.recipient?.phone && <span className="text-zinc-500"> ({log.recipient.phone})</span>}
                    {!log.recipient && log.destination && <span className="text-zinc-500"> ({log.destination})</span>}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{log.body}</p>
                  {log.errorMessage && <p className="mt-1 text-xs text-red-500">Error: {log.errorMessage}</p>}
                  {log.deliveredAt && (
                    <p className="mt-1 text-xs text-emerald-600">Delivered: {new Date(log.deliveredAt).toLocaleString()}</p>
                  )}
                  {log.senderMessageId && (
                    <p className="mt-0.5 text-xs text-zinc-400">Message ID: {log.senderMessageId}</p>
                  )}
                </div>
                {log.senderMessageId && log.status !== "DELIVERED" && (
                  <button
                    onClick={() => handleCheckDelivery(log.id)}
                    disabled={checkingId === log.id}
                    className="ml-3 shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {checkingId === log.id ? "..." : "Check"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
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

// ─── Shared Components ─────────────────────────────────────

function Spinner() {
  return (
    <div className="flex h-32 items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    zinc: "bg-zinc-50 text-zinc-700",
    blue: "bg-blue-50 text-blue-700",
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`rounded-2xl border border-zinc-200 p-4 ${colors[color] ?? colors.zinc}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-medium opacity-70">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SENT: "bg-blue-100 text-blue-700",
    DELIVERED: "bg-emerald-100 text-emerald-700",
    FAILED: "bg-red-100 text-red-700",
    PENDING: "bg-amber-100 text-amber-700",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[status] ?? "bg-zinc-100 text-zinc-600"}`}>{status}</span>;
}

function DeliveryBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DELIVERED: "bg-emerald-100 text-emerald-700",
    UNDELIVERED: "bg-red-100 text-red-700",
    PENDING: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${colors[status] ?? "bg-zinc-100 text-zinc-600"}`}>
      Delivery: {status}
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n)) onChange(Math.max(min ?? 0, Math.min(max ?? 99999, n)));
        }}
        min={min}
        max={max}
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
      {hint && <p className="mt-1 text-xs text-zinc-400">{hint}</p>}
    </div>
  );
}
