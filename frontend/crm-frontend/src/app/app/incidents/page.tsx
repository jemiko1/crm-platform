"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { apiGet } from "@/lib/api";
import ReportIncidentModal from "./report-incident-modal";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import { useModalContext } from "../modal-manager";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(0, 86, 83)";

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
  reportedByEmployeeId?: string | null;
  createdAt: string;
  updatedAt: string;
};

function getStatusBadge(status: Incident["status"]) {
  const styles = {
    CREATED: "bg-blue-50 text-blue-700 ring-blue-200",
    IN_PROGRESS: "bg-amber-50 text-amber-700 ring-amber-200",
    COMPLETED: "bg-teal-50 text-teal-800 ring-teal-200",
    WORK_ORDER_INITIATED: "bg-purple-50 text-purple-700 ring-purple-200",
  };
  return styles[status];
}

function getStatusLabel(status: Incident["status"], t: (key: string, fallback: string) => string) {
  const labels = {
    CREATED: t("incidents.statusFilters.created", "Created"),
    IN_PROGRESS: t("incidents.statusFilters.inProgress", "In Progress"),
    COMPLETED: t("incidents.statusFilters.completed", "Completed"),
    WORK_ORDER_INITIATED: t("incidents.statusFilters.workOrderCreated", "Work Order Created"),
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

function StatusProgressBar({ status, t }: { status: Incident["status"]; t: (key: string, fallback: string) => string }) {
  const stages: Array<{ key: Incident["status"]; label: string; color: string }> = [
    { key: "CREATED", label: t("incidents.statusFilters.created", "Created"), color: "bg-blue-500" },
    { key: "IN_PROGRESS", label: t("incidents.statusFilters.inProgress", "In Progress"), color: "bg-amber-500" },
    { key: "COMPLETED", label: t("incidents.statusFilters.completed", "Completed"), color: "bg-emerald-500" },
    { key: "WORK_ORDER_INITIATED", label: t("incidents.statusFilters.workOrder", "Work Order"), color: "bg-purple-500" },
  ];

  const currentIndex = stages.findIndex((s) => s.key === status);
  const currentStage = stages[currentIndex] || stages[0];

  return (
    <div className="flex flex-col gap-2">
      {/* Progress Bar */}
      <div className="relative flex h-2 w-full items-center rounded-full bg-zinc-200">
        {stages.map((stage, index) => {
          const isActive = index <= currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <div
              key={stage.key}
              className={`h-full flex-1 rounded-full transition-all ${
                isActive ? stage.color : "bg-zinc-200"
              } ${isCurrent ? "ring-2 ring-offset-1 ring-offset-white ring-zinc-300" : ""}`}
              style={{
                marginRight: index < stages.length - 1 ? "2px" : "0",
              }}
            />
          );
        })}
      </div>

      {/* Stage Labels */}
      <div className="flex items-center justify-between gap-1">
        {stages.map((stage, index) => {
          const isActive = index <= currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <div
              key={stage.key}
              className={`flex-1 text-center text-[10px] font-semibold transition-all ${
                isCurrent
                  ? "text-zinc-900"
                  : isActive
                  ? "text-zinc-600"
                  : "text-zinc-400"
              }`}
            >
              <div
                className={`mx-auto mb-0.5 h-1.5 w-1.5 rounded-full ${
                  isCurrent ? stage.color : isActive ? "bg-zinc-400" : "bg-zinc-300"
                }`}
              />
              <div className="truncate">{stage.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
    reportedByEmployeeId: raw?.reportedByEmployeeId ?? null,
    createdAt,
    updatedAt,
  };
}

export default function IncidentsPage() {
  const { t } = useI18n();
  const { hasPermission } = usePermissions();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Incident["status"] | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<Incident["priority"] | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  const [showReportModal, setShowReportModal] = useState(false);

  async function loadIncidents() {
    try {
      setLoading(true);
      setError(null);

      const data = await apiGet<any>("/v1/incidents", {
        cache: "no-store",
      });
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

  const { openModal } = useModalContext();

  function openIncidentModal(incidentId: string) {
    openModal("incident", incidentId);
  }

  return (
    <PermissionGuard permission="incidents.menu">
      <div className="w-full">
      <div className="mx-auto w-full px-2 py-4 md:px-6 md:py-8">
        <div className="mb-3 flex flex-col gap-2 md:mb-8 md:gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
              {t("incidents.badge", "Incidents")}
            </div>

            <h1 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 md:mt-3 md:text-3xl">
              {t("incidents.title", "Incident Management")}
            </h1>
            <p className="mt-0.5 text-xs leading-snug text-zinc-600 md:mt-1 md:text-sm md:leading-normal">
              {t("incidents.description", "Track and manage customer-reported incidents across all buildings.")}
            </p>
          </div>
        </div>

        <div className="rounded-none bg-transparent p-0 shadow-none ring-0 md:rounded-3xl md:bg-white md:p-6 md:shadow-sm md:ring-1 md:ring-zinc-200">
          {loading && (
            <div className="py-12 text-center text-sm text-zinc-600">{t("incidents.loading", "Loading incidents from API...")}</div>
          )}

          {error && !loading && (
            <div className="rounded-2xl bg-red-50 p-6 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">{t("incidents.errorLoading", "Error loading incidents")}</div>
              <div className="mt-1 text-sm text-red-700">{error}</div>
              <button
                type="button"
                onClick={() => loadIncidents()}
                className="mt-3 rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {t("common.retry", "Retry")}
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              <div className="mb-3 flex flex-col gap-2 md:mb-4 md:flex-row md:items-center md:justify-between md:gap-3">
                <input
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setPage(1);
                  }}
                  placeholder={t("incidents.searchPlaceholder", "Search incidents by number, client, building, description...")}
                  className="w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 shadow-sm ring-2 ring-teal-500/40 border border-teal-500/30 hover:ring-teal-500/60 hover:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/70 focus:border-teal-500/60 transition-all md:max-w-md md:rounded-2xl md:px-4 md:py-2.5 md:shadow-md"
                />

                {hasPermission("incidents.create") && (
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 md:w-auto md:rounded-2xl md:px-4 md:py-2.5"
                    style={{ backgroundColor: BRAND }}
                    onClick={() => setShowReportModal(true)}
                  >
                    + {t("incidents.reportIncident", "Report Incident")}
                  </button>
                )}
              </div>

              <div className="-mx-2 mb-3 flex flex-nowrap items-center gap-2 overflow-x-auto overflow-y-hidden px-2 pb-1 [-webkit-overflow-scrolling:touch] md:mx-0 md:mb-4 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
                <FilterPill
                  label={t("incidents.statusFilters.all", "All Status")}
                  count={incidents.length}
                  active={statusFilter === "ALL"}
                  onClick={() => {
                    setStatusFilter("ALL");
                    setPage(1);
                  }}
                  tone="neutral"
                />
                <FilterPill
                  label={t("incidents.statusFilters.created", "Created")}
                  count={statusCounts.CREATED}
                  active={statusFilter === "CREATED"}
                  onClick={() => {
                    setStatusFilter("CREATED");
                    setPage(1);
                  }}
                  tone="blue"
                />
                <FilterPill
                  label={t("incidents.statusFilters.inProgress", "In Progress")}
                  count={statusCounts.IN_PROGRESS}
                  active={statusFilter === "IN_PROGRESS"}
                  onClick={() => {
                    setStatusFilter("IN_PROGRESS");
                    setPage(1);
                  }}
                  tone="amber"
                />
                <FilterPill
                  label={t("incidents.statusFilters.completed", "Completed")}
                  count={statusCounts.COMPLETED}
                  active={statusFilter === "COMPLETED"}
                  onClick={() => {
                    setStatusFilter("COMPLETED");
                    setPage(1);
                  }}
                  tone="emerald"
                />
                <FilterPill
                  label={t("incidents.statusFilters.workOrder", "Work Order")}
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
                  label={t("incidents.priorityFilters.all", "All Priority")}
                  count={incidents.length}
                  active={priorityFilter === "ALL"}
                  onClick={() => {
                    setPriorityFilter("ALL");
                    setPage(1);
                  }}
                  tone="neutral"
                />
                <FilterPill
                  label={t("incidents.priorityFilters.critical", "Critical")}
                  count={priorityCounts.CRITICAL}
                  active={priorityFilter === "CRITICAL"}
                  onClick={() => {
                    setPriorityFilter("CRITICAL");
                    setPage(1);
                  }}
                  tone="rose"
                />
                <FilterPill
                  label={t("incidents.priorityFilters.high", "High")}
                  count={priorityCounts.HIGH}
                  active={priorityFilter === "HIGH"}
                  onClick={() => {
                    setPriorityFilter("HIGH");
                    setPage(1);
                  }}
                  tone="amber"
                />
                <FilterPill
                  label={t("incidents.priorityFilters.medium", "Medium")}
                  count={priorityCounts.MEDIUM}
                  active={priorityFilter === "MEDIUM"}
                  onClick={() => {
                    setPriorityFilter("MEDIUM");
                    setPage(1);
                  }}
                  tone="blue"
                />
              </div>

              <div className="mb-3 text-[11px] text-zinc-600 md:mb-4 md:text-xs">
                {t("incidents.showing", "Showing")}{" "}
                <span className="font-semibold text-zinc-900 tabular-nums">{filtered.length}</span>{" "}
                {t("incidents.of", "of")}{" "}
                <span className="font-semibold text-zinc-900 tabular-nums">{incidents.length}</span>{" "}
                {t("incidents.incidents", "incidents")}
              </div>

              {incidents.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-12 text-center ring-1 ring-zinc-200">
                  <div className="mx-auto max-w-sm">
                    <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white ring-1 ring-zinc-200">
                      <IconIncident />
                    </div>
                    <div className="mt-4 text-sm font-semibold text-zinc-900">{t("incidents.noIncidents", "No incidents reported yet")}</div>
                    <div className="mt-1 text-xs text-zinc-600">
                      {t("incidents.noIncidentsDescription", "When customers report issues, they will appear here.")}
                    </div>
                      {hasPermission("incidents.create") && (
                        <button
                          type="button"
                          className="mt-5 inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                          style={{ backgroundColor: BRAND }}
                          onClick={() => setShowReportModal(true)}
                        >
                          <IconPlus />
                          {t("incidents.reportFirstIncident", "Report First Incident")}
                        </button>
                      )}
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
                  <div className="text-sm text-zinc-600">{t("incidents.noMatch", "No incidents match your filters.")}</div>
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
                    {t("incidents.clearFilters", "Clear all filters")}
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-visible rounded-none ring-0 md:overflow-clip md:rounded-2xl md:ring-1 md:ring-zinc-200">
                  <div>
                    <table className="min-w-[1600px] w-full border-separate border-spacing-0">
                      <colgroup>
                        <col style={{ width: "340px" }} />
                        <col style={{ width: "200px" }} />
                        <col style={{ width: "200px" }} />
                        <col style={{ width: "220px" }} />
                        <col style={{ width: "280px" }} />
                        <col style={{ width: "160px" }} />
                        <col style={{ width: "120px" }} />
                        <col style={{ width: "180px" }} />
                        <col style={{ width: "100px" }} />
                      </colgroup>

                      <thead className="bg-zinc-50 relative z-10 shadow-[0_1px_0_rgba(0,0,0,0.08)] md:sticky md:top-[52px] md:z-20">
                        <tr className="text-left text-[11px] text-zinc-600 md:text-xs">
                          <th className="px-2 py-2 font-medium bg-zinc-50 md:px-5 md:py-3">{t("incidents.columns.incidentNumber", "Incident #")}</th>
                          <th className="px-2 py-2 font-medium border-l border-zinc-200 bg-zinc-50 md:px-4 md:py-3">{t("incidents.columns.status", "Status")}</th>
                          <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("incidents.columns.productsAffected", "Products Affected")}</th>
                          <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("incidents.columns.building", "Building")}</th>
                          <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("incidents.columns.client", "Client")}</th>
                          <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("incidents.columns.createdOn", "Created On")}</th>
                          <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("incidents.columns.priority", "Priority")}</th>
                          <th className="px-2 py-2 font-medium bg-zinc-50 md:px-4 md:py-3">{t("incidents.columns.createdBy", "Created By")}</th>
                          <th className="px-2 py-2 font-medium text-right bg-zinc-50 md:px-4 md:py-3">{t("incidents.columns.actions", "Actions")}</th>
                        </tr>
                      </thead>

                      <tbody className="bg-white">
                        {paged.map((incident, index) => {
                          const isLast = index === paged.length - 1;

                          return (
                            <tr
                              key={incident.id}
                              className={[
                                "group cursor-pointer transition-colors duration-200 ease-out",
                                "hover:bg-teal-50/60",
                                "md:hover:shadow-lg md:hover:-translate-y-0.5 md:hover:z-10",
                                !isLast && "border-b border-zinc-100",
                              ].join(" ")}
                              onClick={() => openIncidentModal(incident.id)}
                            >
                              {/* Incident # */}
                              <td className="px-2 py-2 align-middle md:px-5 md:py-4">
                                <div className="flex items-center justify-between gap-2 md:gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold leading-snug text-zinc-900 underline-offset-2 group-hover:underline md:text-[15px]">
                                      #{incident.incidentNumber}
                                    </div>
                                    <div className="mt-0.5 truncate text-[12px] leading-snug text-zinc-500 md:mt-1 md:text-xs">
                                      {incident.incidentType}
                                    </div>
                                  </div>
                                  <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">
                                    →
                                  </span>
                                </div>
                              </td>

                              {/* Status - Progress Bar */}
                              <td className="px-2 py-2 align-middle border-l border-zinc-200 md:px-4 md:py-4">
                                <StatusProgressBar status={incident.status} t={t} />
                              </td>

                              {/* Products Affected */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
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

                              {/* Building */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <Link
                                  href={`/app/buildings?building=${incident.buildingId}`}
                                  className="block group/building"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-sm font-semibold text-zinc-900 group-hover/building:underline">
                                    {incident.buildingName}
                                  </div>
                                  <div className="mt-0.5 text-xs text-zinc-500">
                                    {t("incidents.buildingNumber", "Building #")}{incident.buildingId}
                                  </div>
                                </Link>
                              </td>

                              {/* Client */}
                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                <Link
                                  href={`/app/clients?client=${incident.clientId}`}
                                  className="block group/client"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="text-sm font-semibold text-zinc-900 group-hover/client:underline">
                                    {incident.clientName}
                                  </div>
                                  <div className="mt-0.5 text-xs text-zinc-500">
                                    {t("incidents.clientNumber", "Client #")}{incident.clientId}
                                  </div>
                                </Link>
                              </td>

                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
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

                              <td className="px-2 py-2 align-middle text-sm text-zinc-700 md:px-4 md:py-4">
                                <div className="text-xs">{formatDate(incident.createdAt)}</div>
                              </td>

                              <td className="px-2 py-2 align-middle md:px-4 md:py-4">
                                {incident.reportedByEmployeeId ? (
                                  <Link
                                    href={`/app/employees?employee=${incident.reportedByEmployeeId}`}
                                    className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 ring-1 ring-teal-200 hover:bg-teal-100 hover:ring-teal-300 transition-all"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                      <circle cx="12" cy="7" r="4" />
                                    </svg>
                                    {incident.reportedBy}
                                  </Link>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">
                                    {incident.reportedBy}
                                  </span>
                                )}
                              </td>

                              <td className="px-2 py-2 align-middle text-right md:px-4 md:py-4">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openIncidentModal(incident.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-1.5 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                                >
                                  {t("common.viewDetails", "View Details")}
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
                <div className="mt-3 flex flex-col gap-2 pb-1 md:mt-5 md:flex-row md:items-center md:justify-between md:gap-3">
                  <div className="text-[11px] text-zinc-600 md:text-xs">
                    {t("incidents.page", "Page")} <span className="font-semibold text-zinc-900">{safePage}</span> {t("incidents.of", "of")}{" "}
                    <span className="font-semibold text-zinc-900">{totalPages}</span>
                  </div>

                  <div className="flex items-center gap-1.5 md:gap-2">
                    <button
                      type="button"
                      className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-40 md:rounded-2xl md:px-3 md:py-2 md:text-sm md:shadow-sm"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      {t("common.prev", "Prev")}
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

      <ReportIncidentModal
        open={showReportModal}
        onClose={() => setShowReportModal(false)}
        onSuccess={handleReportSuccess}
      />

    </div>
    </PermissionGuard>
  );
}

const FilterPill = React.memo(function FilterPill({
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
      ? "bg-teal-50 text-teal-900 ring-teal-200"
      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-teal-50/60",
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
      className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] font-semibold ring-1 shadow-sm transition md:rounded-2xl md:px-3 md:py-2 md:text-xs ${styles[tone]}`}
    >
      {label}
      <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-800 ring-1 ring-zinc-200 tabular-nums">
        {count}
      </span>
    </button>
  );
});

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
