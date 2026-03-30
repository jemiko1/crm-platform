"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet, apiGetList } from "@/lib/api";
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
  clientCount: number;
  workOrderCount: number;
  products: Record<string, number>;
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
  clientCount: number;
  products: BuildingProductCounts;
  openWorkOrders: number;
  updatedAt: string;
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
  return {
    ELEVATOR: products.ELEVATOR ?? 0,
    ENTRANCE_DOOR: products.ENTRANCE_DOOR ?? 0,
    INTERCOM: products.INTERCOM ?? 0,
    SMART_GSM_GATE: products.SMART_GSM_GATE ?? 0,
    SMART_DOOR_GSM: products.SMART_DOOR_GSM ?? 0,
    BOOM_BARRIER: products.BOOM_BARRIER ?? 0,
    OTHER: products.OTHER ?? 0,
  };
}

const ProductIcons = React.memo(function ProductIcons({ p }: { p: BuildingProductCounts }) {
  const items = [
    { key: "ELEVATOR", label: "Elevators", count: p.ELEVATOR, icon: <IconLift /> },
    { key: "ENTRANCE_DOOR", label: "Entrance Doors", count: p.ENTRANCE_DOOR, icon: <IconDoor /> },
    { key: "INTERCOM", label: "Intercoms", count: p.INTERCOM, icon: <IconIntercom /> },
    { key: "SMART_GSM_GATE", label: "Smart GSM Gates", count: p.SMART_GSM_GATE, icon: <IconGate /> },
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
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const pageSize = 10;

  const { openModal } = useModalContext();

  function openBuildingModal(buildingId: number) {
    openModal("building", String(buildingId));
  }

  // Fetch buildings from API
  useEffect(() => {
    let cancelled = false;

    async function fetchBuildings() {
      try {
        setLoading(true);
        setError(null);

        const list = await apiGetList<Building>("/v1/buildings");

        if (!cancelled) {
          const rows: BuildingRow[] = list.map((b) => ({
            coreId: b.coreId,
            name: b.name,
            address: b.address,
            city: b.city,
            clientCount: b.clientCount,
            products: normalizeProductCounts(b.products),
            openWorkOrders: b.workOrderCount,
            updatedAt: b.updatedAt,
          }));
          setBuildings(rows);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load buildings");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchBuildings();

    return () => {
      cancelled = true;
    };
  }, []);

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

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return buildings
      .filter((b) => {
        if (!query) return true;
        const hay = [b.coreId.toString(), b.name, b.address, b.city ?? ""]
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [buildings, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

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
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder={t("buildings.searchPlaceholder", "Search by ID, name, address, city...")}
                  className="min-w-0 w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm ring-2 ring-teal-500/40 border border-teal-500/30 hover:ring-teal-500/60 hover:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/70 focus:border-teal-500/60 transition-all md:max-w-md md:flex-1 md:rounded-2xl md:px-4 md:py-2.5 md:shadow-md"
                />
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
                  <table className="min-w-[980px] w-full border-separate border-spacing-0">
                    <thead className="bg-zinc-50 relative z-10 shadow-[0_1px_0_rgba(0,0,0,0.08)] md:sticky md:top-[52px] md:z-20">
                      <tr className="text-left text-[11px] text-zinc-600 md:text-xs">
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.building", "Building")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.clients", "Clients")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.devices", "Devices")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.workOrders", "Work Orders")}</th>
                        <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("buildings.columns.lastUpdate", "Last Update")}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {paged.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-600">
                            {filtered.length === 0 && buildings.length > 0
                              ? t("buildings.noMatch", "No buildings match your search.")
                              : t("buildings.noBuildings", "No buildings found. Click 'Add Building' to create one.")}
                          </td>
                        </tr>
                      ) : (
                        paged.map((b, index) => {
                          const open = b.openWorkOrders ?? 0;
                          const isLast = index === paged.length - 1;
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
                              {/* Building */}
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
                                    <div className="mt-0.5 text-[12px] leading-snug text-zinc-500 md:mt-1 md:text-xs">
                                      ID {b.coreId} · {b.city ?? "—"}
                                    </div>
                                  </div>
                                </button>
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

                              {/* Last Update */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <button
                                  type="button"
                                  onClick={() => openBuildingModal(b.coreId)}
                                  className="block w-full text-left"
                                  title={t("buildings.openBuilding", "Open building")}
                                >
                                  <div className="text-sm leading-snug text-zinc-900">
                                    {hasMounted
                                      ? new Date(b.updatedAt).toLocaleString()
                                      : formatUtcCompact(b.updatedAt)}
                                  </div>
                                  <div className="mt-0.5 text-[12px] leading-snug text-zinc-500 md:mt-1 md:text-xs">{t("buildings.latestSync", "latest core sync")}</div>
                                </button>
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
              {filtered.length > 0 && (
                <div className="mt-3 flex flex-col gap-2 pb-1 md:mt-5 md:flex-row md:items-center md:justify-between md:gap-3">
                  <div className="text-[11px] text-zinc-600 md:text-xs">
                    {t("common.page", "Page")} <span className="font-semibold text-zinc-900">{safePage}</span> {t("common.of", "of")}{" "}
                    <span className="font-semibold text-zinc-900">{totalPages}</span>
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
