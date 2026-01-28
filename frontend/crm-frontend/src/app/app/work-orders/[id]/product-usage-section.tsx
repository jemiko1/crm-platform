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
    // Filter out products with quantity 0 (marked for deletion) and ensure at least one valid product
    const validUsages = usages.filter((u) => u.quantity > 0);
    
    if (validUsages.length === 0 && usages.length > 0) {
      // All products were removed
      if (!window.confirm("Are you sure you want to remove all products?")) {
        return;
      }
    } else if (validUsages.length === 0) {
      setError("Please add at least one product");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isHeadOfTechnical) {
        // Tech head approves with product usages (can modify)
        await apiPost(`/v1/work-orders/${workOrderId}/approve`, {
          productUsages: validUsages,
          comment: "",
        });
      } else {
        // Tech employee submits products
        await apiPost(`/v1/work-orders/${workOrderId}/products`, validUsages);
      }
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

  // Unified view for both tech employee and tech head when work order is IN_PROGRESS
  if (workOrderStatus === "IN_PROGRESS" && (isAssignedEmployee || isHeadOfTechnical)) {
    const unapprovedUsages = existingUsages.filter((u) => !u.isApproved);
    const hasUnapproved = unapprovedUsages.length > 0;
    const isModifying = isHeadOfTechnical && hasUnapproved && usages.length > 0;

    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {isHeadOfTechnical ? "Product Usage Review" : "Product Usage"}
          </h2>
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

        {/* Show unapproved usages from tech employee - editable for tech head */}
        {isHeadOfTechnical && hasUnapproved && (
          <div className="mb-4 space-y-2">
            <div className="text-xs font-semibold text-zinc-500 uppercase mb-2">Submitted by Tech Employee</div>
            {unapprovedUsages.map((usage) => {
              const existingIndex = usages.findIndex((u) => u.productId === usage.product.id);
              const isInModifications = existingIndex >= 0;
              const currentQuantity = isInModifications ? usages[existingIndex].quantity : usage.quantity;
              
              return (
                <div
                  key={usage.id}
                  className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                >
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-900">{usage.product.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      SKU: {usage.product.sku}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-600">Qty:</label>
                    <input
                      type="number"
                      min="0"
                      max={products.find((p) => p.id === usage.product.id)?.currentStock || 0}
                      value={currentQuantity}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value) || 0;
                        if (newQty === usage.quantity && isInModifications) {
                          // Remove from modifications if back to original
                          removeUsage(existingIndex);
                        } else if (newQty !== usage.quantity) {
                          // Add or update in modifications
                          if (isInModifications) {
                            updateUsage(existingIndex, "quantity", newQty);
                          } else {
                            addUsage(usage.product.id, newQty);
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const newQty = parseInt(e.target.value) || 0;
                        if (newQty === 0 && isInModifications) {
                          // Confirm deletion on blur if quantity is 0
                          if (window.confirm(`Are you sure you want to remove ${usage.product.name}?`)) {
                            removeUsage(existingIndex);
                          } else {
                            // Reset to original quantity
                            e.target.value = usage.quantity.toString();
                          }
                        }
                      }}
                      className="w-20 rounded-xl border-zinc-300 bg-white px-2 py-1 text-sm text-center focus:border-emerald-500 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to remove ${usage.product.name}?`)) {
                          if (isInModifications) {
                            removeUsage(existingIndex);
                          }
                          // Add to usages with quantity 0 to mark for deletion
                          const existing = usages.find((u) => u.productId === usage.product.id);
                          if (!existing) {
                            addUsage(usage.product.id, 0);
                          }
                        }
                      }}
                      className="rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200 transition-colors"
                      title="Remove product"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Show current usages being added/modified */}
        {usages.length > 0 && (
          <div className="mb-4 space-y-2">
            {isModifying && (
              <div className="text-xs font-semibold text-amber-600 uppercase mb-2">Your Modifications</div>
            )}
            {usages.filter((u) => u.quantity > 0).map((usage, index) => {
              const product = products.find((p) => p.id === usage.productId);
              const actualIndex = usages.findIndex((u, i) => u.productId === usage.productId && u.quantity > 0 && i >= index);
              return (
                <div
                  key={`${usage.productId}-${index}`}
                  className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 ring-1 ring-zinc-200"
                >
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-zinc-900">
                      {product?.name || "Unknown Product"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      SKU: {product?.sku || "N/A"} • Stock: {product?.currentStock || 0}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-zinc-600">Qty:</label>
                    <input
                      type="number"
                      min="1"
                      max={product?.currentStock || 0}
                      value={usage.quantity}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value) || 1;
                        if (newQty > 0 && newQty <= (product?.currentStock || 0)) {
                          updateUsage(actualIndex >= 0 ? actualIndex : index, "quantity", newQty);
                        }
                      }}
                      onBlur={(e) => {
                        const newQty = parseInt(e.target.value) || 1;
                        if (newQty < 1) {
                          updateUsage(actualIndex >= 0 ? actualIndex : index, "quantity", 1);
                        } else if (newQty > (product?.currentStock || 0)) {
                          updateUsage(actualIndex >= 0 ? actualIndex : index, "quantity", product?.currentStock || 1);
                        }
                      }}
                      className="w-20 rounded-xl border-zinc-300 bg-white px-2 py-1 text-sm text-center focus:border-emerald-500 focus:ring-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to remove ${product?.name || "this product"}?`)) {
                          removeUsage(actualIndex >= 0 ? actualIndex : index);
                        }
                      }}
                      className="rounded-lg bg-red-100 p-1.5 text-red-600 hover:bg-red-200 transition-colors"
                      title="Remove product"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(usages.length > 0 || (isHeadOfTechnical && hasUnapproved)) && (
          <button
            type="button"
            onClick={async () => {
              if (isHeadOfTechnical && hasUnapproved) {
                const hasChanges = usages.length > 0;
                if (hasChanges) {
                  const confirmed = window.confirm(
                    "Are you sure you want to modify the products submitted by the tech employee? This will replace their submission."
                  );
                  if (!confirmed) return;
                }
              }
              await handleSubmit();
            }}
            disabled={loading}
            className="w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
            style={{ backgroundColor: BRAND }}
          >
            {loading 
              ? "Submitting..." 
              : isHeadOfTechnical 
                ? t("workOrders.actions.approve", "Approve Products")
                : t("workOrders.actions.submitProducts", "Submit Products")
            }
          </button>
        )}

        {isHeadOfTechnical && !hasUnapproved && usages.length === 0 && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm text-emerald-700 ring-1 ring-emerald-200">
            All products approved. You can add more products if needed.
          </div>
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
                  onAdd(selectedProductId, quantity);
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
