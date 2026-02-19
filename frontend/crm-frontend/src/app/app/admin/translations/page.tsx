"use client";

import React, { useEffect, useState, useCallback } from "react";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import Link from "next/link";
import { PermissionGuard } from "@/lib/permission-guard";

const BRAND = "rgb(8, 117, 56)";

type Translation = {
  id: string;
  key: string;
  en: string;
  ka: string | null;
  context: string | null;
  updatedAt: string;
};

export default function TranslationsPage() {
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contextFilter, setContextFilter] = useState("");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ en: "", ka: "" });
  const [saving, setSaving] = useState(false);
  const [showSeedModal, setShowSeedModal] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fetchTranslations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<Translation[]>("/v1/translations");
      setTranslations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTranslations();
  }, [fetchTranslations]);

  const contexts = Array.from(
    new Set(translations.map((t) => t.context).filter(Boolean)),
  ).sort() as string[];

  const filtered = translations.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !t.key.toLowerCase().includes(q) &&
        !t.en.toLowerCase().includes(q) &&
        !(t.ka ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
    }
    if (contextFilter && t.context !== contextFilter) return false;
    if (showMissingOnly && t.ka) return false;
    return true;
  });

  const missingCount = translations.filter((t) => !t.ka).length;

  function startEdit(t: Translation) {
    setEditingId(t.id);
    setEditForm({ en: t.en, ka: t.ka ?? "" });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      await apiPatch(`/v1/translations/${id}`, {
        en: editForm.en,
        ka: editForm.ka || null,
      });
      setEditingId(null);
      fetchTranslations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSeed() {
    setSeeding(true);
    try {
      const enMod = await import("@/locales/en.json");
      const kaMod = await import("@/locales/ka.json");
      const result = await apiPost<{ created: number; updated: number; total: number }>(
        "/v1/translations/seed",
        { en: enMod.default, ka: kaMod.default },
      );
      alert(
        `Seed complete: ${result.created} created, ${result.updated} updated, ${result.total} total keys.`,
      );
      setShowSeedModal(false);
      fetchTranslations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  if (loading && translations.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-zinc-500">Loading translations...</div>
      </div>
    );
  }

  return (
    <PermissionGuard permission="admin.access">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <Link
            href="/app/admin"
            className="text-sm text-zinc-600 hover:text-zinc-900 underline"
          >
            &larr; Back to Admin
          </Link>

          <div className="mt-4 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">
                Translations
              </h1>
              <p className="mt-2 text-sm text-zinc-600">
                Manage bilingual UI text. {translations.length} keys total
                {missingCount > 0 && (
                  <span className="ml-2 text-amber-600 font-medium">
                    ({missingCount} missing Georgian)
                  </span>
                )}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowSeedModal(true)}
                className="rounded-2xl border-2 border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Seed from Files
              </button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            placeholder="Search key or text..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm w-72 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />

          <select
            value={contextFilter}
            onChange={(e) => setContextFilter(e.target.value)}
            className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          >
            <option value="">All sections</option>
            {contexts.map((ctx) => (
              <option key={ctx} value={ctx}>
                {ctx}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={showMissingOnly}
              onChange={(e) => setShowMissingOnly(e.target.checked)}
              className="rounded"
            />
            Missing Georgian only
          </label>

          <span className="ml-auto text-xs text-zinc-500">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
            <div className="text-sm text-rose-700">{error}</div>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl border-2 border-zinc-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="px-4 py-3 text-left font-semibold text-zinc-700 w-[250px]">
                    Key
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-700">
                    English
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-700">
                    Georgian
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-700 w-[100px]">
                    Section
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-zinc-700 w-[100px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-zinc-500">
                      {translations.length === 0
                        ? 'No translations found. Click "Seed from Files" to populate from locale files.'
                        : "No results match your filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-b border-zinc-100 hover:bg-zinc-50/50 transition ${
                        !t.ka ? "bg-amber-50/30" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <code className="text-xs text-zinc-600 bg-zinc-100 px-1.5 py-0.5 rounded break-all">
                          {t.key}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        {editingId === t.id ? (
                          <input
                            type="text"
                            value={editForm.en}
                            onChange={(e) =>
                              setEditForm((p) => ({
                                ...p,
                                en: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                          />
                        ) : (
                          <span className="text-zinc-900">{t.en}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {editingId === t.id ? (
                          <input
                            type="text"
                            value={editForm.ka}
                            onChange={(e) =>
                              setEditForm((p) => ({
                                ...p,
                                ka: e.target.value,
                              }))
                            }
                            className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm"
                            placeholder="Enter Georgian translation..."
                          />
                        ) : t.ka ? (
                          <span className="text-zinc-900">{t.ka}</span>
                        ) : (
                          <span className="text-amber-500 italic text-xs">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.context && (
                          <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
                            {t.context}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {editingId === t.id ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => saveEdit(t.id)}
                              disabled={saving}
                              className="rounded-lg px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                              style={{ backgroundColor: BRAND }}
                            >
                              {saving ? "..." : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(t)}
                            className="rounded-lg bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                          >
                            Edit
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Seed Confirmation Modal */}
        {showSeedModal && (
          <div
            className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-sm"
            onClick={() => !seeding && setShowSeedModal(false)}
          >
            <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
              <div
                className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-zinc-200 px-6 py-4">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Seed Translations
                  </h2>
                </div>
                <div className="p-6">
                  <p className="text-sm text-zinc-600">
                    This will import translation keys from the static locale
                    files (en.json and ka.json) into the database. Existing keys
                    will be updated with the file values.
                  </p>
                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => setShowSeedModal(false)}
                      disabled={seeding}
                      className="flex-1 rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSeed}
                      disabled={seeding}
                      className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: BRAND }}
                    >
                      {seeding ? "Importing..." : "Import"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
