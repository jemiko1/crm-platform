"use client";

import ReportIncidentModal from "@/app/app/incidents/report-incident-modal";
import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

const BRAND = "rgb(8, 117, 56)";

type IncidentStatus = "CREATED" | "IN_PROGRESS" | "COMPLETED" | "WORK_ORDER_INITIATED";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type IncidentDetail = {
  id: string;
  incidentNumber: string;

  clientId: number;
  clientName: string;

  buildingId: number;
  buildingName: string;

  assets: { coreId: number; name: string; type?: string | null }[]; // optional on backend; safe to handle empty
  productsAffected?: string[]; // if backend sends strings instead of assets

  status: IncidentStatus;
  priority: Priority;

  incidentType: string;
  contactMethod: string;
  description: string;

  reportedBy: string;

  createdAt: string;
  updatedAt: string;

  workOrderId?: string | null;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function getStatusBadge(status: IncidentStatus) {
  const styles: Record<IncidentStatus, string> = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    WORK_ORDER_INITIATED: "bg-purple-50 text-purple-700 ring-purple-200",
  };
  return styles[status];
}

function getStatusLabel(status: IncidentStatus) {
  const labels: Record<IncidentStatus, string> = {
    CREATED: "Created",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    WORK_ORDER_INITIATED: "Work Order Created",
  };
  return labels[status];
}

