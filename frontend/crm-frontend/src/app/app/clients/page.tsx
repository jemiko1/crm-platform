"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiGetPaginated } from "@/lib/api";
import ClientStatistics from "./client-statistics";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import { useModalContext } from "../modal-manager";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(0, 86, 83)";

type ClientBuildingRef = {
  coreId: number;
  name: string;
};

type ClientRow = {
  coreId: number;
  firstName: string | null;
  lastName: string | null;
  idNumber: string | null;
  paymentId: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  consolidatedBalance: number;
  updatedAt: string;
  buildings: ClientBuildingRef[];
};

type ClientStatisticsData = {
  totalClientsCount?: number;
  currentMonthCount: number;
  currentMonthPercentageChange: number;
  averagePercentageChange: number;
  monthlyBreakdown: Record<number, Record<number, number>>;
};

function safeText(v?: string | null) {
  const s = (v ?? "").trim();
  return s || "—";
}

function safePhone(v?: string | null) {
  const s = (v ?? "").trim();
  return s || "—";
}

function fullNameOf(c: Pick<ClientRow, "firstName" | "lastName" | "coreId">) {
  const fn = (c.firstName ?? "").trim();
  const ln = (c.lastName ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || `Client #${c.coreId}`;
}

function ClientsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const { t } = useI18n();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statistics, setStatistics] = useState<ClientStatisticsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const { openModal } = useModalContext();

  function openClientModal(clientId: number) {
    openModal("client", String(clientId));
  }

  // Fetch statistics
  const fetchStatistics = useCallback(() => {
    setStatsError(null);
    setStatsLoading(true);
    apiGet<ClientStatisticsData>("/v1/clients/statistics/summary", { cache: "no-store" })
      .then((data) => setStatistics(data))
      .catch((err) => setStatsError(err instanceof Error ? err.message : "Failed to load statistics"))
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => { fetchStatistics(); }, [fetchStatistics]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  // Fetch clients from API (server-side pagination + search)
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        if (debouncedQ.trim()) params.set("search", debouncedQ.trim());

        const result = await apiGetPaginated<ClientRow>(`/v1/clients?${params}`);
        if (!alive) return;

        setRows(result.data);
        setTotal(result.meta.total);
        setTotalPages(result.meta.totalPages);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : t("clients.errorLoading", "Error loading clients"));
        setRows([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [page, debouncedQ]);

  const safePage = Math.min(page, totalPages);
  const paged = rows;

  return (
    <PermissionGuard permission="clients.menu">
      <div className="w-full">
      <div className="mx-auto w-full px-2 py-4 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-3 flex flex-col gap-2 md:mb-8 md:gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              {t("clients.subtitle", "Clients")}
            </div>

            <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 md:mt-3 md:text-3xl">
              {t("clients.title", "Clients Directory")}
            </h1>
            <p className="mt-0.5 text-xs leading-snug text-zinc-600 md:mt-1 md:text-sm md:leading-normal">
              {t("clients.description", "Central client list across buildings. Assignment is mapped by building coreId.")}
            </p>
          </div>
        </div>

        {/* Statistics Section */}
        <ClientStatistics
          statistics={statistics}
          loading={statsLoading}
          error={statsError}
          onRetry={fetchStatistics}
        />

        {/* Main Card */}
        <div className="rounded-none bg-transparent p-0 shadow-none ring-0 md:rounded-3xl md:bg-white md:p-6 md:shadow-sm md:ring-1 md:ring-zinc-200">
          {/* Loading / Error */}
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">Loading clients from API...</div>
          )}

          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">Error loading clients</div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          )}

          {/* Table */}
          {!loading && !error && (
            <>
              {/* Search Input - EXACT like Buildings */}
              <div className="mb-3 md:mb-4">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t("clients.searchPlaceholder", "Search by name, ID number, payment id, phone, building...")}
                  className="w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm ring-2 ring-teal-500/40 border border-teal-500/30 hover:ring-teal-500/60 hover:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/70 focus:border-teal-500/60 transition-all md:max-w-md md:rounded-2xl md:px-4 md:py-2.5 md:shadow-md"
                />
              </div>

              <div className="overflow-x-auto overflow-y-visible rounded-none ring-0 md:overflow-clip md:rounded-2xl md:ring-1 md:ring-zinc-200">
                <div>
                  <table className="min-w-[1120px] w-full border-separate border-spacing-0">
                    <colgroup>
                      <col style={{ width: "300px" }} />
                      <col />
                      <col />
                      <col />
                      <col style={{ width: "100px" }} />
                    </colgroup>

                    <thead className="bg-zinc-50 relative z-10 shadow-[0_1px_0_rgba(0,0,0,0.08)] md:sticky md:top-[52px] md:z-20">
                      <tr className="text-left text-[11px] text-zinc-600 md:text-xs">
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-5 md:py-3">{t("clients.columns.client", "Client")}</th>
                        <th className="px-2 py-2 font-medium border-l border-zinc-200 bg-zinc-50 md:px-4 md:py-3">
                          {t("clients.columns.idNumber", "ID Number")}
                        </th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("clients.columns.phone", "Phone")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("clients.columns.buildings", "Buildings")}</th>
                        <th className="px-2 py-2 font-medium text-right bg-zinc-50 md:px-4 md:py-3">{t("clients.columns.clientId", "Client ID")}</th>
                      </tr>
                    </thead>

                    <tbody className="bg-white">
                      {paged.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-600">
                            {debouncedQ.trim()
                              ? t("clients.noMatch", "No clients match your search.")
                              : t("clients.noClientsFound", "No clients found.")}
                          </td>
                        </tr>
                      ) : (
                        paged.map((c, index) => {
                          const isLast = index === paged.length - 1;
                          const name = fullNameOf(c);

                          return (
                            <tr
                              key={c.coreId}
                              onClick={() => openClientModal(c.coreId)}
                              style={{ cursor: "pointer" }}
                              className={[
                                "group transition-colors duration-200 ease-out",
                                "hover:bg-teal-50/60",
                                "md:hover:shadow-lg md:hover:-translate-y-0.5 md:hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                            >
                              {/* Client */}
                              <td className="px-2 py-2 align-middle md:px-5 md:py-4">
                                <div className="flex items-center justify-between gap-2 md:gap-3">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold leading-snug text-zinc-900 underline-offset-2 group-hover:underline md:text-[15px]">
                                      {name}
                                    </div>
                                    <div className="mt-0.5 truncate text-[12px] leading-snug text-zinc-500 md:mt-1 md:text-xs">
                                      {safePhone(c.primaryPhone)}
                                    </div>
                                  </div>
                                  <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">→</span>
                                </div>
                              </td>

                              {/* ID Number */}
                              <td className="px-2 py-2 align-middle border-l border-zinc-200 md:px-4 md:py-4">
                                <span className="inline-flex items-center rounded-lg bg-white px-2 py-1.5 text-sm text-zinc-900 ring-1 ring-zinc-200 md:rounded-2xl md:px-3 md:py-2">
                                  <span className="tabular-nums">{safeText(c.idNumber)}</span>
                                </span>
                              </td>

                              {/* Phone */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <div className="text-sm text-zinc-700">{safePhone(c.primaryPhone)}</div>
                                {c.secondaryPhone && (
                                  <div className="mt-0.5 text-xs text-zinc-400">{c.secondaryPhone}</div>
                                )}
                              </td>

                              {/* Buildings */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <BuildingsCell buildings={c.buildings ?? []} />
                              </td>

                              {/* Client ID */}
                              <td className="px-2 py-2 align-middle text-right md:px-4 md:py-4">
                                <span className="inline-flex items-center rounded-lg bg-white px-2 py-1.5 text-sm text-zinc-900 ring-1 ring-zinc-200 md:rounded-2xl md:px-3 md:py-2">
                                  <span className="tabular-nums">{c.coreId}</span>
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {total > 0 && (
                <div className="mt-3 flex flex-col gap-2 pb-1 md:mt-5 md:flex-row md:items-center md:justify-between md:gap-3">
                  <div className="text-[11px] text-zinc-600 md:text-xs">
                    {t("common.page", "Page")} <span className="font-semibold text-zinc-900">{safePage}</span> {t("common.of", "of")}{" "}
                    <span className="font-semibold text-zinc-900">{totalPages}</span>
                    <span className="ml-2 text-zinc-400">({total} {t("common.total", "total")})</span>
                  </div>

                  <div className="flex items-center gap-1.5 md:gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40 md:rounded-2xl md:px-3 md:py-2 md:text-sm md:shadow-sm"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t("common.prev", "Prev")}
                    </button>

                    <button
                      type="button"
                      className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40 md:rounded-2xl md:px-3 md:py-2 md:text-sm md:shadow-sm"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      {t("common.next", "Next")}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </PermissionGuard>
  );
}

export default function ClientsPage() {
  return (
    <Suspense fallback={null}>
      <ClientsPageContent />
    </Suspense>
  );
}

const BuildingsCell = React.memo(function BuildingsCell({ buildings }: { buildings: { coreId: number; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const { openModal } = useModalContext();
  const { t } = useI18n();

  if (!buildings.length) {
    return <span className="text-sm text-zinc-500">—</span>;
  }

  const first = buildings[0];
  const extra = Math.max(0, buildings.length - 1);

  return (
    <div
      className="relative inline-flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={() => openModal("building", String(first.coreId))}
        className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
        title={t("clients.openBuilding", "Open building")}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
        <span className="truncate max-w-[180px]">{first.name}</span>
      </button>

      {extra > 0 ? (
        <span className="rounded-2xl bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
          +{extra}
        </span>
      ) : null}

      {open && buildings.length > 1 ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[340px] rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-zinc-200">
          <div className="mb-2 text-xs font-semibold text-zinc-900">
            {t("clients.assignedBuildings", "Assigned Buildings")} ({buildings.length})
          </div>

          <div className="max-h-56 space-y-2 overflow-y-auto">
            {buildings.map((b) => (
              <button
                key={b.coreId}
                type="button"
                onClick={() => openModal("building", String(b.coreId))}
                className="block w-full text-left rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 hover:bg-teal-50 hover:ring-teal-200 transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 truncate font-semibold">{b.name}</div>
                  <div className="text-xs text-zinc-500 tabular-nums">#{b.coreId}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
