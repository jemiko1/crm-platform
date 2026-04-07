"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiGet, apiGetList, apiPost, apiPut } from "@/lib/api";
import AddProductModal from "./add-product-modal";
import EditProductModal from "./edit-product-modal";
import CreatePurchaseOrderModal from "./create-purchase-order-modal";
import EditPurchaseOrderModal from "./edit-purchase-order-modal";
import { PermissionGuard } from "@/lib/permission-guard";
import { usePermissions } from "@/lib/use-permissions";
import { useI18n } from "@/hooks/useI18n";
import { useModalContext } from "../modal-stack-context";

const BRAND = "rgb(0, 86, 83)";

type Tab = "products" | "purchase-orders" | "transactions" | "deactivated-devices";

type Product = {
  id: string;
  sku: string;
  name: string;
  description?: string;
  category: string;
  unit: string;
  currentStock: number;
  reservedStock: number;
  lowStockThreshold: number;
  defaultPurchasePrice: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type PurchaseOrder = {
  id: string;
  poNumber: string;
  supplierName: string;
  supplierEmail?: string;
  status: string;
  orderDate?: string;
  expectedDate?: string;
  receivedDate?: string;
  totalAmount: string;
  notes?: string;
  items: PurchaseOrderItem[];
  createdAt: string;
  updatedAt: string;
};

type PurchaseOrderItem = {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  purchasePrice: string;
  sellPrice: string;
  subtotal: string;
};

type StockTransaction = {
  id: string;
  productId: string;
  product: Product;
  type: string;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  performedBy?: string;
  performedByEmail?: string;
  notes?: string;
  workOrderId?: string;
  createdAt: string;
};

type GroupedTransaction = {
  groupId: string;
  groupType: "work_order" | "standalone";
  workOrder?: {
    id: string;
    workOrderNumber: number;
    title: string;
    type: string;
    status: string;
    buildingName?: string;
  };
  summary: {
    netEffect: { productId: string; productName: string; productSku: string; quantity: number }[];
    date: string;
    performedBy?: string;
  };
  transactions: StockTransaction[];
};

export default function InventoryPage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>("products");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [transactions, setTransactions] = useState<GroupedTransaction[]>([]);

  const [showAddProductModal, setShowAddProductModal] = useState(false);
  const [showEditProductModal, setShowEditProductModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showAddPOModal, setShowAddPOModal] = useState(false);
  const [showEditPOModal, setShowEditPOModal] = useState(false);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await apiGet<{ data: Product[]; meta: any } | Product[]>("/v1/inventory/products");
      if (Array.isArray(res)) {
        setProducts(res);
      } else if (res && Array.isArray(res.data)) {
        setProducts(res.data);
      } else {
        setProducts([]);
      }
    } catch (err) {
      console.error("Failed to load products:", err);
      setProducts([]);
    }
  }, []);

  const fetchPurchaseOrders = useCallback(async () => {
    try {
      const data = await apiGetList<PurchaseOrder>("/v1/inventory/purchase-orders");
      setPurchaseOrders(data);
    } catch (err) {
      console.error("Failed to load purchase orders:", err);
      setPurchaseOrders([]);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await apiGet<{ data: GroupedTransaction[]; meta: any }>("/v1/inventory/transactions/grouped?pageSize=100");
      if (res && Array.isArray(res.data)) {
        setTransactions(res.data);
      } else {
        setTransactions([]);
      }
    } catch (err) {
      console.error("Failed to load transactions:", err);
      setTransactions([]);
    }
  }, []);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        await Promise.all([fetchProducts(), fetchPurchaseOrders(), fetchTransactions()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [fetchProducts, fetchPurchaseOrders, fetchTransactions]);

  if (loading) {
    return (
      <div className="w-full">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-zinc-200">
          <div className="py-12 text-center text-sm text-zinc-600">Loading inventory...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <div className="rounded-3xl bg-rose-50 p-6 ring-1 ring-rose-200">
          <div className="text-sm font-semibold text-rose-900">Error loading inventory</div>
          <div className="mt-1 text-sm text-rose-700">{error}</div>
        </div>
      </div>
    );
  }

  // Calculate low stock count
  const lowStockCount = products.filter((p) => p.currentStock <= p.lowStockThreshold).length;

  return (
    <PermissionGuard permission="inventory.menu">
      <div className="w-full space-y-6">
        {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{t("inventory.title", "Inventory Management")}</h1>
          <p className="mt-1 text-sm text-zinc-600">
            {t("inventory.description", "Track stock levels, manage purchases, and monitor transactions")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {lowStockCount > 0 && (
            <div className="rounded-2xl bg-amber-50 px-4 py-2 ring-1 ring-amber-200">
              <div className="text-xs font-semibold text-amber-900">
                {lowStockCount} {t("inventory.lowStockItems", "Low Stock Item(s)")}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-zinc-200 overflow-x-auto">
        <div className="flex gap-1 flex-nowrap min-w-0">
          <TabButton
            label={`${t("inventory.tabs.products", "Products")} (${products.length})`}
            active={activeTab === "products"}
            onClick={() => setActiveTab("products")}
          />
          <TabButton
            label={`${t("inventory.tabs.purchaseOrders", "Purchase Orders")} (${purchaseOrders.length})`}
            active={activeTab === "purchase-orders"}
            onClick={() => setActiveTab("purchase-orders")}
          />
          <TabButton
            label={`${t("inventory.tabs.transactions", "Transactions")} (${transactions.length})`}
            active={activeTab === "transactions"}
            onClick={() => setActiveTab("transactions")}
          />
          <TabButton
            label={t("inventory.tabs.deactivatedDevices", "Deactivated Devices")}
            active={activeTab === "deactivated-devices"}
            onClick={() => setActiveTab("deactivated-devices")}
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 shadow-sm ring-1 ring-zinc-200">
        {activeTab === "products" && (
          <ProductsTab
            products={products}
            onAddClick={() => setShowAddProductModal(true)}
            onEditClick={(product) => {
              setSelectedProduct(product);
              setShowEditProductModal(true);
            }}
            onRefresh={fetchProducts}
          />
        )}
        {activeTab === "purchase-orders" && (
          <PurchaseOrdersTab
            purchaseOrders={purchaseOrders}
            onAddClick={() => setShowAddPOModal(true)}
            onEditClick={(po) => {
              setSelectedPO(po);
              setShowEditPOModal(true);
            }}
            onRefresh={fetchPurchaseOrders}
          />
        )}
        {activeTab === "transactions" && <TransactionsTab transactions={transactions} />}
        {activeTab === "deactivated-devices" && <DeactivatedDevicesTab />}
      </div>

      {/* Modals */}
      <AddProductModal
        open={showAddProductModal}
        onClose={() => setShowAddProductModal(false)}
        onSuccess={fetchProducts}
      />

      <EditProductModal
        open={showEditProductModal}
        onClose={() => {
          setShowEditProductModal(false);
          setSelectedProduct(null);
        }}
        onSuccess={fetchProducts}
        product={selectedProduct}
      />

      <CreatePurchaseOrderModal
        open={showAddPOModal}
        onClose={() => setShowAddPOModal(false)}
        onSuccess={fetchPurchaseOrders}
        products={products}
      />

      <EditPurchaseOrderModal
        open={showEditPOModal}
        onClose={() => {
          setShowEditPOModal(false);
          setSelectedPO(null);
        }}
        onSuccess={fetchPurchaseOrders}
        products={products}
        purchaseOrder={selectedPO}
      />
      </div>
    </PermissionGuard>
  );
}

/* ========== TAB BUTTON ========== */
function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-t-2xl px-6 py-3 text-sm font-semibold transition-all",
        active
          ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
          : "bg-transparent text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

/* ========== PRODUCTS TAB ========== */
function ProductsTab({
  products,
  onAddClick,
  onEditClick,
  onRefresh,
}: {
  products: Product[];
  onAddClick: () => void;
  onEditClick: (product: Product) => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const { hasPermission } = usePermissions();

  function getCategoryBadge(category: string) {
    const styles: Record<string, string> = {
      ROUTER: "bg-blue-50 text-blue-700 ring-blue-200",
      CONTROLLER: "bg-purple-50 text-purple-700 ring-purple-200",
      SENSOR: "bg-teal-50 text-teal-900 ring-teal-200",
      CABLE: "bg-amber-50 text-amber-700 ring-amber-200",
      ACCESSORY: "bg-zinc-50 text-zinc-700 ring-zinc-200",
      HARDWARE: "bg-slate-50 text-slate-700 ring-slate-200",
      SOFTWARE: "bg-indigo-50 text-indigo-700 ring-indigo-200",
      OTHER: "bg-zinc-50 text-zinc-700 ring-zinc-200",
    };
    return styles[category] || styles.OTHER;
  }

  function getStockStatus(product: Product) {
    if (product.currentStock === 0) {
      return { label: "Out of Stock", class: "bg-rose-50 text-rose-700 ring-rose-200" };
    }
    if (product.currentStock <= product.lowStockThreshold) {
      return { label: "Low Stock", class: "bg-amber-50 text-amber-700 ring-amber-200" };
    }
    return { label: "In Stock", class: "bg-teal-50 text-teal-900 ring-teal-200" };
  }

  if (products.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Product Catalog</h2>
          {hasPermission("inventory.create") && (
            <button
              onClick={onAddClick}
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: BRAND }}
            >
              <IconPlus />
              {t("inventory.addProduct", "Add Product")}
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">{t("inventory.noProducts", "No products in catalog yet.")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">Product Catalog ({products.length})</h2>
        {hasPermission("inventory.create") && (
          <button
            onClick={onAddClick}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            <IconPlus />
              {t("inventory.addProduct", "Add Product")}
            </button>
          )}
        </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-[700px] w-full">
          <thead>
            <tr className="border-b border-zinc-200 text-left">
              <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                SKU
              </th>
              <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                Product
              </th>
              <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                Category
              </th>
              <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                {t("inventory.stock", "Stock")}
              </th>
              <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                {t("inventory.reserved", "Reserved")}
              </th>
              <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                {t("inventory.status", "Status")}
              </th>
              <th className="pb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const stockStatus = getStockStatus(product);

              return (
                <tr
                  key={product.id}
                  className="group border-b border-zinc-100 transition hover:bg-teal-50/30"
                >
                  <td className="py-4">
                    <div className="text-sm font-semibold text-zinc-900">{product.sku}</div>
                  </td>
                  <td className="py-4">
                    <div className="text-sm font-semibold text-zinc-900">{product.name}</div>
                    {product.description && (
                      <div className="mt-0.5 text-xs text-zinc-600 line-clamp-1">
                        {product.description}
                      </div>
                    )}
                  </td>
                  <td className="py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getCategoryBadge(product.category)}`}
                    >
                      {product.category}
                    </span>
                  </td>
                  <td className="py-4">
                    <div className="text-sm font-semibold text-zinc-900">
                      {product.currentStock} {product.unit}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {t("inventory.threshold", "Threshold")}: {product.lowStockThreshold}
                    </div>
                  </td>
                  <td className="py-4">
                    {(product.reservedStock ?? 0) > 0 ? (
                      <div>
                        <div className="text-sm font-semibold text-amber-700">
                          {product.reservedStock} {product.unit}
                        </div>
                        <div className="text-xs text-zinc-500">
                          {t("inventory.available", "Available")}: {product.currentStock - (product.reservedStock ?? 0)}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-zinc-400">—</div>
                    )}
                  </td>
                  <td className="py-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${stockStatus.class}`}
                    >
                      {stockStatus.label}
                    </span>
                  </td>
                  <td className="py-4">
                    <button
                      onClick={() => onEditClick(product)}
                      className="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 transition hover:bg-teal-100"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ========== PURCHASE ORDERS TAB ========== */
function PurchaseOrdersTab({
  purchaseOrders,
  onAddClick,
  onEditClick,
  onRefresh,
}: {
  purchaseOrders: PurchaseOrder[];
  onAddClick: () => void;
  onEditClick: (po: PurchaseOrder) => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      DRAFT: "bg-zinc-50 text-zinc-700 ring-zinc-200",
      ORDERED: "bg-blue-50 text-blue-700 ring-blue-200",
      SHIPPED: "bg-purple-50 text-purple-700 ring-purple-200",
      RECEIVED: "bg-teal-50 text-teal-900 ring-teal-200",
      CANCELLED: "bg-rose-50 text-rose-700 ring-rose-200",
    };
    return styles[status] || styles.DRAFT;
  }

  function formatDate(isoString?: string) {
    if (!isoString) return "—";
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  }

  if (purchaseOrders.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Purchase Orders</h2>
          <button
            onClick={onAddClick}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ backgroundColor: BRAND }}
          >
            <IconPlus />
            {t("inventory.createPO", "Create Purchase Order")}
          </button>
        </div>

        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">{t("inventory.noPurchaseOrders", "No purchase orders yet.")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900">
          Purchase Orders ({purchaseOrders.length})
        </h2>
        <button
          onClick={onAddClick}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND }}
        >
          <IconPlus />
          {t("inventory.createPO", "Create Purchase Order")}
        </button>
      </div>

      <div className="space-y-3">
        {purchaseOrders.map((po) => (
          <div
            key={po.id}
            className="rounded-3xl bg-white p-5 ring-1 ring-zinc-200 transition hover:bg-teal-50/50 hover:ring-teal-300"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-zinc-900">{po.poNumber}</div>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${getStatusBadge(po.status)}`}
                  >
                    {po.status}
                  </span>
                </div>

                <div className="mt-1 text-sm text-zinc-700">
                  Supplier: <span className="font-medium">{po.supplierName}</span>
                </div>

                <div className="mt-2 text-xs text-zinc-600">
                  {po.items.length} item{po.items.length !== 1 ? "s" : ""} •{" "}
                  {formatDate(po.orderDate)} • Total: ${po.totalAmount}
                </div>
              </div>

              <div className="shrink-0 space-y-2 text-right">
                <div className="text-sm font-semibold text-zinc-900">${po.totalAmount}</div>
                <div className="text-xs text-zinc-500">
                  {po.receivedDate ? `Received ${formatDate(po.receivedDate)}` : "Pending"}
                </div>

                {po.status !== "RECEIVED" && po.status !== "CANCELLED" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onEditClick(po)}
                      className="rounded-full bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700"
                    >
                      Edit
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Mark PO ${po.poNumber} as RECEIVED?`)) return;

                        try {
                          await apiPut(`/v1/inventory/purchase-orders/${po.id}/status`, {
                            status: "RECEIVED",
                            receivedDate: new Date().toISOString().split("T")[0],
                          });

                          alert("✅ PO marked as received! Stock batches created.");
                          onRefresh();
                        } catch (err) {
                          alert("❌ Failed to receive PO: " + (err as Error).message);
                        }
                      }}
                      className="rounded-full bg-teal-800 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-900"
                    >
                      Mark as Received
                    </button>
                    <button
                      onClick={async () => {
                        if (!confirm(`Cancel PO ${po.poNumber}? This action cannot be undone.`)) return;

                        try {
                          await apiPut(`/v1/inventory/purchase-orders/${po.id}/status`, {
                            status: "CANCELLED",
                          });

                          alert("✅ PO cancelled successfully.");
                          onRefresh();
                        } catch (err) {
                          alert("❌ Failed to cancel PO: " + (err as Error).message);
                        }
                      }}
                      className="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========== TRANSACTIONS TAB ========== */
function TransactionsTab({ transactions }: { transactions: GroupedTransaction[] }) {
  const { t } = useI18n();
  const { openModal } = useModalContext();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  function toggleExpand(groupId: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }

  function getTypeBadge(type: string) {
    const styles: Record<string, string> = {
      PURCHASE_IN: "bg-teal-50 text-teal-900 ring-teal-200",
      WORK_ORDER_OUT: "bg-blue-50 text-blue-700 ring-blue-200",
      ADJUSTMENT_IN: "bg-purple-50 text-purple-700 ring-purple-200",
      ADJUSTMENT_OUT: "bg-amber-50 text-amber-700 ring-amber-200",
      RETURN_IN: "bg-cyan-50 text-cyan-700 ring-cyan-200",
      DAMAGED_OUT: "bg-rose-50 text-rose-700 ring-rose-200",
      RESERVATION_HOLD: "bg-orange-50 text-orange-700 ring-orange-200",
      RESERVATION_RELEASE: "bg-lime-50 text-lime-700 ring-lime-200",
      REVERSAL_IN: "bg-indigo-50 text-indigo-700 ring-indigo-200",
    };
    return styles[type] || "bg-zinc-50 text-zinc-700 ring-zinc-200";
  }

  function getTypeLabel(type: string) {
    return t(`inventory.transactionTypes.${type}`, {
      PURCHASE_IN: "Purchase",
      WORK_ORDER_OUT: "Work Order",
      ADJUSTMENT_IN: "Adjustment In",
      ADJUSTMENT_OUT: "Adjustment Out",
      RETURN_IN: "Return",
      DAMAGED_OUT: "Damaged",
      RESERVATION_HOLD: "Reserved",
      RESERVATION_RELEASE: "Reservation Released",
      REVERSAL_IN: "Reversal",
    }[type] || type);
  }

  function getGroupTypeBadge(group: GroupedTransaction) {
    if (group.groupType === "work_order") return "bg-blue-50 text-blue-700 ring-blue-200";
    const type = group.transactions[0]?.type;
    return getTypeBadge(type);
  }

  function getGroupTypeLabel(group: GroupedTransaction) {
    if (group.groupType === "work_order") return t("inventory.transactionTypes.WORK_ORDER_OUT", "Work Order");
    return getTypeLabel(group.transactions[0]?.type);
  }

  function getWoTypeLabel(type: string) {
    const labels: Record<string, string> = {
      INSTALLATION: t("workOrders.types.INSTALLATION", "Installation"),
      DIAGNOSTIC: t("workOrders.types.DIAGNOSTIC", "Diagnostic"),
      RESEARCH: t("workOrders.types.RESEARCH", "Research"),
      DEACTIVATE: t("workOrders.types.DEACTIVATE", "Deactivation"),
      REPAIR_CHANGE: t("workOrders.types.REPAIR_CHANGE", "Repair/Change"),
      ACTIVATE: t("workOrders.types.ACTIVATE", "Activation"),
    };
    return labels[type] || type;
  }

  function formatDateTime(isoString: string) {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  }

  if (transactions.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">{t("inventory.transactionHistory", "Transaction History")}</h2>
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">{t("inventory.noTransactions", "No transactions recorded yet.")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900">
        {t("inventory.transactionHistory", "Transaction History")} ({transactions.length})
      </h2>

      <div className="space-y-2">
        {transactions.map((group) => {
          const isExpanded = expandedGroups.has(group.groupId);
          const isWorkOrder = group.groupType === "work_order";
          const hasMultipleTxns = group.transactions.length > 1;

          return (
            <div
              key={group.groupId}
              className="rounded-2xl bg-white ring-1 ring-zinc-200 transition overflow-hidden"
            >
              {/* Summary row */}
              <div
                className={`p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${hasMultipleTxns ? "cursor-pointer hover:bg-zinc-50" : ""}`}
                onClick={hasMultipleTxns ? () => toggleExpand(group.groupId) : undefined}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getGroupTypeBadge(group)}`}
                    >
                      {getGroupTypeLabel(group)}
                    </span>

                    {isWorkOrder && group.workOrder ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openModal("workOrder", group.workOrder!.id);
                        }}
                        className="text-sm font-semibold text-teal-700 hover:text-teal-900 hover:underline text-left"
                      >
                        ID-{group.workOrder.workOrderNumber} — {group.workOrder.title}
                      </button>
                    ) : (
                      <span className="text-sm font-semibold text-zinc-900">
                        {group.summary.netEffect.map((e) => e.productName).join(", ")}
                      </span>
                    )}

                    {isWorkOrder && group.workOrder && (
                      <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
                        {getWoTypeLabel(group.workOrder.type)}
                      </span>
                    )}
                  </div>

                  {/* Net effect per product */}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {group.summary.netEffect.map((effect) => (
                      <span key={effect.productId} className="text-xs text-zinc-600">
                        <span className="font-medium text-zinc-800">{effect.productName}</span>
                        {" "}
                        <span className={effect.quantity < 0 ? "text-rose-600 font-semibold" : effect.quantity > 0 ? "text-teal-600 font-semibold" : "text-zinc-400"}>
                          {effect.quantity > 0 ? "+" : ""}{effect.quantity}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-zinc-500">{formatDateTime(group.summary.date)}</div>
                    {group.summary.performedBy && (
                      <div className="mt-0.5 text-xs font-medium text-zinc-700">{group.summary.performedBy}</div>
                    )}
                  </div>
                  {hasMultipleTxns && (
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center justify-center rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600">
                        {group.transactions.length}
                      </span>
                      <svg
                        className={`h-4 w-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded detail rows */}
              {isExpanded && hasMultipleTxns && (
                <div className="border-t border-zinc-100 bg-zinc-50/50">
                  {group.transactions.map((txn) => (
                    <div
                      key={txn.id}
                      className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-100 last:border-b-0"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${getTypeBadge(txn.type)}`}
                          >
                            {getTypeLabel(txn.type)}
                          </span>
                          <span className="text-xs font-medium text-zinc-800">
                            {txn.product?.name || ""} ({txn.product?.sku || ""})
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {txn.quantity > 0 ? "+" : ""}{txn.quantity} • {txn.balanceBefore} → {txn.balanceAfter}
                          {txn.notes && <span className="ml-2 text-zinc-400">— {txn.notes}</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-zinc-400">{formatDateTime(txn.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ========== DEACTIVATED DEVICES TAB ========== */
function DeactivatedDevicesTab() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [devices, setDevices] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchDevices() {
      try {
        setLoading(true);
        setError(null);
        const data = await apiGetList<any>("/v1/inventory/deactivated-devices?transferred=false");
        if (!cancelled) setDevices(data);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Failed to load deactivated devices");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchDevices();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">{t("inventory.tabs.deactivatedDevices", "Deactivated Devices")}</h2>
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">{t("inventory.loadingDevices", "Loading deactivated devices...")}</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">{t("inventory.tabs.deactivatedDevices", "Deactivated Devices")}</h2>
        <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
          <div className="text-sm text-red-900">{error}</div>
        </div>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">{t("inventory.tabs.deactivatedDevices", "Deactivated Devices")}</h2>
        <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
          <div className="text-sm text-zinc-600">{t("inventory.noDeactivated", "No deactivated devices found.")}</div>
          <p className="mt-2 text-xs text-zinc-500">
            Devices from DEACTIVATE work orders will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-zinc-900">
        {t("inventory.tabs.deactivatedDevices", "Deactivated Devices")} ({devices.length})
      </h2>
      <div className="space-y-2">
        {devices.map((device) => (
          <div
            key={device.id}
            className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 transition hover:bg-zinc-50"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-zinc-900">{device.product?.name || "Unknown"}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  Quantity: {device.quantity}
                  {device.isWorkingCondition && (
                    <span className="ml-2 text-teal-800">✓ Working Condition</span>
                  )}
                  {device.transferredToStock && (
                    <span className="ml-2 text-blue-600">✓ Transferred to Stock</span>
                  )}
                </div>
              </div>
              {!device.isWorkingCondition && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiPost(`/v1/inventory/deactivated-devices/${device.id}/mark-working`, {});
                      window.location.reload();
                    } catch (err: any) {
                      alert(err.message || "Failed to mark as working condition");
                    }
                  }}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                  style={{ backgroundColor: BRAND }}
                >
                  Mark as Working
                </button>
              )}
              {device.isWorkingCondition && !device.transferredToStock && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm("Transfer this device to active stock?")) return;
                    try {
                      await apiPost(`/v1/inventory/deactivated-devices/${device.id}/transfer-to-stock`, {});
                      window.location.reload();
                    } catch (err: any) {
                      alert(err.message || "Failed to transfer to stock");
                    }
                  }}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                  style={{ backgroundColor: BRAND }}
                >
                  Transfer to Stock
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========== ICONS ========== */
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
