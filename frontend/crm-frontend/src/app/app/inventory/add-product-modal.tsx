"use client";

import React, { useState } from "react";
import ModalDialog from "../../modal-dialog";

const BRAND = "rgb(8, 117, 56)";

type AddProductModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const CATEGORIES = [
  { value: "ROUTER", label: "Router" },
  { value: "CONTROLLER", label: "Controller" },
  { value: "SENSOR", label: "Sensor" },
  { value: "CABLE", label: "Cable" },
  { value: "ACCESSORY", label: "Accessory" },
  { value: "HARDWARE", label: "Hardware" },
  { value: "SOFTWARE", label: "Software" },
  { value: "OTHER", label: "Other" },
];

const UNITS = [
  { value: "PIECE", label: "Piece" },
  { value: "METER", label: "Meter" },
  { value: "KG", label: "Kilogram" },
  { value: "BOX", label: "Box" },
  { value: "SET", label: "Set" },
];

export default function AddProductModal({ open, onClose, onSuccess }: AddProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    sku: "",
    name: "",
    description: "",
    category: "ROUTER",
    unit: "PIECE",
    lowStockThreshold: "10",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("http://localhost:3000/v1/inventory/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          sku: formData.sku,
          name: formData.name,
          description: formData.description || undefined,
          category: formData.category,
          unit: formData.unit,
          lowStockThreshold: parseInt(formData.lowStockThreshold),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create product");
      }

      // Reset form
      setFormData({
        sku: "",
        name: "",
        description: "",
        category: "ROUTER",
        unit: "PIECE",
        lowStockThreshold: "10",
      });

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create product");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Add New Product" maxWidth="2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
            <div className="text-sm font-semibold text-rose-900">Error</div>
            <div className="mt-1 text-sm text-rose-700">{error}</div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* SKU */}
          <div>
            <label className="block text-sm font-semibold text-zinc-900">
              SKU <span className="text-rose-600">*</span>
            </label>
            <input
              type="text"
              name="sku"
              required
              value={formData.sku}
              onChange={handleChange}
              placeholder="e.g., RTR-001"
              className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-semibold text-zinc-900">
              Category <span className="text-rose-600">*</span>
            </label>
            <select
              name="category"
              required
              value={formData.category}
              onChange={handleChange}
              className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-zinc-900">
            Product Name <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            name="name"
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., TP-Link Router AC1200"
            className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-zinc-900">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            placeholder="Optional product description..."
            className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="grid gap-6 md:grid-cols-1">
          {/* Unit */}
          <div>
            <label className="block text-sm font-semibold text-zinc-900">
              Unit <span className="text-rose-600">*</span>
            </label>
            <select
              name="unit"
              required
              value={formData.unit}
              onChange={handleChange}
              className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            >
              {UNITS.map((unit) => (
                <option key={unit.value} value={unit.value}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Low Stock Threshold */}
        <div>
          <label className="block text-sm font-semibold text-zinc-900">Low Stock Threshold</label>
          <input
            type="number"
            name="lowStockThreshold"
            required
            min="0"
            value={formData.lowStockThreshold}
            onChange={handleChange}
            placeholder="10"
            className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Alert when stock falls below this number
          </p>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {loading ? "Creating..." : "Add Product"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
