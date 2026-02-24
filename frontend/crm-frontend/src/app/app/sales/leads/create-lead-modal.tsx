"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiGetList, apiPost, ApiError } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type LeadSource = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
};

type SalesService = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  monthlyPrice: number | null;
  oneTimePrice: number | null;
};

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
};

interface CreateLeadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateLeadModal({ open, onClose, onSuccess }: CreateLeadModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Options
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [services, setServices] = useState<SalesService[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Form state - Contact
  const [name, setName] = useState("");
  const [representative, setRepresentative] = useState("");
  const [primaryPhone, setPrimaryPhone] = useState("");
  const [associationName, setAssociationName] = useState("");
  const [sourceId, setSourceId] = useState("");

  // Form state - Building
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [floorsCount, setFloorsCount] = useState(0);
  const [entrancesCount, setEntrancesCount] = useState(0);
  const [apartmentsPerFloor, setApartmentsPerFloor] = useState(0);
  const [elevatorsCount, setElevatorsCount] = useState(0);
  const [entranceDoorsCount, setEntranceDoorsCount] = useState(0);

  // Form state - Services
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // Form state - Assignment
  const [responsibleEmployeeId, setResponsibleEmployeeId] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      loadOptions();
    }
  }, [open]);

  const loadOptions = async () => {
    try {
      const [sourcesRes, servicesRes, employeesRes] = await Promise.all([
        apiGet<LeadSource[]>("/v1/sales/config/sources"),
        apiGet<SalesService[]>("/v1/sales/services"),
        apiGetList<Employee>("/v1/employees?status=ACTIVE"),
      ]);
      setSources(sourcesRes);
      setServices(servicesRes);
      setEmployees(employeesRes);
    } catch (err) {
      console.error("Failed to load options:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiPost("/v1/sales/leads", {
        name,
        representative: representative || undefined,
        primaryPhone,
        associationName: associationName || undefined,
        sourceId: sourceId || undefined,
        city,
        address,
        floorsCount,
        entrancesCount,
        apartmentsPerFloor,
        elevatorsCount,
        entranceDoorsCount,
        serviceIds: selectedServices.length > 0 ? selectedServices : undefined,
        responsibleEmployeeId: responsibleEmployeeId || undefined,
      });

      onSuccess();
      resetForm();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to create lead");
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setRepresentative("");
    setPrimaryPhone("");
    setAssociationName("");
    setSourceId("");
    setCity("");
    setAddress("");
    setFloorsCount(0);
    setEntrancesCount(0);
    setApartmentsPerFloor(0);
    setElevatorsCount(0);
    setEntranceDoorsCount(0);
    setSelectedServices([]);
    setResponsibleEmployeeId("");
    setError(null);
  };

  const toggleService = (serviceId: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  if (!open || !mounted) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div
          className="w-full overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Create New Lead</h2>
                <p className="mt-1 text-xs text-zinc-600">Add a new potential building to the pipeline</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Contact Information */}
            <div className="mb-8">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">Contact Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Lead Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Building or company name"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Representative</label>
                  <input
                    type="text"
                    value={representative}
                    onChange={(e) => setRepresentative(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Contact person name"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    value={primaryPhone}
                    onChange={(e) => setPrimaryPhone(e.target.value)}
                    required
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="+995 XXX XX XX XX"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Association Name</label>
                  <input
                    type="text"
                    value={associationName}
                    onChange={(e) => setAssociationName(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="HOA name (optional)"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Lead Source</label>
                  <select
                    value={sourceId}
                    onChange={(e) => setSourceId(e.target.value)}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Select source</option>
                    {sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.name} ({source.nameKa})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Building Information */}
            <div className="mb-8">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">Building Information</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="e.g., Tbilisi"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Street and number"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Floors Count</label>
                  <input
                    type="number"
                    value={floorsCount}
                    onChange={(e) => setFloorsCount(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Entrances Count</label>
                  <input
                    type="number"
                    value={entrancesCount}
                    onChange={(e) => setEntrancesCount(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Apartments per Floor</label>
                  <input
                    type="number"
                    value={apartmentsPerFloor}
                    onChange={(e) => setApartmentsPerFloor(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Elevators Count</label>
                  <input
                    type="number"
                    value={elevatorsCount}
                    onChange={(e) => setElevatorsCount(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-zinc-700">Entrance Doors Count</label>
                  <input
                    type="number"
                    value={entranceDoorsCount}
                    onChange={(e) => setEntranceDoorsCount(parseInt(e.target.value) || 0)}
                    min={0}
                    className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              </div>
            </div>

            {/* Services */}
            <div className="mb-8">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">Requested Services</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {services.map((service) => (
                  <label
                    key={service.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                      selectedServices.includes(service.id)
                        ? "border-emerald-500 bg-emerald-50"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedServices.includes(service.id)}
                      onChange={() => toggleService(service.id)}
                      className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-zinc-900">{service.name}</div>
                      <div className="text-xs text-zinc-500">{service.nameKa}</div>
                    </div>
                    <div className="text-right">
                      {service.monthlyPrice && (
                        <div className="text-xs text-zinc-600">{service.monthlyPrice} GEL/mo</div>
                      )}
                      {service.oneTimePrice && (
                        <div className="text-xs text-zinc-500">{service.oneTimePrice} GEL once</div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Assignment */}
            <div className="mb-8">
              <h3 className="mb-4 text-sm font-semibold text-zinc-900">Assignment</h3>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Responsible Employee
                </label>
                <select
                  value={responsibleEmployeeId}
                  onChange={(e) => setResponsibleEmployeeId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">Assign to me (default)</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 border-t border-zinc-200 pt-6">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !name || !primaryPhone || !city || !address}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {loading ? "Creating..." : "Create Lead"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
