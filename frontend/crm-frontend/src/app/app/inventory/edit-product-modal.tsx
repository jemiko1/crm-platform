"use client";

import React, { useState, useEffect } from "react";
import ModalDialog from "../../modal-dialog";

const BRAND = "rgb(8, 117, 56)";

type Product = {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  lowStockThreshold: number;
};

type EditProductModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  product: Product | null;
};

export default function EditProductModal({ open, onClose, onSuccess, product }: EditProductModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name,
        description: product.description || "",
      });
    }
  }, [product]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`http://localhost:3000/v1/inventory/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name,
          description: formData.description || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to update product");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product");
    } finally {
      setLoading(false);
    }
  }

  if (!product) return null;

  return (
    <ModalDialog open={open} onClose={onClose} title="Edit Product" maxWidth="2xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
            <div className="text-sm font-semibold text-rose-900">Error</div>
            <div className="mt-1 text-sm text-rose-700">{error}</div>
          </div>
        )}

        {/* Product Info (Read-only) */}
        <div className="rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <div className="text-xs font-semibold text-zinc-500">SKU</div>
          <div className="mt-1 text-sm font-semibold text-zinc-900">{product.sku}</div>
          <div className="mt-3 text-xs font-semibold text-zinc-500">Category</div>
          <div className="mt-1 text-sm text-zinc-900">{product.category}</div>
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
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
