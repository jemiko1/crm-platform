"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

const BRAND = "rgb(8, 117, 56)";

type IncidentDetail = {
  id: string;
  incidentNumber: string;
  status: "CREATED" | "IN_PROGRESS" | "COMPLETED" | "WORK_ORDER_INITIATED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  incidentType: string;
  contactMethod: string;
  description: string;
  reportedBy: string;
  createdAt: string;
  updatedAt: string;
  client: {
    coreId: number;
    firstName: string;
    lastName: string;
    primaryPhone: string;
  };
  building: {
    coreId: number;
    name: string;
    address: string;
    city: string;
  };
  assets: Array<{
    coreId: number;
    name: string;
    type: string;
  }>;
};

type IncidentDetailContentProps = {
  incidentId: string;
  onStatusChange?: () => void;
};

function getStatusBadge(status: IncidentDetail["status"]) {
  const styles = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    WORK_ORDER_INITIATED: "bg-purple-50 text-purple-700 ring-purple-200",
  };
  return styles[status];
}

function getStatusLabel(status: IncidentDetail["status"]) {
  const labels = {
    CREATED: "Created",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    WORK_ORDER_INITIATED: "Work Order Created",
  };
  return labels[status];
}

function getPriorityBadge(priority: IncidentDetail["priority"]) {
  const styles = {
    LOW: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    MEDIUM: "bg-blue-50 text-blue-700 ring-blue-200",
    HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
    CRITICAL: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return styles[priority];
}

function getPriorityDot(priority: IncidentDetail["priority"]) {
  const colors = {
    LOW: "bg-zinc-400",
    MEDIUM: "bg-blue-500",
    HIGH: "bg-amber-500",
    CRITICAL: "bg-rose-500",
  };
  return colors[priority];
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export default function IncidentDetailContent({
  incidentId,
  onStatusChange,
}: IncidentDetailContentProps) {
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  async function loadIncident() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`http://localhost:3000/v1/incidents/${incidentId}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Failed to load incident: ${res.status}`);
      }

      const data = await res.json();
      setIncident(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load incident");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadIncident();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  async function updateStatus(newStatus: IncidentDetail["status"]) {
    if (!incident) return;

    try {
      setUpdating(true);

      const res = await fetch(`http://localhost:3000/v1/incidents/${incidentId}/status`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        throw new Error(`Failed to update status: ${res.status}`);
      }

      const updated = await res.json();
      setIncident(updated);
      onStatusChange?.();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-sm text-zinc-600">Loading incident details...</div>
    );
  }

  if (error || !incident) {
    return (
      <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
        <div className="text-sm font-semibold text-red-900">Error loading incident</div>
        <div className="mt-1 text-sm text-red-700">{error || "Incident not found"}</div>
        <button
          type="button"
          onClick={loadIncident}
          className="mt-3 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold text-zinc-900">#{incident.incidentNumber}</div>
            <div className="mt-1 text-sm text-zinc-600">{incident.incidentType}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${getStatusBadge(
                incident.status
              )}`}
            >
              {getStatusLabel(incident.status)}
            </span>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${getPriorityBadge(
                incident.priority
              )}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${getPriorityDot(incident.priority)}`} />
              {incident.priority}
            </span>
          </div>
        </div>

        <div className="text-xs text-zinc-500">
          Reported by <span className="font-semibold text-zinc-700">{incident.reportedBy}</span> on{" "}
          {formatDate(incident.createdAt)}
        </div>
      </div>

      {/* Description */}
      <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Description
        </div>
        <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-800">
          {incident.description || "No description provided."}
        </div>
      </div>

      {/* Products Affected */}
      {incident.assets && incident.assets.length > 0 && (
        <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Products Affected
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {incident.assets.map((asset, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-zinc-200"
              >
                <div>
                  <div className="font-semibold text-zinc-900">{asset.name}</div>
                  <div className="text-xs text-zinc-500">
                    {asset.type} • #{asset.coreId}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client & Building Info */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Client */}
        <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">Client</div>
          <Link
            href={`/app/clients/${incident.client.coreId}`}
            className="mt-2 block group hover:opacity-80 transition"
          >
            <div className="text-sm font-semibold text-zinc-900 group-hover:underline">
              {incident.client.firstName} {incident.client.lastName}
            </div>
            <div className="mt-1 text-xs text-zinc-600">Client #{incident.client.coreId}</div>
            <div className="mt-1 text-xs text-zinc-500">{incident.client.primaryPhone}</div>
          </Link>
        </div>

        {/* Building */}
        <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
            Building
          </div>
          <Link
            href={`/app/buildings/${incident.building.coreId}`}
            className="mt-2 block group hover:opacity-80 transition"
          >
            <div className="text-sm font-semibold text-zinc-900 group-hover:underline">
              {incident.building.name}
            </div>
            <div className="mt-1 text-xs text-zinc-600">Building #{incident.building.coreId}</div>
            <div className="mt-1 text-xs text-zinc-500">
              {incident.building.address && incident.building.city
                ? `${incident.building.address}, ${incident.building.city}`
                : incident.building.address || incident.building.city || "—"}
            </div>
          </Link>
        </div>
      </div>

      {/* Contact Method */}
      <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Contact Method
        </div>
        <div className="mt-2 text-sm text-zinc-800">{incident.contactMethod}</div>
      </div>

      {/* Status Actions */}
      <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50/50 p-4">
        <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Update Status
        </div>
        <div className="flex flex-wrap gap-2">
          {incident.status === "CREATED" && (
            <button
              type="button"
              onClick={() => updateStatus("IN_PROGRESS")}
              disabled={updating}
              className="rounded-2xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
            >
              Mark In Progress
            </button>
          )}

          {(incident.status === "CREATED" || incident.status === "IN_PROGRESS") && (
            <>
              <button
                type="button"
                onClick={() => updateStatus("COMPLETED")}
                disabled={updating}
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Mark Completed
              </button>
              <button
                type="button"
                onClick={() => updateStatus("WORK_ORDER_INITIATED")}
                disabled={updating}
                className="rounded-2xl px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                Create Work Order
              </button>
            </>
          )}

          {incident.status === "COMPLETED" && (
            <div className="text-sm text-emerald-700">
              ✓ This incident has been marked as completed.
            </div>
          )}

          {incident.status === "WORK_ORDER_INITIATED" && (
            <div className="text-sm text-purple-700">
              ✓ A work order has been created for this incident.
            </div>
          )}
        </div>
      </div>

      {/* Timestamps */}
      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <div>
          Created: <span className="font-semibold text-zinc-700">{formatDate(incident.createdAt)}</span>
        </div>
        <div>•</div>
        <div>
          Updated: <span className="font-semibold text-zinc-700">{formatDate(incident.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
