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
};

type POItem = {
  productId: string;
  quantity: number;
  purchasePrice: number;
  sellPrice: number;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierName: string;
  supplierEmail?: string;
  orderDate?: string;
  expectedDate?: string;
  notes?: string;
  items: Array<{
    id: string;
    productId: string;
    quantity: number;
    purchasePrice: string;
    sellPrice: string;
    product: Product;
  }>;
};

type EditPurchaseOrderModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  products: Product[];
  purchaseOrder: PurchaseOrder | null;
};

export default function EditPurchaseOrderModal({
  open,
  onClose,
  onSuccess,
  products,
  purchaseOrder,
}: EditPurchaseOrderModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    supplierName: "",
    supplierEmail: "",
    orderDate: "",
    expectedDate: "",
    notes: "",
  });

  const [items, setItems] = useState<POItem[]>([
    { productId: "", quantity: 1, purchasePrice: 0, sellPrice: 0 },
  ]);

  useEffect(() => {
    if (purchaseOrder) {
      setFormData({
        supplierName: purchaseOrder.supplierName,
        supplierEmail: purchaseOrder.supplierEmail || "",
        orderDate: purchaseOrder.orderDate ? purchaseOrder.orderDate.split("T")[0] : "",
        expectedDate: purchaseOrder.expectedDate ? purchaseOrder.expectedDate.split("T")[0] : "",
        notes: purchaseOrder.notes || "",
      });

      setItems(
        purchaseOrder.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          purchasePrice: parseFloat(item.purchasePrice),
          sellPrice: parseFloat(item.sellPrice),
        }))
      );
    }
  }, [purchaseOrder]);

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
        i === index ? { ...item, [field]: typeof value === "string" ? parseFloat(value) || 0 : value } : item
      )
    );
  }

  function handleProductSelect(index: number, productId: string) {
    updateItem(index, "productId", productId);
  }

  function calculateTotal() {
    return items.reduce((sum, item) => sum + item.quantity * item.purchasePrice, 0).toFixed(2);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!purchaseOrder) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/v1/inventory/purchase-orders/${purchaseOrder.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          supplierName: formData.supplierName,
          supplierEmail: formData.supplierEmail || undefined,
          orderDate: formData.orderDate || undefined,
          expectedDate: formData.expectedDate || undefined,
          notes: formData.notes || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            sellPrice: item.sellPrice,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to update purchase order");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update purchase order");
    } finally {
      setLoading(false);
    }
  }

  if (!purchaseOrder) return null;

  return (
    <ModalDialog open={open} onClose={onClose} title={`Edit PO ${purchaseOrder.poNumber}`} maxWidth="4xl">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
            <div className="text-sm font-semibold text-rose-900">Error</div>
            <div className="mt-1 text-sm text-rose-700">{error}</div>
          </div>
        )}

        {/* Supplier Info */}
        <div className="grid gap-6 md:grid-cols-2">
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
              placeholder="China Supplier Ltd"
              className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
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
              className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {/* Dates */}
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-zinc-900">Order Date</label>
            <input
              type="date"
              name="orderDate"
              value={formData.orderDate}
              onChange={handleChange}
              className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-zinc-900">Expected Delivery Date</label>
            <input
              type="date"
              name="expectedDate"
              value={formData.expectedDate}
              onChange={handleChange}
              className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <label className="block text-sm font-semibold text-zinc-900">
              Order Items <span className="text-rose-600">*</span>
            </label>
            <button
              type="button"
              onClick={addItem}
              className="rounded-full bg-emerald-50 px-4 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
            >
              + Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="flex flex-wrap items-end gap-3 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-semibold text-zinc-900">Product</label>
                  <select
                    required
                    value={item.productId}
                    onChange={(e) => handleProductSelect(index, e.target.value)}
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
                  <label className="block text-xs font-semibold text-zinc-900">Qty</label>
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

        {/* Notes */}
        <div>
          <label className="block text-sm font-semibold text-zinc-900">Notes</label>
          <textarea
            name="notes"
            value={formData.notes}
            onChange={handleChange}
            rows={3}
            placeholder="Additional notes or special instructions..."
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
