"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AddBuildingModal from "./add-building-modal";

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

const BRAND = "rgb(8, 117, 56)";

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

function ProductIcons({ p }: { p: BuildingProductCounts }) {
  const items = [
    { key: "ELEVATOR", label: "Elevators", count: p.ELEVATOR, icon: <IconLift /> },
    { key: "ENTRANCE_DOOR", label: "Entrance Doors", count: p.ENTRANCE_DOOR, icon: <IconDoor /> },
    { key: "INTERCOM", label: "Intercoms", count: p.INTERCOM, icon: <IconIntercom /> },
    { key: "SMART_GSM_GATE", label: "Smart GSM Gates", count: p.SMART_GSM_GATE, icon: <IconGate /> },
    { key: "SMART_DOOR_GSM", label: "Smart Door GSM", count: p.SMART_DOOR_GSM, icon: <IconSmartDoor /> },
  ];

  return (
    <div className="flex items-center gap-2">
      {items.map((it) => {
        const muted = it.count === 0;
        return (
          <span
            key={it.key}
            className={[
              "inline-flex items-center gap-2 rounded-2xl px-2.5 py-1.5",
              "ring-1 ring-zinc-200 bg-zinc-50",
              "text-xs text-zinc-700",
              "h-9",
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
}

export default function BuildingsPage() {
  const hasMounted = useHasMounted();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const pageSize = 10;

  // Fetch buildings from API
  useEffect(() => {
    let cancelled = false;

    async function fetchBuildings() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("http://localhost:3000/v1/buildings", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }

        const data = (await res.json()) as Building[];

        if (!cancelled) {
          const rows: BuildingRow[] = data.map((b) => ({
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
    <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Buildings
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              Buildings Directory
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Synced from your core system via API. Buildings and products are read-only in this CRM.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 whitespace-nowrap"
              style={{ backgroundColor: BRAND }}
            >
              + Add Building
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 md:p-6">
          {/* Loading State */}
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">
              Loading buildings from API...
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">Error loading buildings</div>
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
              {/* Search Input - positioned above table */}
              <div className="mb-4">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by ID, name, address, city..."
                  className="w-full max-w-md rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-md ring-2 ring-emerald-500/40 border border-emerald-500/30 hover:ring-emerald-500/60 hover:border-emerald-500/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:shadow-lg focus:border-emerald-500/60 transition-all"
                />
              </div>

              <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-200">
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full border-separate border-spacing-0">
                    <thead className="bg-zinc-50">
                      <tr className="text-left text-xs text-zinc-600">
                        <th className="px-4 py-3 font-medium">Building</th>
                        <th className="px-4 py-3 font-medium">Clients</th>
                        <th className="px-4 py-3 font-medium">Products</th>
                        <th className="px-4 py-3 font-medium">Work Orders</th>
                        <th className="px-4 py-3 font-medium">Last Update</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {paged.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-600">
                            {filtered.length === 0 && buildings.length > 0
                              ? "No buildings match your search."
                              : "No buildings found. Click 'Add Building' to create one."}
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
                                "group transition-all duration-200 ease-out",
                                "hover:bg-emerald-50/60",
                                "hover:shadow-lg hover:-translate-y-0.5 hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                            >
                              {/* Building */}
                              <td className="px-4 py-4 align-middle">
                                <Link href={`/app/buildings/${b.coreId}`} className="block">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-zinc-900 underline-offset-2 group-hover:underline">
                                        {b.name}
                                      </span>
                                      <span className="text-zinc-400">→</span>
                                    </div>
                                    <div className="mt-1 text-xs text-zinc-500">
                                      ID {b.coreId} • {b.city ?? "—"}
                                    </div>
                                  </div>
                                </Link>
                              </td>

                              {/* Clients */}
                              <td className="px-4 py-4 align-middle">
                                <Link
                                  href={`/app/buildings/${b.coreId}?tab=clients`}
                                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                                  title="Open clients list"
                                >
                                  <span className="text-zinc-500">
                                    <IconClients />
                                  </span>
                                  <span className="font-semibold tabular-nums">{b.clientCount}</span>
                                </Link>
                              </td>

                              {/* Products */}
                              <td className="px-4 py-4 align-middle">
                                <Link
                                  href={`/app/buildings/${b.coreId}?tab=products`}
                                  className="block"
                                  title="Open products"
                                >
                                  <div className="group-hover:opacity-95">
                                    <ProductIcons p={b.products} />
                                  </div>
                                </Link>
                              </td>

                              {/* Work Orders */}
                              <td className="px-4 py-4 align-middle">
                                <Link
                                  href={`/app/buildings/${b.coreId}?tab=work-orders`}
                                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                                  title="Open work orders"
                                >
                                  <span className="text-zinc-500">
                                    <IconClipboardSmall />
                                  </span>
                                  <span className="tabular-nums">
                                    <span className="font-semibold text-zinc-700">Open:</span> {open}
                                  </span>
                                </Link>
                              </td>

                              {/* Last Update */}
                              <td className="px-4 py-4 align-middle">
                                <Link
                                  href={`/app/buildings/${b.coreId}`}
                                  className="block"
                                  title="Open building"
                                >
                                  <div className="text-sm text-zinc-900">
                                    {hasMounted
                                      ? new Date(b.updatedAt).toLocaleString()
                                      : formatUtcCompact(b.updatedAt)}
                                  </div>
                                  <div className="mt-1 text-xs text-zinc-500">latest core sync</div>
                                </Link>
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
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-zinc-600">
                    Page <span className="font-semibold text-zinc-900">{safePage}</span> of{" "}
                    <span className="font-semibold text-zinc-900">{totalPages}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </button>
                    <button
                      type="button"
                      className="rounded-2xl bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Next
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