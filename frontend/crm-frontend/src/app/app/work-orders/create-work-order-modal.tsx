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

const WORK_ORDER_TYPES: Array<{ value: WorkOrderType; labelEn: string; labelKa: string }> = [
  { value: "INSTALLATION", labelEn: "Installation", labelKa: "ინსტალაცია" },
  { value: "DIAGNOSTIC", labelEn: "Diagnostic", labelKa: "დიაგნოსტიკა" },
  { value: "RESEARCH", labelEn: "Research", labelKa: "მოკვლევა" },
  { value: "DEACTIVATE", labelEn: "Deactivate", labelKa: "დემონტაჟი" },
  { value: "REPAIR_CHANGE", labelEn: "Repair/Change", labelKa: "შეცვლა" },
  { value: "ACTIVATE", labelEn: "Activate", labelKa: "ჩართვა" },
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [buildings, setBuildings] = useState<Building[]>([]);
  const [buildingSearch, setBuildingSearch] = useState("");
  const [selectedBuilding, setSelectedBuilding] = useState<Building | null>(null);

  const [buildingAssets, setBuildingAssets] = useState<Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<number[]>([]);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);

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
        if (!cancelled) {
          setBuildings(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch buildings:", err);
        }
      }
    }

    fetchBuildings();

    return () => {
      cancelled = true;
    };
  }, [open]);

  // Fetch employees
  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function fetchEmployees() {
      try {
        const data = await apiGet<Employee[]>("/v1/employees?status=ACTIVE");
        if (!cancelled) {
          setEmployees(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch employees:", err);
        }
      }
    }

    fetchEmployees();

    return () => {
      cancelled = true;
    };
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
        if (!cancelled) {
          setBuildingAssets(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch assets:", err);
        }
      }
    }

    fetchAssets();

    return () => {
      cancelled = true;
    };
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!formData.type) {
        throw new Error("Please select a work order type");
      }

      if (!formData.buildingId) {
        throw new Error("Please select a building");
      }

      if (formData.assetIds.length === 0) {
        throw new Error("Please select at least one device");
      }

      if (!formData.description.trim()) {
        throw new Error("Please provide a description");
      }

      if (requiresAmountAndInventory) {
        if (!formData.inventoryProcessingType) {
          throw new Error("Please select inventory processing type");
        }
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
        if (formData.amountGel) {
          payload.amountGel = parseFloat(formData.amountGel);
        }
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div
          className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {t("workOrders.create", "Create Work Order")}
                </h2>
                <p className="mt-1 text-xs text-zinc-600">
                  Create a new work order for technical team visit
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
                aria-label="Close"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-6">
              {/* Work Order Type */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-900">
                  {t("workOrders.fields.type", "Type")} <span className="text-red-600">*</span>
                </label>
                <select
                  value={formData.type || ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      type: e.target.value as WorkOrderType,
                      amountGel: "",
                      inventoryProcessingType: null,
                    }))
                  }
                  required
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="">Select type</option>
                  {WORK_ORDER_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {language === "ka" ? type.labelKa : type.labelEn}
                    </option>
                  ))}
                </select>
              </div>

              {/* Building Selection */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-900">
                  {t("workOrders.fields.building", "Building")} <span className="text-red-600">*</span>
                </label>
                {isBuildingLocked && presetBuilding ? (
                  <div className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200">
                    <div className="text-sm font-semibold text-zinc-900">{presetBuilding.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">#{presetBuilding.coreId}</div>
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={buildingSearch}
                      onChange={(e) => setBuildingSearch(e.target.value)}
                      placeholder="Search buildings..."
                      className="mb-2 w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                    <div className="max-h-48 space-y-2 overflow-y-auto">
                      {filteredBuildings.map((building) => {
                        const isSelected = selectedBuilding?.coreId === building.coreId;
                        return (
                          <button
                            key={building.coreId}
                            type="button"
                            onClick={() => {
                              setSelectedBuilding(building);
                              setFormData((prev) => ({ ...prev, buildingId: building.coreId }));
                            }}
                            className={`w-full rounded-2xl p-3 text-left ring-1 transition ${
                              isSelected
                                ? "bg-emerald-50 ring-emerald-300"
                                : "bg-white ring-zinc-200 hover:bg-zinc-50"
                            }`}
                          >
                            <div className="text-sm font-semibold text-zinc-900">{building.name}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">
                              #{building.coreId} {building.address && `• ${building.address}`}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* Device Selection */}
              {selectedBuilding && (
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-900">
                    {t("workOrders.fields.devices", "Devices")} <span className="text-red-600">*</span>
                  </label>
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {buildingAssets.length === 0 ? (
                      <div className="rounded-2xl bg-zinc-50 p-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
                        No devices found in this building
                      </div>
                    ) : (
                      buildingAssets.map((asset) => {
                        const isSelected = selectedAssets.includes(asset.coreId);
                        return (
                          <label
                            key={asset.coreId}
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 ring-1 transition ${
                              isSelected
                                ? "bg-emerald-50 ring-emerald-300"
                                : "bg-white ring-zinc-200 hover:bg-zinc-50"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                if (isSelected) {
                                  setSelectedAssets((prev) =>
                                    prev.filter((id) => id !== asset.coreId),
                                  );
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
                </div>
              )}

              {/* Contact Number */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-900">
                  {t("workOrders.fields.contactNumber", "Contact Number")}
                </label>
                <input
                  type="tel"
                  value={formData.contactNumber}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, contactNumber: e.target.value }))
                  }
                  placeholder="Building representative contact number"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Deadline */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-900">
                  {t("workOrders.fields.deadline", "Deadline")}
                </label>
                <input
                  type="datetime-local"
                  value={formData.deadline}
                  onChange={(e) => setFormData((prev) => ({ ...prev, deadline: e.target.value }))}
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Description */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-900">
                  {t("workOrders.fields.description", "Description")} <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, description: e.target.value }))
                  }
                  required
                  rows={4}
                  placeholder="Describe what should be done..."
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
                />
              </div>

              {/* Amount (GEL) - Only for INSTALLATION and REPAIR_CHANGE */}
              {requiresAmountAndInventory && (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-900">
                      {t("workOrders.fields.amountGel", "Amount (GEL)")}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.amountGel}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, amountGel: e.target.value }))
                      }
                      placeholder="0.00"
                      className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>

                  {/* Inventory Processing Type */}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-zinc-900">
                      {t("workOrders.fields.inventoryProcessingType", "Inventory Processing Type")}{" "}
                      <span className="text-red-600">*</span>
                    </label>
                    <select
                      value={formData.inventoryProcessingType || ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          inventoryProcessingType: e.target.value as "ASG" | "Building" | null,
                        }))
                      }
                      required
                      className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    >
                      <option value="">Select type</option>
                      <option value="ASG">ASG</option>
                      <option value="Building">Building</option>
                    </select>
                  </div>
                </>
              )}

              {/* Employees To Notify */}
              <div>
                <label className="mb-2 block text-sm font-medium text-zinc-900">
                  {t("workOrders.fields.employeesToNotify", "Employees To be Notified")}
                </label>
                <input
                  type="text"
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Search employees..."
                  className="mb-2 w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {filteredEmployees.map((employee) => {
                    const isSelected = selectedEmployees.includes(employee.id);
                    return (
                      <label
                        key={employee.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 ring-1 transition ${
                          isSelected
                            ? "bg-emerald-50 ring-emerald-300"
                            : "bg-white ring-zinc-200 hover:bg-zinc-50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedEmployees((prev) => prev.filter((id) => id !== employee.id));
                              setFormData((prev) => ({
                                ...prev,
                                employeeIdsToNotify: prev.employeeIdsToNotify.filter(
                                  (id) => id !== employee.id,
                                ),
                              }));
                            } else {
                              setSelectedEmployees((prev) => [...prev, employee.id]);
                              setFormData((prev) => ({
                                ...prev,
                                employeeIdsToNotify: [...prev.employeeIdsToNotify, employee.id],
                              }));
                            }
                          }}
                          className="h-5 w-5 rounded border-zinc-300 text-emerald-600 focus:ring-2 focus:ring-emerald-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-zinc-900">
                            {employee.firstName} {employee.lastName}
                          </div>
                          <div className="mt-0.5 text-xs text-zinc-500">
                            {employee.email} • {employee.employeeId}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
                  <div className="text-sm text-red-900">{error}</div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {loading ? "Creating..." : t("workOrders.actions.create", "Create Work Order")}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
