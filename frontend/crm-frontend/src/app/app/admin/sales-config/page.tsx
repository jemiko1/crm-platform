"use client";

import React, { useCallback, useEffect, useState } from "react";
import { apiGet, apiPatch, apiPost, apiDelete, ApiError } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Position = {
  id: string;
  name: string;
  code: string;
};

type PipelineConfig = {
  id: string;
  key: string;
  positionId: string | null;
  value: string | null;
  description: string | null;
  position: Position | null;
};

type LeadStage = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  isTerminal: boolean;
};

type LeadSource = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export default function SalesConfigPage() {
  const [configs, setConfigs] = useState<PipelineConfig[]>([]);
  const [stages, setStages] = useState<LeadStage[]>([]);
  const [sources, setSources] = useState<LeadSource[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"config" | "stages" | "sources">("config");

  // Source form state
  const [showSourceForm, setShowSourceForm] = useState(false);
  const [editingSource, setEditingSource] = useState<LeadSource | null>(null);
  const [sourceCode, setSourceCode] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [sourceNameKa, setSourceNameKa] = useState("");
  const [sourceDescription, setSourceDescription] = useState("");
  const [sourceSortOrder, setSourceSortOrder] = useState("0");
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [configsRes, stagesRes, sourcesRes, positionsRes] = await Promise.all([
        apiGet<PipelineConfig[]>("/v1/sales/config/pipeline"),
        apiGet<LeadStage[]>("/v1/sales/config/stages"),
        apiGet<LeadSource[]>("/v1/sales/config/sources?includeInactive=true"),
        apiGet<Position[]>("/v1/sales/config/positions"),
      ]);
      setConfigs(configsRes);
      setStages(stagesRes);
      setSources(sourcesRes);
      setPositions(positionsRes);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to load configuration");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConfigUpdate = async (key: string, positionId: string | null) => {
    try {
      await apiPatch(`/v1/sales/config/pipeline/${key}`, {
        positionId: positionId || null,
      });
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  const handleStageToggle = async (stage: LeadStage) => {
    try {
      await apiPatch(`/v1/sales/config/stages/${stage.id}`, {
        isActive: !stage.isActive,
      });
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  const resetSourceForm = () => {
    setEditingSource(null);
    setSourceCode("");
    setSourceName("");
    setSourceNameKa("");
    setSourceDescription("");
    setSourceSortOrder("0");
    setFormError(null);
  };

  const handleEditSource = (source: LeadSource) => {
    setEditingSource(source);
    setSourceCode(source.code);
    setSourceName(source.name);
    setSourceNameKa(source.nameKa);
    setSourceDescription(source.description || "");
    setSourceSortOrder(source.sortOrder.toString());
    setShowSourceForm(true);
  };

  const handleSourceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    setFormError(null);

    const payload = {
      code: sourceCode,
      name: sourceName,
      nameKa: sourceNameKa,
      description: sourceDescription || undefined,
      sortOrder: parseInt(sourceSortOrder) || 0,
    };

    try {
      if (editingSource) {
        await apiPatch(`/v1/sales/config/sources/${editingSource.id}`, payload);
      } else {
        await apiPost("/v1/sales/config/sources", payload);
      }
      setShowSourceForm(false);
      resetSourceForm();
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setFormLoading(false);
    }
  };

  const handleSourceToggle = async (source: LeadSource) => {
    try {
      await apiPatch(`/v1/sales/config/sources/${source.id}`, {
        isActive: !source.isActive,
      });
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  const handleSourceDelete = async (source: LeadSource) => {
    if (!confirm(`Are you sure you want to delete "${source.name}"?`)) return;

    try {
      await apiDelete(`/v1/sales/config/sources/${source.id}`);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Sales Pipeline Configuration</h1>
        <p className="mt-1 text-sm text-zinc-600">Configure pipeline stages, sources, and position assignments</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-zinc-200">
        <nav className="flex gap-8">
          {[
            { id: "config", label: "Position Assignments" },
            { id: "stages", label: "Pipeline Stages" },
            { id: "sources", label: "Lead Sources" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`border-b-2 pb-4 text-sm font-medium transition ${
                activeTab === tab.id
                  ? "border-emerald-500 text-emerald-600"
                  : "border-transparent text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Position Assignments */}
      {activeTab === "config" && (
        <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
          <h2 className="mb-6 text-lg font-semibold text-zinc-900">Position Assignments</h2>
          <p className="mb-6 text-sm text-zinc-600">
            Assign positions to control who can perform certain actions in the sales pipeline.
          </p>

          <div className="space-y-6">
            {configs.map((config) => (
              <div key={config.id} className="flex items-center justify-between rounded-xl border border-zinc-200 p-4">
                <div>
                  <div className="font-medium text-zinc-900">{config.key.replace(/_/g, " ")}</div>
                  <div className="text-sm text-zinc-500">{config.description}</div>
                </div>
                <select
                  value={config.positionId || ""}
                  onChange={(e) => handleConfigUpdate(config.key, e.target.value || null)}
                  className="rounded-xl border border-zinc-200 px-4 py-2.5 text-sm"
                >
                  <option value="">Not assigned</option>
                  {positions.map((pos) => (
                    <option key={pos.id} value={pos.id}>
                      {pos.name} ({pos.code})
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Stages */}
      {activeTab === "stages" && (
        <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
          <h2 className="mb-6 text-lg font-semibold text-zinc-900">Pipeline Stages</h2>
          <p className="mb-6 text-sm text-zinc-600">
            Configure the stages in your sales pipeline. Stages define the journey of a lead from initial contact to closing.
          </p>

          <div className="space-y-3">
            {stages
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((stage) => (
                <div
                  key={stage.id}
                  className={`flex items-center justify-between rounded-xl border p-4 ${
                    stage.isActive ? "border-zinc-200" : "border-zinc-100 bg-zinc-50 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: stage.color || "#6366f1" }}
                    >
                      {stage.sortOrder}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-900">{stage.name}</span>
                        <span className="text-sm text-zinc-500">({stage.nameKa})</span>
                        {stage.isTerminal && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            Terminal
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-zinc-500">Code: {stage.code}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        stage.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {stage.isActive ? "Active" : "Inactive"}
                    </span>
                    {!stage.isTerminal && (
                      <button
                        onClick={() => handleStageToggle(stage)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                          stage.isActive
                            ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                      >
                        {stage.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Lead Sources */}
      {activeTab === "sources" && (
        <div className="rounded-2xl bg-white p-6 shadow-lg ring-1 ring-zinc-200">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Lead Sources</h2>
              <p className="text-sm text-zinc-600">Configure where leads come from</p>
            </div>
            <button
              onClick={() => {
                resetSourceForm();
                setShowSourceForm(true);
              }}
              className="rounded-xl px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: BRAND }}
            >
              Add Source
            </button>
          </div>

          {/* Source Form */}
          {showSourceForm && (
            <div className="mb-6 rounded-xl bg-zinc-50 p-4">
              {formError && (
                <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{formError}</div>
              )}
              <form onSubmit={handleSourceSubmit}>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700">Code *</label>
                    <input
                      type="text"
                      value={sourceCode}
                      onChange={(e) => setSourceCode(e.target.value.toUpperCase())}
                      required
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700">Name (EN) *</label>
                    <input
                      type="text"
                      value={sourceName}
                      onChange={(e) => setSourceName(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700">Name (KA) *</label>
                    <input
                      type="text"
                      value={sourceNameKa}
                      onChange={(e) => setSourceNameKa(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-zinc-700">Sort Order</label>
                    <input
                      type="number"
                      value={sourceSortOrder}
                      onChange={(e) => setSourceSortOrder(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSourceForm(false);
                      resetSourceForm();
                    }}
                    className="rounded-lg border border-zinc-200 px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={formLoading}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-white"
                    style={{ backgroundColor: BRAND }}
                  >
                    {formLoading ? "Saving..." : editingSource ? "Update" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Sources List */}
          <div className="space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className={`flex items-center justify-between rounded-xl border p-4 ${
                  source.isActive ? "border-zinc-200" : "border-zinc-100 bg-zinc-50 opacity-60"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900">{source.name}</span>
                    <span className="text-sm text-zinc-500">({source.nameKa})</span>
                  </div>
                  <div className="text-xs text-zinc-500">Code: {source.code}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEditSource(source)}
                    className="rounded p-1.5 text-zinc-600 hover:bg-zinc-100"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleSourceToggle(source)}
                    className={`rounded p-1.5 ${
                      source.isActive
                        ? "text-amber-600 hover:bg-amber-50"
                        : "text-emerald-600 hover:bg-emerald-50"
                    }`}
                  >
                    {source.isActive ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleSourceDelete(source)}
                    className="rounded p-1.5 text-red-600 hover:bg-red-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
