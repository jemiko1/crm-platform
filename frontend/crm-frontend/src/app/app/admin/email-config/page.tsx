"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

type EmailConfig = {
  id: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  fromName: string;
  fromEmail: string;
  isActive: boolean;
};

type TestResult = {
  smtp: { success: boolean; message: string };
  imap: { success: boolean; message: string };
};

export default function EmailConfigPage() {
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
      const data = await apiGet<EmailConfig>("/v1/admin/notifications/email-config");
      setConfig(data);
    } catch {
      setConfig({
        id: "",
        smtpHost: "",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "",
        smtpPass: "",
        imapHost: "",
        imapPort: 993,
        imapSecure: true,
        imapUser: "",
        imapPass: "",
        fromName: "",
        fromEmail: "",
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
      const updated = await apiPut<EmailConfig>("/v1/admin/notifications/email-config", config);
      setConfig(updated);
      setSaveMsg("Configuration saved successfully");
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiPost<TestResult>("/v1/admin/notifications/email-config/test", {});
      setTestResult(result);
    } catch (err: any) {
      setTestResult({
        smtp: { success: false, message: err.message },
        imap: { success: false, message: err.message },
      });
    } finally {
      setTesting(false);
    }
  }

  function update(field: keyof EmailConfig, value: any) {
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
            <h1 className="text-2xl font-bold text-zinc-900">Email Configuration</h1>
            <p className="mt-1 text-sm text-zinc-500">Configure SMTP (outgoing) and IMAP (incoming) email settings</p>
          </div>
        </div>

        <div className="mx-auto max-w-3xl space-y-6">
          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-5">
            <div>
              <p className="font-semibold text-zinc-900">Email Service</p>
              <p className="text-sm text-zinc-500">Enable or disable email sending globally</p>
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

          {/* SMTP Settings */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">SMTP Settings (Outgoing)</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SMTP Host" value={config?.smtpHost ?? ""} onChange={(v) => update("smtpHost", v)} placeholder="smtp.gmail.com" />
              <Field label="SMTP Port" value={String(config?.smtpPort ?? 587)} onChange={(v) => update("smtpPort", parseInt(v) || 587)} placeholder="587" />
              <Field label="Username" value={config?.smtpUser ?? ""} onChange={(v) => update("smtpUser", v)} placeholder="your-email@gmail.com" />
              <Field label="Password" value={config?.smtpPass ?? ""} onChange={(v) => update("smtpPass", v)} placeholder="App password" type="password" />
              <Field label="From Name" value={config?.fromName ?? ""} onChange={(v) => update("fromName", v)} placeholder="CRM Platform" />
              <Field label="From Email" value={config?.fromEmail ?? ""} onChange={(v) => update("fromEmail", v)} placeholder="noreply@example.com" />
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={config?.smtpSecure ?? false}
                  onChange={(e) => update("smtpSecure", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label className="text-sm text-zinc-700">Use SSL/TLS (port 465)</label>
              </div>
            </div>
          </div>

          {/* IMAP Settings */}
          <div className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">IMAP Settings (Incoming)</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="IMAP Host" value={config?.imapHost ?? ""} onChange={(v) => update("imapHost", v)} placeholder="imap.gmail.com" />
              <Field label="IMAP Port" value={String(config?.imapPort ?? 993)} onChange={(v) => update("imapPort", parseInt(v) || 993)} placeholder="993" />
              <Field label="Username" value={config?.imapUser ?? ""} onChange={(v) => update("imapUser", v)} placeholder="your-email@gmail.com" />
              <Field label="Password" value={config?.imapPass ?? ""} onChange={(v) => update("imapPass", v)} placeholder="App password" type="password" />
              <div className="flex items-center gap-2 md:col-span-2">
                <input
                  type="checkbox"
                  checked={config?.imapSecure ?? true}
                  onChange={(e) => update("imapSecure", e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                <label className="text-sm text-zinc-700">Use SSL/TLS</label>
              </div>
            </div>
          </div>

          {/* Test Results */}
          {testResult && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-zinc-900">Connection Test Results</h3>
              <div className="space-y-2">
                <ResultBadge label="SMTP" success={testResult.smtp.success} message={testResult.smtp.message} />
                <ResultBadge label="IMAP" success={testResult.imap.success} message={testResult.imap.message} />
              </div>
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
              onClick={handleTest}
              disabled={testing}
              className="rounded-xl border border-zinc-300 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
            >
              {testing ? "Testing..." : "Test Connection"}
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

function ResultBadge({ label, success, message }: { label: string; success: boolean; message: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${success ? "bg-emerald-50" : "bg-red-50"}`}>
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${success ? "bg-emerald-500" : "bg-red-500"}`}>
        {success ? "\u2713" : "\u2717"}
      </span>
      <div>
        <span className="font-semibold text-zinc-800">{label}: </span>
        <span className={`text-sm ${success ? "text-emerald-700" : "text-red-700"}`}>{message}</span>
      </div>
    </div>
  );
}
