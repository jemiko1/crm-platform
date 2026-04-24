"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(0, 86, 83)";

type Position = {
  id: string;
  name: string;
  nameKa: string | null;
  code: string;
  isActive: boolean;
};

type Queue = {
  id: string;
  name: string;
  strategy: string;
  isAfterHoursQueue: boolean;
  isActive: boolean;
};

type Rule = {
  id: string;
  positionId: string;
  queueId: string;
  positionName: string;
  positionNameKa: string | null;
  positionCode: string;
  queueName: string;
  isAfterHoursQueue: boolean;
  createdAt: string;
};

type CellKey = string; // `${positionId}:${queueId}`

function cellKey(positionId: string, queueId: string): CellKey {
  return `${positionId}:${queueId}`;
}

export default function PositionQueueRulesPage() {
  const { t, language } = useI18n();
  const [positions, setPositions] = useState<Position[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cells currently being persisted. Keys like `posId:queueId`. Used to
  // disable the checkbox and show a saving state — prevents double-clicks
  // from racing against themselves.
  const [pending, setPending] = useState<Set<CellKey>>(new Set());

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [pos, qs, rs] = await Promise.all([
        apiGet<Position[]>("/v1/positions"),
        apiGet<Queue[]>("/v1/telephony/queues"),
        apiGet<Rule[]>("/v1/telephony/position-queue-rules"),
      ]);
      setPositions(pos.filter((p) => p.isActive));
      setQueues(qs.filter((q) => q.isActive));
      setRules(rs);
      setError(null);
    } catch (err: any) {
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Index rules by cell key for O(1) lookup in the matrix render.
  const ruleIndex = useMemo(() => {
    const map = new Map<CellKey, Rule>();
    for (const r of rules) map.set(cellKey(r.positionId, r.queueId), r);
    return map;
  }, [rules]);

  async function toggleCell(positionId: string, queueId: string, currentlyChecked: boolean) {
    const key = cellKey(positionId, queueId);
    if (pending.has(key)) return;

    // Optimistic update — snapshot current state so we can revert on error.
    const prevRules = rules;
    setPending((s) => new Set(s).add(key));

    if (currentlyChecked) {
      const rule = ruleIndex.get(key);
      if (!rule) {
        setPending((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
        return;
      }
      setRules((r) => r.filter((x) => x.id !== rule.id));
      try {
        await apiDelete(`/v1/telephony/position-queue-rules/${rule.id}`);
      } catch (err) {
        setRules(prevRules);
        setError(t("positionQueueRules.saveError", "Failed to save. Your change was reverted."));
      } finally {
        setPending((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    } else {
      // Optimistic add with a temporary id; refetch replaces it with the
      // real row. We also include positionName/queueName so the cell
      // doesn't flicker — these are looked up from the existing arrays.
      const pos = positions.find((p) => p.id === positionId);
      const q = queues.find((x) => x.id === queueId);
      if (!pos || !q) return;
      const tempRule: Rule = {
        id: `__tmp_${key}`,
        positionId,
        queueId,
        positionName: pos.name,
        positionNameKa: pos.nameKa,
        positionCode: pos.code,
        queueName: q.name,
        isAfterHoursQueue: q.isAfterHoursQueue,
        createdAt: new Date().toISOString(),
      };
      setRules((r) => [...r, tempRule]);
      try {
        const created = await apiPost<Rule>("/v1/telephony/position-queue-rules", {
          positionId,
          queueId,
        });
        // Replace the temp row with the persisted one (id matters for
        // subsequent delete). Backend returns the bare rule row, so
        // re-hydrate the display fields from local state.
        setRules((r) =>
          r.map((x) =>
            x.id === tempRule.id
              ? { ...tempRule, id: created.id, createdAt: (created as any).createdAt ?? tempRule.createdAt }
              : x,
          ),
        );
      } catch (err) {
        setRules(prevRules);
        setError(t("positionQueueRules.saveError", "Failed to save. Your change was reverted."));
      } finally {
        setPending((s) => {
          const n = new Set(s);
          n.delete(key);
          return n;
        });
      }
    }
  }

  const positionLabel = (p: Position) =>
    language === "ka" && p.nameKa ? p.nameKa : p.name;

  return (
    <PermissionGuard permission="admin.access">
      <div className="p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/app/admin"
            className="mb-2 inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← {t("positionQueueRules.backToAdmin", "Back to Admin Panel")}
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900">
            {t("positionQueueRules.title", "Position → Queue Rules")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-zinc-600">
            {t(
              "positionQueueRules.description",
              "Each checked cell means: when an operator in that Position is linked to an extension, they automatically join that queue.",
            )}
          </p>
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <div>{error}</div>
            <button
              onClick={() => {
                setError(null);
                fetchAll();
              }}
              className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-200"
            >
              {t("positionQueueRules.reload", "Reload")}
            </button>
          </div>
        )}

        {/* How-it-works callout */}
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-semibold">{t("positionQueueRules.howItWorks", "How this works")}</div>
          <div className="mt-1">{t("positionQueueRules.howItWorksBody", "Rules take effect the next time an employee is linked or unlinked from an extension.")}</div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-zinc-50 p-12 text-center text-sm text-zinc-600">
            {t("positionQueueRules.loading", "Loading rules...")}
          </div>
        ) : positions.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 p-12 text-center text-sm text-zinc-600">
            {t("positionQueueRules.noPositions", "No positions configured — create positions first.")}
          </div>
        ) : queues.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 p-12 text-center text-sm text-zinc-600">
            {t("positionQueueRules.noQueues", "No queues visible — verify Asterisk is connected and queues have been synced.")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl bg-white shadow-sm ring-1 ring-zinc-200">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-zinc-50/50">
                  <th className="sticky left-0 z-10 bg-zinc-50/50 px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-zinc-600">
                    {t("positionQueueRules.position", "Position")}
                  </th>
                  {queues.map((q) => (
                    <th
                      key={q.id}
                      className="px-4 py-4 text-center text-xs font-semibold uppercase tracking-wider text-zinc-600"
                    >
                      <div className="font-mono text-sm text-zinc-900">{q.name}</div>
                      {q.isAfterHoursQueue && (
                        <div className="mt-1 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-200">
                          {t("positionQueueRules.afterHoursLabel", "after hours")}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {positions.map((p) => (
                  <tr key={p.id} className="transition hover:bg-zinc-50/50">
                    <td className="sticky left-0 z-10 bg-white px-6 py-3 whitespace-nowrap">
                      <div className="font-medium text-zinc-900">{positionLabel(p)}</div>
                      <div className="text-xs text-zinc-500">{p.code}</div>
                    </td>
                    {queues.map((q) => {
                      const key = cellKey(p.id, q.id);
                      const checked = ruleIndex.has(key);
                      const isPending = pending.has(key);
                      return (
                        <td key={q.id} className="px-4 py-3 text-center">
                          <label className="inline-flex items-center justify-center">
                            <input
                              type="checkbox"
                              className="h-5 w-5 cursor-pointer rounded border-zinc-300 text-teal-600 focus:ring-teal-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                              checked={checked}
                              disabled={isPending}
                              onChange={() => toggleCell(p.id, q.id, checked)}
                              style={{ accentColor: BRAND }}
                              aria-label={`${positionLabel(p)} × ${q.name}`}
                            />
                            {isPending && (
                              <span className="ml-2 text-[11px] text-zinc-500">
                                {t("positionQueueRules.saving", "Saving…")}
                              </span>
                            )}
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
