"use client";

import React, { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { usePermissions } from "@/lib/use-permissions";

const BRAND = "rgb(8, 117, 56)";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
};

type DeactivatedDevice = {
  productId: string;
  quantity: number;
  batchId?: string;
  notes?: string;
};

type DeactivatedDevicesSectionProps = {
  workOrderId: string;
  workOrderStatus: string;
  existingDevices?: Array<{
    id: string;
    quantity: number;
    isWorkingCondition: boolean;
    transferredToStock: boolean;
    product: {
      id: string;
      name: string;
      sku: string;
      category: string;
    };
  }>;
  isAssignedEmployee: boolean;
  isHeadOfTechnical: boolean;
  onUpdate: () => void;
};

export default function DeactivatedDevicesSection({
  workOrderId,
  workOrderStatus,
  existingDevices = [],
  isAssignedEmployee,
  isHeadOfTechnical,
  onUpdate,
}: DeactivatedDevicesSectionProps) {
  const { t } = useI18n();
  const { hasPermission } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<DeactivatedDevice[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch products
  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      try {
        const data = await apiGet<Product[]>("/v1/inventory/products");
        if (!cancelled) {
          setProducts(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to fetch products:", err);
        }
      }
    }

    fetchProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    if (devices.length === 0) {
      setError("Please add at least one device");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/work-orders/${workOrderId}/deactivated-devices`, devices);
      setDevices([]);
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to submit devices");
      }
    } finally {
      setLoading(false);
    }
  }

  function addDevice(productId: string, quantity: number, batchId?: string, notes?: string) {
    setDevices((prev) => [...prev, { productId, quantity, batchId, notes }]);
  }

  function removeDevice(index: number) {
    setDevices((prev) => prev.filter((_, i) => i !== index));
  }

  // Tech employee view
  if (workOrderStatus === "IN_PROGRESS" && isAssignedEmployee) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Deactivated Devices</h2>
          {hasPermission('work_orders.manage_devices') && (
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: BRAND }}
            >
              + Add Device
            </button>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
            <div className="text-sm text-red-900">{error}</div>
          </div>
        )}

        {devices.length > 0 && (
          <div className="mb-4 space-y-2">
            {devices.map((device, index) => {
              const product = products.find((p) => p.id === device.productId);
              return (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                >
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-900">
                      {product?.name || "Unknown Product"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">Quantity: {device.quantity}</div>
                  </div>
                  {hasPermission('work_orders.manage_devices') && (
                    <button
                      type="button"
                      onClick={() => removeDevice(index)}
                      className="rounded-2xl px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {devices.length > 0 && hasPermission('work_orders.manage_devices') && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {loading ? "Submitting..." : t("workOrders.actions.submitDevices", "Submit Devices")}
          </button>
        )}

        {showAddModal && (
          <AddDeviceModal
            products={products}
            onAdd={(productId, quantity, batchId, notes) => {
              addDevice(productId, quantity, batchId, notes);
              setShowAddModal(false);
            }}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </div>
    );
  }

  // Display only
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">Deactivated Devices</h2>
      {existingDevices.length > 0 ? (
        <div className="space-y-2">
          {existingDevices.map((device) => (
            <div
              key={device.id}
              className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
            >
              <div className="text-sm font-semibold text-zinc-900">{device.product.name}</div>
              <div className="mt-1 text-xs text-zinc-500">
                SKU: {device.product.sku} • Quantity: {device.quantity}
                {device.isWorkingCondition && (
                  <span className="ml-2 text-emerald-600">✓ Working Condition</span>
                )}
                {device.transferredToStock && (
                  <span className="ml-2 text-blue-600">✓ Transferred to Stock</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-zinc-50 p-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
          No deactivated devices recorded
        </div>
      )}
    </div>
  );
}

function AddDeviceModal({
  products,
  onAdd,
  onClose,
}: {
  products: Product[];
  onAdd: (productId: string, quantity: number, batchId?: string, notes?: string) => void;
  onClose: () => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">Add Deactivated Device</h3>
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-900">Product</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {selectedProduct && (
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-900">Quantity</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
            </div>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-900">Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-2xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 ring-1 ring-zinc-200 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (selectedProductId && quantity > 0) {
                  onAdd(selectedProductId, quantity, undefined, notes || undefined);
                }
              }}
              disabled={!selectedProductId || quantity <= 0}
              className="flex-1 rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              style={{ backgroundColor: BRAND }}
            >
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
