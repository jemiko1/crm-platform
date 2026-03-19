"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiGet, apiGetList, apiPut, apiPost, apiDelete } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

const TABS = ["Channels", "Canned Responses", "Webhook Logs"] as const;
type Tab = (typeof TABS)[number];

type ChannelAccount = {
  id: string;
  type: string;
  name: string;
  status: string;
  metadata: Record<string, unknown>;
};

type ChannelAccountsConfig = {
  VIBER?: ChannelAccount;
  FACEBOOK?: ChannelAccount;
  TELEGRAM?: ChannelAccount;
  WHATSAPP?: ChannelAccount;
};

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
      />
    </div>
  );
}

function ChannelToggle({
  channelType,
  active,
  onToggle,
  toggling,
}: {
  channelType: string;
  active: boolean;
  onToggle: () => void;
  toggling: boolean;
}) {
  return (
    <button
      onClick={onToggle}
      disabled={toggling}
      title={active ? `Disable ${channelType}` : `Enable ${channelType}`}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 ${
        active ? "bg-emerald-500" : "bg-zinc-300"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ${
          active ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function ClientChatsConfigPage() {
  const [activeTab, setActiveTab] = useState<Tab>("Channels");

  return (
    <PermissionGuard permission="client_chats_config.access">
      <div className="p-4 sm:p-6 lg:p-8">
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
            <h1 className="text-2xl font-bold text-zinc-900">Client Chats Configuration</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Configure Viber, Telegram, WhatsApp, and Facebook Messenger for the unified inbox
            </p>
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

        {activeTab === "Channels" && (
          <div className="space-y-6">
            <ViberConfig />
            <FacebookConfig />
            <TelegramConfig />
            <WhatsAppConfig />
          </div>
        )}
        {activeTab === "Canned Responses" && <CannedResponsesTab />}
        {activeTab === "Webhook Logs" && <WebhookLogsTab />}
      </div>
    </PermissionGuard>
  );
}

function ViberConfig() {
  const [account, setAccount] = useState<ChannelAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [viberBotToken, setViberBotToken] = useState("");
  const [senderName, setSenderName] = useState("Support");
  const [webhookStatus, setWebhookStatus] = useState<{
    ok: boolean;
    url?: string;
    accountName?: string;
    subscribersCount?: number;
    error?: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<ChannelAccountsConfig>("/v1/clientchats/channel-accounts");
      const acc = data.VIBER;
      if (acc) {
        setAccount(acc);
        setName(acc.name);
        setActive(acc.status === "ACTIVE");
        setViberBotToken((acc.metadata?.viberBotToken as string) || "");
        setSenderName((acc.metadata?.senderName as string) || "Support");
      }
    } catch {
      setMsg("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWebhookStatus = useCallback(async () => {
    try {
      const status = await apiGet<{ ok: boolean; url?: string; accountName?: string; subscribersCount?: number; error?: string }>(
        "/v1/clientchats/viber/webhook-status"
      );
      setWebhookStatus(status);
    } catch {
      setWebhookStatus({ ok: false, error: "Failed to fetch status" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (viberBotToken) loadWebhookStatus();
  }, [viberBotToken, loadWebhookStatus]);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await apiPut(`/v1/clientchats/channel-accounts/VIBER`, {
        name: name || "Default Viber",
        metadata: { viberBotToken: viberBotToken || undefined, senderName: senderName || "Support" },
      });
      setMsg("Viber configuration saved");
      load();
      loadWebhookStatus();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterWebhook() {
    setRegistering(true);
    setMsg("");
    try {
      const result = await apiPost<{ ok: boolean; url?: string; error?: string }>(
        "/v1/clientchats/viber/register-webhook",
        {}
      );
      if (result.ok) {
        setMsg(`Webhook registered: ${result.url}`);
        loadWebhookStatus();
      } else {
        setMsg(`Failed: ${result.error}`);
      }
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setRegistering(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    setMsg("");
    const newStatus = active ? "INACTIVE" : "ACTIVE";
    try {
      await apiPut(`/v1/clientchats/channel-accounts/VIBER`, { status: newStatus });
      setActive(newStatus === "ACTIVE");
      setMsg(newStatus === "ACTIVE" ? "Viber enabled" : "Viber disabled");
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setToggling(false);
    }
  }

  if (loading) return <ChannelCardSkeleton channel="Viber" />;

  return (
    <div className={`rounded-2xl border bg-white p-6 ${active ? "border-zinc-200" : "border-zinc-200 opacity-60"}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">Viber</h2>
          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Bot</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${active ? "text-emerald-600" : "text-zinc-400"}`}>
            {active ? "Active" : "Disabled"}
          </span>
          <ChannelToggle channelType="Viber" active={active} onToggle={handleToggle} toggling={toggling} />
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Create a bot at{" "}
        <a href="https://partners.viber.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
          Viber Partners
        </a>
        , save the token below, then click <strong>Register Webhook</strong> to receive messages.
      </p>

      {webhookStatus && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-700">Connection status</p>
          {webhookStatus.ok ? (
            <div className="space-y-1 text-sm">
              <p className="text-emerald-600 font-medium">Connected</p>
              {webhookStatus.accountName && (
                <p className="text-zinc-500">Account: {webhookStatus.accountName}</p>
              )}
              {webhookStatus.url && (
                <p className="text-zinc-500 truncate" title={webhookStatus.url}>
                  Webhook: {webhookStatus.url}
                </p>
              )}
              {webhookStatus.subscribersCount !== undefined && (
                <p className="text-zinc-500">{webhookStatus.subscribersCount} subscriber(s)</p>
              )}
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="text-amber-600 font-medium">Not connected</p>
              {webhookStatus.error && <p className="text-zinc-500">{webhookStatus.error}</p>}
              <p className="text-zinc-500">Save your token and click Register Webhook. Set CLIENTCHATS_WEBHOOK_BASE_URL on the backend.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Account Name" value={name} onChange={setName} placeholder="Default Viber" disabled={!active} />
        <Field label="Sender Name" value={senderName} onChange={setSenderName} placeholder="Support" disabled={!active} />
        <div className="md:col-span-2">
          <Field
            label="Viber Bot Token"
            value={viberBotToken}
            onChange={setViberBotToken}
            placeholder="Your Viber authentication token"
            type="password"
            disabled={!active}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !active}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Viber"}
        </button>
        <button
          onClick={handleRegisterWebhook}
          disabled={registering || !viberBotToken || !active}
          className="rounded-xl border border-purple-600 bg-white px-4 py-2 text-sm font-medium text-purple-600 transition hover:bg-purple-50 disabled:opacity-50"
        >
          {registering ? "Registering..." : "Register Webhook"}
        </button>
        <button
          onClick={loadWebhookStatus}
          disabled={!active}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          Refresh status
        </button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}

function FacebookConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [fbPageAccessToken, setFbPageAccessToken] = useState("");
  const [fbAppSecret, setFbAppSecret] = useState("");
  const [fbVerifyToken, setFbVerifyToken] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<{
    ok: boolean;
    pageName?: string;
    pageId?: string;
    webhookUrl?: string;
    error?: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<ChannelAccountsConfig>("/v1/clientchats/channel-accounts");
      const acc = data.FACEBOOK;
      if (acc) {
        setName(acc.name);
        setActive(acc.status === "ACTIVE");
        setFbPageAccessToken((acc.metadata?.fbPageAccessToken as string) || "");
        setFbAppSecret((acc.metadata?.fbAppSecret as string) || "");
        setFbVerifyToken((acc.metadata?.fbVerifyToken as string) || "");
      }
    } catch {
      setMsg("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWebhookStatus = useCallback(async () => {
    try {
      const status = await apiGet<{ ok: boolean; pageName?: string; pageId?: string; webhookUrl?: string; error?: string }>(
        "/v1/clientchats/facebook/webhook-status"
      );
      setWebhookStatus(status);
    } catch {
      setWebhookStatus({ ok: false, error: "Failed to fetch status" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (fbPageAccessToken) loadWebhookStatus();
  }, [fbPageAccessToken, loadWebhookStatus]);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await apiPut(`/v1/clientchats/channel-accounts/FACEBOOK`, {
        name: name || "Default Facebook",
        metadata: {
          fbPageAccessToken: fbPageAccessToken || undefined,
          fbAppSecret: fbAppSecret || undefined,
          fbVerifyToken: fbVerifyToken || undefined,
        },
      });
      setMsg("Facebook configuration saved");
      load();
      loadWebhookStatus();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    setMsg("");
    const newStatus = active ? "INACTIVE" : "ACTIVE";
    try {
      await apiPut(`/v1/clientchats/channel-accounts/FACEBOOK`, { status: newStatus });
      setActive(newStatus === "ACTIVE");
      setMsg(newStatus === "ACTIVE" ? "Facebook enabled" : "Facebook disabled");
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setToggling(false);
    }
  }

  if (loading) return <ChannelCardSkeleton channel="Facebook" />;

  return (
    <div className={`rounded-2xl border bg-white p-6 ${active ? "border-zinc-200" : "border-zinc-200 opacity-60"}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">Facebook Messenger</h2>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Page</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${active ? "text-emerald-600" : "text-zinc-400"}`}>
            {active ? "Active" : "Disabled"}
          </span>
          <ChannelToggle channelType="Facebook" active={active} onToggle={handleToggle} toggling={toggling} />
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Create an app at{" "}
        <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
          Facebook Developers
        </a>
        , add Messenger, and set webhook in the app dashboard. Use Verify Token below when configuring the webhook.
      </p>

      {webhookStatus && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-700">Connection status</p>
          {webhookStatus.ok ? (
            <div className="space-y-1 text-sm">
              <p className="text-emerald-600 font-medium">Connected</p>
              {webhookStatus.pageName && (
                <p className="text-zinc-500">Page: {webhookStatus.pageName}</p>
              )}
              {webhookStatus.webhookUrl && (
                <p className="text-zinc-500 truncate" title={webhookStatus.webhookUrl}>
                  Webhook URL: {webhookStatus.webhookUrl}
                </p>
              )}
              <p className="text-zinc-500">Configure this URL in Facebook Developer Console → App → Messenger → Webhooks.</p>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="text-amber-600 font-medium">Not connected</p>
              {webhookStatus.error && <p className="text-zinc-500">{webhookStatus.error}</p>}
              <p className="text-zinc-500">Save your Page Access Token. Set CLIENTCHATS_WEBHOOK_BASE_URL on the backend.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Account Name" value={name} onChange={setName} placeholder="Default Facebook" disabled={!active} />
        <Field label="Verify Token" value={fbVerifyToken} onChange={setFbVerifyToken} placeholder="Custom string for webhook verification" disabled={!active} />
        <div className="md:col-span-2">
          <Field
            label="Page Access Token"
            value={fbPageAccessToken}
            onChange={setFbPageAccessToken}
            placeholder="Long-lived page access token"
            type="password"
            disabled={!active}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="App Secret"
            value={fbAppSecret}
            onChange={setFbAppSecret}
            placeholder="App secret for signature verification"
            type="password"
            disabled={!active}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !active}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Facebook"}
        </button>
        <button
          onClick={loadWebhookStatus}
          disabled={!active}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          Refresh status
        </button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}

function TelegramConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<{
    ok: boolean;
    url?: string;
    pendingUpdateCount?: number;
    error?: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<ChannelAccountsConfig>("/v1/clientchats/channel-accounts");
      const acc = data.TELEGRAM;
      if (acc) {
        setName(acc.name);
        setActive(acc.status === "ACTIVE");
        setTelegramBotToken((acc.metadata?.telegramBotToken as string) || "");
      }
    } catch {
      setMsg("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWebhookStatus = useCallback(async () => {
    try {
      const status = await apiGet<{ ok: boolean; url?: string; pendingUpdateCount?: number; error?: string }>(
        "/v1/clientchats/telegram/webhook-status"
      );
      setWebhookStatus(status);
    } catch {
      setWebhookStatus({ ok: false, error: "Failed to fetch status" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (telegramBotToken) loadWebhookStatus();
  }, [telegramBotToken, loadWebhookStatus]);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await apiPut(`/v1/clientchats/channel-accounts/TELEGRAM`, {
        name: name || "Default Telegram",
        metadata: { telegramBotToken: telegramBotToken || undefined },
      });
      setMsg("Telegram configuration saved");
      load();
      loadWebhookStatus();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleRegisterWebhook() {
    setRegistering(true);
    setMsg("");
    try {
      const result = await apiPost<{ ok: boolean; url?: string; error?: string }>(
        "/v1/clientchats/telegram/register-webhook",
        {}
      );
      if (result.ok) {
        setMsg(`Webhook registered: ${result.url}`);
        loadWebhookStatus();
      } else {
        setMsg(`Failed: ${result.error}`);
      }
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setRegistering(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    setMsg("");
    const newStatus = active ? "INACTIVE" : "ACTIVE";
    try {
      await apiPut(`/v1/clientchats/channel-accounts/TELEGRAM`, { status: newStatus });
      setActive(newStatus === "ACTIVE");
      setMsg(newStatus === "ACTIVE" ? "Telegram enabled" : "Telegram disabled");
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setToggling(false);
    }
  }

  if (loading) return <ChannelCardSkeleton channel="Telegram" />;

  return (
    <div className={`rounded-2xl border bg-white p-6 ${active ? "border-zinc-200" : "border-zinc-200 opacity-60"}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">Telegram</h2>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">Bot</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${active ? "text-emerald-600" : "text-zinc-400"}`}>
            {active ? "Active" : "Disabled"}
          </span>
          <ChannelToggle channelType="Telegram" active={active} onToggle={handleToggle} toggling={toggling} />
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Create a bot via{" "}
        <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
          @BotFather
        </a>
        , save the token below, then click <strong>Register Webhook</strong> to receive messages.
      </p>

      {/* Webhook status */}
      {webhookStatus && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-700">Connection status</p>
          {webhookStatus.ok ? (
            <div className="space-y-1 text-sm">
              <p className="text-emerald-600 font-medium">Connected</p>
              {webhookStatus.url && (
                <p className="text-zinc-500 truncate" title={webhookStatus.url}>
                  Webhook: {webhookStatus.url}
                </p>
              )}
              {webhookStatus.pendingUpdateCount !== undefined && webhookStatus.pendingUpdateCount > 0 && (
                <p className="text-amber-600">{webhookStatus.pendingUpdateCount} pending update(s)</p>
              )}
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="text-amber-600 font-medium">Not connected</p>
              {webhookStatus.error && <p className="text-zinc-500">{webhookStatus.error}</p>}
              <p className="text-zinc-500">Save your token and click Register Webhook. Set CLIENTCHATS_WEBHOOK_BASE_URL on the backend.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Account Name" value={name} onChange={setName} placeholder="Default Telegram" disabled={!active} />
        <div className="md:col-span-2">
          <Field
            label="Bot Token"
            value={telegramBotToken}
            onChange={setTelegramBotToken}
            placeholder="123456789:ABCdefGHI..."
            type="password"
            disabled={!active}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !active}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Telegram"}
        </button>
        <button
          onClick={handleRegisterWebhook}
          disabled={registering || !telegramBotToken || !active}
          className="rounded-xl border border-sky-600 bg-white px-4 py-2 text-sm font-medium text-sky-600 transition hover:bg-sky-50 disabled:opacity-50"
        >
          {registering ? "Registering..." : "Register Webhook"}
        </button>
        <button
          onClick={loadWebhookStatus}
          disabled={!active}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          Refresh status
        </button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>
    </div>
  );
}

function WhatsAppConfig() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [active, setActive] = useState(true);
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waVerifyToken, setWaVerifyToken] = useState("");
  const [waAppSecret, setWaAppSecret] = useState("");
  const [waBusinessAccountId, setWaBusinessAccountId] = useState("");
  const [webhookStatus, setWebhookStatus] = useState<{
    ok: boolean;
    phoneNumber?: string;
    webhookUrl?: string;
    error?: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<ChannelAccountsConfig>("/v1/clientchats/channel-accounts");
      const acc = data.WHATSAPP;
      if (acc) {
        setName(acc.name);
        setActive(acc.status === "ACTIVE");
        setWaAccessToken((acc.metadata?.waAccessToken as string) || "");
        setWaPhoneNumberId((acc.metadata?.waPhoneNumberId as string) || "");
        setWaVerifyToken((acc.metadata?.waVerifyToken as string) || "");
        setWaAppSecret((acc.metadata?.waAppSecret as string) || "");
        setWaBusinessAccountId((acc.metadata?.waBusinessAccountId as string) || "");
      }
    } catch {
      setMsg("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWebhookStatus = useCallback(async () => {
    try {
      const status = await apiGet<{ ok: boolean; phoneNumber?: string; webhookUrl?: string; error?: string }>(
        "/v1/clientchats/whatsapp/webhook-status"
      );
      setWebhookStatus(status);
    } catch {
      setWebhookStatus({ ok: false, error: "Failed to fetch status" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (waAccessToken && waPhoneNumberId) loadWebhookStatus();
  }, [waAccessToken, waPhoneNumberId, loadWebhookStatus]);

  async function handleSave() {
    setSaving(true);
    setMsg("");
    try {
      await apiPut(`/v1/clientchats/channel-accounts/WHATSAPP`, {
        name: name || "Default WhatsApp",
        metadata: {
          waAccessToken: waAccessToken || undefined,
          waPhoneNumberId: waPhoneNumberId || undefined,
          waVerifyToken: waVerifyToken || undefined,
          waAppSecret: waAppSecret || undefined,
          waBusinessAccountId: waBusinessAccountId || undefined,
        },
      });
      setMsg("WhatsApp configuration saved");
      load();
      loadWebhookStatus();
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateTestConversation() {
    const phone = testPhone.replace(/\D/g, "");
    if (phone.length < 10) {
      setMsg("Enter a valid phone number (at least 10 digits, e.g. 995555123456)");
      return;
    }
    setCreating(true);
    setMsg("");
    try {
      await apiPost<{ conversationId: string }>(
        "/v1/clientchats/whatsapp/create-test-conversation",
        { phoneNumber: phone }
      );
      setMsg("Test conversation created! Go to Client Chats to reply.");
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    setMsg("");
    const newStatus = active ? "INACTIVE" : "ACTIVE";
    try {
      await apiPut(`/v1/clientchats/channel-accounts/WHATSAPP`, { status: newStatus });
      setActive(newStatus === "ACTIVE");
      setMsg(newStatus === "ACTIVE" ? "WhatsApp enabled" : "WhatsApp disabled");
    } catch (err: any) {
      setMsg(`Error: ${err.message}`);
    } finally {
      setToggling(false);
    }
  }

  if (loading) return <ChannelCardSkeleton channel="WhatsApp" />;

  return (
    <div className={`rounded-2xl border bg-white p-6 ${active ? "border-zinc-200" : "border-zinc-200 opacity-60"}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-zinc-900">WhatsApp Business</h2>
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Cloud API</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${active ? "text-emerald-600" : "text-zinc-400"}`}>
            {active ? "Active" : "Disabled"}
          </span>
          <ChannelToggle channelType="WhatsApp" active={active} onToggle={handleToggle} toggling={toggling} />
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Use{" "}
        <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:underline">
          WhatsApp Cloud API
        </a>
        . Add WhatsApp to your Meta app, get Phone Number ID and Access Token, then configure webhook in Meta Developer Console.
      </p>

      {webhookStatus && (
        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="mb-2 text-sm font-medium text-zinc-700">Connection status</p>
          {webhookStatus.ok ? (
            <div className="space-y-1 text-sm">
              <p className="text-emerald-600 font-medium">Connected</p>
              {webhookStatus.phoneNumber && (
                <p className="text-zinc-500">Phone: {webhookStatus.phoneNumber}</p>
              )}
              {webhookStatus.webhookUrl && (
                <p className="text-zinc-500 truncate" title={webhookStatus.webhookUrl}>
                  Webhook URL: {webhookStatus.webhookUrl}
                </p>
              )}
              <p className="text-zinc-500">Configure this URL in Meta Developer Console → App → WhatsApp → Configuration → Webhook.</p>
            </div>
          ) : (
            <div className="space-y-1 text-sm">
              <p className="text-amber-600 font-medium">Not connected</p>
              {webhookStatus.error && <p className="text-zinc-500">{webhookStatus.error}</p>}
              <p className="text-zinc-500">Save Access Token and Phone Number ID. Set CLIENTCHATS_WEBHOOK_BASE_URL on the backend.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Account Name" value={name} onChange={setName} placeholder="Default WhatsApp" disabled={!active} />
        <Field label="Phone Number ID" value={waPhoneNumberId} onChange={setWaPhoneNumberId} placeholder="From Meta Business Suite" disabled={!active} />
        <Field label="Business Account ID" value={waBusinessAccountId} onChange={setWaBusinessAccountId} placeholder="WABA ID for template messages" disabled={!active} />
        <Field label="Verify Token" value={waVerifyToken} onChange={setWaVerifyToken} placeholder="Custom string for webhook verification" disabled={!active} />
        <div className="md:col-span-2">
          <Field
            label="Access Token"
            value={waAccessToken}
            onChange={setWaAccessToken}
            placeholder="Permanent token from Meta"
            type="password"
            disabled={!active}
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="App Secret"
            value={waAppSecret}
            onChange={setWaAppSecret}
            placeholder="App secret for signature verification"
            type="password"
            disabled={!active}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !active}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save WhatsApp"}
        </button>
        <button
          onClick={loadWebhookStatus}
          disabled={!active}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
        >
          Refresh status
        </button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>

      {webhookStatus?.ok && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-sm font-medium text-amber-900">Test conversation (for App Review)</p>
          <p className="mb-3 text-xs text-amber-800">
            Add your phone to Meta&apos;s &quot;To&quot; list (WhatsApp → API Setup → Add phone number), then create a test conversation here. Reply from Client Chats — the message will appear in your WhatsApp.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="e.g. 995555123456 or +1 555 123 4567"
              className="w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <button
              onClick={handleCreateTestConversation}
              disabled={creating}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create test conversation"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WebhookLogsTab() {
  const [failures, setFailures] = useState<Array<{ id: string; channelType: string; error: string; payloadMeta: Record<string, unknown>; createdAt: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [channelFilter, setChannelFilter] = useState<string>("");

  useEffect(() => {
    load();
  }, [channelFilter]);

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (channelFilter) params.set("channelType", channelFilter);
      const data = await apiGet<typeof failures>(`/v1/clientchats/webhook-failures?${params}`);
      setFailures(Array.isArray(data) ? data : []);
    } catch {
      setFailures([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Webhook failures</h2>
        <div className="flex items-center gap-2">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
          >
            <option value="">All channels</option>
            <option value="VIBER">Viber</option>
            <option value="FACEBOOK">Facebook</option>
            <option value="TELEGRAM">Telegram</option>
            <option value="WHATSAPP">WhatsApp</option>
          </select>
          <button
            onClick={load}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Refresh
          </button>
        </div>
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        Recent webhook processing errors. If messages are not arriving, check these logs for details.
      </p>
      {loading ? (
        <div className="py-8 text-center text-sm text-zinc-400">Loading...</div>
      ) : failures.length === 0 ? (
        <div className="py-8 text-center text-sm text-zinc-400">No failures recorded</div>
      ) : (
        <div className="max-h-96 overflow-y-auto space-y-2">
          {failures.map((f) => (
            <div
              key={f.id}
              className="rounded-lg border border-red-100 bg-red-50/50 p-3 text-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-red-700">{f.channelType}</span>
                <span className="text-zinc-500">{new Date(f.createdAt).toLocaleString()}</span>
              </div>
              <p className="mt-1 text-zinc-700">{f.error}</p>
              {f.payloadMeta && Object.keys(f.payloadMeta).length > 0 && (
                <p className="mt-1 text-xs text-zinc-500">
                  {JSON.stringify(f.payloadMeta)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type CannedResponse = {
  id: string;
  title: string;
  content: string;
  category: string | null;
  channelType: string | null;
  isGlobal: boolean;
  sortOrder: number;
  createdBy: { id: string; email: string } | null;
};

const CHANNEL_OPTIONS = [
  { value: "", label: "All Channels" },
  { value: "WEB", label: "WEB" },
  { value: "VIBER", label: "VIBER" },
  { value: "FACEBOOK", label: "FACEBOOK" },
  { value: "TELEGRAM", label: "TELEGRAM" },
  { value: "WHATSAPP", label: "WHATSAPP" },
];

function CannedResponsesTab() {
  const [responses, setResponses] = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formChannelType, setFormChannelType] = useState("");
  const [formIsGlobal, setFormIsGlobal] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<CannedResponse[]>("/v1/clientchats/canned-responses");
      setResponses(data);
    } catch {
      setResponses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function resetForm() {
    setFormTitle("");
    setFormContent("");
    setFormCategory("");
    setFormChannelType("");
    setFormIsGlobal(true);
    setEditing(null);
    setCreating(false);
  }

  function startCreate() {
    resetForm();
    setCreating(true);
  }

  function startEdit(r: CannedResponse) {
    setCreating(false);
    setEditing(r);
    setFormTitle(r.title);
    setFormContent(r.content);
    setFormCategory(r.category || "");
    setFormChannelType(r.channelType || "");
    setFormIsGlobal(r.isGlobal);
  }

  async function handleSave() {
    if (!formTitle.trim() || !formContent.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: formTitle.trim(),
        content: formContent.trim(),
        category: formCategory.trim() || undefined,
        channelType: formChannelType || undefined,
        isGlobal: formIsGlobal,
      };
      if (editing) {
        await apiPut(`/v1/clientchats/canned-responses/${editing.id}`, body);
      } else {
        await apiPost("/v1/clientchats/canned-responses", body);
      }
      resetForm();
      fetchAll();
    } catch {
      // keep form open for retry
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this canned response?")) return;
    try {
      await apiDelete(`/v1/clientchats/canned-responses/${id}`);
      if (editing?.id === id) resetForm();
      fetchAll();
    } catch {
      // silent
    }
  }

  const showForm = creating || editing !== null;

  return (
    <div className="space-y-4">
      {showForm && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <h3 className="mb-4 text-base font-semibold text-zinc-900">
            {editing ? "Edit Canned Response" : "New Canned Response"}
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Title" value={formTitle} onChange={setFormTitle} placeholder="e.g. Greeting" />
            <Field label="Category" value={formCategory} onChange={setFormCategory} placeholder="e.g. General (optional)" />
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Content</label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Hello {clientName}, how can I help you today?"
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-zinc-400">Use {"{clientName}"} as a placeholder for the client&apos;s name.</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Channel Type</label>
              <select
                value={formChannelType}
                onChange={(e) => setFormChannelType(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {CHANNEL_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 self-end pb-2">
              <label className="flex items-center gap-2 text-sm text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsGlobal}
                  onChange={(e) => setFormIsGlobal(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                />
                Global (visible to all agents)
              </label>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !formTitle.trim() || !formContent.trim()}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : editing ? "Update" : "Create"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Canned Responses</h2>
          {!showForm && (
            <button
              onClick={startCreate}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              Add New
            </button>
          )}
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          Pre-written replies that agents can insert with a &quot;/&quot; shortcut in the chat reply box.
        </p>

        {loading ? (
          <div className="py-8 text-center text-sm text-zinc-400">Loading...</div>
        ) : responses.length === 0 ? (
          <div className="py-8 text-center text-sm text-zinc-400">No canned responses yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th className="pb-2 pr-4">Title</th>
                  <th className="pb-2 pr-4">Category</th>
                  <th className="pb-2 pr-4">Channel</th>
                  <th className="pb-2 pr-4">Content</th>
                  <th className="pb-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {responses.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50/50">
                    <td className="py-2.5 pr-4 font-medium text-zinc-900">{r.title}</td>
                    <td className="py-2.5 pr-4 text-zinc-500">{r.category || "—"}</td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        {r.channelType || "All"}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-zinc-500 max-w-xs truncate" title={r.content}>
                      {r.content.length > 50 ? r.content.slice(0, 50) + "..." : r.content}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(r)}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-50"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ChannelCardSkeleton({ channel }: { channel: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 h-6 w-32 animate-pulse rounded bg-zinc-200" />
      <div className="space-y-3">
        <div className="h-10 w-full animate-pulse rounded bg-zinc-100" />
        <div className="h-10 w-full animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="mt-4 h-10 w-24 animate-pulse rounded bg-zinc-200" />
    </div>
  );
}
