"use client";

import React, { useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";

type LeadService = {
  id: string;
  quantity: number;
  monthlyPrice: number | null;
  oneTimePrice: number | null;
  notes: string | null;
  service: {
    id: string;
    code: string;
    name: string;
    nameKa: string;
    monthlyPrice: number | null;
    oneTimePrice: number | null;
  };
};

type SalesService = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  monthlyPrice: number | null;
  oneTimePrice: number | null;
};

interface LeadServicesSectionProps {
  leadId: string;
  services: LeadService[];
  isLocked: boolean;
  onUpdate: () => void;
}

export default function LeadServicesSection({
  leadId,
  services,
  isLocked,
  onUpdate,
}: LeadServicesSectionProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [availableServices, setAvailableServices] = useState<SalesService[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAvailableServices = async () => {
    try {
      const data = await apiGet<SalesService[]>("/v1/sales/services");
      // Filter out already added services
      const existingIds = services.map((s) => s.service.id);
      setAvailableServices(data.filter((s) => !existingIds.includes(s.id)));
    } catch (err) {
      console.error("Failed to load services:", err);
    }
  };

  const handleAddService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedServiceId) return;

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/sales/leads/${leadId}/services`, {
        serviceId: selectedServiceId,
        quantity,
      });
      setShowAddForm(false);
      setSelectedServiceId("");
      setQuantity(1);
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to add service");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveService = async (serviceId: string) => {
    if (!confirm("Are you sure you want to remove this service?")) return;

    try {
      await apiDelete(`/v1/sales/leads/${leadId}/services/${serviceId}`);
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  const totalMonthly = services.reduce(
    (sum, s) => sum + (Number(s.monthlyPrice) || 0) * s.quantity,
    0
  );
  const totalOneTime = services.reduce(
    (sum, s) => sum + (Number(s.oneTimePrice) || 0) * s.quantity,
    0
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-zinc-900">Services</h3>
        {!isLocked && (
          <button
            onClick={() => {
              loadAvailableServices();
              setShowAddForm(true);
            }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            Add Service
          </button>
        )}
      </div>

      {/* Add Service Form */}
      {showAddForm && (
        <form onSubmit={handleAddService} className="mb-6 rounded-xl bg-zinc-50 p-4">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Service</label>
              <select
                value={selectedServiceId}
                onChange={(e) => setSelectedServiceId(e.target.value)}
                required
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">Select service...</option>
                {availableServices.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} ({service.nameKa})
                    {service.monthlyPrice && ` - ${service.monthlyPrice} GEL/mo`}
                    {service.oneTimePrice && ` + ${service.oneTimePrice} GEL once`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                min={1}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedServiceId}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {loading ? "Adding..." : "Add Service"}
            </button>
          </div>
        </form>
      )}

      {/* Services List */}
      {services.length === 0 ? (
        <p className="text-center text-zinc-500">No services added yet</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-zinc-600">
                    Service
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-zinc-600">
                    Qty
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-zinc-600">
                    Monthly
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-zinc-600">
                    One-time
                  </th>
                  {!isLocked && (
                    <th className="px-4 py-3 text-center text-xs font-semibold uppercase text-zinc-600">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {services.map((ls) => (
                  <tr key={ls.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{ls.service.name}</div>
                      <div className="text-xs text-zinc-500">{ls.service.nameKa}</div>
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-900">{ls.quantity}</td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {ls.monthlyPrice
                        ? `${(Number(ls.monthlyPrice) * ls.quantity).toFixed(2)} GEL`
                        : "-"}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-900">
                      {ls.oneTimePrice
                        ? `${(Number(ls.oneTimePrice) * ls.quantity).toFixed(2)} GEL`
                        : "-"}
                    </td>
                    {!isLocked && (
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => handleRemoveService(ls.service.id)}
                          className="rounded p-1 text-red-600 hover:bg-red-50"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-zinc-300 bg-zinc-50">
                <tr>
                  <td colSpan={2} className="px-4 py-3 font-semibold text-zinc-900">
                    Total
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                    {totalMonthly.toFixed(2)} GEL/mo
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-600">
                    {totalOneTime.toFixed(2)} GEL
                  </td>
                  {!isLocked && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
