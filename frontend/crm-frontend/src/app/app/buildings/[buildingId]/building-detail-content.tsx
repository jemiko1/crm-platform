"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { apiGet } from "@/lib/api";
import { usePermissions } from "@/lib/use-permissions";
import { useModalContext } from "../../modal-manager";
import AddDeviceModal from "./add-device-modal";
import AddClientModal from "./add-client-modal";
import EditBuildingModal from "./edit-building-modal";
import ReportIncidentModal from "../../incidents/report-incident-modal";
import CreateWorkOrderModal from "../../work-orders/create-work-order-modal";

const BRAND = "rgb(8, 117, 56)";

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

type Asset = {
  coreId: number;
  type: string;
  name: string;
  ip: string;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  updatedAt: string;
};

type Client = {
  coreId: number;
  firstName: string;
  lastName: string;
  idNumber: string;
  paymentId: string;
  primaryPhone: string;
  secondaryPhone: string;
  updatedAt: string;
};

type Tab = "overview" | "devices" | "clients" | "work-orders" | "incidents" | "product-flow";

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

const ASSET_TYPE_LABELS: Record<string, string> = {
  ELEVATOR: "Elevator",
  ENTRANCE_DOOR: "Entrance Door",
  INTERCOM: "Intercom",
  SMART_GSM_GATE: "Smart GSM Gate",
  SMART_DOOR_GSM: "Smart Door GSM",
  BOOM_BARRIER: "Boom Barrier",
  OTHER: "Other",
};

const TYPE_ORDER = [
  "ELEVATOR",
  "ENTRANCE_DOOR",
  "INTERCOM",
  "SMART_GSM_GATE",
  "SMART_DOOR_GSM",
  "BOOM_BARRIER",
  "OTHER",
];

function typeLabel(type: string) {
  return ASSET_TYPE_LABELS[type] || type;
}

function typeRank(type: string) {
  const idx = TYPE_ORDER.indexOf(type);
  return idx >= 0 ? idx : 999;
}

function getStatusDotColor(status: string) {
  if (status === "ONLINE") return "bg-emerald-500";
  if (status === "OFFLINE") return "bg-rose-500";
  return "bg-zinc-400";
}

function getStatusPill(status: string) {
  if (status === "ONLINE") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "OFFLINE") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-zinc-50 text-zinc-700 ring-zinc-200";
}

type Props = {
  building: Building;
  buildingId: string;
  onUpdate?: () => void;
};

