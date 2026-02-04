"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type SalesService = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  description: string | null;
  monthlyPrice: number | null;
  oneTimePrice: number | null;
  sortOrder: number;
  isActive: boolean;
  category: {
    id: string;
    name: string;
    nameKa: string;
  } | null;
};

type ServiceCategory = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  _count: { services: number };
};

export default function ServicesAdminPage() {
  const [services, setServices] = useState<SalesService[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingService, setEditingService] = useState<SalesService | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formNameKa, setFormNameKa] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formMonthlyPrice, setFormMonthlyPrice] = useState("");
  const [formOneTimePrice, setFormOneTimePrice] = useState("");
  const [formSortOrder, setFormSortOrder] = useState("0");
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [servicesRes, categoriesRes] = await Promise.all([
        apiGet<SalesService[]>(`/v1/sales/services?includeInactive=${showInactive}`),
        apiGet<ServiceCategory[]>(`/v1/sales/services/categories/all?includeInactive=true`),
      ]);
      setServices(servicesRes);
      setCategories(categoriesRes);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load services");
      }
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setEditingService(null);
    setFormCode("");
    setFormName("");
    setFormNameKa("");
    setFormDescription("");
    setFormMonthlyPrice("");
    setFormOneTimePrice("");
    setFormSortOrder("0");
    setFormCategoryId("");
    setFormError(null);
  };

  const handleEdit = (service: SalesService) => {
    setEditingService(service);
    setFormCode(service.code);
    setFormName(service.name);
    setFormNameKa(service.nameKa);
    setFormDescription(service.description || "");
    setFormMonthlyPrice(service.monthlyPrice?.toString() || "");
    setFormOneTimePrice(service.oneTimePrice?.toString() || "");
    setFormSortOrder(service.sortOrder.toString());
    setFormCategoryId(service.category?.id || "");
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    const payload = {
      code: formCode,
      name: formName,
      nameKa: formNameKa,
      description: formDescription || undefined,
      monthlyPrice: formMonthlyPrice ? parseFloat(formMonthlyPrice) : undefined,
      oneTimePrice: formOneTimePrice ? parseFloat(formOneTimePrice) : undefined,
      sortOrder: parseInt(formSortOrder) || 0,
      categoryId: formCategoryId || undefined,
    };

    try {
      if (editingService) {
        await apiPatch(`/v1/sales/services/${editingService.id}`, payload);
      } else {
        await apiPost("/v1/sales/services", payload);
      }
      setShowForm(false);
      resetForm();
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      } else {
        setFormError("Failed to save service");
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleToggleActive = async (service: SalesService) => {
    try {
      await apiPatch(`/v1/sales/services/${service.id}`, {
        isActive: !service.isActive,
      });
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  const handleDelete = async (service: SalesService) => {
    if (!confirm(`Are you sure you want to delete "${service.name}"?`)) return;

    try {
      await apiDelete(`/v1/sales/services/${service.id}`);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Services Catalog</h1>
            <p className="mt-1 text-sm text-zinc-600">Manage sellable services for sales pipeline</p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowForm(true);
            }}
            className="flex items-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl"
            style={{ backgroundColor: BRAND }}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Service
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-emerald-600"
          />
          Show inactive services
        </label>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-8 rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">
            {editingService ? "Edit Service" : "Add New Service"}
          </h2>

          {formError && (
            <div className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">{formError}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Code *</label>
                <input
                  type="text"
                  value={formCode}
                  onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                  required
                  placeholder="e.g., CARD_MONTHLY"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Name (EN) *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Name (KA) *</label>
                <input
                  type="text"
                  value={formNameKa}
                  onChange={(e) => setFormNameKa(e.target.value)}
                  required
                  placeholder="ქართული სახელი"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Monthly Price (GEL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formMonthlyPrice}
                  onChange={(e) => setFormMonthlyPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">One-time Price (GEL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formOneTimePrice}
                  onChange={(e) => setFormOneTimePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Sort Order</label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">Description</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={formLoading}
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-white"
                style={{ backgroundColor: BRAND }}
              >
                {formLoading ? "Saving..." : editingService ? "Update Service" : "Create Service"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Services Table */}
      <div className="rounded-2xl bg-white shadow-lg ring-1 ring-zinc-200">
        {services.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-zinc-500">
            No services found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/50">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-zinc-600">Code</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase text-zinc-600">Name</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-zinc-600">Monthly</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase text-zinc-600">One-time</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase text-zinc-600">Status</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase text-zinc-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {services.map((service) => (
                  <tr key={service.id} className={service.isActive ? "" : "bg-zinc-50 opacity-60"}>
                    <td className="px-6 py-4 font-mono text-sm text-zinc-900">{service.code}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-zinc-900">{service.name}</div>
                      <div className="text-sm text-zinc-500">{service.nameKa}</div>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-zinc-900">
                      {service.monthlyPrice ? `${service.monthlyPrice} GEL` : "-"}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-zinc-900">
                      {service.oneTimePrice ? `${service.oneTimePrice} GEL` : "-"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                          service.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-zinc-100 text-zinc-600"
                        }`}
                      >
                        {service.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleEdit(service)}
                          className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100"
                          title="Edit"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleToggleActive(service)}
                          className={`rounded p-1.5 ${
                            service.isActive
                              ? "text-amber-600 hover:bg-amber-50"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                          title={service.isActive ? "Deactivate" : "Activate"}
                        >
                          {service.isActive ? (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(service)}
                          className="rounded p-1.5 text-red-600 hover:bg-red-50"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
