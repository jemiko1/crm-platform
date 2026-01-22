"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(8, 117, 56)";

type Building = {
  coreId: number;
  name: string;
  address: string | null;
  city: string | null;
};

type Asset = {
  coreId: number;
  type: string;
  name: string;
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string;
};

type WorkOrderType =
  | "INSTALLATION"
  | "DIAGNOSTIC"
  | "RESEARCH"
  | "DEACTIVATE"
  | "REPAIR_CHANGE"
  | "ACTIVATE";

type WorkOrderFormData = {
  type: WorkOrderType | null;
  buildingId: number | null;
  assetIds: number[];
  contactNumber: string;
  deadline: string;
  description: string;
  amountGel: string;
  inventoryProcessingType: "ASG" | "Building" | null;
  employeeIdsToNotify: string[];
};

const WORK_ORDER_TYPES: Array<{
  value: WorkOrderType;
  labelEn: string;
  labelKa: string;
  icon: string;
}> = [
  { value: "INSTALLATION", labelEn: "Installation", labelKa: "ინსტალაცია", icon: "🔧" },
  { value: "DIAGNOSTIC", labelEn: "Diagnostic", labelKa: "დიაგნოსტიკა", icon: "🔍" },
  { value: "RESEARCH", labelEn: "Research", labelKa: "მოკვლევა", icon: "📋" },
  { value: "DEACTIVATE", labelEn: "Deactivate", labelKa: "დემონტაჟი", icon: "🔌" },
  { value: "REPAIR_CHANGE", labelEn: "Repair/Change", labelKa: "შეცვლა", icon: "🛠️" },
  { value: "ACTIVATE", labelEn: "Activate", labelKa: "ჩართვა", icon: "⚡" },
];

