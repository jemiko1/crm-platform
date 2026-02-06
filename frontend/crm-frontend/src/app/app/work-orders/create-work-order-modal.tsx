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
}> = [
  { value: "INSTALLATION", labelEn: "Installation", labelKa: "ინსტალაცია" },
  { value: "DIAGNOSTIC", labelEn: "Diagnostic", labelKa: "დიაგნოსტიკა" },
  { value: "RESEARCH", labelEn: "Research", labelKa: "მოკვლევა" },
  { value: "DEACTIVATE", labelEn: "Deactivate", labelKa: "დემონტაჟი" },
  { value: "REPAIR_CHANGE", labelEn: "Repair/Change", labelKa: "შეცვლა" },
  { value: "ACTIVATE", labelEn: "Activate", labelKa: "ჩართვა" },
];

const STEPS = [
  { id: 1, title: "Work Order Type", description: "Select type" },
  { id: 2, title: "Location & Assets", description: "Building and devices" },
  { id: 3, title: "Work Details", description: "Description and schedule" },
  { id: 4, title: "Additional Info", description: "Optional details" },
  { id: 5, title: "Review", description: "Confirm details" },
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
  const [currentStep, setCurrentStep] = useState(1);

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
        const data = await apiGet<Asset[]>(`/v1/buildings/${selectedBuilding!.coreId}/assets`);
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
    setCurrentStep(isBuildingLocked ? 2 : 1);
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

  function canProceedToNextStep(): boolean {
    switch (currentStep) {
      case 1:
        return formData.type !== null;
      case 2:
        return formData.buildingId !== null && formData.assetIds.length > 0;
      case 3:
        return formData.description.trim() !== "";
      case 4:
        if (requiresAmountAndInventory) {
          return formData.inventoryProcessingType !== null;
        }
        return true;
      default:
        return true;
    }
  }

  function handleNext() {
    if (canProceedToNextStep() && currentStep < 5) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  }

  async function handleSubmit() {
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
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-5xl max-h-[90vh] mx-auto">
        <div
          className="w-full overflow-hidden rounded-none sm:rounded-2xl bg-white shadow-2xl flex flex-col md:flex-row max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left Sidebar - Steps */}
          <div className="w-full md:w-72 bg-gradient-to-b from-emerald-50 to-teal-50 p-4 sm:p-6 md:p-8 flex flex-col md:min-h-0">
            <div className="mb-4 md:mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-zinc-800">Create Work Order</h2>
              <p className="text-xs sm:text-sm text-zinc-600 mt-1">Follow the steps to create a new work order</p>
            </div>

            <div className="space-y-1 flex-1 overflow-y-auto md:overflow-y-visible">
              {STEPS.map((step, idx) => {
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;
                const isUpcoming = currentStep < step.id;

                return (
                  <div key={step.id} className="relative">
                    {/* Connector Line */}
                    {idx < STEPS.length - 1 && (
                      <div
                        className={`absolute left-[15px] top-8 w-0.5 h-8 ${
                          isCompleted ? "bg-emerald-500" : "bg-zinc-300"
                        }`}
                      />
                    )}

                    {/* Step Item */}
                    <div
                      className={`relative flex items-start gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg transition-all ${
                        isCurrent ? "bg-white shadow-sm" : ""
                      }`}
                    >
                      {/* Step Number Circle */}
                      <div
                        className={`flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-semibold text-xs sm:text-sm transition-all ${
                          isCompleted
                            ? "bg-emerald-500 text-white"
                            : isCurrent
                            ? "bg-emerald-600 text-white ring-4 ring-emerald-200"
                            : "bg-white text-zinc-400 border-2 border-zinc-300"
                        }`}
                      >
                        {isCompleted ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          step.id
                        )}
                      </div>

                      {/* Step Content */}
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-xs sm:text-sm font-semibold ${
                            isCurrent ? "text-zinc-900" : isCompleted ? "text-zinc-700" : "text-zinc-500"
                          }`}
                        >
                          {step.title}
                        </div>
                        <div className="text-[10px] sm:text-xs text-zinc-500 mt-0.5">{step.description}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 flex flex-col max-h-[90vh] min-h-0">
            {/* Header */}
            <div className="border-b border-zinc-200 px-4 sm:px-6 md:px-8 py-4 sm:py-5 md:py-6 flex items-center justify-between bg-white">
              <div>
                <h3 className="text-base sm:text-lg font-semibold text-zinc-900">{STEPS[currentStep - 1].title}</h3>
                <p className="text-xs sm:text-sm text-zinc-600 mt-0.5">{STEPS[currentStep - 1].description}</p>
              </div>
              <button
                type="button"
                onClick={handleBackdropClick}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Form Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 py-4 sm:py-5 md:py-6 bg-zinc-50">
              {/* Step 1: Work Order Type */}
              {currentStep === 1 && (
                <div className="space-y-4 sm:space-y-6 max-w-2xl">
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-zinc-900 mb-2 sm:mb-3 uppercase">
                      Select Work Order Type <span className="text-red-500">*</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
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
                            className={`text-left p-3 sm:p-4 rounded-xl border-2 transition-all ${
                              isSelected
                                ? "border-emerald-500 bg-emerald-50"
                                : "border-zinc-200 hover:border-zinc-300 bg-white"
                            }`}
                          >
                            <div className={`text-sm sm:text-base font-semibold ${isSelected ? "text-emerald-900" : "text-zinc-900"}`}>
                              {language === "ka" ? type.labelKa : type.labelEn}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Location & Assets */}
              {currentStep === 2 && (
                <div className="space-y-4 sm:space-y-6 max-w-2xl">
                  {/* Building */}
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-zinc-900 mb-2 sm:mb-3 uppercase">
                      Building <span className="text-red-500">*</span>
                    </label>
                    {isBuildingLocked && presetBuilding ? (
                      <div className="rounded-xl bg-zinc-50 p-4 border border-zinc-200">
                        <div className="font-medium text-zinc-900">{presetBuilding.name}</div>
                        <div className="text-xs text-zinc-500 mt-1">ID: #{presetBuilding.coreId}</div>
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
                          placeholder="Search buildings by name, address, or ID..."
                          className="w-full rounded-xl bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 border border-zinc-300 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                        />

                        {selectedBuilding && !showBuildingResults && (
                          <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 p-3 border border-emerald-200">
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
                              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                              </svg>
                            </button>
                          </div>
                        )}

                        {showBuildingResults && filteredBuildings.length > 0 && (
                          <div className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-white border border-zinc-200 shadow-sm">
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
                                className="w-full px-4 py-3 text-left hover:bg-zinc-50 border-b border-zinc-100 last:border-0"
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
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <label className="text-xs sm:text-sm font-bold text-zinc-900 uppercase">
                          Select Devices <span className="text-red-500">*</span>
                        </label>
                        {selectedAssets.length > 0 && (
                          <span className="text-xs text-emerald-600 font-semibold bg-emerald-100 px-2 py-1 rounded-lg">
                            {selectedAssets.length} selected
                          </span>
                        )}
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-xl border border-zinc-300 bg-white">
                        {buildingAssets.length === 0 ? (
                          <div className="p-8 text-center text-sm text-zinc-500">No devices found in this building</div>
                        ) : (
                          <div className="divide-y divide-zinc-100">
                            {buildingAssets.map((asset) => {
                              const isSelected = selectedAssets.includes(asset.coreId);
                              return (
                                <label
                                  key={asset.coreId}
                                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                    isSelected ? "bg-emerald-50" : "hover:bg-zinc-50"
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
                </div>
              )}

              {/* Step 3: Work Details */}
              {currentStep === 3 && (
                <div className="space-y-4 sm:space-y-6 max-w-2xl">
                  {/* Description */}
                  <div>
                    <label className="block text-xs sm:text-sm font-bold text-zinc-900 mb-2 sm:mb-3 uppercase">
                      Work Description <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                      rows={5}
                      placeholder="Describe the work that needs to be done in detail..."
                      className="w-full rounded-xl bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 border border-zinc-300 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 resize-none"
                    />
                  </div>

                  {/* Contact & Deadline */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs sm:text-sm font-bold text-zinc-900 mb-2 sm:mb-3 uppercase">Contact Number</label>
                      <input
                        type="tel"
                        value={formData.contactNumber}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contactNumber: e.target.value }))}
                        placeholder="+995 XXX XXX XXX"
                        className="w-full rounded-xl bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 border border-zinc-300 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs sm:text-sm font-bold text-zinc-900 mb-2 sm:mb-3 uppercase">Deadline</label>
                      <input
                        type="datetime-local"
                        value={formData.deadline}
                        onChange={(e) => setFormData((prev) => ({ ...prev, deadline: e.target.value }))}
                        className="w-full rounded-xl bg-white px-4 py-3 text-sm text-zinc-900 border border-zinc-300 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Step 4: Additional Info */}
              {currentStep === 4 && (
                <div className="space-y-4 sm:space-y-6 max-w-2xl">
                  {/* Amount & Inventory Type */}
                  {requiresAmountAndInventory && (
                    <div className="rounded-xl bg-amber-50 p-4 sm:p-5 border border-amber-200">
                      <div className="text-xs sm:text-sm font-bold text-amber-900 mb-3 sm:mb-4 uppercase">Financial & Inventory Details</div>
                      <div className="space-y-3 sm:space-y-4">
                        <div>
                          <label className="block text-xs sm:text-sm font-bold text-zinc-900 mb-2 sm:mb-3 uppercase">Amount (GEL)</label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.amountGel}
                            onChange={(e) => setFormData((prev) => ({ ...prev, amountGel: e.target.value }))}
                            placeholder="0.00"
                            className="w-full rounded-xl bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 border border-amber-300 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                          />
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-bold text-zinc-900 mb-2 sm:mb-3 uppercase">
                            Inventory Processing Type <span className="text-red-500">*</span>
                          </label>
                          <div className="grid grid-cols-2 gap-2 sm:gap-3">
                            {(["ASG", "Building"] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => setFormData((prev) => ({ ...prev, inventoryProcessingType: type }))}
                                className={`px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                                  formData.inventoryProcessingType === type
                                    ? "bg-amber-600 text-white border-2 border-amber-600"
                                    : "bg-white text-zinc-700 border-2 border-zinc-300 hover:border-zinc-400"
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
                    <div className="flex items-center justify-between mb-2 sm:mb-3">
                      <label className="text-xs sm:text-sm font-bold text-zinc-900 uppercase">Additional Notifications</label>
                      {selectedEmployees.length > 0 && (
                        <span className="text-xs text-blue-600 font-semibold bg-blue-100 px-2 py-1 rounded-lg">
                          {selectedEmployees.length} selected
                        </span>
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
                      className="w-full rounded-xl bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 border border-zinc-300 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                    />

                    {selectedEmployees.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {selectedEmployees.map((empId) => {
                          const emp = employees.find((e) => e.id === empId);
                          if (!emp) return null;
                          return (
                            <span
                              key={emp.id}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700"
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
                                className="rounded p-0.5 hover:bg-zinc-200"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                                </svg>
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {showEmployeeResults && filteredEmployees.length > 0 && (
                      <div className="mt-3 max-h-48 overflow-y-auto rounded-xl bg-white border border-zinc-200 shadow-sm">
                        {filteredEmployees.slice(0, 5).map((employee) => {
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
                              className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-zinc-100 last:border-0 ${
                                isSelected ? "bg-blue-50" : "hover:bg-zinc-50"
                              }`}
                            >
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600">
                                {employee.firstName[0]}{employee.lastName[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-zinc-900">{employee.firstName} {employee.lastName}</div>
                                <div className="text-xs text-zinc-500">{employee.employeeId}</div>
                              </div>
                              {isSelected && (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-blue-600">
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
              )}

              {/* Step 5: Review */}
              {currentStep === 5 && (
                <div className="space-y-4 sm:space-y-6 max-w-2xl">
                  <div className="bg-white rounded-xl p-4 sm:p-5 border border-zinc-200 space-y-3 sm:space-y-4">
                    <div>
                      <div className="text-xs font-semibold text-zinc-600 uppercase mb-1">Work Order Type</div>
                      <div className="text-sm font-medium text-zinc-900">
                        {WORK_ORDER_TYPES.find((t) => t.value === formData.type)?.[language === "ka" ? "labelKa" : "labelEn"]}
                      </div>
                    </div>

                    <div className="border-t border-zinc-200 pt-4">
                      <div className="text-xs font-semibold text-zinc-600 uppercase mb-1">Building</div>
                      <div className="text-sm font-medium text-zinc-900">{selectedBuilding?.name}</div>
                      <div className="text-xs text-zinc-500">ID: #{selectedBuilding?.coreId}</div>
                    </div>

                    <div className="border-t border-zinc-200 pt-4">
                      <div className="text-xs font-semibold text-zinc-600 uppercase mb-1">Devices</div>
                      <div className="text-sm text-zinc-700">{selectedAssets.length} device(s) selected</div>
                    </div>

                    <div className="border-t border-zinc-200 pt-4">
                      <div className="text-xs font-semibold text-zinc-600 uppercase mb-1">Description</div>
                      <div className="text-sm text-zinc-700">{formData.description}</div>
                    </div>

                    {formData.contactNumber && (
                      <div className="border-t border-zinc-200 pt-4">
                        <div className="text-xs font-semibold text-zinc-600 uppercase mb-1">Contact</div>
                        <div className="text-sm text-zinc-700">{formData.contactNumber}</div>
                      </div>
                    )}

                    {formData.deadline && (
                      <div className="border-t border-zinc-200 pt-4">
                        <div className="text-xs font-semibold text-zinc-600 uppercase mb-1">Deadline</div>
                        <div className="text-sm text-zinc-700">{new Date(formData.deadline).toLocaleString()}</div>
                      </div>
                    )}

                    {requiresAmountAndInventory && (
                      <div className="border-t border-zinc-200 pt-4">
                        <div className="text-xs font-semibold text-zinc-600 uppercase mb-1">Financial Details</div>
                        <div className="text-sm text-zinc-700">
                          {formData.amountGel && `Amount: ${formData.amountGel} GEL`}
                          {formData.amountGel && formData.inventoryProcessingType && " • "}
                          {formData.inventoryProcessingType && `Inventory: ${formData.inventoryProcessingType}`}
                        </div>
                      </div>
                    )}

                    {selectedEmployees.length > 0 && (
                      <div className="border-t border-zinc-200 pt-4">
                        <div className="text-xs font-semibold text-zinc-600 uppercase mb-1">Notifications</div>
                        <div className="text-sm text-zinc-700">{selectedEmployees.length} employee(s) will be notified</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="mt-6 rounded-xl bg-red-50 p-4 border border-red-200">
                  <div className="text-sm text-red-800">{error}</div>
                </div>
              )}
            </div>

            {/* Footer Navigation */}
            <div className="border-t border-zinc-200 bg-white px-4 sm:px-6 md:px-8 py-4 sm:py-5">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={currentStep === 1 ? handleBackdropClick : handleBack}
                  disabled={loading}
                  className="rounded-xl px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 transition-colors"
                >
                  {currentStep === 1 ? "Cancel" : "Back"}
                </button>

                {currentStep < 5 ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    disabled={!canProceedToNextStep()}
                    className="rounded-xl px-5 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    style={{ backgroundColor: canProceedToNextStep() ? BRAND : "#9ca3af" }}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="rounded-xl px-5 sm:px-6 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50 transition-all"
                    style={{ backgroundColor: BRAND }}
                  >
                    {loading ? "Creating..." : "Create Work Order"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Confirmation */}
      {showCancelConfirm && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-2xl z-[100]"
          onClick={handleCancelCancel}
        >
          <div
            className="bg-white rounded-xl p-6 shadow-xl max-w-sm mx-4"
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
  );

  return createPortal(modalContent, document.body);
}
