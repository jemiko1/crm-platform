"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiGetPaginated } from "@/lib/api";
import AddBuildingModal from "./add-building-modal";
import BuildingStatistics from "./building-statistics";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import { useModalContext } from "../modal-manager";
import { useI18n } from "@/hooks/useI18n";

type Building = {
  coreId: number;
  name: string;
  address: string;
  city: string;
  branchId: number | null;
  isActive: boolean;
  disableCrons: boolean;
  source: "core" | "manual";
  clientCount: number;
  workOrderCount: number;
  products: Record<string, number>;
  createdAt: string;
  updatedAt: string;
};

type StatisticsData = {
  totalBuildingsCount?: number;
  currentMonthCount: number;
  currentMonthPercentageChange: number;
  averagePercentageChange: number;
  monthlyBreakdown: Record<number, Record<number, number>>;
};

type BuildingProductCounts = {
  ELEVATOR: number;
  ENTRANCE_DOOR: number;
  INTERCOM: number;
  SMART_GSM_GATE: number;
  SMART_DOOR_GSM: number;
  BOOM_BARRIER: number;
  OTHER: number;
};

type BuildingRow = {
  coreId: number;
  name: string;
  address: string;
  city: string;
  branchId: number | null;
  isActive: boolean;
  disableCrons: boolean;
  source: "core" | "manual";
  clientCount: number;
  products: BuildingProductCounts;
  openWorkOrders: number;
  createdAt: string;
  updatedAt: string;
};

const BRANCH_MAP: Record<number, { label: string; color: string; bg: string; ring: string }> = {
  162: { label: "ASG", color: "text-teal-800", bg: "bg-teal-50", ring: "ring-teal-200" },
  285898: { label: "Benec", color: "text-zinc-700", bg: "bg-zinc-50", ring: "ring-zinc-200" },
  1963171: { label: "გაუქმებული", color: "text-red-700", bg: "bg-red-50", ring: "ring-red-200" },
};

const BRAND = "rgb(0, 86, 83)";

function useHasMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function formatUtcCompact(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

function normalizeProductCounts(products: Record<string, number>): BuildingProductCounts {
  // Build an uppercase lookup for case-insensitive matching
  const upper: Record<string, number> = {};
  for (const [k, v] of Object.entries(products)) {
    const key = k.toUpperCase();
    upper[key] = (upper[key] ?? 0) + v;
  }

  // Map known aliases (core system sends LIFT/DOOR/INTERCOM instead of ELEVATOR/ENTRANCE_DOOR)
  const elevator = (upper.ELEVATOR ?? 0) + (upper.LIFT ?? 0);
  const entranceDoor = (upper.ENTRANCE_DOOR ?? 0) + (upper.DOOR ?? 0);
  const intercom = (upper.INTERCOM ?? 0);
  const smartGsmGate = (upper.SMART_GSM_GATE ?? 0);
  const smartDoorGsm = (upper.SMART_DOOR_GSM ?? 0);
  const boomBarrier = (upper.BOOM_BARRIER ?? 0);

  // Sum known types and subtract from total to get OTHER
  const knownTotal = elevator + entranceDoor + intercom + smartGsmGate + smartDoorGsm + boomBarrier;
  const totalAll = Object.values(products).reduce((s, v) => s + v, 0);
  const other = (upper.OTHER ?? 0) + Math.max(0, totalAll - knownTotal - (upper.OTHER ?? 0));

  return {
    ELEVATOR: elevator,
    ENTRANCE_DOOR: entranceDoor,
    INTERCOM: intercom,
    SMART_GSM_GATE: smartGsmGate,
    SMART_DOOR_GSM: smartDoorGsm,
    BOOM_BARRIER: boomBarrier,
    OTHER: other,
  };
}

const ProductIcons = React.memo(function ProductIcons({ p }: { p: BuildingProductCounts }) {
  const items = [
    { key: "ELEVATOR", label: "Lift", count: p.ELEVATOR, icon: <IconLift /> },
    { key: "ENTRANCE_DOOR", label: "Entrance Door", count: p.ENTRANCE_DOOR, icon: <IconDoor /> },
    { key: "INTERCOM", label: "Intercom", count: p.INTERCOM, icon: <IconIntercom /> },
    { key: "SMART_GSM_GATE", label: "Smart GSM Gate", count: p.SMART_GSM_GATE, icon: <IconGate /> },
    { key: "SMART_DOOR_GSM", label: "Smart Door GSM", count: p.SMART_DOOR_GSM, icon: <IconSmartDoor /> },
  ];

  return (
    <div className="flex max-w-full flex-wrap items-center gap-1 md:gap-2">
      {items.map((it) => {
        const muted = it.count === 0;
        return (
          <span
            key={it.key}
            className={[
              "inline-flex h-7 items-center gap-1 rounded-lg px-1.5 py-1 md:h-9 md:gap-2 md:rounded-2xl md:px-2.5 md:py-1.5",
              "ring-1 ring-zinc-200 bg-zinc-50",
              "text-[11px] text-zinc-700 md:text-xs",
              muted ? "opacity-60" : "opacity-100",
            ].join(" ")}
            title={`${it.label}: ${it.count}`}
          >
            <span className="text-zinc-500">{it.icon}</span>
            <span className="font-semibold text-zinc-900 tabular-nums">{it.count}</span>
          </span>
        );
      })}
    </div>
  );
});

function BuildingsPageContent() {
  const { t } = useI18n();
  const hasMounted = useHasMounted();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const hasLoadedOnce = useRef(false);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const pageSize = 20;

  const { openModal } = useModalContext();

  function openBuildingModal(buildingId: number) {
    openModal("building", String(buildingId));
  }

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);

  // Fetch buildings from API (server-side pagination + search)
  useEffect(() => {
    let cancelled = false;

    async function fetchBuildings() {
      try {
        if (!hasLoadedOnce.current) setLoading(true);
        else setSearching(true);
        setError(null);

        const params = new URLSearchParams();
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        if (debouncedQ.trim()) params.set("search", debouncedQ.trim());

        const result = await apiGetPaginated<Building>(`/v1/buildings?${params}`);

        if (!cancelled) {
          const rows: BuildingRow[] = result.data.map((b) => ({
            coreId: b.coreId,
            name: b.name,
            address: b.address,
            city: b.city,
            branchId: b.branchId,
            isActive: b.isActive,
            disableCrons: b.disableCrons,
            source: b.source,
            clientCount: b.clientCount,
            products: normalizeProductCounts(b.products),
            openWorkOrders: b.workOrderCount,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
          }));
          setBuildings(rows);
          setTotal(result.meta.total);
          setTotalPages(result.meta.totalPages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load buildings");
        }
      } finally {
        if (!cancelled) {
          hasLoadedOnce.current = true;
          setLoading(false);
          setSearching(false);
        }
      }
    }

    fetchBuildings();

    return () => {
      cancelled = true;
    };
  }, [page, debouncedQ]);

  // Fetch statistics
  const fetchStatistics = useCallback(() => {
    setStatsError(null);
    setStatsLoading(true);

    apiGet<StatisticsData>("/v1/buildings/statistics/summary", {
      cache: "no-store",
    })
      .then((data) => {
        setStatistics(data);
      })
      .catch((err) => {
        setStatsError(err instanceof Error ? err.message : "Failed to load statistics");
      })
      .finally(() => {
        setStatsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchStatistics();
  }, [fetchStatistics]);

  const safePage = Math.min(page, totalPages);
  const paged = buildings;

  return (
    <PermissionGuard permission="buildings.menu">
      <div className="w-full">
      <div className="mx-auto w-full px-2 py-4 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-3 flex flex-col gap-2 md:mb-8 md:flex-row md:items-end md:justify-between md:gap-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200 md:shadow-sm">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              {t("buildings.subtitle", "Buildings")}
            </div>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 md:mt-3 md:text-3xl">
              {t("buildings.title", "Buildings Directory")}
            </h1>
            <p className="mt-0.5 text-xs leading-snug text-zinc-600 md:mt-1 md:text-sm md:leading-normal">
              {t("buildings.description", "Synced from your core system via API. Buildings and devices are read-only in this CRM.")}
            </p>
          </div>

        </div>

        {/* Statistics Section */}
        <BuildingStatistics
          statistics={statistics}
          loading={statsLoading}
          error={statsError}
          onRetry={fetchStatistics}
        />

        {/* Main Card */}
        <div className="rounded-none bg-transparent p-0 shadow-none ring-0 md:rounded-3xl md:bg-white md:p-6 md:shadow-sm md:ring-1 md:ring-zinc-200">
          {/* Loading State */}
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">
              {t("buildings.loading", "Loading buildings from API...")}
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">{t("buildings.errorLoading", "Error loading buildings")}</div>
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

          {/* Table */}
          {!loading && !error && (
            <>
              {/* Search + Add Building - above table */}
              <div className="mb-3 flex flex-col gap-2 md:mb-4 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
                <div className="relative min-w-0 w-full md:max-w-md md:flex-1">
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder={t("buildings.searchPlaceholder", "Search by ID, name, address, city...")}
                    className="w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm ring-2 ring-teal-500/40 border border-teal-500/30 hover:ring-teal-500/60 hover:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/70 focus:border-teal-500/60 transition-all md:rounded-2xl md:px-4 md:py-2.5 md:shadow-md"
                  />
                  {searching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                  )}
                </div>
                {hasPermission("buildings.create") && (
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="w-full shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 whitespace-nowrap md:ml-auto md:w-auto md:rounded-2xl md:px-4 md:py-2.5"
                    style={{ backgroundColor: BRAND }}
                  >
                    + {t("buildings.addBuilding", "Add Building")}
                  </button>
                )}
              </div>

              <div className="overflow-x-auto overflow-y-visible rounded-none ring-0 md:overflow-clip md:rounded-2xl md:ring-1 md:ring-zinc-200">
                <div>
                  <table className="min-w-[1180px] w-full border-separate border-spacing-0">
                    <thead className="bg-zinc-50 relative z-10 shadow-[0_1px_0_rgba(0,0,0,0.08)] md:sticky md:top-[52px] md:z-20">
                      <tr className="text-left text-[11px] text-zinc-600 md:text-xs">
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.building", "Building")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.branch", "Branch")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.clients", "Clients")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.devices", "Devices")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.workOrders", "Work Orders")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.createdOn", "Created On")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.source", "Source")}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {paged.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-600">
                            {debouncedQ.trim()
                              ? t("buildings.noMatch", "No buildings match your search.")
                              : t("buildings.noBuildings", "No buildings found. Click 'Add Building' to create one.")}
                          </td>
                        </tr>
                      ) : (
                        paged.map((b, index) => {
                          const open = b.openWorkOrders ?? 0;
                          const isLast = index === paged.length - 1;
                          const branch = b.branchId != null ? BRANCH_MAP[b.branchId] : null;
                          const isActive = b.isActive ?? !b.disableCrons;
                          return (
                            <tr
                              key={b.coreId}
                              className={[
                                "group transition-colors duration-200 ease-out",
                                "hover:bg-teal-50/60",
                                "md:hover:shadow-lg md:hover:-translate-y-0.5 md:hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                            >
                              {/* Building (with active/inactive dot) */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <button
                                  type="button"
                                  onClick={() => openBuildingModal(b.coreId)}
                                  className="block w-full text-left"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold leading-snug text-zinc-900 underline-offset-2 group-hover:underline">
                                        {b.name}
                                      </span>
                                      <span className="text-zinc-400">→</span>
                                    </div>
                                    <div className="mt-0.5 flex items-center gap-1.5 text-[12px] leading-snug text-zinc-500 md:mt-1 md:text-xs">
                                      <span
                                        className={`inline-block h-2 w-2 shrink-0 rounded-full ${isActive ? "bg-emerald-500" : "bg-red-400"}`}
                                        title={isActive ? t("common.active", "Active") : t("common.inactive", "Inactive")}
                                      />
                                      ID {b.coreId} · {b.city ?? "—"}
                                    </div>
                                  </div>
                                </button>
                              </td>

                              {/* Branch */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                {branch ? (
                                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${branch.bg} ${branch.color} ${branch.ring}`}>
                                    {branch.label}
                                  </span>
                                ) : (
                                  <span className="text-xs text-zinc-400">—</span>
                                )}
                              </td>

                              {/* Clients */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const params = new URLSearchParams(searchParams?.toString() || "");
                                    params.set("building", String(b.coreId));
                                    params.set("tab", "clients");
                                    router.push(`${window.location.pathname}?${params.toString()}`);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-sm text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 md:gap-2 md:rounded-2xl md:px-3 md:py-2"
                                  title={t("buildings.openClients", "Open clients list")}
                                >
                                  <span className="text-zinc-500">
                                    <IconClients />
                                  </span>
                                  <span className="font-semibold tabular-nums">{b.clientCount}</span>
                                </button>
                              </td>

                              {/* Devices */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const params = new URLSearchParams(searchParams?.toString() || "");
                                    params.set("building", String(b.coreId));
                                    params.set("tab", "devices");
                                    router.push(`${window.location.pathname}?${params.toString()}`);
                                  }}
                                  className="block w-full"
                                  title={t("buildings.openDevices", "Open devices")}
                                >
                                  <div className="group-hover:opacity-95">
                                    <ProductIcons p={b.products} />
                                  </div>
                                </button>
                              </td>

                              {/* Work Orders */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const params = new URLSearchParams(searchParams?.toString() || "");
                                    params.set("building", String(b.coreId));
                                    params.set("tab", "work-orders");
                                    router.push(`${window.location.pathname}?${params.toString()}`);
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2 py-1.5 text-sm text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 md:gap-2 md:rounded-2xl md:px-3 md:py-2"
                                  title={t("buildings.openWorkOrders", "Open work orders")}
                                >
                                  <span className="text-zinc-500">
                                    <IconClipboardSmall />
                                  </span>
                                  <span className="tabular-nums">
                                    <span className="font-semibold text-zinc-700">{t("buildings.open", "Open:")}</span> {open}
                                  </span>
                                </button>
                              </td>

                              {/* Created On */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <div className="text-sm leading-snug text-zinc-900 tabular-nums">
                                  {hasMounted
                                    ? new Date(b.createdAt).toLocaleDateString()
                                    : formatUtcCompact(b.createdAt).split(" ")[0]}
                                </div>
                              </td>

                              {/* Source */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${
                                  b.source === "core"
                                    ? "bg-sky-50 text-sky-700 ring-sky-200"
                                    : "bg-amber-50 text-amber-700 ring-amber-200"
                                }`}>
                                  {b.source === "core" ? t("buildings.sourceCore", "Core Sync") : t("buildings.sourceManual", "Manual")}
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

      {/* Add Building Modal */}
      <AddBuildingModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          window.location.reload();
        }}
      />
    </div>
    </PermissionGuard>
  );
}

/* --- Small neutral icons (inline, no libs) --- */
function IconLift() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 21V3h10v18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10 7h4M10 11h4M10 15h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconDoor() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 21V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 12h.01"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconIntercom() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M9 8h6M9 12h6M9 16h3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconGate() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 21V9l8-4 8 4v12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 21V12h6v9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSmartDoor() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 12h.01"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M4 21h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClients() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 21a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClipboardSmall() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4h6l1 2h3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6h3l1-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 4a2 2 0 0 0 0 4h6a2 2 0 0 0 0-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BuildingsPage() {
  return (
    <Suspense fallback={null}>
      <BuildingsPageContent />
    </Suspense>
  );
}