export default function CreateWorkOrderModal({
  open,
  onClose,
  onSuccess,
  presetBuilding,
  lockBuilding,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  presetBuilding?: Building;
  lockBuilding?: boolean;
}) {
  const { t, language } = useI18n();
  const [mounted, setMounted] = useState(false);
  const isBuildingLocked = Boolean(lockBuilding && presetBuilding);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingSearch, setBuildingSearch] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);
  const [showBuildingResults, setShowBuildingResults] = useState(false);

  const [buildingAssets, setBuildingAssets] = useState<Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [showEmployeeResults, setShowEmployeeResults] = useState(false);

  const [formData, setFormData] = useState<WorkOrderFormData>({
    type: null,
    buildingId: null,
    assetIds: [],
    contactNumber: "",
    deadline: "",
    description: "",
    amountGel: "",
    inventoryProcessingType: null,
    employeeIdsToNotify: [],
  });

  // Fetch buildings
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function fetchBuildings() {
      try {
        const data = await apiGet<Building[]>("/v1/buildings");
        if (!cancelled) setBuildings(data);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch buildings:", err);
      }
    }
    fetchBuildings();
    return () => { cancelled = true; };
  }, [open]);

  // Fetch employees
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function fetchEmployees() {
      try {
        const data = await apiGet<Employee[]>("/v1/employees?status=ACTIVE");
        if (!cancelled) setEmployees(data);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch employees:", err);
      }
    }
    fetchEmployees();
    return () => { cancelled = true; };
  }, [open]);

  // Fetch assets when building is selected
  useEffect(() => {
    if (!selectedBuilding) {
      setBuildingAssets([]);
      setSelectedAssets([]);
      return;
    }
    let cancelled = false;
    async function fetchAssets() {
      try {
        const data = await apiGet<Asset[]>(`/v1/buildings/${selectedBuilding.coreId}/assets`);
        if (!cancelled) setBuildingAssets(data);
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch assets:", err);
      }
    }
    fetchAssets();
    return () => { cancelled = true; };
  }, [selectedBuilding]);

  // Initialize on open
  useEffect(() => {
    if (!open) return;
    setError(null);
    setFormData({
      type: null,
      buildingId: null,
      assetIds: [],
      contactNumber: "",
      deadline: "",
      description: "",
      amountGel: "",
      inventoryProcessingType: null,
      employeeIdsToNotify: [],
    });
    setSelectedAssets([]);
    setSelectedEmployees([]);
    setBuildingSearch("");
    setEmployeeSearch("");
    setShowBuildingResults(false);
    setShowEmployeeResults(false);

    if (isBuildingLocked && presetBuilding) {
      setSelectedBuilding(presetBuilding);
      setFormData((prev) => ({ ...prev, buildingId: presetBuilding.coreId }));
    } else {
      setSelectedBuilding(null);
    }
  }, [open, isBuildingLocked, presetBuilding]);

  const filteredBuildings = useMemo(() => {
    if (!buildingSearch.trim()) return buildings;
    const query = buildingSearch.toLowerCase();
    return buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(query) ||
        b.address?.toLowerCase().includes(query) ||
        String(b.coreId).includes(query),
    );
  }, [buildings, buildingSearch]);

  const filteredEmployees = useMemo(() => {
    if (!employeeSearch.trim()) return employees;
    const query = employeeSearch.toLowerCase();
    return employees.filter(
      (e) =>
        e.firstName.toLowerCase().includes(query) ||
        e.lastName.toLowerCase().includes(query) ||
        e.email.toLowerCase().includes(query) ||
        e.employeeId.toLowerCase().includes(query),
    );
  }, [employees, employeeSearch]);

  const requiresAmountAndInventory =
    formData.type === "INSTALLATION" || formData.type === "REPAIR_CHANGE";

  const hasFormData = useMemo(() => {
    return (
      formData.type !== null ||
      formData.buildingId !== null ||
      formData.assetIds.length > 0 ||
      formData.contactNumber.trim() !== "" ||
      formData.deadline !== "" ||
      formData.description.trim() !== "" ||
      formData.amountGel !== "" ||
      formData.inventoryProcessingType !== null ||
      formData.employeeIdsToNotify.length > 0
    );
  }, [formData]);

  function handleBackdropClick() {
    if (hasFormData) {
      setShowCancelConfirm(true);
    } else {
      onClose();
    }
  }

  function handleConfirmCancel() {
    setShowCancelConfirm(false);
    onClose();
  }

  function handleCancelCancel() {
    setShowCancelConfirm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.type) throw new Error("Please select a work order type");
      if (!formData.buildingId) throw new Error("Please select a building");
      if (formData.assetIds.length === 0) throw new Error("Please select at least one device");
      if (!formData.description.trim()) throw new Error("Please provide a description");
      if (requiresAmountAndInventory && !formData.inventoryProcessingType) {
        throw new Error("Please select inventory processing type");
      }

      const payload: any = {
        buildingId: formData.buildingId,
        assetIds: formData.assetIds,
        type: formData.type,
        description: formData.description,
        contactNumber: formData.contactNumber || undefined,
        deadline: formData.deadline || undefined,
        employeeIdsToNotify: formData.employeeIdsToNotify,
      };

      if (requiresAmountAndInventory) {
        if (formData.amountGel) payload.amountGel = parseFloat(formData.amountGel);
        payload.inventoryProcessingType = formData.inventoryProcessingType;
      }

      await apiPost("/v1/work-orders", payload);
      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to create work order");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-4xl max-h-[90vh]">
        <div
          className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4 bg-zinc-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {t("workOrders.create", "Create Work Order")}
                </h2>
                <p className="text-sm text-zinc-500">Schedule a technical team visit</p>
              </div>
              <button
                type="button"
                onClick={handleBackdropClick}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="p-6 space-y-6">
              
              {/* Work Order Type */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-3">
                  Work Order Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {WORK_ORDER_TYPES.map((type) => {
                    const isSelected = formData.type === type.value;
                    return (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            type: type.value,
                            amountGel: "",
                            inventoryProcessingType: null,
                          }))
                        }
                        className={`relative flex flex-col items-center gap-1.5 rounded-xl p-3 text-center ring-1 transition-all ${
                          isSelected
                            ? "bg-emerald-50 ring-emerald-500 shadow-sm"
                            : "bg-white ring-zinc-200 hover:ring-zinc-300 hover:bg-zinc-50"
                        }`}
                      >
                        <span className="text-xl">{type.icon}</span>
                        <span className={`text-xs font-medium ${isSelected ? "text-emerald-700" : "text-zinc-700"}`}>
                          {language === "ka" ? type.labelKa : type.labelEn}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Left Column */}
                <div className="space-y-5">
                  
                  {/* Building */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      Building <span className="text-red-500">*</span>
                    </label>
                    {isBuildingLocked && presetBuilding ? (
                      <div className="rounded-xl bg-zinc-100 p-3 ring-1 ring-zinc-200">
                        <div className="font-medium text-zinc-900">{presetBuilding.name}</div>
                        <div className="text-xs text-zinc-500">ID: #{presetBuilding.coreId}</div>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={buildingSearch}
                          onChange={(e) => {
                            setBuildingSearch(e.target.value);
                            setShowBuildingResults(e.target.value.trim().length > 0);
                          }}
                          onFocus={() => {
                            if (buildingSearch.trim().length > 0) setShowBuildingResults(true);
                          }}
                          placeholder="Search buildings..."
                          className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        
                        {selectedBuilding && !showBuildingResults && (
                          <div className="mt-2 flex items-center justify-between rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
                            <div>
                              <div className="font-medium text-zinc-900">{selectedBuilding.name}</div>
                              <div className="text-xs text-zinc-500">#{selectedBuilding.coreId}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBuilding(null);
                                setFormData((prev) => ({ ...prev, buildingId: null, assetIds: [] }));
                                setBuildingSearch("");
                                setSelectedAssets([]);
                              }}
                              className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        )}
                        
                        {showBuildingResults && filteredBuildings.length > 0 && (
                          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl bg-zinc-50 ring-1 ring-zinc-200 [&::-webkit-scrollbar]:hidden">
                            {filteredBuildings.slice(0, 5).map((building) => (
                              <button
                                key={building.coreId}
                                type="button"
                                onClick={() => {
                                  setSelectedBuilding(building);
                                  setFormData((prev) => ({ ...prev, buildingId: building.coreId }));
                                  setBuildingSearch("");
                                  setShowBuildingResults(false);
                                }}
                                className="w-full px-4 py-2.5 text-left hover:bg-white border-b border-zinc-100 last:border-0"
                              >
                                <div className="text-sm font-medium text-zinc-900">{building.name}</div>
                                <div className="text-xs text-zinc-500">#{building.coreId} {building.address && `• ${building.address}`}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Devices */}
                  {selectedBuilding && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-zinc-700">
                          Devices <span className="text-red-500">*</span>
                        </label>
                        {selectedAssets.length > 0 && (
                          <span className="text-xs text-emerald-600 font-medium">{selectedAssets.length} selected</span>
                        )}
                      </div>
                      <div className="max-h-40 overflow-y-auto rounded-xl ring-1 ring-zinc-200 [&::-webkit-scrollbar]:hidden">
                        {buildingAssets.length === 0 ? (
                          <div className="p-4 text-center text-sm text-zinc-500">No devices found</div>
                        ) : (
                          <div className="divide-y divide-zinc-100">
                            {buildingAssets.map((asset) => {
                              const isSelected = selectedAssets.includes(asset.coreId);
                              return (
                                <label
                                  key={asset.coreId}
                                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                                    isSelected ? "bg-emerald-50" : "bg-white hover:bg-zinc-50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {
                                      if (isSelected) {
                                        setSelectedAssets((prev) => prev.filter((id) => id !== asset.coreId));
                                        setFormData((prev) => ({
                                          ...prev,
                                          assetIds: prev.assetIds.filter((id) => id !== asset.coreId),
                                        }));
                                      } else {
                                        setSelectedAssets((prev) => [...prev, asset.coreId]);
                                        setFormData((prev) => ({
                                          ...prev,
                                          assetIds: [...prev.assetIds, asset.coreId],
                                        }));
                                      }
                                    }}
                                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-zinc-900">{asset.name}</div>
                                    <div className="text-xs text-zinc-500">{asset.type} • #{asset.coreId}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Description */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 mb-2">
                      Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                      required
                      rows={4}
                      placeholder="Describe what should be done..."
                      className="w-full rounded-xl bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                    />
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-5">
                  
                  {/* Contact & Deadline */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-2">Contact Number</label>
                      <input
                        type="tel"
                        value={formData.contactNumber}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contactNumber: e.target.value }))}
                        placeholder="+995 XXX XXX XXX"
                        className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 mb-2">Deadline</label>
                      <input
                        type="datetime-local"
                        value={formData.deadline}
                        onChange={(e) => setFormData((prev) => ({ ...prev, deadline: e.target.value }))}
                        className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  </div>

                  {/* Amount & Inventory Type */}
                  {requiresAmountAndInventory && (
                    <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                      <div className="text-xs font-medium text-amber-800 mb-3">Additional fields for {formData.type === "INSTALLATION" ? "Installation" : "Repair/Change"}</div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-zinc-600 mb-1.5">Amount (GEL)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.amountGel}
                            onChange={(e) => setFormData((prev) => ({ ...prev, amountGel: e.target.value }))}
                            placeholder="0.00"
                            className="w-full rounded-lg bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-zinc-600 mb-1.5">
                            Inventory Type <span className="text-red-500">*</span>
                          </label>
                          <div className="flex gap-2">
                            {(["ASG", "Building"] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, inventoryProcessingType: type }))}
                                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                                  formData.inventoryProcessingType === type
                                    ? "bg-amber-600 text-white"
                                    : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50"
                                }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Employees to Notify */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-zinc-700">Additional Notifications</label>
                      {selectedEmployees.length > 0 && (
                        <span className="text-xs text-emerald-600 font-medium">{selectedEmployees.length} selected</span>
                      )}
                    </div>
                    <input
                      type="text"
                      value={employeeSearch}
                      onChange={(e) => {
                        setEmployeeSearch(e.target.value);
                        setShowEmployeeResults(e.target.value.trim().length > 0);
                      }}
                      onFocus={() => {
                        if (employeeSearch.trim().length > 0) setShowEmployeeResults(true);
                      }}
                      placeholder="Search employees to notify..."
                      className="w-full rounded-xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    
                    {selectedEmployees.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {selectedEmployees.map((empId) => {
                          const emp = employees.find((e) => e.id === empId);
                          if (!emp) return null;
                          return (
                            <span
                              key={emp.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700"
                            >
                              {emp.firstName} {emp.lastName}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedEmployees((prev) => prev.filter((id) => id !== emp.id));
                                  setFormData((prev) => ({
                                    ...prev,
                                    employeeIdsToNotify: prev.employeeIdsToNotify.filter((id) => id !== emp.id),
                                  }));
                                }}
                                className="ml-0.5 rounded p-0.5 hover:bg-zinc-200"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                                </svg>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    
                    {showEmployeeResults && filteredEmployees.length > 0 && (
                      <div className="mt-2 max-h-32 overflow-y-auto rounded-xl bg-zinc-50 ring-1 ring-zinc-200 [&::-webkit-scrollbar]:hidden">
                        {filteredEmployees.slice(0, 4).map((employee) => {
                          const isSelected = selectedEmployees.includes(employee.id);
                          return (
                            <button
                              key={employee.id}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setSelectedEmployees((prev) => prev.filter((id) => id !== employee.id));
                                  setFormData((prev) => ({
                                    ...prev,
                                    employeeIdsToNotify: prev.employeeIdsToNotify.filter((id) => id !== employee.id),
                                  }));
                                } else {
                                  setSelectedEmployees((prev) => [...prev, employee.id]);
                                  setFormData((prev) => ({
                                    ...prev,
                                    employeeIdsToNotify: [...prev.employeeIdsToNotify, employee.id],
                                  }));
                                }
                              }}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left border-b border-zinc-100 last:border-0 ${
                                isSelected ? "bg-emerald-50" : "hover:bg-white"
                              }`}
                            >
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                                {employee.firstName[0]}{employee.lastName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-zinc-900">{employee.firstName} {employee.lastName}</div>
                                <div className="text-xs text-zinc-500">{employee.employeeId}</div>
                              </div>
                              {isSelected && (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-emerald-600">
                                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
                  <div className="text-sm text-red-800">{error}</div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-zinc-200 bg-zinc-50 px-6 py-4">
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleBackdropClick}
                  disabled={loading}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
                  style={{ backgroundColor: BRAND }}
                >
                  {loading ? "Creating..." : "Create Work Order"}
                </button>
              </div>
            </div>
          </form>

          {/* Cancel Confirmation */}
          {showCancelConfirm && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl z-[100]"
              onClick={handleCancelCancel}
            >
              <div
                className="bg-white rounded-xl p-5 shadow-xl ring-1 ring-zinc-200 max-w-sm mx-4"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-base font-semibold text-zinc-900 mb-2">Discard changes?</h3>
                <p className="text-sm text-zinc-600 mb-5">
                  You have unsaved data. Are you sure you want to close?
                </p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleCancelCancel}
                    className="flex-1 rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-200"
                  >
                    Keep Editing
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmCancel}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Discard
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