export default function BuildingDetailContent({ building, buildingId, onUpdate }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { openModal } = useModalContext();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [showAddClientModal, setShowAddClientModal] = useState(false);
  const [showEditBuildingModal, setShowEditBuildingModal] = useState(false);
  const [showReportIncidentModal, setShowReportIncidentModal] = useState(false);

  // Handle URL query param for tab
  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab === "devices" || tab === "clients" || tab === "work-orders" || tab === "incidents" || tab === "product-flow") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Fetch assets + clients + incidents
  const fetchData = React.useCallback(async () => {
    if (!buildingId) return;

    try {
      const [assetsData, clientsData, incidentsData] = await Promise.all([
        apiGet<Asset[]>(`/v1/buildings/${buildingId}/assets`, { cache: "no-store" }).catch(() => []),
        apiGet<Client[]>(`/v1/buildings/${buildingId}/clients`, { cache: "no-store" }).catch(() => []),
        apiGet<Incident[]>(`/v1/buildings/${buildingId}/incidents`, { cache: "no-store" }).catch(() => []),
      ]);

      setAssets(assetsData);
      setClients(clientsData);
      setIncidents(Array.isArray(incidentsData) ? incidentsData : Array.isArray((incidentsData as any)?.items) ? (incidentsData as any).items : []);
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  }, [buildingId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Calculate statistics
  const stats = React.useMemo(() => {
    if (!building || !assets) return null;
    const offlineDevices = assets.filter((a) => a.status === "OFFLINE");

    return {
      offlineDevices: offlineDevices.length,
      offlineDevicesList: offlineDevices,
      activeWorkOrders: building.workOrderCount,
    };
  }, [building, assets]);

  // Calculate device counts for Devices tab
  const deviceCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    assets.forEach((asset) => {
      const t = asset.type || "OTHER";
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }, [assets]);

  async function handleDeviceSuccess() {
    await fetchData();
    setShowAddDeviceModal(false);
    setActiveTab("devices");
  }

  async function handleClientSuccess() {
    await fetchData();
    setShowAddClientModal(false);
    setActiveTab("clients");
  }

  // Fetch incidents for this building (force refresh)
  const fetchIncidents = React.useCallback(async () => {
    if (!buildingId) return;

    try {
      setIncidentsLoading(true);

      const data = await apiGet<any>(`/v1/buildings/${buildingId}/incidents`, {
        cache: "no-store",
      });
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setIncidents(arr);
    } catch (err) {
      console.error("Failed to load incidents:", err);
      setIncidents([]);
    } finally {
      setIncidentsLoading(false);
    }
  }, [buildingId]);


  return (
    <div className="p-6 bg-emerald-50/30 rounded-t-3xl lg:rounded-l-3xl lg:rounded-tr-none lg:rounded-br-none">
      {/* Header with Edit Button */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1 text-xs text-zinc-700 ring-1 ring-zinc-200">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
            Building #{building.coreId}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
            {building.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-600">
            {building.city} • {building.address}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowEditBuildingModal(true)}
          className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50"
          title="Edit building"
        >
          <span className="grid h-7 w-7 place-items-center rounded-xl bg-emerald-50 ring-1 ring-emerald-200">
            <IconEditSmall />
          </span>
          Edit
        </button>
      </div>

      {/* Alerts layout: Work Orders LEFT, Offline RIGHT */}
      {stats && (
        <div className="mb-6 grid gap-3 md:grid-cols-2 md:items-start">
          {/* LEFT: Work Orders */}
          <button
            type="button"
            onClick={() => setActiveTab("work-orders")}
            className="group flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-zinc-200 hover:bg-blue-50 hover:ring-blue-300 transition"
          >
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600 ring-1 ring-blue-200">
              <IconWorkOrdersLg />
            </div>
            <div className="min-w-0 text-left">
              <div className="text-xs text-zinc-600">Work Orders</div>
              <div className="text-lg font-semibold text-zinc-900 tabular-nums">
                {stats.activeWorkOrders}
              </div>
            </div>
            <span className="ml-auto text-zinc-400 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </button>

          {/* RIGHT: Offline Alert (only if exists) */}
          <div className="md:justify-self-end">
            {stats.offlineDevices > 0 ? (
              <OfflineDevicesAlert count={stats.offlineDevices} devices={stats.offlineDevicesList} />
            ) : null}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6">
        <div className="flex items-center gap-2 overflow-x-auto">
          <TabButton label="Overview" active={activeTab === "overview"} onClick={() => setActiveTab("overview")} />
          <TabButton
            label={`Devices (${assets.length})`}
            active={activeTab === "devices"}
            onClick={() => setActiveTab("devices")}
          />
          <TabButton
            label={`Clients (${clients.length})`}
            active={activeTab === "clients"}
            onClick={() => setActiveTab("clients")}
          />
          <TabButton
            label={`Work Orders (${building.workOrderCount})`}
            active={activeTab === "work-orders"}
            onClick={() => setActiveTab("work-orders")}
          />
          <TabButton
            label={`Incidents (${incidents.length})`}
            active={activeTab === "incidents"}
            onClick={() => setActiveTab("incidents")}
          />
          <TabButton
            label="Product Flow"
            active={activeTab === "product-flow"}
            onClick={() => setActiveTab("product-flow")}
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        {activeTab === "overview" && <OverviewTab building={building} />}
        {activeTab === "devices" && (
          <DevicesTab
            buildingId={buildingId}
            assets={assets}
            deviceCounts={deviceCounts}
            onAddClick={() => setShowAddDeviceModal(true)}
          />
        )}
        {activeTab === "clients" && <ClientsTab clients={clients} onAddClick={() => setShowAddClientModal(true)} buildingId={buildingId} />}
        {activeTab === "work-orders" && <WorkOrdersTab buildingCoreId={building.coreId} building={building} buildingId={buildingId} onUpdate={onUpdate} />}
        {activeTab === "incidents" && (
          <IncidentsTab
            incidents={incidents}
            loading={incidentsLoading}
            onIncidentClick={(incidentId) => openModal("incident", String(incidentId))}
            onAddClick={() => setShowReportIncidentModal(true)}
            buildingId={buildingId}
          />
        )}
        {activeTab === "product-flow" && <ProductFlowTab buildingCoreId={building.coreId} />}
      </div>

      {/* Modals */}
      <AddDeviceModal
        buildingCoreId={buildingId}
        open={showAddDeviceModal}
        onClose={() => setShowAddDeviceModal(false)}
        onSuccess={handleDeviceSuccess}
      />

      <AddClientModal
        buildingCoreId={buildingId}
        open={showAddClientModal}
        onClose={() => setShowAddClientModal(false)}
        onSuccess={handleClientSuccess}
      />

      <EditBuildingModal
        building={building}
        open={showEditBuildingModal}
        onClose={() => setShowEditBuildingModal(false)}
        onSuccess={() => {
          fetchData();
          setShowEditBuildingModal(false);
          if (onUpdate) onUpdate();
        }}
      />

      <ReportIncidentModal
        open={showReportIncidentModal}
        onClose={() => setShowReportIncidentModal(false)}
        onSuccess={() => {
          fetchData();
          setShowReportIncidentModal(false);
        }}
        presetBuilding={{ coreId: building.coreId, name: building.name, city: building.city, address: building.address }}
        lockBuilding={true}
      />

    </div>
  );
}

/* ========== OFFLINE ALERT ========== */
const OfflineDevicesAlert = React.memo(function OfflineDevicesAlert({ count, devices }: { count: number; devices: Asset[] }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div
      className={[
        "relative w-full md:w-[360px]",
        "flex items-center gap-3",
        "rounded-2xl px-4 py-3",
        "bg-gradient-to-br from-rose-50 via-white to-rose-50",
        "ring-1 ring-rose-200 shadow-sm",
      ].join(" ")}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      role="status"
      aria-label="Offline devices alert"
    >
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-100 text-rose-700 ring-1 ring-rose-200">
        <IconOfflineLg />
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold text-rose-700 uppercase tracking-wide">Alert</div>
          <span className="h-1 w-1 rounded-full bg-rose-300" />
          <div className="text-xs text-zinc-600">Offline devices</div>
        </div>

        <div className="mt-1 flex items-end gap-2">
          <div className="text-lg font-semibold text-zinc-900 tabular-nums">{count}</div>
          <div className="text-xs text-zinc-600">need attention</div>
        </div>
      </div>

      <div className="ml-auto">
        <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
          OFFLINE
        </span>
      </div>

      {/* Tooltip */}
      {showTooltip && devices.length > 0 && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-zinc-200">
          <div className="mb-2 text-xs font-semibold text-zinc-900">Offline Devices ({count})</div>
          <div className="max-h-56 space-y-2 overflow-y-auto">
            {devices.map((device) => (
              <div key={device.coreId} className="rounded-xl bg-zinc-50 p-2 text-xs ring-1 ring-zinc-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-zinc-900">{device.name}</div>
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Offline
                  </span>
                </div>
                <div className="mt-0.5 text-zinc-600">{typeLabel(device.type)}</div>
                {device.ip && <div className="mt-0.5 font-mono text-zinc-500">IP: {device.ip}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

/* ========== TAB BUTTON ========== */
const TabButton = React.memo(function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-2xl px-4 py-2.5 text-sm font-medium transition whitespace-nowrap",
        active ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200" : "text-zinc-600 hover:text-zinc-900 hover:bg-white/50",
      ].join(" ")}
    >
      {label}
    </button>
  );
});

/* ========== OVERVIEW TAB ========== */
function OverviewTab({ building }: { building: Building }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Building Information</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <InfoCard label="Building ID" value={`#${building.coreId}`} icon="🆔" />
          <InfoCard label="Name" value={building.name} icon="🏢" />
          <InfoCard label="City" value={building.city} icon="🌆" />
          <InfoCard label="Address" value={building.address} icon="📍" />
          <InfoCard label="Clients" value={String(building.clientCount)} icon="👥" />
          <InfoCard label="Work Orders" value={String(building.workOrderCount)} icon="📋" />
        </div>
      </div>

      <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
        <div className="text-sm font-semibold text-emerald-900">Core Sync Status</div>
        <div className="mt-1 text-xs text-emerald-700">
          Last synced: {new Date(building.updatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
      <div className="flex items-center gap-2 text-xs text-zinc-600">
        {icon && <span>{icon}</span>}
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-zinc-900">{value}</div>
    </div>
  );
}

/* ========== DEVICES TAB ========== */
function DevicesTab({
  buildingId,
  assets,
  deviceCounts,
  onAddClick,
}: {
  buildingId: string;
  assets: Asset[];
  deviceCounts: Record<string, number>;
  onAddClick: () => void;
}) {
  const { hasPermission } = usePermissions();
  const allTypes = useMemo(() => {
    const keys = Object.keys(deviceCounts);
    return keys.sort((a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b));
  }, [deviceCounts]);

  const [selectedTypes, setSelectedTypes] = useState<Record<string, boolean>>({});
  const [offlineOnly, setOfflineOnly] = useState(false);

  useEffect(() => {
    setSelectedTypes((prev) => {
      const next: Record<string, boolean> = {};
      for (const t of allTypes) next[t] = prev[t] ?? true;
      return next;
    });
  }, [allTypes]);

  const allMarked = allTypes.length > 0 && allTypes.every((t) => selectedTypes[t] !== false);

  function setAll(mark: boolean) {
    const next: Record<string, boolean> = {};
    for (const t of allTypes) next[t] = mark;
    setSelectedTypes(next);
  }

  const filteredAssets = useMemo(() => {
    const list = assets.filter((a) => {
      const t = a.type || "OTHER";
      if (!selectedTypes[t]) return false;
      if (offlineOnly && a.status !== "OFFLINE") return false;
      return true;
    });

    return list.sort((a, b) => {
      const ta = a.type || "OTHER";
      const tb = b.type || "OTHER";
      const r = typeRank(ta) - typeRank(tb);
      if (r !== 0) return r;
      const n = (a.name || "").localeCompare(b.name || "");
      if (n !== 0) return n;
      return a.coreId - b.coreId;
    });
  }, [assets, selectedTypes, offlineOnly]);

  const grouped = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const a of filteredAssets) {
      const t = a.type || "OTHER";
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(a);
    }
    const orderedTypes = Array.from(map.keys()).sort((a, b) => typeRank(a) - typeRank(b) || a.localeCompare(b));
    return orderedTypes.map((t) => ({ type: t, items: map.get(t)! }));
  }, [filteredAssets]);

  const offlineCount = useMemo(() => assets.filter((a) => a.status === "OFFLINE").length, [assets]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-zinc-900">Devices ({assets.length})</h2>
          <div className="mt-1 text-xs text-zinc-600">
            Use filters to show specific device categories. Table is grouped by type.
          </div>
        </div>

        {hasPermission('assets.create') && (
          <button
            type="button"
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: BRAND }}
            onClick={onAddClick}
          >
            + Add Device
          </button>
        )}
      </div>

      <div className="rounded-3xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              label="Mark all"
              count={allTypes.length}
              checked={allMarked}
              onChange={(v) => setAll(v)}
              tone="neutral"
            />

            <FilterPill
              label="Offline"
              count={offlineCount}
              checked={offlineOnly}
              onChange={(v) => setOfflineOnly(v)}
              tone="danger"
            />
          </div>

          <div className="text-xs text-zinc-600">
            Showing <span className="font-semibold text-zinc-900 tabular-nums">{filteredAssets.length}</span> of{" "}
            <span className="font-semibold text-zinc-900 tabular-nums">{assets.length}</span>
          </div>
        </div>

        {allTypes.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {allTypes.map((t) => (
              <FilterPill
                key={t}
                label={typeLabel(t)}
                count={deviceCounts[t] ?? 0}
                checked={selectedTypes[t] !== false}
                onChange={(v) => setSelectedTypes((prev) => ({ ...prev, [t]: v }))}
                tone="brand"
              />
            ))}
          </div>
        )}
      </div>

      {filteredAssets.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">No devices match your filters.</div>
          <div className="mt-2 text-xs text-zinc-500">Try "Mark all", or turn off "Offline" filter.</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-200">
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full border-separate border-spacing-0">
              <thead className="bg-white sticky top-0">
                <tr className="text-left text-xs text-zinc-600 bg-zinc-50">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">IP</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>

              <tbody className="bg-white">
                {grouped.map((g) => (
                  <React.Fragment key={g.type}>
                    <tr>
                      <td colSpan={5} className="px-4 py-3 bg-white">
                        <div className="flex items-center justify-between gap-3">
                          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200">
                            <span className="h-2 w-2 rounded-full bg-zinc-300" />
                            {typeLabel(g.type)}
                          </div>
                          <div className="text-xs text-zinc-500 tabular-nums">{g.items.length} items</div>
                        </div>
                      </td>
                    </tr>

                    {g.items.map((asset) => (
                      <tr key={`${asset.type}-${asset.coreId}`} className="group transition-colors hover:bg-emerald-50/60">
                        <td className="px-4 py-3 align-middle">
                          <div className="text-sm font-semibold text-zinc-900">{asset.name}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">Core ID: {asset.coreId}</div>
                        </td>

                        <td className="px-4 py-3 align-middle">
                          <span className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-zinc-800 ring-1 ring-zinc-200">
                            {typeLabel(asset.type)}
                          </span>
                        </td>

                        <td className="px-4 py-3 align-middle">
                          <span
                            className={[
                              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold",
                              "ring-1",
                              getStatusPill(asset.status),
                            ].join(" ")}
                          >
                            <span className={["h-1.5 w-1.5 rounded-full", getStatusDotColor(asset.status)].join(" ")} />
                            {asset.status}
                          </span>
                        </td>

                        <td className="px-4 py-3 align-middle">
                          <span className="inline-flex items-center rounded-2xl bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200">
                            {asset.ip ? <span className="font-mono tabular-nums">{asset.ip}</span> : <span className="text-zinc-500">—</span>}
                          </span>
                        </td>

                        <td className="px-4 py-3 align-middle">
                          <Link
                            href={`/app/buildings/${buildingId}/assets/${asset.coreId}`}
                            className="inline-flex items-center gap-1 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
                          >
                            View
                            <span className="transition-transform group-hover:translate-x-0.5">→</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const FilterPill = React.memo(function FilterPill({
  label,
  count,
  checked,
  onChange,
  tone,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: (v: boolean) => void;
  tone: "neutral" | "brand" | "danger";
}) {
  const pill =
    tone === "danger"
      ? checked
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : "bg-white text-zinc-700 ring-zinc-200 hover:bg-rose-50/60"
      : tone === "brand"
      ? checked
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : "bg-white text-zinc-700 ring-zinc-200 hover:bg-emerald-50/60"
      : checked
      ? "bg-zinc-100 text-zinc-900 ring-zinc-200"
      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50";

  const box =
    tone === "danger"
      ? checked
        ? "bg-rose-600 ring-rose-700"
        : "bg-white ring-zinc-300"
      : tone === "brand"
      ? checked
        ? "bg-emerald-600 ring-emerald-700"
        : "bg-white ring-zinc-300"
      : checked
      ? "bg-zinc-800 ring-zinc-900"
      : "bg-white ring-zinc-300";

  return (
    <label
      className={["inline-flex items-center gap-2 rounded-2xl px-3 py-2", "ring-1 shadow-sm select-none cursor-pointer transition", pill].join(" ")}
      title={label}
    >
      <span className={["grid h-5 w-5 place-items-center rounded-lg ring-1", box].join(" ")}>
        {checked ? <CheckIcon /> : null}
      </span>
      <span className="text-xs font-semibold">{label}</span>
      <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-zinc-800 ring-1 ring-zinc-200 tabular-nums">
        {count}
      </span>

      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
});

/* ========== CLIENTS TAB ========== */
function ClientsTab({ clients, onAddClick, buildingId }: { clients: Client[]; onAddClick: () => void; buildingId: string }) {
  const { hasPermission } = usePermissions();
  const { openModal } = useModalContext();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Clients ({clients.length})</h2>
        {hasPermission('clients.create') && (
          <button
            type="button"
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: BRAND }}
            onClick={onAddClick}
          >
            + Add Client
          </button>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">No clients yet.</div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-200">
          <table className="w-full border-separate border-spacing-0">
            <thead className="bg-zinc-50">
              <tr className="text-left text-xs text-zinc-600">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">ID Number</th>
                <th className="px-4 py-3 font-medium">Payment ID</th>
                <th className="px-4 py-3 font-medium">Primary Phone</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {clients.map((client) => (
                  <tr
                    key={client.coreId}
                    onClick={() => openModal("client", String(client.coreId))}
                    style={{ cursor: "pointer" }}
                    className="group transition-colors hover:bg-emerald-50/60"
                  >
                    <td className="px-4 py-3 align-middle">
                      <div className="text-sm font-semibold text-zinc-900 group-hover:underline underline-offset-2">
                        {client.firstName} {client.lastName}
                      </div>
                      <div className="text-xs text-zinc-500">ID: {client.coreId}</div>
                    </td>
                    <td className="px-4 py-3 align-middle text-sm text-zinc-700">{client.idNumber}</td>
                    <td className="px-4 py-3 align-middle text-sm text-zinc-700">{client.paymentId}</td>
                    <td className="px-4 py-3 align-middle text-sm text-zinc-700">{client.primaryPhone}</td>
                    <td className="px-4 py-3 align-middle text-right">
                      <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5 inline-block">→</span>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ========== WORK ORDERS TAB ========== */
function WorkOrdersTab({
  buildingCoreId,
  building,
  buildingId,
  onUpdate,
}: {
  buildingCoreId: number;
  building: Building;
  buildingId: string;
  onUpdate?: () => void;
}) {
  const { hasPermission } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchWorkOrders() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          buildingId: String(buildingCoreId),
          page: "1",
          pageSize: "50",
        });

        const data = await apiGet<{ data: any[]; meta: any }>(`/v1/work-orders?${params}`);

        if (!cancelled) {
          setWorkOrders(data.data);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load work orders");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchWorkOrders();

    return () => {
      cancelled = true;
    };
  }, [buildingCoreId]);

  if (!hasPermission('work_orders.read')) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">Work Orders</h2>
        <div className="rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-200 text-center">
          <div className="text-sm font-semibold text-rose-900">Insufficient Permissions</div>
          <div className="mt-1 text-sm text-rose-700">
            You do not have permission to view work orders.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Work Orders</h2>
        {hasPermission('work_orders.create') && (
          <button
            type="button"
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: BRAND }}
            onClick={() => setShowCreateModal(true)}
          >
            + Create Work Order
          </button>
        )}
      </div>

      {loading && (
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">Loading work orders...</div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
          <div className="text-sm text-red-900">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          {workOrders.length === 0 ? (
            <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
              <div className="text-sm text-zinc-600">No work orders found for this building.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {workOrders.map((wo) => {
                const workOrderId = wo.workOrderNumber ?? wo.id;
                if (!workOrderId) return null;
                // Simple URL - browser history handles "back" navigation
                const workOrderUrl = `/app/work-orders?workOrder=${workOrderId}`;
                return (
                  <Link
                    key={wo.id || workOrderId}
                    href={workOrderUrl}
                    className="block rounded-2xl bg-white p-4 ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="text-sm font-semibold text-zinc-900">{wo.title}</div>
                        <div className="mt-1 text-xs text-zinc-500">
                          {wo.type} • {wo.status} • {new Date(wo.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <span className="text-zinc-400">→</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      <CreateWorkOrderModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          if (onUpdate) onUpdate();
        }}
        presetBuilding={{
          coreId: building.coreId,
          name: building.name,
          address: building.address,
          city: building.city,
        }}
        lockBuilding={true}
      />
    </div>
  );
}

/* ========== INCIDENTS TAB ========== */
function IncidentsTab({
  incidents,
  loading,
  onIncidentClick,
  onAddClick,
  buildingId,
}: {
  incidents: Incident[];
  loading: boolean;
  onIncidentClick: (incidentId: string) => void;
  onAddClick: () => void;
  buildingId: string;
}) {
  const { hasPermission } = usePermissions();
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

  if (!hasPermission('incidents.menu')) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">Incidents</h2>
        <div className="rounded-2xl bg-rose-50 p-6 ring-1 ring-rose-200 text-center">
          <div className="text-sm font-semibold text-rose-900">Insufficient Permissions</div>
          <div className="mt-1 text-sm text-rose-700">
            You do not have permission to view incidents.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Incidents ({incidents.length})</h2>
        {hasPermission('incidents.create') && (
          <button
            onClick={onAddClick}
            className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            Report Incident
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">Loading incidents...</div>
        </div>
      ) : incidents.length === 0 ? (
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">No incidents reported for this building yet.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {incidents.map((incident) => {
            // Simple URL - browser history handles "back" navigation (if needed)
            const clientUrl = `/app/clients?client=${incident.clientId}`;
            return (
              <button
                key={incident.id}
                type="button"
                onClick={() => onIncidentClick(incident.id)}
                className="group block w-full text-left rounded-3xl bg-white p-5 ring-1 ring-zinc-200 transition hover:bg-emerald-50/50 hover:ring-emerald-300 cursor-pointer"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm font-semibold text-zinc-900 group-hover:underline">
                        #{incident.incidentNumber}
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(
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
                    </div>

                    <div className="mt-1 text-xs text-zinc-600">
                      <span className="font-medium text-zinc-800">{incident.incidentType}</span>
                      <span className="mx-2 text-zinc-300">•</span>
                      Client:{" "}
                      <Link
                        href={clientUrl}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-emerald-700 hover:underline"
                      >
                        {incident.clientName}
                      </Link>
                    </div>

                  {incident.description ? (
                    <div className="mt-2 line-clamp-2 text-sm text-zinc-700">{incident.description}</div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    {(incident.productsAffected || []).slice(0, 3).map((p, idx) => (
                      <span
                        key={`${incident.id}-p-${idx}`}
                        className="inline-flex items-center rounded-full bg-white px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200"
                      >
                        {p}
                      </span>
                    ))}
                    {(incident.productsAffected?.length ?? 0) > 3 && (
                      <span className="inline-flex items-center rounded-full bg-zinc-50 px-2 py-1 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200">
                        +{incident.productsAffected.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-xs text-zinc-500">Created</div>
                  <div className="mt-0.5 text-xs font-semibold text-zinc-900 tabular-nums">
                    {formatDate(incident.createdAt)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">by {incident.reportedBy}</div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-zinc-900">
                    View <span className="transition-transform group-hover:translate-x-0.5">→</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ========== PRODUCT FLOW TAB ========== */
function ProductFlowTab({ buildingCoreId }: { buildingCoreId: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productUsages, setProductUsages] = useState<Array<{
    id: string;
    workOrderId: string;
    workOrderNumber?: number;
    workOrderTitle: string;
    workOrderType: string;
    workOrderStatus: string;
    productId: string;
    productName: string;
    productSku: string;
    productCategory: string;
    quantity: number;
    approvedAt: string | null;
    approvedBy: string | null;
    devices: Array<{ coreId: number; name: string; type: string }>;
    createdAt: string;
  }>>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchProductUsages() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          buildingId: String(buildingCoreId),
          page: "1",
          pageSize: "1000",
        });

        const workOrdersData = await apiGet<{ data: any[]; meta: any }>(`/v1/work-orders?${params}`);
        const workOrders = workOrdersData.data || [];

        const usagesPromises = workOrders.map(async (wo) => {
          try {
            const workOrderId = wo.workOrderNumber?.toString() || wo.id;
            const detail = await apiGet<any>(`/v1/work-orders/${workOrderId}`);
            
            const approvedUsages = (detail.productUsages || []).filter((pu: any) => pu.isApproved);
            
            const devices: Array<{ coreId: number; name: string; type: string }> = [];
            if (detail.workOrderAssets && detail.workOrderAssets.length > 0) {
              detail.workOrderAssets.forEach((wa: any) => {
                devices.push({
                  coreId: wa.asset.coreId,
                  name: wa.asset.name,
                  type: wa.asset.type,
                });
              });
            } else if (detail.asset) {
              devices.push({
                coreId: detail.asset.coreId,
                name: detail.asset.name,
                type: detail.asset.type,
              });
            }

            return approvedUsages.map((usage: any) => ({
              id: usage.id,
              workOrderId: detail.id,
              workOrderNumber: detail.workOrderNumber,
              workOrderTitle: detail.title,
              workOrderType: detail.type,
              workOrderStatus: detail.status,
              productId: usage.product.id,
              productName: usage.product.name,
              productSku: usage.product.sku,
              productCategory: usage.product.category,
              quantity: usage.quantity,
              approvedAt: usage.approvedAt,
              approvedBy: usage.approvedBy,
              devices,
              createdAt: usage.createdAt,
            }));
          } catch (err) {
            console.error(`Failed to fetch work order ${wo.id}:`, err);
            return [];
          }
        });

        const allUsages = (await Promise.all(usagesPromises)).flat();

        if (!cancelled) {
          setProductUsages(allUsages);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load product usages");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProductUsages();

    return () => {
      cancelled = true;
    };
  }, [buildingCoreId]);

  function formatDate(iso: string | null) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Product Flow</h2>
        <div className="mt-1 text-xs text-zinc-600">
          Approved product usages from work orders assigned to this building
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">Loading product flow data...</div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
          <div className="text-sm text-red-900">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <>
          {productUsages.length === 0 ? (
            <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
              <div className="text-sm text-zinc-600">No approved product usages found for this building.</div>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-gradient-to-br from-emerald-50 via-white to-emerald-50 border-2 border-emerald-200 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 className="text-base font-bold text-zinc-900">Summary</h3>
                  <span className="ml-auto px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                    {productUsages.length} transaction(s)
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white/80 rounded-lg border border-emerald-100 p-4">
                    <div className="text-xs font-semibold text-zinc-500 uppercase mb-1">Total Products Used</div>
                    <div className="text-2xl font-bold text-zinc-900">
                      {productUsages.reduce((sum, u) => sum + u.quantity, 0)}
                    </div>
                  </div>
                  <div className="bg-white/80 rounded-lg border border-emerald-100 p-4">
                    <div className="text-xs font-semibold text-zinc-500 uppercase mb-1">Unique Products</div>
                    <div className="text-2xl font-bold text-zinc-900">
                      {new Set(productUsages.map(u => u.productId)).size}
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-200">
                <div className="overflow-x-auto">
                  <table className="min-w-[1200px] w-full border-separate border-spacing-0">
                    <thead className="bg-zinc-50 sticky top-0">
                      <tr className="text-left text-xs text-zinc-600">
                        <th className="px-4 py-3 font-medium">Work Order</th>
                        <th className="px-4 py-3 font-medium">Device(s)</th>
                        <th className="px-4 py-3 font-medium">Product</th>
                        <th className="px-4 py-3 font-medium">Quantity</th>
                        <th className="px-4 py-3 font-medium">Category</th>
                        <th className="px-4 py-3 font-medium">Approved At</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {productUsages
                        .sort((a, b) => new Date(b.approvedAt || b.createdAt).getTime() - new Date(a.approvedAt || a.createdAt).getTime())
                        .map((usage) => (
                          <tr key={usage.id} className="group transition-colors hover:bg-emerald-50/60">
                            <td className="px-4 py-3 align-middle">
                              <div className="text-sm font-semibold text-zinc-900">{usage.workOrderTitle}</div>
                              <div className="mt-0.5 text-xs text-zinc-500">
                                {usage.workOrderNumber ? `#${usage.workOrderNumber}` : usage.workOrderId.slice(0, 8)}
                                {" • "}
                                {usage.workOrderType}
                              </div>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              {usage.devices.length > 0 ? (
                                <div className="space-y-1">
                                  {usage.devices.map((device) => (
                                    <div key={device.coreId} className="text-xs">
                                      <span className="font-semibold text-zinc-900">{device.name}</span>
                                      <span className="ml-1 text-zinc-500">({device.type})</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-zinc-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <div className="text-sm font-semibold text-zinc-900">{usage.productName}</div>
                              <div className="mt-0.5 text-xs text-zinc-500">SKU: {usage.productSku}</div>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700 ring-1 ring-blue-200">
                                {usage.quantity}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <span className="inline-flex items-center rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 ring-1 ring-purple-200">
                                {usage.productCategory}
                              </span>
                            </td>
                            <td className="px-4 py-3 align-middle">
                              <div className="text-xs text-zinc-600">{formatDate(usage.approvedAt)}</div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ========== ICONS ========== */
function IconEditSmall() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconOfflineLg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IconWorkOrdersLg() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4h6l1 2h3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6h3l1-2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 4a2 2 0 0 0 0 4h6a2 2 0 0 0 0-4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12h6M9 16h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 6 9 17l-5-5"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
