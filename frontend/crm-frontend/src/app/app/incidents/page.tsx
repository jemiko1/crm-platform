"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import ReportIncidentModal from "./report-incident-modal";
import ModalDialog from "../../modal-dialog";
import IncidentDetailContent from "./incident-detail-content";

const BRAND = "rgb(8, 117, 56)";

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

function getStatusBadge(status: Incident["status"]) {
  const styles = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    WORK_ORDER_INITIATED: "bg-purple-50 text-purple-700 ring-purple-200",
  };
  return styles[status];
}

function getStatusLabel(status: Incident["status"]) {
  const labels = {
    CREATED: "Created",
    IN_PROGRESS: "In Progress",
    COMPLETED: "Completed",
    WORK_ORDER_INITIATED: "Work Order Created",
  };
  return labels[status];
}

function getPriorityBadge(priority: Incident["priority"]) {
  const styles = {
    LOW: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    MEDIUM: "bg-blue-50 text-blue-700 ring-blue-200",
    HIGH: "bg-amber-50 text-amber-700 ring-amber-200",
    CRITICAL: "bg-rose-50 text-rose-700 ring-rose-200",
  };
  return styles[priority];
}

function getPriorityDot(priority: Incident["priority"]) {
  const colors = {
    LOW: "bg-zinc-400",
    MEDIUM: "bg-blue-500",
    HIGH: "bg-amber-500",
    CRITICAL: "bg-rose-500",
  };
  return colors[priority];
}

function safeStr(v: unknown, fallback = "—") {
  if (typeof v === "string") {
    const s = v.trim();
    return s || fallback;
  }
  return fallback;
}

function safeNum(v: unknown, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === "string").map((s) => s.trim()).filter(Boolean);
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

function normalizeIncident(raw: any): Incident {
  // backend may return different shapes; normalize defensively
  const status =
    raw?.status === "CREATED" ||
    raw?.status === "IN_PROGRESS" ||
    raw?.status === "COMPLETED" ||
    raw?.status === "WORK_ORDER_INITIATED"
      ? raw.status
      : "CREATED";

  const priority =
    raw?.priority === "LOW" ||
    raw?.priority === "MEDIUM" ||
    raw?.priority === "HIGH" ||
    raw?.priority === "CRITICAL"
      ? raw.priority
      : "LOW";

  const createdAt = typeof raw?.createdAt === "string" ? raw.createdAt : "";
  const updatedAt = typeof raw?.updatedAt === "string" ? raw.updatedAt : createdAt;

  return {
    id: safeStr(raw?.id, ""),
    incidentNumber: safeStr(raw?.incidentNumber, "—"),
    clientId: safeNum(raw?.clientId, 0),
    clientName: safeStr(raw?.clientName, "—"),
    buildingId: safeNum(raw?.buildingId, 0),
    buildingName: safeStr(raw?.buildingName, "—"),
    productsAffected: safeArr(raw?.productsAffected ?? raw?.assets ?? raw?.products),
    status,
    priority,
    incidentType: safeStr(raw?.incidentType, "—"),
    contactMethod: safeStr(raw?.contactMethod, "—"),
    description: safeStr(raw?.description, ""),
    reportedBy: safeStr(raw?.reportedBy ?? raw?.reportedByName ?? raw?.createdBy, "—"),
    createdAt,
    updatedAt,
  };
}

