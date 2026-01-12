"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

const BRAND = "rgb(8, 117, 56)";

type ClientBuildingRef = {
  coreId: number;
  name: string;
};

type Client = {
  coreId: number;
  firstName: string | null;
  lastName: string | null;
  idNumber: string | null;
  paymentId: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  updatedAt: string; // ISO
  buildings: ClientBuildingRef[];
};

function safeText(v?: string | null) {
  const s = (v ?? "").trim();
  return s || "—";
}

function fullNameOf(c: Pick<Client, "firstName" | "lastName" | "coreId">) {
  const fn = (c.firstName ?? "").trim();
  const ln = (c.lastName ?? "").trim();
  const full = `${fn} ${ln}`.trim();
  return full || `Client #${c.coreId}`;
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

export default function ClientDetailPage() {
  const params = useParams();
  const clientIdParam = params?.clientId as string | undefined;
  const clientCoreId = Number(clientIdParam);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [client, setClient] = useState<Client | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!clientIdParam || Number.isNaN(clientCoreId)) {
        setLoading(false);
        setError("Invalid client id");
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch("http://localhost:3000/v1/clients", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = (await res.json()) as Client[];
        const found = (Array.isArray(data) ? data : []).find(
          (c) => Number(c.coreId) === clientCoreId
        );

        if (!found) throw new Error(`Client ${clientCoreId} not found`);

        if (!alive) return;
        setClient(found);
      } catch (e) {
        if (!alive) return;
        setClient(null);
        setError(e instanceof Error ? e.message : "Failed to load client");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [clientIdParam, clientCoreId]);

  const name = useMemo(() => (client ? fullNameOf(client) : ""), [client]);

  if (loading) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
            <div className="py-12 text-center text-sm text-zinc-600">
              Loading client details...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">
                Error loading client
              </div>
              <div className="mt-1 text-sm text-red-700">{error}</div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Link
                  href="/app/clients"
                  className="inline-flex items-center justify-center rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                >
                  Back to Clients
                </Link>

                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center justify-center rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-zinc-600">
          <Link href="/app/clients" className="hover:text-zinc-900">
            Clients
          </Link>
          <span>→</span>
          <span className="text-zinc-900">{name}</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Client #{client.coreId}
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              {name}
            </h1>

            <p className="mt-1 text-sm text-zinc-600">
              Payment ID: <span className="font-medium text-zinc-900">{safeText(client.paymentId)}</span>
              <span className="mx-2 text-zinc-300">•</span>
              ID Number: <span className="font-medium text-zinc-900">{safeText(client.idNumber)}</span>
            </p>
          </div>

          {/* Right actions (small, standard) */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
              onClick={() => alert("Edit client — later phase")}
            >
              Edit
            </button>
            <button
              type="button"
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: BRAND }}
              onClick={() => alert("Create work order — later phase")}
            >
              + Work Order
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left: Profile */}
          <div className="lg:col-span-2 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900">Client Profile</h2>
              <div className="text-xs text-zinc-500">
                Last update:{" "}
                <span className="font-medium text-zinc-700">
                  {formatUtcCompact(client.updatedAt)}
                </span>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <InfoCard label="First Name" value={safeText(client.firstName)} />
              <InfoCard label="Last Name" value={safeText(client.lastName)} />
              <InfoCard label="ID Number" value={safeText(client.idNumber)} />
              <InfoCard label="Payment ID" value={safeText(client.paymentId)} />
              <InfoCard label="Primary Phone" value={safeText(client.primaryPhone)} />
              <InfoCard label="Secondary Phone" value={safeText(client.secondaryPhone)} />
            </div>
          </div>

          {/* Right: Assigned Buildings */}
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-zinc-900">Assigned Buildings</h2>
              <span className="rounded-full bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
                {client.buildings?.length ?? 0}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {(client.buildings ?? []).length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600 ring-1 ring-zinc-200">
                  No building assignments yet.
                </div>
              ) : (
                (client.buildings ?? []).map((b) => (
                  <Link
                    key={b.coreId}
                    href={`/app/buildings/${b.coreId}`}
                    className="group block rounded-2xl bg-white p-3 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
                    title="Open building"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-zinc-900 group-hover:underline">
                          {b.name}
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          Building #{b.coreId}
                        </div>
                      </div>
                      <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <div className="text-sm font-semibold text-emerald-900">Note</div>
              <div className="mt-1 text-xs text-emerald-700">
                Clients are assigned to buildings by building coreId mapping (core sync later).
              </div>
            </div>
          </div>
        </div>

        {/* Future tabs placeholder (kept simple & consistent) */}
        <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Work Orders</h2>
            <span className="text-xs text-zinc-500">Coming soon</span>
          </div>

          <div className="mt-4 rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
            <div className="text-sm text-zinc-600">
              Work Orders module will appear here in later phase.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
