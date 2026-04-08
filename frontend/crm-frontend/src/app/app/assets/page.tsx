"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiGetPaginated } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";
import { useModalContext } from "../modal-manager";
import { useI18n } from "@/hooks/useI18n";
import SourceTabs from "@/components/source-tabs";

const BRAND = "rgb(0, 86, 83)";

type DeviceRow = {
  id: string;
  coreId: number | null;
  type: string;
  name: string;
  ip: string | null;
  port: string | null;
  status: string;
  source: "core" | "manual";
  createdAt: string;
  updatedAt: string;
  building: { coreId: number; name: string } | null;
};

type StatisticsData = {
  totalDevicesCount?: number;
  currentMonthCount: number;
  currentMonthPercentageChange: number;
  averagePercentageChange: number;
  monthlyBreakdown: Record<number, Record<number, number>>;
};

function useHasMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

const DEVICE_TYPE_STYLES: Record<string, { color: string; bg: string; ring: string }> = {
  LIFT: { color: "text-violet-700", bg: "bg-violet-50", ring: "ring-violet-200" },
  ELEVATOR: { color: "text-violet-700", bg: "bg-violet-50", ring: "ring-violet-200" },
  DOOR: { color: "text-sky-700", bg: "bg-sky-50", ring: "ring-sky-200" },
  ENTRANCE_DOOR: { color: "text-sky-700", bg: "bg-sky-50", ring: "ring-sky-200" },
  INTERCOM: { color: "text-amber-700", bg: "bg-amber-50", ring: "ring-amber-200" },
  SMART_GSM_GATE: { color: "text-teal-700", bg: "bg-teal-50", ring: "ring-teal-200" },
  SMART_DOOR_GSM: { color: "text-emerald-700", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  BOOM_BARRIER: { color: "text-red-700", bg: "bg-red-50", ring: "ring-red-200" },
};

const STATUS_STYLES: Record<string, { dot: string; text: string }> = {
  ONLINE: { dot: "bg-emerald-500", text: "text-emerald-700" },
  OFFLINE: { dot: "bg-red-400", text: "text-red-600" },
  UNKNOWN: { dot: "bg-zinc-400", text: "text-zinc-500" },
};

function DevicesPageContent() {
  const { t } = useI18n();
  const hasMounted = useHasMounted();
  const [sourceTab, setSourceTab] = useState<"core" | "crm">("core");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const { openModal } = useModalContext();

  function handleTabSwitch(tab: "core" | "crm") {
    setSourceTab(tab);
    setPage(1);
    setQ("");
    setDebouncedQ("");
    hasLoadedOnce.current = false;
  }

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  // Fetch devices
  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        if (!hasLoadedOnce.current) setLoading(true);
        else setSearching(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        params.set("source", sourceTab);
        if (debouncedQ.trim()) params.set("search", debouncedQ.trim());

        const result = await apiGetPaginated<DeviceRow>(`/v1/assets?${params}`);
        if (!alive) return;

        setRows(result.data);
        setTotal(result.meta.total);
        setTotalPages(result.meta.totalPages);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : t("devices.errorLoading", "Error loading devices"));
        setRows([]);
      } finally {
        if (!alive) return;
        hasLoadedOnce.current = true;
        setLoading(false);
        setSearching(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [page, debouncedQ, sourceTab]);

  // Fetch statistics
  const fetchStatistics = useCallback(() => {
    setStatsError(null);
    setStatsLoading(true);
    apiGet<StatisticsData>(`/v1/assets/statistics/summary?source=${sourceTab}`, { cache: "no-store" })
      .then((data) => setStatistics(data))
      .catch((err) => setStatsError(err instanceof Error ? err.message : "Failed to load statistics"))
      .finally(() => setStatsLoading(false));
  }, [sourceTab]);

  useEffect(() => { fetchStatistics(); }, [fetchStatistics]);

  const safePage = Math.min(page, totalPages);

  return (
    <PermissionGuard permission="assets.menu">
      <div className="w-full">
      <div className="mx-auto w-full px-2 py-4 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-3 flex flex-col gap-2 md:mb-6 md:gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              {t("devices.subtitle", "Devices")}
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 md:mt-3 md:text-3xl">
              {t("devices.title", "Devices Directory")}
            </h1>
            <p className="mt-0.5 text-xs leading-snug text-zinc-600 md:mt-1 md:text-sm md:leading-normal">
              {sourceTab === "core"
                ? t("devices.description", "All devices synced from core system across buildings.")
                : t("devices.descriptionCrm", "Manually created devices in CRM28.")}
            </p>
          </div>
        </div>

        {/* Source Tabs */}
        <SourceTabs
          active={sourceTab}
          onSwitch={handleTabSwitch}
          coreLabel={t("devices.tabs.core", "Core Devices")}
          crmLabel={t("devices.tabs.crm", "CRM28 Devices")}
        />

        {/* Statistics Section */}
        <DeviceStatistics
          statistics={statistics}
          loading={statsLoading}
          error={statsError}
          onRetry={fetchStatistics}
        />

        {/* Main Card */}
        <div className="rounded-none bg-transparent p-0 shadow-none ring-0 md:rounded-3xl md:bg-white md:p-6 md:shadow-sm md:ring-1 md:ring-zinc-200">
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">
              {t("devices.loading", "Loading devices...")}
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">{t("devices.errorLoading", "Error loading devices")}</div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {t("common.retry", "Retry")}
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Search */}
              <div className="mb-3 md:mb-4">
                <div className="relative md:max-w-md">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("devices.searchPlaceholder", "Search by name, type, IP, building...")}
                    className="w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm ring-2 ring-teal-500/40 border border-teal-500/30 hover:ring-teal-500/60 hover:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/70 focus:border-teal-500/60 transition-all md:rounded-2xl md:px-4 md:py-2.5 md:shadow-md"
                  />
                  {searching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                  )}
                </div>
              </div>

              <div className="overflow-x-auto overflow-y-visible rounded-none ring-0 md:overflow-clip md:rounded-2xl md:ring-1 md:ring-zinc-200">
                <div>
                  <table className="min-w-[960px] w-full border-separate border-spacing-0">
                    <thead className="bg-zinc-50 relative z-10 shadow-[0_1px_0_rgba(0,0,0,0.08)] md:sticky md:top-[52px] md:z-20">
                      <tr className="text-left text-[11px] text-zinc-600 md:text-xs">
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("devices.columns.device", "Device")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("devices.columns.type", "Type")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("devices.columns.building", "Building")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("devices.columns.ip", "IP Address")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("devices.columns.status", "Status")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("devices.columns.createdOn", "Created On")}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-600">
                            {debouncedQ.trim()
                              ? t("devices.noMatch", "No devices match your search.")
                              : t("devices.noDevices", "No devices found.")}
                          </td>
                        </tr>
                      ) : (
                        rows.map((d, index) => {
                          const isLast = index === rows.length - 1;
                          const typeKey = d.type.toUpperCase();
                          const typeStyle = DEVICE_TYPE_STYLES[typeKey] ?? {
                            color: "text-zinc-700",
                            bg: "bg-zinc-50",
                            ring: "ring-zinc-200",
                          };
                          const typeLabel = t(`devices.types.${typeKey}`, d.type);
                          const statusInfo = STATUS_STYLES[d.status] ?? STATUS_STYLES.UNKNOWN;
                          const statusLabel = t(`devices.statuses.${d.status}`, d.status);

                          return (
                            <tr
                              key={d.id}
                              className={[
                                "group transition-colors duration-200 ease-out",
                                "hover:bg-teal-50/60",
                                "md:hover:shadow-lg md:hover:-translate-y-0.5 md:hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                            >
                              {/* Device name + ID */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold leading-snug text-zinc-900">
                                    {d.name || (d.coreId ? `Device #${d.coreId}` : "Device")}
                                  </div>
                                  <div className="mt-0.5 text-[12px] leading-snug text-zinc-500 md:text-xs">
                                    {d.coreId ? `ID ${d.coreId}` : "CRM"}
                                  </div>
                                </div>
                              </td>

                              {/* Type */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${typeStyle.bg} ${typeStyle.color} ${typeStyle.ring}`}>
                                  {typeLabel}
                                </span>
                              </td>

                              {/* Building */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                {d.building ? (
                                  <button
                                    type="button"
                                    onClick={() => openModal("building", String(d.building!.coreId))}
                                    className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                                  >
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
                                    <span className="truncate max-w-[180px]">{d.building.name}</span>
                                  </button>
                                ) : (
                                  <span className="text-xs text-zinc-400">—</span>
                                )}
                              </td>

                              {/* IP */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <span className="text-sm tabular-nums text-zinc-700">
                                  {d.ip ?? "—"}
                                  {d.port ? `:${d.port}` : ""}
                                </span>
                              </td>

                              {/* Status */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <div className="flex items-center gap-1.5">
                                  <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusInfo.dot}`} />
                                  <span className={`text-xs font-medium ${statusInfo.text}`}>{statusLabel}</span>
                                </div>
                              </td>

                              {/* Created On */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <div className="text-sm leading-snug text-zinc-700 tabular-nums">
                                  {hasMounted ? new Date(d.createdAt).toLocaleDateString() : ""}
                                </div>
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
                      {t("common.previous", "Previous")}
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

/* ── Statistics Component ── */
function DeviceStatistics({
  statistics,
  loading,
  error,
  onRetry,
}: {
  statistics: StatisticsData | null;
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  const { t } = useI18n();

  if (error) {
    return (
      <div className="mb-4 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200 md:mb-6 md:rounded-2xl md:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-amber-900">{t("devices.stats.statsUnavailable", "Statistics unavailable")}</div>
            <div className="mt-1 text-sm text-amber-700">{error}</div>
          </div>
          {onRetry && (
            <button type="button" onClick={onRetry} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors">
              {t("common.retry", "Retry")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentMonth = new Date().toLocaleDateString("en-US", { month: "long" });
  const currentYear = new Date().getFullYear();

  return (
    <div
      className="-mx-2 mb-4 flex snap-x snap-mandatory gap-2 overflow-x-auto overflow-y-hidden px-2 pb-1 [-webkit-overflow-scrolling:touch] md:mx-0 md:mb-6 md:grid md:max-w-none md:grid-cols-2 md:gap-5 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-4"
      data-testid="device-statistics"
    >
      <StatBox
        title={t("devices.stats.totalDevices", "Total Devices")}
        value={loading ? "..." : statistics?.totalDevicesCount ?? 0}
        subtitle={t("devices.stats.allTime", "All time")}
        loading={loading}
        variant="total"
      />
      <StatBox
        title={t("devices.stats.addedThisMonth", "Devices Added This Month")}
        value={loading ? "..." : statistics?.currentMonthCount ?? 0}
        subtitle={`${currentMonth} ${currentYear}`}
        loading={loading}
        variant="primary"
      />
      <StatBox
        title={t("devices.stats.changeVsLastMonth", "Change vs Last Month")}
        value={
          loading
            ? "..."
            : statistics?.currentMonthPercentageChange === 0
            ? t("devices.stats.noChange", "No change")
            : `${statistics?.currentMonthPercentageChange && statistics.currentMonthPercentageChange > 0 ? "+" : ""}${statistics?.currentMonthPercentageChange?.toFixed(1) ?? 0}%`
        }
        changeValue={loading ? undefined : statistics?.currentMonthPercentageChange}
        loading={loading}
        variant="change"
        sinceLabel={t("devices.stats.sinceLastMonth", "Since last month")}
      />
      <StatBox
        title={t("devices.stats.changeVsAverage", "Change vs Average")}
        value={
          loading
            ? "..."
            : statistics?.averagePercentageChange === 0
            ? t("devices.stats.onAverage", "On average")
            : `${statistics?.averagePercentageChange && statistics.averagePercentageChange > 0 ? "+" : ""}${statistics?.averagePercentageChange?.toFixed(1) ?? 0}%`
        }
        changeValue={loading ? undefined : statistics?.averagePercentageChange}
        loading={loading}
        variant="average"
        sinceLabel={t("devices.stats.vsMonthlyAvg", "Vs monthly avg")}
      />
    </div>
  );
}

/* ── StatBox ── */
function StatBox({
  title,
  value,
  subtitle,
  changeValue,
  loading,
  variant = "primary",
  sinceLabel,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  changeValue?: number;
  loading?: boolean;
  variant?: "primary" | "change" | "average" | "total";
  sinceLabel?: string;
}) {
  const hasChange = changeValue !== undefined;
  const isPositive = hasChange && changeValue > 0;
  const isNegative = hasChange && changeValue < 0;
  const isNeutral = hasChange && changeValue === 0;

  const bottomBorderStyles = {
    primary: "border-b-2 border-teal-500 md:border-b-4",
    change: "border-b-2 border-sky-500 md:border-b-4",
    average: "border-b-2 border-violet-500 md:border-b-4",
    total: "border-b-2 border-amber-500 md:border-b-4",
  };

  return (
    <div
      className={[
        "relative min-w-[148px] shrink-0 snap-start text-left",
        "rounded-none border-0 bg-zinc-50/90 p-2",
        "shadow-none",
        "transition-all duration-300 ease-out",
        "md:min-w-0 md:snap-none md:shrink md:rounded-xl md:bg-white md:p-3",
        "md:shadow-[0_6px_24px_rgba(0,0,0,0.1)]",
        bottomBorderStyles[variant],
        loading ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex flex-col gap-0.5 md:gap-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">{title}</div>
        <div className="text-lg font-bold tabular-nums leading-tight text-zinc-900 md:text-center md:text-2xl">
          {loading ? "..." : value}
        </div>
        {subtitle && <div className="hidden text-[11px] text-zinc-500 md:block">{subtitle}</div>}
        {hasChange && !loading && (
          <div className="hidden flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] md:flex">
            <div className="flex items-center gap-1.5">
              {isPositive && <span className="font-semibold text-teal-800">+{changeValue!.toFixed(1)}%</span>}
              {isNegative && <span className="font-semibold text-red-600">{changeValue!.toFixed(1)}%</span>}
              {isNeutral && <span className="font-semibold text-zinc-500">No change</span>}
            </div>
            <span className="text-zinc-400">
              {sinceLabel ?? (variant === "change" ? "Since last month" : "Vs monthly avg")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DevicesPage() {
  return (
    <Suspense fallback={null}>
      <DevicesPageContent />
    </Suspense>
  );
}
