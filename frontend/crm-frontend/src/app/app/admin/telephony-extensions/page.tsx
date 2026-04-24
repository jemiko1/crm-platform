"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";
import { useI18nContext } from "@/contexts/i18n-context";

const BRAND = "rgb(0, 86, 83)";

type Extension = {
  id: string;
  extension: string;
  displayName: string;
  sipServer: string | null;
  isOperator: boolean;
  isActive: boolean;
  crmUserId: string | null;
  user: {
    id: string;
    email: string;
    role: string;
    employee: { firstName: string; lastName: string } | null;
  } | null;
};

type UserWithConfig = {
  id: string;
  email: string;
  employee: { firstName: string; lastName: string; status: string } | null;
  telephonyExtension: { id: string; extension: string } | null;
};

type SyncResult = {
  total: number;
  linked: number;
  autoLinked: number;
  statuses: Record<string, string>;
};

export default function TelephonyExtensionsPage() {
  const { t } = useI18nContext();
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [users, setUsers] = useState<UserWithConfig[]>([]);
  const [sipStatuses, setSipStatuses] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busyExt, setBusyExt] = useState<string | null>(null); // extension id currently being acted on
  const [linkDialogExt, setLinkDialogExt] = useState<Extension | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  // inFlight ref mirrors softphone's useBreak pattern (Silent Override Risk
  // #21) — React state updates are async; a synchronous double-click would
  // fire two requests before busyExt lands. ref.current is set synchronously.
  const inFlight = useRef(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [exts, userRows, statuses] = await Promise.all([
        apiGet<Extension[]>("/v1/telephony/extensions"),
        apiGet<UserWithConfig[]>("/v1/telephony/extensions/users-with-config"),
        apiGet<Record<string, string>>("/v1/telephony/extensions/sip-statuses"),
      ]);
      setExtensions(exts);
      setUsers(userRows);
      setSipStatuses(statuses);
      setError(null);
    } catch (err: any) {
      setError(err?.message || t("telephony.failedToLoad", "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function handleSyncNow() {
    try {
      setSyncing(true);
      setError(null);
      const result = await apiPost<SyncResult>(
        "/v1/telephony/extensions/sync-now",
        {},
      );
      setSyncResult(result);
      setSipStatuses(result.statuses);
      fetchAll();
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => setSyncResult(null), 8000);
    } catch (err: any) {
      setError(err?.message || t("telephony.syncFailed", "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  async function handleLink(extId: string, userId: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setBusyExt(extId);
      setError(null);
      await apiPost(`/v1/telephony/extensions/${extId}/link`, { userId });
      setLinkDialogExt(null);
      await fetchAll();
    } catch (err: any) {
      setError(err?.message || t("telephony.linkFailed", "Link failed"));
    } finally {
      setBusyExt(null);
      inFlight.current = false;
    }
  }

  async function handleUnlink(ext: Extension) {
    if (inFlight.current) return;
    const name = linkedName(ext);
    if (!confirm(
      t("telephony.confirmUnlink", "Unlink {name} from extension {ext}? Their queue membership will be removed.").replace("{name}", name).replace("{ext}", ext.extension),
    )) return;
    inFlight.current = true;
    try {
      setBusyExt(ext.id);
      setError(null);
      await apiPost(`/v1/telephony/extensions/${ext.id}/unlink`, {});
      await fetchAll();
    } catch (err: any) {
      setError(err?.message || t("telephony.unlinkFailed", "Unlink failed"));
    } finally {
      setBusyExt(null);
      inFlight.current = false;
    }
  }

  async function handleResync(ext: Extension) {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      setBusyExt(ext.id);
      setError(null);
      const result = await apiPost<{
        applied: number;
        skipped: string[];
        reason?: 'no-position' | 'auto-queue-sync-disabled';
      }>(`/v1/telephony/extensions/${ext.id}/resync-queues`, {});

      let msg: string;
      if (result.reason === 'auto-queue-sync-disabled') {
        msg = t(
          "telephony.resyncDisabled",
          "AMI queue sync is disabled by TELEPHONY_AUTO_QUEUE_SYNC=false — no action taken.",
        );
      } else if (result.reason === 'no-position') {
        msg = t(
          "telephony.resyncNoPosition",
          "Employee has no Position — no queues to sync.",
        );
      } else if (result.skipped.length) {
        msg = t("telephony.resyncPartial", "Resynced {applied} queue(s); skipped: {skipped}")
          .replace("{applied}", String(result.applied))
          .replace("{skipped}", result.skipped.join(", "));
      } else {
        msg = t("telephony.resyncOk", "Resynced {applied} queue(s)")
          .replace("{applied}", String(result.applied));
      }
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err: any) {
      setError(err?.message || t("telephony.resyncFailed", "Resync failed"));
    } finally {
      setBusyExt(null);
      inFlight.current = false;
    }
  }

  async function handleToggleActive(ext: Extension) {
    try {
      setBusyExt(ext.id);
      await apiPatch(`/v1/telephony/extensions/${ext.id}`, { isActive: !ext.isActive });
      await fetchAll();
    } catch (err: any) {
      setError(err?.message || "Failed to toggle active");
    } finally {
      setBusyExt(null);
    }
  }

  function linkedName(ext: Extension): string {
    if (!ext.user) return "";
    if (ext.user.employee) return `${ext.user.employee.firstName} ${ext.user.employee.lastName}`;
    return ext.user.email;
  }

  function sipStatusBadge(extNum: string) {
    const state = sipStatuses[extNum];
    if (!state || state === "Unavailable")
      return { label: t("telephony.sipOffline"), cls: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" };
    if (state === "In use" || state === "Busy" || state === "Ringing")
      return { label: t("telephony.sipOnCall"), cls: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" };
    return { label: t("telephony.sipOnline"), cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" };
  }

  // Users eligible to be linked: active, no existing telephonyExtension.
  const availableUsers = users.filter(
    (u) => u.telephonyExtension === null && u.employee && u.employee.status === "ACTIVE",
  );

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="text-zinc-600">{t("telephony.loading")}</div>
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
            ← {t("telephony.backToAdmin")}
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">{t("telephony.extensionsTitle")}</h1>
              <p className="mt-1 text-sm text-zinc-600">
                {t(
                  "telephony.poolDescription",
                  "Extensions are pre-provisioned in FreePBX. Link an employee to place them on an extension; unlink to return it to the pool.",
                )}
              </p>
            </div>
            <button
              onClick={handleSyncNow}
              disabled={syncing}
              className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition"
              style={{ backgroundColor: BRAND }}
            >
              <svg
                className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {syncing ? t("telephony.syncing") : t("telephony.syncFromAsterisk")}
            </button>
          </div>
        </div>

        {successMsg && (
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800 ring-1 ring-teal-200">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="ml-2 text-teal-600 hover:text-teal-800">×</button>
          </div>
        )}

        {syncResult && syncResult.total > 0 && (
          <div className="mb-4 flex items-center justify-between rounded-2xl bg-teal-50 px-4 py-3 text-sm text-teal-800 ring-1 ring-teal-200">
            <span>
              {t("telephony.syncComplete")}: {syncResult.total} {t("telephony.endpoints")}, {syncResult.linked} {t("telephony.linked")}
            </span>
            <button onClick={() => setSyncResult(null)} className="text-teal-600 hover:text-teal-800 ml-2">×</button>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        <div className="rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200 overflow-hidden">
          <table className="w-full table-fixed">
            <thead className="bg-zinc-50/50">
              <tr>
                <th className="w-[12%] px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  {t("telephony.extensionNumber", "Extension")}
                </th>
                <th className="w-[30%] px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  {t("telephony.linkedEmployee", "Linked employee")}
                </th>
                <th className="w-[20%] px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  {t("telephony.emailLogin")}
                </th>
                <th className="w-[13%] px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  {t("telephony.sipStatus")}
                </th>
                <th className="w-[25%] px-5 py-4 text-right text-xs font-semibold uppercase tracking-wider text-zinc-600">
                  {t("telephony.actions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {extensions.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-zinc-500">
                    {t(
                      "telephony.noExtensionsYet",
                      "No extensions found. Create extensions in FreePBX (Bulk Handler) and click Sync.",
                    )}
                  </td>
                </tr>
              )}
              {extensions.map((ext) => {
                const sip = sipStatusBadge(ext.extension);
                const isLinked = !!ext.user;
                const busy = busyExt === ext.id;
                return (
                  <Fragment key={ext.id}>
                    <tr className={!ext.isActive ? "bg-zinc-50/60" : ""}>
                      <td className="px-5 py-4">
                        <div className="font-mono text-sm font-semibold text-zinc-900">{ext.extension}</div>
                        {!ext.isActive && (
                          <span className="mt-0.5 inline-flex text-xs text-zinc-400">{t("telephony.disabled")}</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {isLinked ? (
                          <div className="text-sm font-medium text-zinc-900 truncate">{linkedName(ext)}</div>
                        ) : (
                          <span className="text-sm italic text-zinc-400">
                            {t("telephony.availableForLink", "— available —")}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-sm text-zinc-600 truncate">{ext.user?.email ?? "—"}</div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${sip.cls}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${sip.dot}`} />
                          {sip.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isLinked ? (
                            <>
                              <button
                                disabled={busy}
                                onClick={() => handleResync(ext)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-700 bg-white border border-zinc-300 transition hover:bg-zinc-50 disabled:opacity-50"
                                title={t(
                                  "telephony.resyncHint",
                                  "Re-apply queue rules for this extension via AMI. Useful if AMI was down during link.",
                                )}
                              >
                                {t("telephony.resync", "Resync queues")}
                              </button>
                              <button
                                disabled={busy}
                                onClick={() => handleUnlink(ext)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 transition hover:bg-rose-100 disabled:opacity-50"
                              >
                                {t("telephony.unlink", "Unlink")}
                              </button>
                            </>
                          ) : (
                            <button
                              disabled={busy || !ext.isActive}
                              onClick={() => setLinkDialogExt(ext)}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-50"
                              style={{ backgroundColor: BRAND }}
                            >
                              {t("telephony.link", "Link employee")}
                            </button>
                          )}
                          <button
                            disabled={busy}
                            onClick={() => handleToggleActive(ext)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                              ext.isActive
                                ? "border-amber-200 text-amber-700 hover:bg-amber-50"
                                : "border-teal-200 text-teal-900 hover:bg-teal-50"
                            }`}
                          >
                            {ext.isActive ? t("telephony.disable") : t("telephony.enable")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Link-employee dialog */}
        {linkDialogExt && (
          <LinkDialog
            ext={linkDialogExt}
            users={availableUsers}
            onClose={() => setLinkDialogExt(null)}
            onSubmit={(userId) => handleLink(linkDialogExt.id, userId)}
            busy={busyExt === linkDialogExt.id}
            t={t}
          />
        )}
      </div>
    </PermissionGuard>
  );
}

function LinkDialog({
  ext,
  users,
  onClose,
  onSubmit,
  busy,
  t,
}: {
  ext: Extension;
  users: UserWithConfig[];
  onClose: () => void;
  onSubmit: (userId: string) => void;
  busy: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  const [selected, setSelected] = useState<string>("");
  // Defense-in-depth: the parent's inFlight ref already guards handleLink,
  // but if parent state lags we want the button itself to be inert on the
  // second synchronous click. useRef is sync — button onClick checks it
  // before calling onSubmit.
  const submitting = useRef(false);

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-zinc-900/40 px-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl ring-1 ring-zinc-200">
        <h2 className="text-lg font-bold text-zinc-900">
          {t("telephony.linkDialogTitle", "Link employee to extension")} {ext.extension}
        </h2>
        <p className="mt-2 text-sm text-zinc-600">
          {t(
            "telephony.linkDialogBody",
            "The employee will join queues according to Position → Queue Rules for their Position.",
          )}
        </p>

        <label className="mt-4 block text-xs font-medium text-zinc-600">
          {t("telephony.employee", "Employee")}
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm bg-white"
        >
          <option value="">
            {t("telephony.pickEmployee", "— pick an employee —")}
          </option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.employee ? `${u.employee.firstName} ${u.employee.lastName}` : u.email} ({u.email})
            </option>
          ))}
        </select>
        {users.length === 0 && (
          <p className="mt-2 text-xs text-amber-700">
            {t(
              "telephony.noAvailableEmployees",
              "All active employees already have an extension. Unlink someone first.",
            )}
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            disabled={!selected || busy}
            onClick={() => {
              if (submitting.current) return;
              submitting.current = true;
              try {
                onSubmit(selected);
              } finally {
                // Cleared on next tick so rapid synchronous clicks are
                // blocked but a legitimate retry after failure isn't.
                setTimeout(() => { submitting.current = false; }, 0);
              }
            }}
            className="rounded-xl px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {busy ? t("telephony.saving") : t("telephony.link", "Link")}
          </button>
        </div>
      </div>
    </div>
  );
}