export default function IncidentsPage() {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Incident["status"] | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<Incident["priority"] | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

  async function loadIncidents() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("http://localhost:3000/v1/incidents", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      // If backend isn't ready yet, avoid hard crash
      if (!res.ok) {
        // Show empty (but not error) for 404/501 etc during development
        setIncidents([]);
        return;
      }

      const data = await res.json();
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setIncidents(arr.map(normalizeIncident).filter((x: any) => x?.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load incidents");
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await loadIncidents();
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let result = [...incidents];

    if (query) {
      result = result.filter((inc) => {
        const hay = [
          inc.incidentNumber,
          inc.clientName,
          inc.buildingName,
          inc.description,
          inc.incidentType,
          inc.reportedBy,
          ...(inc.productsAffected ?? []),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(query);
      });
    }

    if (statusFilter !== "ALL") {
      result = result.filter((inc) => inc.status === statusFilter);
    }

    if (priorityFilter !== "ALL") {
      result = result.filter((inc) => inc.priority === priorityFilter);
    }

    // Sort newest first (safe)
    return result.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [incidents, q, statusFilter, priorityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const statusCounts = useMemo(() => {
    const counts = { CREATED: 0, IN_PROGRESS: 0, COMPLETED: 0, WORK_ORDER_INITIATED: 0 };
    incidents.forEach((inc) => {
      counts[inc.status]++;
    });
    return counts;
  }, [incidents]);

  const priorityCounts = useMemo(() => {
    const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    incidents.forEach((inc) => {
      counts[inc.priority]++;
    });
    return counts;
  }, [incidents]);

  function handleReportSuccess() {
    // Refresh list after creating incident
    loadIncidents();
  }

  function handleStatusChange() {
    // Refresh list after status update
    loadIncidents();
  }

  return (
    <div className="w-full">
      <div className="mx-auto w-full px-4 py-6 md:px-6 md:py-8">
        <div className="mb-6 flex flex-col gap-3 md:mb-8">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              Incidents
            </div>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
              Incident Management
            </h1>
            <p className="mt-1 text-sm text-zinc-600">
              Track and manage customer-reported incidents across all buildings.
            </p>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-zinc-200 md:p-6 overflow-hidden">
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">Loading incidents from API...</div>
          )}

          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">Error loading incidents</div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
              <button
                type="button"
                onClick={() => loadIncidents()}
                className="mt-3 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search incidents by number, client, building, description..."
                  className="w-full max-w-md rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-md ring-2 ring-emerald-500/40 border border-emerald-500/30 hover:ring-emerald-500/60 hover:border-emerald-500/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/70 focus:shadow-lg focus:border-emerald-500/60 transition-all"
                />

                <button
                  type="button"
                  className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                  style={{ backgroundColor: BRAND }}
                  onClick={() => setShowReportModal(true)}
                >
                  + Report Incident
                </button>
              </div>

              <div className="mb-4 flex flex-wrap items-center gap-2">
                <FilterPill
                  label="All Status"
                  count={incidents.length}
                  active={statusFilter === "ALL"}
                  onClick={() => {
                    setStatusFilter("ALL");
                    setPage(1);
                  }}
                  tone="neutral"
                />
                <FilterPill
                  label="Created"
                  count={statusCounts.CREATED}
                  active={statusFilter === "CREATED"}
                  onClick={() => {
                    setStatusFilter("CREATED");
                    setPage(1);
                  }}
                  tone="blue"
                />
                <FilterPill
                  label="In Progress"
                  count={statusCounts.IN_PROGRESS}
                  active={statusFilter === "IN_PROGRESS"}
                  onClick={() => {
                    setStatusFilter("IN_PROGRESS");
                    setPage(1);
                  }}
                  tone="amber"
                />
                <FilterPill
                  label="Completed"
                  count={statusCounts.COMPLETED}
                  active={statusFilter === "COMPLETED"}
                  onClick={() => {
                    setStatusFilter("COMPLETED");
                    setPage(1);
                  }}
                  tone="emerald"
                />
                <FilterPill
                  label="Work Order"
                  count={statusCounts.WORK_ORDER_INITIATED}
                  active={statusFilter === "WORK_ORDER_INITIATED"}
                  onClick={() => {
                    setStatusFilter("WORK_ORDER_INITIATED");
                    setPage(1);
                  }}
                  tone="purple"
                />

                <div className="mx-2 h-6 w-px bg-zinc-200" />

                <FilterPill
                  label="All Priority"
                  count={incidents.length}
                  active={priorityFilter === "ALL"}
                  onClick={() => {
                    setPriorityFilter("ALL");
                    setPage(1);
                  }}
                  tone="neutral"
                />
                <FilterPill
                  label="Critical"
                  count={priorityCounts.CRITICAL}
                  active={priorityFilter === "CRITICAL"}
                  onClick={() => {
                    setPriorityFilter("CRITICAL");
                    setPage(1);
                  }}
                  tone="rose"
                />
                <FilterPill
                  label="High"
                  count={priorityCounts.HIGH}
                  active={priorityFilter === "HIGH"}
                  onClick={() => {
                    setPriorityFilter("HIGH");
                    setPage(1);
                  }}
                  tone="amber"
                />
                <FilterPill
                  label="Medium"
                  count={priorityCounts.MEDIUM}
                  active={priorityFilter === "MEDIUM"}
                  onClick={() => {
                    setPriorityFilter("MEDIUM");
                    setPage(1);
                  }}
                  tone="blue"
                />
              </div>

              <div className="mb-4 text-xs text-zinc-600">
                Showing{" "}
                <span className="font-semibold text-zinc-900 tabular-nums">{filtered.length}</span>{" "}
                of{" "}
                <span className="font-semibold text-zinc-900 tabular-nums">{incidents.length}</span>{" "}
                incidents
              </div>

              {incidents.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-12 text-center ring-1 ring-zinc-200">
                  <div className="mx-auto max-w-sm">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white ring-1 ring-zinc-200">
                      <IconIncident />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-zinc-900">No incidents reported yet</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      When customers report issues, they will appear here.
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
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
                  <div className="text-sm text-zinc-600">No incidents match your filters.</div>
                  <button
                    type="button"
                    className="mt-3 text-xs text-zinc-500 hover:text-zinc-700 underline"
                    onClick={() => {
                      setQ("");
                      setStatusFilter("ALL");
                      setPriorityFilter("ALL");
                      setPage(1);
                    }}
                  >
                    Clear all filters
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-200">
                  <div className="overflow-x-auto">
                    <table className="min-w-[1400px] w-full border-separate border-spacing-0">
                      <colgroup>
                        <col style={{ width: "140px" }} />
                        <col style={{ width: "280px" }} />
                        <col style={{ width: "220px" }} />
                        <col style={{ width: "200px" }} />
                        <col style={{ width: "140px" }} />
                        <col style={{ width: "120px" }} />
                        <col />
                        <col style={{ width: "100px" }} />
                      </colgroup>

                      <thead className="bg-zinc-50">
                        <tr className="text-left text-xs text-zinc-600">
                          <th className="px-4 py-3 font-medium">Incident #</th>
                          <th className="px-4 py-3 font-medium">Client</th>
                          <th className="px-4 py-3 font-medium">Building</th>
                          <th className="px-4 py-3 font-medium">Products Affected</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Priority</th>
                          <th className="px-4 py-3 font-medium">Created</th>
                          <th className="px-4 py-3 font-medium text-right">Actions</th>
                        </tr>
                      </thead>

                      <tbody className="bg-white">
                        {paged.map((incident, index) => {
                          const isLast = index === paged.length - 1;

                          return (
                            <tr
                              key={incident.id}
                              className={[
                                "group transition-all duration-200 ease-out cursor-pointer",
                                "hover:bg-emerald-50/60",
                                "hover:shadow-lg hover:-translate-y-0.5 hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                              onClick={() => setSelectedIncidentId(incident.id)}
                            >
                              <td className="px-4 py-4 align-middle">
                                <div className="block">
                                  <div className="text-sm font-semibold text-zinc-900 underline-offset-2 group-hover:underline">
                                    #{incident.incidentNumber}
                                  </div>
                                  <div className="mt-0.5 text-xs text-zinc-500">
                                    {incident.incidentType}
                                  </div>
                                </div>
                              </td>

                              <td className="px-4 py-4 align-middle">
                                <Link
                                  href={`/app/clients/${incident.clientId}`}
                                  className="block group/client"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-sm font-semibold text-zinc-900 group-hover/client:underline">
                                    {incident.clientName}
                                  </div>
                                  <div className="mt-0.5 text-xs text-zinc-500">
                                    Client #{incident.clientId}
                                  </div>
                                </Link>
                              </td>

                              <td className="px-4 py-4 align-middle">
                                <Link
                                  href={`/app/buildings/${incident.buildingId}`}
                                  className="block group/building"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-sm font-semibold text-zinc-900 group-hover/building:underline">
                                    {incident.buildingName}
                                  </div>
                                  <div className="mt-0.5 text-xs text-zinc-500">
                                    Building #{incident.buildingId}
                                  </div>
                                </Link>
                              </td>

                              <td className="px-4 py-4 align-middle">
                                <div className="flex flex-wrap gap-1">
                                  {(incident.productsAffected ?? []).slice(0, 2).map((prod, i) => (
                                    <span
                                      key={i}
                                      className="inline-flex items-center rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200"
                                    >
                                      {prod}
                                    </span>
                                  ))}
                                  {(incident.productsAffected?.length ?? 0) > 2 && (
                                    <span className="inline-flex items-center rounded-full bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
                                      +{incident.productsAffected.length - 2}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="px-4 py-4 align-middle">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(
                                    incident.status
                                  )}`}
                                >
                                  {getStatusLabel(incident.status)}
                                </span>
                              </td>

                              <td className="px-4 py-4 align-middle">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getPriorityBadge(
                                    incident.priority
                                  )}`}
                                >
                                  <span
                                    className={`h-1.5 w-1.5 rounded-full ${getPriorityDot(
                                      incident.priority
                                    )}`}
                                  />
                                  {incident.priority}
                                </span>
                              </td>

                              <td className="px-4 py-4 align-middle text-sm text-zinc-700">
                                <div className="text-xs">{formatDate(incident.createdAt)}</div>
                                <div className="mt-0.5 text-xs text-zinc-500">by {incident.reportedBy}</div>
                              </td>

                              <td className="px-4 py-4 align-middle text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedIncidentId(incident.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                                >
                                  View
                                  <span className="transition-transform group-hover:translate-x-0.5">→</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

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

      <ReportIncidentModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSuccess={handleReportSuccess}
      />

      <ModalDialog
        open={selectedIncidentId !== null}
        onClose={() => setSelectedIncidentId(null)}
        title="Incident Details"
        maxWidth="4xl"
      >
        {selectedIncidentId && (
          <IncidentDetailContent
            incidentId={selectedIncidentId}
            onStatusChange={handleStatusChange}
          />
        )}
      </ModalDialog>
    </div>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone: "neutral" | "blue" | "amber" | "emerald" | "purple" | "rose";
}) {
  const styles = {
    neutral: active
      ? "bg-zinc-100 text-zinc-900 ring-zinc-300"
      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50",
    blue: active
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-blue-50/60",
    amber: active
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-amber-50/60",
    emerald: active
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-emerald-50/60",
    purple: active
      ? "bg-purple-50 text-purple-700 ring-purple-200"
      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-purple-50/60",
    rose: active
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-rose-50/60",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold ring-1 shadow-sm transition ${styles[tone]}`}
    >
      {label}
      <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-800 ring-1 ring-zinc-200 tabular-nums">
        {count}
      </span>
    </button>
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
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
