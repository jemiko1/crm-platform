"use client";

import React, { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(8, 117, 56)";

type Product = {
  id: string;
  name: string;
  sku: string;
  category: string;
  currentStock: number;
};

type StockBatch = {
  id: string;
  remainingQuantity: number;
  purchasePrice: number;
  sellPrice: number;
  receivedDate: string;
};

type ProductUsage = {
  productId: string;
  quantity: number;
  batchId?: string;
};

type ProductUsageSectionProps = {
  workOrderId: string;
  workOrderType: string;
  workOrderStatus: string;
  existingUsages?: Array<{
    id: string;
    quantity: number;
    isApproved: boolean;
    product: {
      id: string;
      name: string;
      sku: string;
      category: string;
    };
    batch?: {
      id: string;
      purchasePrice: number;
      sellPrice: number;
    };
  }>;
  isAssignedEmployee: boolean;
  isHeadOfTechnical: boolean;
  onUpdate: () => void;
};

export default function ProductUsageSection({
  workOrderId,
  workOrderType,
  workOrderStatus,
  existingUsages = [],
  isAssignedEmployee,
  isHeadOfTechnical,
  onUpdate,
}: ProductUsageSectionProps) {
  const { t } = useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usages, setUsages] = useState<ProductUsage[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // Fetch products
  useEffect(() => {
    let cancelled = false;

    async function fetchProducts() {
      try {
        const data = await apiGet<Product[]>("/v1/inventory/products");
        if (!cancelled) {
          setProducts(data.filter((p) => p.currentStock > 0));
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
    if (usages.length === 0) {
      setError("Please add at least one product");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/work-orders/${workOrderId}/products`, usages);
      setUsages([]);
      onUpdate();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to submit products");
      }
    } finally {
      setLoading(false);
    }
  }

  function addUsage(productId: string, quantity: number, batchId?: string) {
    setUsages((prev) => [...prev, { productId, quantity, batchId }]);
  }

  function removeUsage(index: number) {
    setUsages((prev) => prev.filter((_, i) => i !== index));
  }

  function updateUsage(index: number, field: keyof ProductUsage, value: any) {
    setUsages((prev) =>
      prev.map((usage, i) => (i === index ? { ...usage, [field]: value } : usage)),
    );
  }

  // Tech employee view
  if (workOrderStatus === "IN_PROGRESS" && isAssignedEmployee) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">Product Usage</h2>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            style={{ backgroundColor: BRAND }}
          >
            + Add Product
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
            <div className="text-sm text-red-900">{error}</div>
          </div>
        )}

        {usages.length > 0 && (
          <div className="mb-4 space-y-2">
            {usages.map((usage, index) => {
              const product = products.find((p) => p.id === usage.productId);
              return (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                >
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-900">
                      {product?.name || "Unknown Product"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      Quantity: {usage.quantity} • Stock: {product?.currentStock || 0}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeUsage(index)}
                    className="rounded-2xl px-3 py-1 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {usages.length > 0 && (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {loading ? "Submitting..." : t("workOrders.actions.submitProducts", "Submit Products")}
          </button>
        )}

        {showAddModal && (
          <AddProductModal
            products={products}
            onAdd={(productId, quantity, batchId) => {
              addUsage(productId, quantity, batchId);
              setShowAddModal(false);
            }}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </div>
    );
  }

  // Head view - review and approve
  if (workOrderStatus === "IN_PROGRESS" && isHeadOfTechnical && existingUsages.length > 0) {
    const unapprovedUsages = existingUsages.filter((u) => !u.isApproved);
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <h2 className="text-lg font-semibold text-zinc-900 mb-4">Product Usage Review</h2>
        {unapprovedUsages.length > 0 ? (
          <div className="space-y-3">
            {unapprovedUsages.map((usage) => (
              <div
                key={usage.id}
                className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
              >
                <div className="text-sm font-semibold text-zinc-900">{usage.product.name}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  SKU: {usage.product.sku} • Quantity: {usage.quantity}
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => {
                const comment = prompt("Enter approval comment (optional):");
                // TODO: Implement approve with product usages
                alert("Approve functionality - to be implemented");
              }}
              className="w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: BRAND }}
            >
              {t("workOrders.actions.approve", "Approve Products")}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm text-emerald-700 ring-1 ring-emerald-200">
            All products approved
          </div>
        )}
      </div>
    );
  }

  // Display only
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">Product Usage</h2>
      {existingUsages.length > 0 ? (
        <div className="space-y-2">
          {existingUsages.map((usage) => (
            <div
              key={usage.id}
              className="rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
            >
              <div className="text-sm font-semibold text-zinc-900">{usage.product.name}</div>
              <div className="mt-1 text-xs text-zinc-500">
                SKU: {usage.product.sku} • Quantity: {usage.quantity}
                {usage.isApproved && (
                  <span className="ml-2 text-emerald-600">✓ Approved</span>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-zinc-50 p-4 text-center text-sm text-zinc-600 ring-1 ring-zinc-200">
          No products used
        </div>
      )}
    </div>
  );
}

function AddProductModal({
  products,
  onAdd,
  onClose,
}: {
  products: Product[];
  onAdd: (productId: string, quantity: number, batchId?: string) => void;
  onClose: () => void;
}) {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("");

  useEffect(() => {
    if (!selectedProductId) {
      setBatches([]);
      return;
    }

    let cancelled = false;

    async function fetchBatches() {
      try {
        // TODO: Fetch batches for product
        // const data = await apiGet(`/v1/inventory/products/${selectedProductId}/batches`);
        // if (!cancelled) setBatches(data);
      } catch (err) {
        console.error("Failed to fetch batches:", err);
      }
    }

    fetchBatches();

    return () => {
      cancelled = true;
    };
  }, [selectedProductId]);

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-zinc-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-zinc-900 mb-4">Add Product</h3>
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
                  {p.name} (Stock: {p.currentStock})
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
                max={selectedProduct.currentStock}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              />
              <div className="mt-1 text-xs text-zinc-500">
                Available: {selectedProduct.currentStock}
              </div>
            </div>
          )}
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
                  onAdd(selectedProductId, quantity, selectedBatchId || undefined);
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
