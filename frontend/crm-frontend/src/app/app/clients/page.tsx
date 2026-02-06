"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiGet } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";

const BRAND = "rgb(8, 117, 56)";

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
  updatedAt: string;
  buildings: ClientBuildingRef[];
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

export default function ClientsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasPermission } = usePermissions();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ClientRow[]>([]);

  // Helper function to open client modal via URL
  // Simple URL - browser history handles "back" navigation
  function openClientModal(clientId: number) {
    router.push(`/app/clients?client=${clientId}`);
  }

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const data = await apiGet<ClientRow[]>("/v1/clients", {
          cache: "no-store",
        });
        if (!alive) return;

        setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load clients");
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
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const src = rows ?? [];

    return src
      .filter((c) => {
        if (!query) return true;

        const buildings = (c.buildings ?? [])
          .map((b) => `${b.name} ${b.coreId}`)
          .join(" ");

        const hay = [
          String(c.coreId),
          c.firstName ?? "",
          c.lastName ?? "",
          c.idNumber ?? "",
          c.paymentId ?? "",
          c.primaryPhone ?? "",
          c.secondaryPhone ?? "",
          buildings,
        ]
          .join(" ")
          .toLowerCase();

        return hay.includes(query);
      })
      .sort((a, b) => {
        const ta = new Date(a.updatedAt).getTime();
        const tb = new Date(b.updatedAt).getTime();
        if (tb !== ta) return tb - ta; // newest first
        return (b.coreId ?? 0) - (a.coreId ?? 0); // tie-break
      });
  }, [rows, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <PermissionGuard permission="clients.menu">
      <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 md:mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Clients
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              Clients Directory
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Central client list across buildings. Assignment is mapped by building coreId.
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 md:p-6 overflow-hidden">
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
              <div className="mb-4">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search by name, ID number, payment id, phone, building..."
                  className="w-full max-w-md rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-md ring-2 ring-emerald-500/40 border border-emerald-500/30 hover:ring-emerald-500/60 hover:border-emerald-500/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:shadow-lg focus:border-emerald-500/60 transition-all"
                />
              </div>

              <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-200">
                <div className="overflow-x-auto">
                  <table className="min-w-[1220px] w-full border-separate border-spacing-0">
                    <colgroup>
                      <col style={{ width: "340px" }} />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col />
                      <col style={{ width: "120px" }} />
                    </colgroup>

                    <thead className="bg-zinc-50">
                      <tr className="text-left text-xs text-zinc-600">
                        <th className="px-5 py-3 font-medium">Client</th>
                        <th className="px-4 py-3 font-medium border-l border-zinc-200">
                          ID Number
                        </th>
                        <th className="px-4 py-3 font-medium">Payment ID</th>
                        <th className="px-4 py-3 font-medium">Primary Phone</th>
                        <th className="px-4 py-3 font-medium">Secondary Phone</th>
                        <th className="px-4 py-3 font-medium">Buildings</th>
                        <th className="px-4 py-3 font-medium text-right">Client ID</th>
                      </tr>
                    </thead>

                    <tbody className="bg-white">
                      {paged.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-sm text-zinc-600">
                            {filtered.length === 0 && rows.length > 0
                              ? "No clients match your search."
                              : "No clients found."}
                          </td>
                        </tr>
                      ) : (
                        paged.map((c, index) => {
                          const isLast = index === paged.length - 1;
                          const name = fullNameOf(c);

                          return (
                            <tr
                              key={c.coreId}
                              className={[
                                "group transition-all duration-200 ease-out",
                                "hover:bg-emerald-50/60",
                                "hover:shadow-lg hover:-translate-y-0.5 hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                            >
                              {/* Client */}
                              <td className="px-5 py-4 align-middle">
                                <button
                                  type="button"
                                  onClick={() => openClientModal(c.coreId)}
                                  className="block w-full text-left"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="text-[15px] font-semibold text-zinc-900 underline-offset-2 group-hover:underline truncate">
                                        {name}
                                      </div>
                                      <div className="mt-1 text-xs text-zinc-500 truncate">
                                        {safePhone(c.primaryPhone)} • {safeText(c.paymentId)}
                                      </div>
                                    </div>

                                    <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">
                                      →
                                    </span>
                                  </div>
                                </button>
                              </td>

                              {/* ID Number */}
                              <td className="px-4 py-4 align-middle border-l border-zinc-200">
                                <span className="inline-flex items-center rounded-2xl bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200">
                                  <span className="tabular-nums">{safeText(c.idNumber)}</span>
                                </span>
                              </td>

                              {/* Payment ID */}
                              <td className="px-4 py-4 align-middle">
                                <span className="inline-flex items-center rounded-2xl bg-zinc-50 px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200">
                                  <span className="tabular-nums">{safeText(c.paymentId)}</span>
                                </span>
                              </td>

                              {/* Primary Phone */}
                              <td className="px-4 py-4 align-middle text-sm text-zinc-700">
                                {safePhone(c.primaryPhone)}
                              </td>

                              {/* Secondary Phone */}
                              <td className="px-4 py-4 align-middle text-sm text-zinc-700">
                                {safePhone(c.secondaryPhone)}
                              </td>

                              {/* Buildings */}
                              <td className="px-4 py-4 align-middle">
                                <BuildingsCell buildings={c.buildings ?? []} />
                              </td>

                              {/* Client ID */}
                              <td className="px-4 py-4 align-middle text-right">
                                <span className="inline-flex items-center rounded-2xl bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200">
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
      </div>
    </PermissionGuard>
  );
}

const BuildingsCell = React.memo(function BuildingsCell({ buildings }: { buildings: { coreId: number; name: string }[] }) {
  const [open, setOpen] = useState(false);

  if (!buildings.length) {
    return <span className="text-sm text-zinc-500">—</span>;
  }

  const first = buildings[0];
  const extra = Math.max(0, buildings.length - 1);

  return (
    <div
      className="relative inline-flex items-center gap-2"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={`/app/buildings?building=${first.coreId}`}
        className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
        title="Open building"
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
        <span className="truncate max-w-[180px]">{first.name}</span>
      </Link>

      {extra > 0 ? (
        <span className="rounded-2xl bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
          +{extra}
        </span>
      ) : null}

      {open && buildings.length > 1 ? (
        <div className="absolute left-0 top-full z-50 mt-2 w-[340px] rounded-2xl bg-white p-3 shadow-2xl ring-1 ring-zinc-200">
          <div className="mb-2 text-xs font-semibold text-zinc-900">
            Assigned Buildings ({buildings.length})
          </div>

          <div className="max-h-56 space-y-2 overflow-y-auto">
            {buildings.map((b) => (
              <Link
                key={b.coreId}
                href={`/app/buildings?building=${b.coreId}`}
                className="block rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 hover:bg-emerald-50 hover:ring-emerald-200 transition"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 truncate font-semibold">{b.name}</div>
                  <div className="text-xs text-zinc-500 tabular-nums">#{b.coreId}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
