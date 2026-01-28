"use client";

import React, { useState, useEffect } from "react";
import ModalDialog from "../../modal-dialog";
import { API_BASE } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  defaultPurchasePrice: string;
};

type POItem = {
  productId: string;
  quantity: number;
  purchasePrice: number;
  sellPrice: number;
};

type CreatePurchaseOrderModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products: Product[];
};

export default function CreatePurchaseOrderModal({
  open,
  onClose,
  onSuccess,
  products,
}: CreatePurchaseOrderModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    supplierName: "",
    supplierEmail: "",
    orderDate: new Date().toISOString().split("T")[0],
    expectedDate: "",
    notes: "",
  });

  const [items, setItems] = useState<POItem[]>([
    { productId: "", quantity: 1, purchasePrice: 0, sellPrice: 0 },
  ]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: "", quantity: 1, purchasePrice: 0, sellPrice: 0 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof POItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, [field]: field === "productId" ? value : Number(value) } : item
      )
    );
  }

  function handleProductSelect(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    if (product) {
      updateItem(index, "productId", productId);
      // Don't auto-fill prices anymore - user must enter them
    }
  }

  function calculateTotal() {
    return items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0).toFixed(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate items
      const validItems = items.filter((item) => item.productId && item.quantity > 0);
      if (validItems.length === 0) {
        throw new Error("Please add at least one product");
      }

      const res = await fetch(`${API_BASE}/v1/inventory/purchase-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          supplierName: formData.supplierName,
          supplierEmail: formData.supplierEmail || undefined,
          orderDate: formData.orderDate,
          expectedDate: formData.expectedDate || undefined,
          notes: formData.notes || undefined,
          items: validItems,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create purchase order");
      }

      // Reset form
      setFormData({
        supplierName: "",
        supplierEmail: "",
        orderDate: new Date().toISOString().split("T")[0],
        expectedDate: "",
        notes: "",
      });
      setItems([{ productId: "", quantity: 1, purchasePrice: 0, sellPrice: 0 }]);

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create purchase order");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalDialog open={open} onClose={onClose} title="Create Purchase Order" maxWidth="4xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
            <div className="text-sm font-semibold text-rose-900">Error</div>
            <div className="mt-1 text-sm text-rose-700">{error}</div>
          </div>
        )}

        {/* Supplier Information */}
        <div className="space-y-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
          <h3 className="text-sm font-semibold text-zinc-900">Supplier Information</h3>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-zinc-900">
                Supplier Name <span className="text-rose-600">*</span>
              </label>
              <input
                type="text"
                name="supplierName"
                required
                value={formData.supplierName}
                onChange={handleChange}
                placeholder="e.g., Shenzhen Electronics Co."
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-900">Supplier Email</label>
              <input
                type="email"
                name="supplierEmail"
                value={formData.supplierEmail}
                onChange={handleChange}
                placeholder="supplier@example.com"
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-zinc-900">
                Order Date <span className="text-rose-600">*</span>
              </label>
              <input
                type="date"
                name="orderDate"
                required
                value={formData.orderDate}
                onChange={handleChange}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-900">Expected Delivery</label>
              <input
                type="date"
                name="expectedDate"
                value={formData.expectedDate}
                onChange={handleChange}
                className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-900">Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              placeholder="Optional notes about this purchase order..."
              className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {/* Items */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-900">Items</h3>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              <IconPlus />
              Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div
                key={index}
                className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 md:flex-row md:items-end"
              >
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-zinc-900">Product</label>
                  <select
                    value={item.productId}
                    onChange={(e) => handleProductSelect(index, e.target.value)}
                    required
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  >
                    <option value="">Select product...</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.sku} - {product.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full md:w-24">
                  <label className="block text-xs font-semibold text-zinc-900">Quantity</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={item.quantity}
                    onChange={(e) => updateItem(index, "quantity", e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="w-full md:w-28">
                  <label className="block text-xs font-semibold text-zinc-900">Purchase ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={item.purchasePrice}
                    onChange={(e) => updateItem(index, "purchasePrice", e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="w-full md:w-28">
                  <label className="block text-xs font-semibold text-zinc-900">Sell ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={item.sellPrice}
                    onChange={(e) => updateItem(index, "sellPrice", e.target.value)}
                    className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                <div className="w-full md:w-28">
                  <label className="block text-xs font-semibold text-zinc-900">Subtotal</label>
                  <div className="mt-1 rounded-xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900">
                    ${(item.quantity * item.purchasePrice).toFixed(2)}
                  </div>
                </div>

                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="self-end rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
            <div className="text-sm font-semibold text-emerald-900">Total Amount</div>
            <div className="text-xl font-bold text-emerald-900">${calculateTotal()}</div>
          </div>
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
            {loading ? "Creating..." : "Create Purchase Order"}
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
