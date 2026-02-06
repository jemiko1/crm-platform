"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import Link from "next/link";
import dynamic from "next/dynamic";
import { PermissionGuard } from "@/lib/permission-guard";

const DeleteItemModal = dynamic(() => import("./delete-item-modal"), {
  loading: () => <div>Loading...</div>,
  ssr: false,
});

const BRAND = "rgb(8, 117, 56)";

type ListCategory = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  tableName: string | null;
  fieldName: string | null;
  isUserEditable: boolean;
  sortOrder: number;
  isActive: boolean;
  items: ListItem[];
};

type ListItem = {
  id: string;
  categoryId: string;
  value: string;
  displayName: string;
  description: string | null;
  colorHex: string | null;
  icon: string | null;
  sortOrder: number;
  isDefault: boolean;
  isActive: boolean;
};

export default function CategoryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const categoryId = params?.categoryId as string;

  const [category, setCategory] = useState<ListCategory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ListItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ListItem | null>(null);

  const [formData, setFormData] = useState({
    value: "",
    displayName: "",
    description: "",
    colorHex: "",
    icon: "",
    sortOrder: "",
    isDefault: false,
    isActive: true,
  });

  useEffect(() => {
    if (categoryId) {
      fetchCategory();
    }
  }, [categoryId]);

  async function fetchCategory() {
    try {
      setLoading(true);
      const data = await apiGet<ListCategory>(`/v1/system-lists/categories/${categoryId}`);
      setCategory(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load category");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setFormData({
      value: "",
      displayName: "",
      description: "",
      colorHex: "",
      icon: "",
      sortOrder: "",
      isDefault: false,
      isActive: true,
    });
  }

  function handleEdit(item: ListItem) {
    setEditingItem(item);
    setFormData({
      value: item.value,
      displayName: item.displayName,
      description: item.description || "",
      colorHex: item.colorHex || "",
      icon: item.icon || "",
      sortOrder: item.sortOrder.toString(),
      isDefault: item.isDefault,
      isActive: item.isActive,
    });
    setShowAddModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) return;

    try {
      const payload = {
        categoryId: category.id,
        value: formData.value,
        displayName: formData.displayName,
        description: formData.description || undefined,
        colorHex: formData.colorHex || undefined,
        icon: formData.icon || undefined,
        sortOrder: formData.sortOrder ? parseInt(formData.sortOrder) : undefined,
        isDefault: formData.isDefault,
        isActive: formData.isActive,
      };

      if (editingItem) {
        await apiPatch(`/v1/system-lists/items/${editingItem.id}`, payload);
      } else {
        await apiPost("/v1/system-lists/items", payload);
      }

      setShowAddModal(false);
      setEditingItem(null);
      resetForm();
      fetchCategory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save item");
    }
  }

  async function handleDeactivate(item: ListItem) {
    if (!confirm(`Are you sure you want to deactivate "${item.displayName}"?`)) {
      return;
    }

    try {
      await apiPatch(`/v1/system-lists/items/${item.id}/deactivate`, {});
      fetchCategory();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to deactivate item");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-zinc-500">Loading category...</div>
      </div>
    );
  }

  if (error || !category) {
    return (
      <div className="space-y-4">
        <Link
          href="/app/admin/list-items"
          className="text-sm text-zinc-600 hover:text-zinc-900 underline"
        >
          ← Back to List Items
        </Link>
        <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
          <div className="text-sm font-semibold text-rose-900">Error</div>
          <div className="mt-1 text-sm text-rose-700">{error || "Category not found"}</div>
        </div>
      </div>
    );
  }

  const activeItems = category.items.filter((i) => i.isActive);
  const inactiveItems = category.items.filter((i) => !i.isActive);

  return (
    <PermissionGuard permission="admin.access">
      <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/app/admin/list-items"
          className="text-sm text-zinc-600 hover:text-zinc-900 underline"
        >
          ← Back to List Items
        </Link>

        <div className="mt-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{category.name}</h1>
            {category.description && (
              <p className="mt-2 text-sm text-zinc-600">{category.description}</p>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
              {category.tableName && (
                <span className="rounded-full bg-zinc-100 px-2 py-1 font-mono">
                  {category.tableName}.{category.fieldName}
                </span>
              )}
              {category.isUserEditable ? (
                <span className="rounded-full bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                  ✏️ Editable
                </span>
              ) : (
                <span className="rounded-full bg-zinc-200 px-2 py-1 font-medium text-zinc-700">
                  🔒 System-Managed
                </span>
              )}
            </div>
          </div>

          {category.isUserEditable && (
            <button
              onClick={() => {
                resetForm();
                setEditingItem(null);
                setShowAddModal(true);
              }}
              className="rounded-2xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
              style={{ backgroundColor: BRAND }}
            >
              + Add Item
            </button>
          )}
        </div>
      </div>

      {!category.isUserEditable && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div className="font-semibold text-amber-900">Read-Only Category</div>
          </div>
          <p className="mt-1 text-sm text-amber-700">
            This list is managed by the system and cannot be edited to maintain data integrity.
          </p>
        </div>
      )}

      {/* Active Items */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Active Items</h2>
          <div className="text-xs text-zinc-500">{activeItems.length} items</div>
        </div>

        {activeItems.length === 0 ? (
          <div className="rounded-2xl bg-zinc-50 p-8 text-center ring-1 ring-zinc-200">
            <div className="text-sm text-zinc-600">No active items in this category</div>
          </div>
        ) : (
          <div className="space-y-2">
            {activeItems.map((item) => (
              <div
                key={item.id}
                className="group flex items-center gap-4 rounded-2xl border-2 border-zinc-200 bg-white p-4 transition hover:border-zinc-300"
              >
                {/* Color indicator */}
                {item.colorHex && (
                  <div
                    className="h-10 w-10 rounded-xl ring-2 ring-zinc-200"
                    style={{ backgroundColor: item.colorHex }}
                  />
                )}

                {/* Icon */}
                {item.icon && <div className="text-2xl">{item.icon}</div>}

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-zinc-900">{item.displayName}</div>
                    {item.isDefault && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-500">
                    <span className="font-mono">{item.value}</span>
                    {item.description && (
                      <>
                        <span>•</span>
                        <span>{item.description}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {category.isUserEditable && (
                  <div className="flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                    <button
                      onClick={() => handleEdit(item)}
                      className="rounded-xl bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingItem(item)}
                      className="rounded-xl bg-rose-100 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-200"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => handleDeactivate(item)}
                      className="rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-200"
                    >
                      Deactivate
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inactive Items */}
      {inactiveItems.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-500">Inactive Items</h2>
            <div className="text-xs text-zinc-500">{inactiveItems.length} items</div>
          </div>

          <div className="space-y-2 opacity-60">
            {inactiveItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 rounded-2xl border-2 border-zinc-200 bg-zinc-50 p-4"
              >
                {item.colorHex && (
                  <div
                    className="h-10 w-10 rounded-xl opacity-50 ring-2 ring-zinc-200"
                    style={{ backgroundColor: item.colorHex }}
                  />
                )}
                {item.icon && <div className="text-2xl opacity-50">{item.icon}</div>}
                <div className="flex-1">
                  <div className="font-semibold text-zinc-600">{item.displayName}</div>
                  <div className="mt-0.5 text-xs text-zinc-500">
                    <span className="font-mono">{item.value}</span>
                    {item.description && (
                      <>
                        <span> • </span>
                        <span>{item.description}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-full bg-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700">
                  Inactive
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
          onClick={() => {
            setShowAddModal(false);
            setEditingItem(null);
            resetForm();
          }}
        >
          <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
            <div
              className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b border-zinc-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-zinc-900">
                  {editingItem ? "Edit Item" : "Add New Item"}
                </h2>
                <p className="mt-1 text-xs text-zinc-600">{category.name}</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-zinc-900">
                      Value (Backend) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.value}
                      onChange={(e) => setFormData((p) => ({ ...p, value: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm"
                      placeholder="ELEVATOR"
                      required
                      disabled={!!editingItem}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-900">
                      Display Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.displayName}
                      onChange={(e) => setFormData((p) => ({ ...p, displayName: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm"
                      placeholder="Elevator"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-900">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                    className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm"
                    rows={2}
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-zinc-900">Color (Hex)</label>
                    <input
                      type="text"
                      value={formData.colorHex}
                      onChange={(e) => setFormData((p) => ({ ...p, colorHex: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-mono"
                      placeholder="#10b981"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-900">Icon/Emoji</label>
                    <input
                      type="text"
                      value={formData.icon}
                      onChange={(e) => setFormData((p) => ({ ...p, icon: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm"
                      placeholder="📦"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-900">Sort Order</label>
                    <input
                      type="number"
                      value={formData.sortOrder}
                      onChange={(e) => setFormData((p) => ({ ...p, sortOrder: e.target.value }))}
                      className="mt-2 w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm"
                      placeholder="0"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isDefault}
                      onChange={(e) => setFormData((p) => ({ ...p, isDefault: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm text-zinc-700">Set as default value</span>
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm text-zinc-700">Active</span>
                  </label>
                </div>

                <div className="flex items-center gap-2 border-t border-zinc-200 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setEditingItem(null);
                      resetForm();
                    }}
                    className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="ml-auto rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                    style={{ backgroundColor: BRAND }}
                  >
                    {editingItem ? "Save Changes" : "Create Item"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deletingItem && (
        <DeleteItemModal
          item={deletingItem}
          category={category}
          availableItems={activeItems.filter((i) => i.id !== deletingItem.id)}
          onClose={() => setDeletingItem(null)}
          onSuccess={() => {
            setDeletingItem(null);
            fetchCategory();
          }}
        />
      )}
    </div>
    </PermissionGuard>
  );
}
