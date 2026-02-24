"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import { PermissionGuard } from "@/lib/permission-guard";

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
  _count?: {
    items: number;
  };
};

export default function ListItemsPage() {
  const [categories, setCategories] = useState<ListCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    try {
      setLoading(true);
      const data = await apiGet<ListCategory[]>("/v1/system-lists/categories");
      setCategories(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load categories");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-zinc-500">Loading list categories...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
        <div className="text-sm font-semibold text-rose-900">Error</div>
        <div className="mt-1 text-sm text-rose-700">{error}</div>
      </div>
    );
  }

  const editableCategories = categories.filter((c) => c.isUserEditable);
  const systemCategories = categories.filter((c) => !c.isUserEditable);

  return (
    <PermissionGuard permission="admin.access">
      <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">List Items Management</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Manage dropdown values, categories, and system lists used throughout the CRM.
        </p>
      </div>

      {/* User-Editable Categories */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">User-Editable Lists</h2>
          <div className="text-xs text-zinc-500">
            {editableCategories.length} categories
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {editableCategories.map((category) => (
            <Link
              key={category.id}
              href={`/app/admin/list-items/${category.id}`}
              className="group rounded-2xl border-2 border-zinc-200 bg-white p-6 transition hover:border-emerald-300 hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="font-semibold text-zinc-900 group-hover:text-emerald-700">
                    {category.name}
                  </h3>
                  {category.description && (
                    <p className="mt-1 text-xs text-zinc-600">{category.description}</p>
                  )}
                </div>
                <div className="ml-2 text-2xl transition-transform group-hover:translate-x-1">
                  →
                </div>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-zinc-700">
                    {category._count?.items ?? 0}
                  </span>{" "}
                  items
                </div>
                {category.tableName && (
                  <div className="flex items-center gap-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs text-zinc-600">
                      {category.tableName}.{category.fieldName}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                ✏️ Editable
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* System-Managed Categories */}
      {systemCategories.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900">System-Managed Lists</h2>
            <div className="text-xs text-zinc-500">
              {systemCategories.length} categories
            </div>
          </div>

          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div className="font-semibold text-amber-900">Read-Only Categories</div>
            </div>
            <p className="text-sm text-amber-700">
              These lists are managed by the system and cannot be edited to maintain data
              integrity and business logic.
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {systemCategories.map((category) => (
              <div
                key={category.id}
                className="rounded-2xl border-2 border-zinc-200 bg-zinc-50 p-6 opacity-75"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-zinc-700">{category.name}</h3>
                    {category.description && (
                      <p className="mt-1 text-xs text-zinc-600">{category.description}</p>
                    )}
                  </div>
                  <div className="ml-2 text-2xl text-zinc-400">🔒</div>
                </div>

                <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                  <div className="flex items-center gap-1">
                    <span className="font-semibold text-zinc-700">
                      {category._count?.items ?? 0}
                    </span>{" "}
                    items
                  </div>
                  {category.tableName && (
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 font-mono text-xs text-zinc-600">
                        {category.tableName}.{category.fieldName}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl bg-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700">
                  🔒 System-Managed
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </PermissionGuard>
  );
}
