"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { apiPost, ApiError } from "@/lib/api";

type LeadStage = {
  id: string;
  code: string;
  name: string;
  nameKa: string;
  color: string | null;
  sortOrder: number;
  isTerminal: boolean;
  isActive: boolean;
};

interface ChangeStageModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  currentStageId: string;
  stages: LeadStage[];
  onSuccess: () => void;
}

export default function ChangeStageModal({
  open,
  onClose,
  leadId,
  currentStageId,
  stages,
  onSuccess,
}: ChangeStageModalProps) {
  const [mounted, setMounted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState(currentStageId);
  const [reason, setReason] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStageId === currentStageId) return;

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/sales/leads/${leadId}/change-stage`, {
        stageId: selectedStageId,
        reason: reason || undefined,
      });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to change stage");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!open || !mounted) return null;

  const currentStage = stages.find((s) => s.id === currentStageId);
  const selectedStage = stages.find((s) => s.id === selectedStageId);
  const isBackward = selectedStage && currentStage && selectedStage.sortOrder < currentStage.sortOrder;

  const modalContent = (
    <div className="fixed inset-0 z-[50000] flex items-center justify-center p-4">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div
          className="w-full overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Change Stage</h2>
                <p className="mt-1 text-xs text-zinc-600">Move lead to a different pipeline stage</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            {error && (
              <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
            )}

            {/* Current Stage */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-zinc-700">Current Stage</label>
              <div
                className="flex items-center gap-3 rounded-xl border px-4 py-3"
                style={{
                  backgroundColor: `${currentStage?.color || "#6366f1"}15`,
                  borderColor: currentStage?.color || "#6366f1",
                }}
              >
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: currentStage?.color || "#6366f1" }}
                >
                  {currentStage?.sortOrder || 1}
                </div>
                <div>
                  <div className="font-medium text-zinc-900">{currentStage?.name}</div>
                  <div className="text-sm text-zinc-500">{currentStage?.nameKa}</div>
                </div>
              </div>
            </div>

            {/* New Stage Selection */}
            <div className="mb-6">
              <label className="mb-2 block text-sm font-medium text-zinc-700">New Stage</label>
              <div className="space-y-2">
                {stages
                  .filter((s) => !s.isTerminal && s.id !== currentStageId)
                  .map((stage) => (
                    <button
                      key={stage.id}
                      type="button"
                      onClick={() => setSelectedStageId(stage.id)}
                      className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                        selectedStageId === stage.id
                          ? "ring-2 ring-offset-2"
                          : "hover:border-zinc-300"
                      }`}
                      style={{
                        backgroundColor: selectedStageId === stage.id ? `${stage.color || "#6366f1"}15` : "white",
                        borderColor: selectedStageId === stage.id ? stage.color || "#6366f1" : "#e4e4e7",
                        // @ts-expect-error -- CSS custom property for Tailwind ring color
                        "--tw-ring-color": selectedStageId === stage.id ? stage.color || "#6366f1" : "transparent",
                      }}
                    >
                      <div
                        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                        style={{ backgroundColor: stage.color || "#6366f1" }}
                      >
                        {stage.sortOrder}
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-zinc-900">{stage.name}</div>
                        <div className="text-sm text-zinc-500">{stage.nameKa}</div>
                      </div>
                      {currentStage && stage.sortOrder < currentStage.sortOrder && (
                        <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Backward
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            </div>

            {/* Warning for backward movement */}
            {isBackward && (
              <div className="mb-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-700">
                <strong>Warning:</strong> You are moving this lead backward in the pipeline. This action may require special permission.
              </div>
            )}

            {/* Reason */}
            <div className="mb-6">
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                Reason {isBackward && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required={isBackward}
                rows={2}
                placeholder={isBackward ? "Explain why this lead is moving backward..." : "Optional reason for stage change..."}
                className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 border-t border-zinc-200 pt-6">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || selectedStageId === currentStageId || (isBackward && !reason)}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:bg-emerald-700 hover:shadow-xl disabled:opacity-50"
              >
                {loading ? "Changing..." : "Change Stage"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