function getPriorityBadge(priority: Priority) {
  const styles: Record<Priority, string> = {
    LOW: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    MEDIUM: "bg-blue-50 text-blue-700 ring-blue-200",
    HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
    CRITICAL: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return styles[priority];
}

function getPriorityDot(priority: Priority) {
  const colors: Record<Priority, string> = {
    LOW: "bg-zinc-400",
    MEDIUM: "bg-blue-500",
    HIGH: "bg-amber-500",
    CRITICAL: "bg-rose-500",
  };
  return colors[priority];
}

function normalizeIncidentDetail(raw: any): IncidentDetail {
  // Be defensive: backend might return different shapes during development
  const assetsRaw = Array.isArray(raw?.assets) ? raw.assets : [];
  const productsRaw = Array.isArray(raw?.productsAffected) ? raw.productsAffected : [];

  return {
    id: String(raw?.id ?? ""),
    incidentNumber: String(raw?.incidentNumber ?? raw?.number ?? ""),

    clientId: Number(raw?.clientId ?? raw?.client?.coreId ?? 0),
    clientName: String(raw?.clientName ?? raw?.client?.name ?? raw?.clientFullName ?? "—"),

    buildingId: Number(raw?.buildingId ?? raw?.building?.coreId ?? 0),
    buildingName: String(raw?.buildingName ?? raw?.building?.name ?? "—"),

    assets: assetsRaw
      .map((a: any) => ({
        coreId: Number(a?.coreId ?? a?.id ?? 0),
        name: String(a?.name ?? a?.title ?? "—"),
        type: a?.type ?? null,
      }))
      .filter((a: any) => a.coreId && a.name),

    productsAffected: productsRaw.map((p: any) => String(p)),

    status: (raw?.status ?? "CREATED") as IncidentStatus,
    priority: (raw?.priority ?? "LOW") as Priority,

    incidentType: String(raw?.incidentType ?? "—"),
    contactMethod: String(raw?.contactMethod ?? "—"),
    description: String(raw?.description ?? ""),

    reportedBy: String(raw?.reportedBy ?? raw?.reportedByName ?? raw?.user?.name ?? "—"),

    createdAt: String(raw?.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw?.updatedAt ?? raw?.createdAt ?? new Date().toISOString()),

    workOrderId: raw?.workOrderId ?? raw?.workOrder?.id ?? null,
  };
}

export default function IncidentDetailPage() {
  const params = useParams();
  const router = useRouter();

  const incidentId = (params?.incidentId as string | undefined) ?? "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [incident, setIncident] = useState<IncidentDetail | null>(null);

  async function loadIncident(id: string) {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`http://localhost:3000/v1/incidents/${id}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || `Failed to load incident (${res.status})`);
      }

      const data = await res.json();
      const normalized = normalizeIncidentDetail(data);

      setIncident(normalized);
    } catch (e) {
      setIncident(null);
      setError(e instanceof Error ? e.message : "Failed to load incident");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!incidentId) {
      setLoading(false);
      setError("Missing incident id");
      return;
    }
    void loadIncident(incidentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  const affectedLabels = useMemo(() => {
    if (!incident) return [];
    if (incident.assets?.length) return incident.assets.map((a) => a.name);
    if (incident.productsAffected?.length) return incident.productsAffected;
    return [];
  }, [incident]);

  async function patchStatus(next: IncidentStatus) {
    if (!incident) return;

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`http://localhost:3000/v1/incidents/${incident.id}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || `Failed to update status (${res.status})`);
      }

      // Some backends return updated incident; some return {ok:true}. Handle both.
      const payload = await res.json().catch(() => null);
      if (payload && (payload.id || payload.incidentNumber || payload.status)) {
        setIncident(normalizeIncidentDetail(payload));
      } else {
        await loadIncident(incident.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  async function createWorkOrder() {
    if (!incident) return;

    try {
      setSaving(true);
      setError(null);

      const res = await fetch(`http://localhost:3000/v1/incidents/${incident.id}/work-order`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        throw new Error(msg?.message || `Failed to create work order (${res.status})`);
      }

      const payload = await res.json().catch(() => null);

      // Try to resolve workOrderId + route
      const woId = payload?.workOrderId ?? payload?.workOrder?.id ?? payload?.id ?? null;

      // update incident status locally
      await loadIncident(incident.id);

      if (woId) {
        // If/when you implement work order details route later, this will start working.
        // For now we keep user on incident page.
        // router.push(`/app/work-orders/${woId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create work order");
    } finally {
      setSaving(false);
    }
  }

  const canMarkInProgress = incident?.status === "CREATED";
  const canMarkCompleted = incident?.status === "IN_PROGRESS";
  const canCreateWorkOrder = incident?.status === "IN_PROGRESS";

  return (
    <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        {/* Breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-sm text-zinc-600">
          <Link href="/app/incidents" className="hover:text-zinc-900">
            Incidents
          </Link>
          <span>→</span>
          <span className="text-zinc-900">
            {incident ? `Incident #${incident.incidentNumber}` : "Incident"}
          </span>
        </div>

        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 md:mb-8 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Incident
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              {incident ? `Incident #${incident.incidentNumber}` : "Incident Details"}
            </h1>

            {incident && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(
                    incident.status
                  )}`}
                >
                  {getStatusLabel(incident.status)}
                </span>

                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getPriorityBadge(
                    incident.priority
                  )}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${getPriorityDot(incident.priority)}`} />
                  {incident.priority}
                </span>

                {incident.workOrderId && (
                  <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-800 ring-1 ring-purple-200">
                    Work Order: {incident.workOrderId}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => router.push("/app/incidents")}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              Back
            </button>

            <button
              type="button"
              disabled={!canMarkInProgress || saving}
              onClick={() => patchStatus("IN_PROGRESS")}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
              title={canMarkInProgress ? "Move to In Progress" : "Only available when status is CREATED"}
            >
              Mark In Progress
            </button>

            <button
              type="button"
              disabled={!canMarkCompleted || saving}
              onClick={() => patchStatus("COMPLETED")}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40"
              title={canMarkCompleted ? "Complete this incident" : "Only available when status is IN_PROGRESS"}
            >
              Mark Completed
            </button>

            <button
              type="button"
              disabled={!canCreateWorkOrder || saving}
              onClick={createWorkOrder}
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-40"
              style={{ backgroundColor: BRAND }}
              title={canCreateWorkOrder ? "Create a work order from this incident" : "Only available when status is IN_PROGRESS"}
            >
              Create Work Order
            </button>
          </div>
        </div>

        {/* Main Card */}
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200 overflow-hidden">
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">
              Loading incident details...
            </div>
          )}

          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">Error</div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void loadIncident(incidentId)}
                  className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Retry
                </button>
                <Link
                  href="/app/incidents"
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                >
                  Back to Incidents
                </Link>
              </div>
            </div>
          )}

          {!loading && !error && incident && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left: Incident Details */}
              <div className="lg:col-span-2 space-y-6">
                <section className="rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-200">
                  <div className="text-sm font-semibold text-zinc-900">Incident Details</div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Info label="Incident Type" value={incident.incidentType || "—"} />
                    <Info label="Contact Method" value={incident.contactMethod || "—"} />
                    <Info label="Reported By" value={incident.reportedBy || "—"} />
                    <Info label="Created" value={formatDate(incident.createdAt)} />
                    <Info label="Updated" value={formatDate(incident.updatedAt)} />
                    <Info label="Status" value={getStatusLabel(incident.status)} />
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-zinc-600">Description</div>
                    <div className="mt-1 whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm text-zinc-900 ring-1 ring-zinc-200">
                      {incident.description || "—"}
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-zinc-900">Products Affected</div>
                    <span className="rounded-full bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
                      {affectedLabels.length}
                    </span>
                  </div>

                  {affectedLabels.length === 0 ? (
                    <div className="mt-3 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-600 ring-1 ring-zinc-200">
                      No specific products were selected.
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {affectedLabels.map((name, idx) => (
                        <span
                          key={`${name}-${idx}`}
                          className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200"
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </section>
              </div>

              {/* Right: Related */}
              <div className="space-y-6">
                <section className="rounded-2xl bg-white p-5 ring-1 ring-zinc-200">
                  <div className="text-sm font-semibold text-zinc-900">Related</div>

                  <div className="mt-3 space-y-2">
                    <Link
                      href={`/app/clients/${incident.clientId}`}
                      className="group block rounded-2xl bg-white p-4 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
                    >
                      <div className="text-xs text-zinc-600">Client</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900 group-hover:underline">
                        {incident.clientName || `Client #${incident.clientId}`}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">Client #{incident.clientId}</div>
                    </Link>

                    <Link
                      href={`/app/buildings/${incident.buildingId}`}
                      className="group block rounded-2xl bg-white p-4 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
                    >
                      <div className="text-xs text-zinc-600">Building</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900 group-hover:underline">
                        {incident.buildingName || `Building #${incident.buildingId}`}
                      </div>
                      <div className="mt-0.5 text-xs text-zinc-500">Building #{incident.buildingId}</div>
                    </Link>
                  </div>

                  <div className="mt-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                    <div className="text-sm font-semibold text-emerald-900">Pipeline</div>
                    <div className="mt-1 text-xs text-emerald-700">
                      CREATED → IN_PROGRESS → COMPLETED
                      <br />
                      or IN_PROGRESS → WORK_ORDER_INITIATED
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200">
      <div className="text-xs text-zinc-600">{label}</div>
      <div className="mt-1 text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}
