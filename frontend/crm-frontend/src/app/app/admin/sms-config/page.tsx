"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

type SmsConfig = {
  id: string;
  provider: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
  isActive: boolean;
};

export default function SmsConfigPage() {
  const [config, setConfig] = useState<SmsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [showTestInput, setShowTestInput] = useState(false);

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
        provider: "twilio",
        accountSid: "",
        authToken: "",
        fromNumber: "",
        isActive: false,
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

  function update(field: keyof SmsConfig, value: any) {
    setConfig((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <PermissionGuard permission="admin.access">
      <div className="p-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
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
            <p className="mt-1 text-sm text-zinc-500">Configure your SMS provider credentials for sending text messages</p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl space-y-6">
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
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Provider Settings</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Provider</label>
                <select
                  value={config?.provider ?? "twilio"}
                  onChange={(e) => update("provider", e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="twilio">Twilio</option>
                  <option value="vonage">Vonage (Nexmo)</option>
                  <option value="messagebird">MessageBird</option>
                </select>
              </div>
              <Field label="From Number" value={config?.fromNumber ?? ""} onChange={(v) => update("fromNumber", v)} placeholder="+1234567890" />
              <Field label="Account SID" value={config?.accountSid ?? ""} onChange={(v) => update("accountSid", v)} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
              <Field label="Auth Token" value={config?.authToken ?? ""} onChange={(v) => update("authToken", v)} placeholder="Your auth token" type="password" />
            </div>
          </div>

          {/* Test SMS */}
          {showTestInput && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-zinc-900">Send Test SMS</h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={testNumber}
                  onChange={(e) => setTestNumber(e.target.value)}
                  placeholder="+1234567890"
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
      </div>
    </PermissionGuard>
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
