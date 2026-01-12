"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ReportIncidentModal from "../../incidents/report-incident-modal";

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

type Incident = {
  id: string;
  incidentNumber: string;
  clientId: number;
  clientName: string;
  buildingId: number;
  buildingName: string;
  productsAffected: string[];
  status: "CREATED" | "IN_PROGRESS" | "COMPLETED" | "WORK_ORDER_INITIATED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  incidentType: string;
  contactMethod: string;
  description: string;
  reportedBy: string;
  createdAt: string;
  updatedAt: string;
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

function formatLocalCompact(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function getStatusBadge(status: Incident["status"]) {
  const styles: Record<Incident["status"], string> = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    WORK_ORDER_INITIATED: "bg-purple-50 text-purple-700 ring-purple-200",
  };
  return styles[status];
}

function getStatusLabel(status: Incident["status"]) {
  const labels: Record<Incident["status"], string> = {
    CREATED: "Created",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    WORK_ORDER_INITIATED: "Work Order Created",
  };
  return labels[status];
}

function getPriorityBadge(priority: Incident["priority"]) {
  const styles: Record<Incident["priority"], string> = {
    LOW: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    MEDIUM: "bg-blue-50 text-blue-700 ring-blue-200",
    HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
    CRITICAL: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return styles[priority];
}

function getPriorityDot(priority: Incident["priority"]) {
  const colors: Record<Incident["priority"], string> = {
    LOW: "bg-zinc-400",
    MEDIUM: "bg-blue-500",
    HIGH: "bg-amber-500",
    CRITICAL: "bg-rose-500",
  };
  return colors[priority];
}

// --- normalize API responses into our Incident type ---
function normalizeIncident(raw: any): Incident | null {
  if (!raw) return null;

  const id = String(raw.id ?? raw.incidentId ?? "");
  const incidentNumber = String(raw.incidentNumber ?? raw.number ?? "");

  const clientId = Number(raw.clientId ?? raw.clientCoreId ?? raw.client?.coreId ?? raw.client?.clientId);
  const clientName =
    String(raw.clientName ?? raw.client?.name ?? raw.client?.fullName ?? raw.client?.displayName ?? "") ||
    (Number.isFinite(clientId) ? `Client #${clientId}` : "Client");

  const buildingId = Number(raw.buildingId ?? raw.buildingCoreId ?? raw.building?.coreId ?? raw.building?.buildingId);
  const buildingName =
    String(raw.buildingName ?? raw.building?.name ?? "") || (Number.isFinite(buildingId) ? `Building #${buildingId}` : "Building");

  const productsAffected: string[] =
    Array.isArray(raw.productsAffected) ? raw.productsAffected.map((x: any) => String(x)) :
    Array.isArray(raw.assets) ? raw.assets.map((a: any) => String(a?.name ?? a?.coreId ?? a?.id ?? "Asset")) :
    [];

  const status = (raw.status ?? "CREATED") as Incident["status"];
  const priority = (raw.priority ?? "LOW") as Incident["priority"];

  const incidentType = String(raw.incidentType ?? raw.type ?? "—");
  const contactMethod = String(raw.contactMethod ?? raw.contact ?? "—");
  const description = String(raw.description ?? "");

  const reportedBy =
    String(raw.reportedBy ?? raw.reportedByName ?? raw.reportedByEmail ?? raw.reportedByUser?.email ?? raw.reportedByUser?.name ?? "—");

  const createdAt = String(raw.createdAt ?? new Date().toISOString());
  const updatedAt = String(raw.updatedAt ?? createdAt);

  if (!id) return null;

  return {
    id,
    incidentNumber,
    clientId: Number.isFinite(clientId) ? clientId : 0,
    clientName,
    buildingId: Number.isFinite(buildingId) ? buildingId : 0,
    buildingName,
    productsAffected,
    status,
    priority,
    incidentType,
    contactMethod,
    description,
    reportedBy,
    createdAt,
    updatedAt,
  };
}

function extractArrayResponse(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export default function ClientDetailPage() {
  const params = useParams();
  const clientIdParam = params?.clientId as string | undefined;
  const clientCoreId = Number(clientIdParam);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [client, setClient] = useState<Client | null>(null);

  // incidents state
  const [incLoading, setIncLoading] = useState(true);
  const [incError, setIncError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [showReportModal, setShowReportModal] = useState(false);

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

        // You currently have GET /v1/clients list, so we find the client by coreId.
        const res = await fetch("http://localhost:3000/v1/clients", {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = (await res.json()) as Client[];
        const found = (Array.isArray(data) ? data : []).find((c) => Number(c.coreId) === clientCoreId);

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

  // Load incidents for this client
  useEffect(() => {
    let alive = true;

    async function loadClientIncidents() {
      if (!clientIdParam || Number.isNaN(clientCoreId)) return;

      try {
        setIncLoading(true);
        setIncError(null);

        // Preferred: /v1/clients/:clientId/incidents
        let res = await fetch(`http://localhost:3000/v1/clients/${clientCoreId}/incidents`, {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });

        // Fallback: /v1/incidents?clientId=...
        if (!res.ok) {
          res = await fetch(`http://localhost:3000/v1/incidents?clientId=${encodeURIComponent(String(clientCoreId))}`, {
            method: "GET",
            credentials: "include",
            cache: "no-store",
          });
        }

        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const data = await res.json();
        const arr = extractArrayResponse(data);

        const normalized = arr
          .map((x: any) => normalizeIncident(x))
          .filter((x: Incident | null): x is Incident => Boolean(x?.id))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        if (!alive) return;
        setIncidents(normalized);
      } catch (e) {
        if (!alive) return;
        setIncError(e instanceof Error ? e.message : "Failed to load incidents");
        setIncidents([]);
      } finally {
        if (!alive) return;
        setIncLoading(false);
      }
    }

    loadClientIncidents();
    return () => {
      alive = false;
    };
  }, [clientIdParam, clientCoreId]);

  const name = useMemo(() => (client ? fullNameOf(client) : ""), [client]);

  function handleReportSuccess() {
    // reload incidents only
    setShowReportModal(false);
    // quick refresh (simple + reliable)
    window.location.reload();
  }

  if (loading) {
    return (
      <div className="w-full">
        <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
            <div className="py-12 text-center text-sm text-zinc-600">Loading client details...</div>
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
              <div className="text-sm font-semibold text-red-900">Error loading client</div>
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

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">{name}</h1>

            <p className="mt-1 text-sm text-zinc-600">
              Payment ID: <span className="font-medium text-zinc-900">{safeText(client.paymentId)}</span>
              <span className="mx-2 text-zinc-300">•</span>
              ID Number: <span className="font-medium text-zinc-900">{safeText(client.idNumber)}</span>
            </p>
          </div>

          {/* Right actions */}
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
              onClick={() => setShowReportModal(true)}
            >
              + Report Incident
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
                <span className="font-medium text-zinc-700">{formatUtcCompact(client.updatedAt)}</span>
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
                        <div className="mt-0.5 text-xs text-zinc-500">Building #{b.coreId}</div>
                      </div>
                      <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">→</span>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <div className="text-sm font-semibold text-emerald-900">Note</div>
              <div className="mt-1 text-xs text-emerald-700">
                Client is locked in incident creation from this page (call center safe).
              </div>
            </div>
          </div>
        </div>

        {/* Incident History */}
        <div className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Incident History</h2>
              <p className="mt-1 text-sm text-zinc-600">All incidents created for this client.</p>
            </div>

            <button
              type="button"
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: BRAND }}
              onClick={() => setShowReportModal(true)}
            >
              + Report Incident
            </button>
          </div>

          {incLoading ? (
            <div className="mt-6 rounded-2xl bg-zinc-50 p-10 text-center ring-1 ring-zinc-200">
              <div className="text-sm text-zinc-600">Loading incidents...</div>
            </div>
          ) : incError ? (
            <div className="mt-6 rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">Error loading incidents</div>
              <div className="mt-1 text-sm text-red-700">{incError}</div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="mt-3 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          ) : incidents.length === 0 ? (
            <div className="mt-6 rounded-2xl bg-zinc-50 p-10 text-center ring-1 ring-zinc-200">
              <div className="mx-auto max-w-sm">
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white ring-1 ring-zinc-200">
                  <IconIncident />
                </div>
                <div className="mt-4 text-sm font-semibold text-zinc-900">No incidents yet</div>
                <div className="mt-1 text-xs text-zinc-600">
                  When issues are reported for this client, they’ll appear here.
                </div>
                <button
                  type="button"
                  className="mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                  style={{ backgroundColor: BRAND }}
                  onClick={() => setShowReportModal(true)}
                >
                  <IconPlus />
                  Report First Incident
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {incidents.map((inc) => (
                <Link
                  key={inc.id}
                  href={`/app/incidents/${inc.id}`}
                  className="group block rounded-3xl bg-white p-5 ring-1 ring-zinc-200 transition hover:bg-emerald-50/50 hover:ring-emerald-300"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-900 group-hover:underline">
                          #{inc.incidentNumber}
                        </div>

                        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(inc.status)}`}>
                          {getStatusLabel(inc.status)}
                        </span>

                        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getPriorityBadge(inc.priority)}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${getPriorityDot(inc.priority)}`} />
                          {inc.priority}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-zinc-600">
                        <span className="font-medium text-zinc-800">{inc.incidentType}</span>
                        <span className="mx-2 text-zinc-300">•</span>
                        Building: <span className="font-medium text-zinc-800">{inc.buildingName}</span>
                      </div>

                      {inc.description ? (
                        <div className="mt-2 line-clamp-2 text-sm text-zinc-700">
                          {inc.description}
                        </div>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center gap-1">
                        {inc.productsAffected.slice(0, 3).map((p, idx) => (
                          <span
                            key={`${inc.id}-p-${idx}`}
                            className="inline-flex items-center rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200"
                          >
                            {p}
                          </span>
                        ))}
                        {inc.productsAffected.length > 3 && (
                          <span className="inline-flex items-center rounded-full bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
                            +{inc.productsAffected.length - 3}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-xs text-zinc-500">Created</div>
                      <div className="mt-0.5 text-xs font-semibold text-zinc-900 tabular-nums">
                        {formatLocalCompact(inc.createdAt)}
                      </div>
                      <div className="mt-1 text-xs text-zinc-500">by {inc.reportedBy}</div>
                      <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900">
                        View <span className="transition-transform group-hover:translate-x-0.5">→</span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Report Incident Modal (CLIENT PRESET + LOCKED) */}
      <ReportIncidentModal
  open={showReportModal}
  onClose={() => setShowReportModal(false)}
  onSuccess={handleReportSuccess}
  presetClient={{
    coreId: client.coreId,
    firstName: client.firstName,
    lastName: client.lastName,
  }}
  lockClient={true}
  allowedBuildingCoreIds={(client.buildings ?? []).map((b) => b.coreId)}
/>
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

function IconIncident() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 9v4M12 17h.01"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
