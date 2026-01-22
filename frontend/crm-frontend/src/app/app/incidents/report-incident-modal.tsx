"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useListItems } from "@/hooks/useListItems";

const BRAND = "rgb(8, 117, 56)";

type Building = {
  coreId: number;
  name: string;
  address: string;
  city: string;
};

type Client = {
  coreId: number;
  firstName: string | null;
  lastName: string | null;
};

type Asset = {
  coreId: number;
  type: string;
  name: string;
};

type IncidentFormData = {
  buildingId: number | null;
  clientId: number | null;
  productIds: number[];
  contactMethod: "PHONE" | "EMAIL" | "IN_PERSON" | "OTHER" | null;
  incidentType: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  description: string;
};

export default function ReportIncidentModal({
  open,
  onClose,
  onSuccess,

  // When opened from Client page:
  presetClient,
  lockClient,
  allowedBuildingCoreIds,

  // When opened from Building detail page:
  presetBuilding,
  lockBuilding,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;

  presetClient?: Client;
  lockClient?: boolean;
  allowedBuildingCoreIds?: number[];

  presetBuilding?: Building;
  lockBuilding?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  const isClientLocked = Boolean(lockClient && presetClient);
  const isBuildingLocked = Boolean(lockBuilding && presetBuilding);

  // Fetch dynamic list items
  const { items: contactMethods, loading: loadingContactMethods } = useListItems("CONTACT_METHOD", open);
  const { items: incidentTypes, loading: loadingIncidentTypes } = useListItems("INCIDENT_TYPE", open);
  const { items: priorities, loading: loadingPriorities } = useListItems("INCIDENT_PRIORITY", open);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Steps:
  // - Normal: 1 Building → 2 Client → 3 Devices → 4 Details
  // - Client-locked: 1 Building → 3 Devices → 4 Details
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingSearch, setBuildingSearch] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  const [buildingClients, setBuildingClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const [buildingAssets, setBuildingAssets] = useState<Asset[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);

  const [formData, setFormData] = useState<IncidentFormData>({
    buildingId: null,
    clientId: null,
    productIds: [],
    contactMethod: null,
    incidentType: null,
    priority: null,
    description: "",
  });

  function fullNameOf(c: Client) {
    const fn = (c.firstName ?? "").trim();
    const ln = (c.lastName ?? "").trim();
    const full = `${fn} ${ln}`.trim();
    return full || `Client #${c.coreId}`;
  }

  const allowedBuildingSet = useMemo(() => {
    const ids = Array.isArray(allowedBuildingCoreIds) ? allowedBuildingCoreIds : [];
    return new Set(ids.filter((n) => Number.isFinite(n)));
  }, [allowedBuildingCoreIds]);

  const hasBuildingRestriction = isClientLocked && allowedBuildingSet.size > 0;

  const totalSteps = isClientLocked ? 3 : 4;

  function visibleStepNumber() {
    if (!isClientLocked) return step;
    if (step === 1) return 1;
    if (step === 3) return 2;
    return 3;
  }

  function stepLabel(s: 1 | 2 | 3 | 4) {
    if (isClientLocked) {
      if (s === 1) return "Select Building";
      if (s === 3) return "Select Devices";
      return "Incident Details";
    }
    if (s === 1) return "Select Building";
    if (s === 2) return "Select Client";
    if (s === 3) return "Select Devices";
    return "Incident Details";
  }

  // Initialize on open
  useEffect(() => {
    if (!open) return;

    // Start clean each open
    setStep(isBuildingLocked ? 2 : 1); // Skip building step if building is locked
    setError(null);

    // If building locked, preset it
    if (isBuildingLocked && presetBuilding) {
      setSelectedBuilding(presetBuilding);
      setBuildingSearch(`${presetBuilding.name} - ${presetBuilding.city}`);
      setFormData((prev) => ({ ...prev, buildingId: presetBuilding.coreId }));
    } else {
      setSelectedBuilding(null);
      setBuildingSearch("");
      setFormData((prev) => ({ ...prev, buildingId: null }));
    }

    // If client locked, preset it
    if (isClientLocked && presetClient) {
      setSelectedClient(presetClient);
      setClientSearch(fullNameOf(presetClient));
      setFormData((prev) => ({ ...prev, clientId: presetClient.coreId }));
    } else {
      setSelectedClient(null);
      setClientSearch("");
      setFormData((prev) => ({ ...prev, clientId: null }));
    }
  }, [open, isClientLocked, presetClient, isBuildingLocked, presetBuilding]);

  // Fetch buildings on open
  useEffect(() => {
    if (!open) return;

    let alive = true;

    async function loadBuildings() {
      try {
        const res = await fetch("http://localhost:3000/v1/buildings", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to fetch buildings");

        const data = await res.json();
        const all: Building[] = Array.isArray(data) ? data : [];

        const filtered = hasBuildingRestriction
          ? all.filter((b) => allowedBuildingSet.has(Number(b.coreId)))
          : all;

        if (!alive) return;
        setBuildings(filtered);

        // If client-locked and only 1 allowed building => auto-select and skip to products
        if (isClientLocked && filtered.length === 1) {
          const only = filtered[0];
          setSelectedBuilding(only);
          setBuildingSearch(`${only.name} - ${only.city}`);
          setFormData((prev) => ({ ...prev, buildingId: only.coreId }));
          setStep(3);
        }
      } catch (e) {
        if (!alive) return;
        console.error("Failed to load buildings:", e);
        setBuildings([]);
      }
    }

    loadBuildings();
    return () => {
      alive = false;
    };
  }, [open, hasBuildingRestriction, allowedBuildingSet, isClientLocked]);

  // Fetch clients when building selected (only when client is NOT locked)
  useEffect(() => {
    if (!selectedBuilding) return;
    if (isClientLocked) return;

    const b = selectedBuilding; // ✅ critical: keeps TS happy in async closure
    let alive = true;

    async function loadClients() {
      try {
        const res = await fetch(`http://localhost:3000/v1/buildings/${b.coreId}/clients`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to fetch clients");
        const data = await res.json();
        if (!alive) return;
        setBuildingClients(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        console.error("Failed to load clients:", e);
        setBuildingClients([]);
      }
    }

    loadClients();
    return () => {
      alive = false;
    };
  }, [selectedBuilding, isClientLocked]);

  // Fetch assets when building selected
  useEffect(() => {
    if (!selectedBuilding) return;

    const b = selectedBuilding; // ✅ critical: keeps TS happy in async closure
    let alive = true;

    async function loadAssets() {
      try {
        const res = await fetch(`http://localhost:3000/v1/buildings/${b.coreId}/assets`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to fetch assets");
        const data = await res.json();
        if (!alive) return;
        setBuildingAssets(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!alive) return;
        console.error("Failed to load assets:", e);
        setBuildingAssets([]);
      }
    }

    loadAssets();
    return () => {
      alive = false;
    };
  }, [selectedBuilding]);

  const filteredBuildings = useMemo(() => {
    const query = buildingSearch.trim().toLowerCase();
    if (!query) return buildings.slice(0, 10);

    return buildings
      .filter((b) => {
        const name = (b.name ?? "").toLowerCase();
        const address = (b.address ?? "").toLowerCase();
        const city = (b.city ?? "").toLowerCase();
        const id = String(b.coreId);
        return name.includes(query) || address.includes(query) || city.includes(query) || id.includes(query);
      })
      .slice(0, 10);
  }, [buildings, buildingSearch]);

  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return buildingClients.slice(0, 10);

    return buildingClients
      .filter((c) => {
        const fn = (c.firstName ?? "").toLowerCase();
        const ln = (c.lastName ?? "").toLowerCase();
        const full = `${fn} ${ln}`.toLowerCase();
        const id = String(c.coreId);
        return full.includes(query) || id.includes(query);
      })
      .slice(0, 10);
  }, [buildingClients, clientSearch]);

  function handleBuildingSelect(building: Building) {
    setSelectedBuilding(building);
    setBuildingSearch(`${building.name} - ${building.city}`);
    setFormData((prev) => ({ ...prev, buildingId: building.coreId }));

    if (isClientLocked) setStep(3);
    else setStep(2);
  }

  function handleClientSelect(client: Client) {
    setSelectedClient(client);
    setClientSearch(fullNameOf(client));
    setFormData((prev) => ({ ...prev, clientId: client.coreId }));
    setStep(3);
  }

  function handleProductToggle(assetId: number) {
    setSelectedProducts((prev) => (prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId]));
  }

  function handleProductsConfirm() {
    setFormData((prev) => ({ ...prev, productIds: selectedProducts }));
    setError(null);
    setStep(4);
  }

  async function handleSubmit() {
    if (!formData.buildingId) return setError("Building is required");
    // Client is now optional - no validation needed
    if (!formData.contactMethod) return setError("Contact method is required");
    if (!formData.incidentType) return setError("Incident type is required");
    if (!formData.priority) return setError("Priority is required");
    if (!formData.description.trim()) return setError("Description is required");

    try {
      setLoading(true);
      setError(null);

      const payload: any = {
        buildingId: formData.buildingId,
        assetIds: formData.productIds,
        contactMethod: formData.contactMethod,
        incidentType: formData.incidentType,
        priority: formData.priority,
        description: formData.description,
      };

      // Only include clientId if it was provided
      if (formData.clientId !== null) {
        payload.clientId = formData.clientId;
      }

      const res = await fetch("http://localhost:3000/v1/incidents", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Failed to create incident" }));
        throw new Error(errorData.message || `API error: ${res.status}`);
      }

      onSuccess();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create incident");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setStep(1);
    setBuildingSearch("");
    setClientSearch("");

    setSelectedBuilding(null);
    setSelectedProducts([]);
    setBuildingClients([]);
    setBuildingAssets([]);

    setFormData({
      buildingId: null,
      clientId: isClientLocked && presetClient ? presetClient.coreId : null,
      productIds: [],
      contactMethod: null,
      incidentType: null,
      priority: null,
      description: "",
    });

    setError(null);
    onClose();
  }

  if (!open || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Report Incident</h2>
            <p className="mt-0.5 text-xs text-zinc-600">
              Step {visibleStepNumber()} of {totalSteps} • {stepLabel(step)}
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="grid h-10 w-10 place-items-center rounded-2xl text-zinc-600 hover:bg-zinc-100"
          >
            <IconClose />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
              <div className="text-sm font-semibold text-red-900">Error</div>
              <div className="mt-1 text-xs text-red-700">{error}</div>
            </div>
          )}

          {isClientLocked && presetClient && (
            <div className="mb-4 rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
              <div className="text-sm font-semibold text-emerald-900">Client Locked</div>
              <div className="mt-1 text-xs text-emerald-700">
                Creating incident for: <span className="font-semibold">{fullNameOf(presetClient)}</span>
              </div>
            </div>
          )}

          {/* Step 1: Building */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-900">Search Building</label>
                <p className="mt-0.5 text-xs text-zinc-600">
                  {hasBuildingRestriction
                    ? "Only buildings assigned to this client are shown."
                    : "Type building name, address, city, or ID"}
                </p>
                <input
                  type="text"
                  value={buildingSearch}
                  onChange={(e) => setBuildingSearch(e.target.value)}
                  placeholder="Start typing building name..."
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                {filteredBuildings.length === 0 ? (
                  <div className="rounded-2xl bg-zinc-50 p-6 text-center ring-1 ring-zinc-200">
                    <div className="text-sm text-zinc-600">
                      {buildingSearch ? "No buildings found" : "Start typing to search"}
                    </div>
                  </div>
                ) : (
                  filteredBuildings.map((building) => (
                    <button
                      key={building.coreId}
                      type="button"
                      onClick={() => handleBuildingSelect(building)}
                      className="group w-full rounded-2xl bg-white p-4 text-left ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-zinc-900">{building.name}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">
                            {building.city} • {building.address} • Building #{building.coreId}
                          </div>
                        </div>
                        <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">→</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Step 2: Client (only if not locked) */}
          {!isClientLocked && step === 2 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                <div className="text-sm font-semibold text-emerald-900">Selected Building</div>
                <div className="mt-1 text-xs text-emerald-700">
                  {selectedBuilding?.name ?? "—"} - {selectedBuilding?.city ?? "—"}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">Search Client</label>
                <p className="mt-0.5 text-xs text-zinc-600">Which client from this building reported the issue?</p>
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Start typing client name..."
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                {buildingClients.length === 0 ? (
                  <div className="rounded-2xl bg-zinc-50 p-6 text-center ring-1 ring-zinc-200">
                    <div className="text-sm text-zinc-600">No clients assigned to this building</div>
                  </div>
                ) : filteredClients.length === 0 ? (
                  <div className="rounded-2xl bg-zinc-50 p-6 text-center ring-1 ring-zinc-200">
                    <div className="text-sm text-zinc-600">
                      {clientSearch ? "No clients match your search" : "Start typing to search"}
                    </div>
                  </div>
                ) : (
                  filteredClients.map((client) => (
                    <button
                      key={client.coreId}
                      type="button"
                      onClick={() => handleClientSelect(client)}
                      className="group w-full rounded-2xl bg-white p-4 text-left ring-1 ring-zinc-200 transition hover:bg-emerald-50/60 hover:ring-emerald-300"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-zinc-900">{fullNameOf(client)}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">Client #{client.coreId}</div>
                        </div>
                        <span className="text-zinc-400 transition-transform group-hover:translate-x-0.5">→</span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-xs text-zinc-600 hover:text-zinc-900 underline"
                >
                  ← Back to building selection
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setSelectedClient(null);
                    setClientSearch("");
                    setFormData((prev) => ({ ...prev, clientId: null }));
                    setStep(3);
                  }}
                  className="rounded-2xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
                >
                  Skip - Unknown Client →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Products */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                <div className="text-sm font-semibold text-emerald-900">Summary</div>
                <div className="mt-2 space-y-1 text-xs text-emerald-700">
                  <div>Building: {selectedBuilding?.name ?? "—"}</div>
                  <div>
                    Client:{" "}
                    {isClientLocked && presetClient
                      ? fullNameOf(presetClient)
                      : selectedClient
                        ? fullNameOf(selectedClient)
                        : "Unknown Client"}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">Select Affected Devices (Optional)</label>
                <p className="mt-0.5 text-xs text-zinc-600">Select devices if the incident affects specific equipment</p>
              </div>

              <div className="space-y-2">
                {buildingAssets.length === 0 ? (
                  <div className="rounded-2xl bg-zinc-50 p-6 text-center ring-1 ring-zinc-200">
                    <div className="text-sm text-zinc-600">No devices found in this building</div>
                    <p className="mt-2 text-xs text-zinc-500">You can continue without selecting devices</p>
                  </div>
                ) : (
                  buildingAssets.map((asset) => {
                    const isSelected = selectedProducts.includes(asset.coreId);
                    return (
                      <label
                        key={asset.coreId}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl p-4 ring-1 transition ${
                          isSelected ? "bg-emerald-50 ring-emerald-300" : "bg-white ring-zinc-200 hover:bg-zinc-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleProductToggle(asset.coreId)}
                          className="h-5 w-5 rounded border-zinc-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-zinc-900">{asset.name}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">
                            {asset.type} • Device #{asset.coreId}
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(isClientLocked ? 1 : 2)}
                  className="text-xs text-zinc-600 hover:text-zinc-900 underline"
                >
                  ← Back
                </button>

                <button
                  type="button"
                  onClick={handleProductsConfirm}
                  className="ml-auto rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                  style={{ backgroundColor: BRAND }}
                >
                  Continue to Details →
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Details */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                <div className="text-sm font-semibold text-emerald-900">Summary</div>
                <div className="mt-2 space-y-1 text-xs text-emerald-700">
                  <div>Building: {selectedBuilding?.name ?? "—"}</div>
                  <div>
                    Client:{" "}
                    {isClientLocked && presetClient
                      ? fullNameOf(presetClient)
                      : selectedClient
                        ? fullNameOf(selectedClient)
                        : "Unknown Client"}
                  </div>
                  <div>Devices: {selectedProducts.length > 0 ? `${selectedProducts.length} selected` : "None"}</div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Contact Method <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.contactMethod ?? ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, contactMethod: e.target.value as any }))}
                  disabled={loadingContactMethods}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 disabled:opacity-50"
                >
                  <option value="">Select contact method</option>
                  {loadingContactMethods ? (
                    <option disabled>Loading...</option>
                  ) : (
                    contactMethods.map((method) => (
                      <option key={method.id} value={method.value}>
                        {method.displayName}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Incident Type <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formData.incidentType ?? ""}
                  onChange={(e) => setFormData((prev) => ({ ...prev, incidentType: e.target.value }))}
                  disabled={loadingIncidentTypes}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/70 disabled:opacity-50"
                >
                  <option value="">Select incident type</option>
                  {loadingIncidentTypes ? (
                    <option disabled>Loading...</option>
                  ) : (
                    incidentTypes.map((type) => (
                      <option key={type.id} value={type.value}>
                        {type.displayName}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Priority <span className="text-rose-500">*</span>
                </label>
                {loadingPriorities ? (
                  <div className="mt-2 text-sm text-zinc-500">Loading priorities...</div>
                ) : (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {priorities.map((priority) => {
                      const isSelected = formData.priority === priority.value;
                      const hexColor = priority.colorHex || "#6b7280";

                      return (
                        <button
                          key={priority.id}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, priority: priority.value as any }))}
                          className="rounded-2xl px-3 py-2 text-xs font-semibold ring-1 transition"
                          style={{
                            backgroundColor: isSelected ? `${hexColor}20` : "white",
                            borderColor: isSelected ? hexColor : "#e5e7eb",
                            color: isSelected ? hexColor : "#18181b",
                            ringColor: hexColor,
                          }}
                        >
                          {priority.displayName}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Description <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the incident in detail..."
                  rows={5}
                  className="mt-2 w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/70"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-xs text-zinc-600 hover:text-zinc-900 underline"
                >
                  ← Back to product selection
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="ml-auto rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-40"
                  style={{ backgroundColor: BRAND }}
                >
                  {loading ? "Creating..." : "Create Incident"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
