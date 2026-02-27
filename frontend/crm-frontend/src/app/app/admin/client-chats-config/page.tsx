"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { apiGet, apiPut, apiPost } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

const TABS = ["Channels", "Webhook Logs"] as const;
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
        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      />
    </div>
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
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
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

  if (loading) return <ChannelCardSkeleton channel="Viber" />;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Viber</h2>
        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">Bot</span>
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
        <Field label="Account Name" value={name} onChange={setName} placeholder="Default Viber" />
        <Field label="Sender Name" value={senderName} onChange={setSenderName} placeholder="Support" />
        <div className="md:col-span-2">
          <Field
            label="Viber Bot Token"
            value={viberBotToken}
            onChange={setViberBotToken}
            placeholder="Your Viber authentication token"
            type="password"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Viber"}
        </button>
        <button
          onClick={handleRegisterWebhook}
          disabled={registering || !viberBotToken}
          className="rounded-xl border border-purple-600 bg-white px-4 py-2 text-sm font-medium text-purple-600 transition hover:bg-purple-50 disabled:opacity-50"
        >
          {registering ? "Registering..." : "Register Webhook"}
        </button>
        <button
          onClick={loadWebhookStatus}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
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
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
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

  if (loading) return <ChannelCardSkeleton channel="Facebook" />;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Facebook Messenger</h2>
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">Page</span>
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
        <Field label="Account Name" value={name} onChange={setName} placeholder="Default Facebook" />
        <Field label="Verify Token" value={fbVerifyToken} onChange={setFbVerifyToken} placeholder="Custom string for webhook verification" />
        <div className="md:col-span-2">
          <Field
            label="Page Access Token"
            value={fbPageAccessToken}
            onChange={setFbPageAccessToken}
            placeholder="Long-lived page access token"
            type="password"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="App Secret"
            value={fbAppSecret}
            onChange={setFbAppSecret}
            placeholder="App secret for signature verification"
            type="password"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Facebook"}
        </button>
        <button
          onClick={loadWebhookStatus}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
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
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
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

  if (loading) return <ChannelCardSkeleton channel="Telegram" />;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Telegram</h2>
        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">Bot</span>
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
        <Field label="Account Name" value={name} onChange={setName} placeholder="Default Telegram" />
        <div className="md:col-span-2">
          <Field
            label="Bot Token"
            value={telegramBotToken}
            onChange={setTelegramBotToken}
            placeholder="123456789:ABCdefGHI..."
            type="password"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Telegram"}
        </button>
        <button
          onClick={handleRegisterWebhook}
          disabled={registering || !telegramBotToken}
          className="rounded-xl border border-sky-600 bg-white px-4 py-2 text-sm font-medium text-sky-600 transition hover:bg-sky-50 disabled:opacity-50"
        >
          {registering ? "Registering..." : "Register Webhook"}
        </button>
        <button
          onClick={loadWebhookStatus}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
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
  const [msg, setMsg] = useState("");
  const [name, setName] = useState("");
  const [waAccessToken, setWaAccessToken] = useState("");
  const [waPhoneNumberId, setWaPhoneNumberId] = useState("");
  const [waVerifyToken, setWaVerifyToken] = useState("");
  const [waAppSecret, setWaAppSecret] = useState("");
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
        setWaAccessToken((acc.metadata?.waAccessToken as string) || "");
        setWaPhoneNumberId((acc.metadata?.waPhoneNumberId as string) || "");
        setWaVerifyToken((acc.metadata?.waVerifyToken as string) || "");
        setWaAppSecret((acc.metadata?.waAppSecret as string) || "");
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

  if (loading) return <ChannelCardSkeleton channel="WhatsApp" />;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">WhatsApp Business</h2>
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Cloud API</span>
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
        <Field label="Account Name" value={name} onChange={setName} placeholder="Default WhatsApp" />
        <Field label="Phone Number ID" value={waPhoneNumberId} onChange={setWaPhoneNumberId} placeholder="From Meta Business Suite" />
        <Field label="Verify Token" value={waVerifyToken} onChange={setWaVerifyToken} placeholder="Custom string for webhook verification" />
        <div className="md:col-span-2">
          <Field
            label="Access Token"
            value={waAccessToken}
            onChange={setWaAccessToken}
            placeholder="Permanent token from Meta"
            type="password"
          />
        </div>
        <div className="md:col-span-2">
          <Field
            label="App Secret"
            value={waAppSecret}
            onChange={setWaAppSecret}
            placeholder="App secret for signature verification"
            type="password"
          />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save WhatsApp"}
        </button>
        <button
          onClick={loadWebhookStatus}
          className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          Refresh status
        </button>
        {msg && <span className="text-sm text-zinc-500">{msg}</span>}
      </div>
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
