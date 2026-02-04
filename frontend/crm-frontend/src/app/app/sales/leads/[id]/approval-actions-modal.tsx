"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import { apiPost, ApiError } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

interface ApprovalActionsModalProps {
  open: boolean;
  onClose: () => void;
  leadId: string;
  onSuccess: () => void;
}

export default function ApprovalActionsModal({
  open,
  onClose,
  leadId,
  onSuccess,
}: ApprovalActionsModalProps) {
  const [mounted, setMounted] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<"APPROVE" | "UNLOCK" | "CANCEL" | null>(null);
  const [notes, setNotes] = useState("");
  const [lostReason, setLostReason] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAction) return;

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/sales/leads/${leadId}/approval`, {
        action: selectedAction,
        notes: notes || undefined,
        lostReason: selectedAction === "CANCEL" ? lostReason : undefined,
      });
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to process approval");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!open || !mounted) return null;

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
                <h2 className="text-lg font-semibold text-zinc-900">Review Lead</h2>
                <p className="mt-1 text-xs text-zinc-600">Choose an action for this lead</p>
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

            {/* Action Selection */}
            <div className="mb-6 space-y-3">
              <label className="block text-sm font-medium text-zinc-700">Select Action</label>

              {/* Approve */}
              <button
                type="button"
                onClick={() => setSelectedAction("APPROVE")}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedAction === "APPROVE"
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-lg">
                    ✅
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900">Approve Lead</div>
                    <div className="text-sm text-zinc-500">Mark as Won and proceed to next stage</div>
                  </div>
                </div>
              </button>

              {/* Unlock */}
              <button
                type="button"
                onClick={() => setSelectedAction("UNLOCK")}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedAction === "UNLOCK"
                    ? "border-amber-500 bg-amber-50 ring-2 ring-amber-500/20"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-lg">
                    🔓
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900">Unlock & Return</div>
                    <div className="text-sm text-zinc-500">Return to sales agent for corrections</div>
                  </div>
                </div>
              </button>

              {/* Cancel */}
              <button
                type="button"
                onClick={() => setSelectedAction("CANCEL")}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selectedAction === "CANCEL"
                    ? "border-red-500 bg-red-50 ring-2 ring-red-500/20"
                    : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-lg">
                    ❌
                  </div>
                  <div>
                    <div className="font-medium text-zinc-900">Cancel Lead</div>
                    <div className="text-sm text-zinc-500">Mark as Lost and close the deal</div>
                  </div>
                </div>
              </button>
            </div>

            {/* Notes */}
            {selectedAction && (
              <div className="mb-6">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Notes {selectedAction === "UNLOCK" && <span className="text-red-500">*</span>}
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required={selectedAction === "UNLOCK"}
                  rows={3}
                  placeholder={
                    selectedAction === "APPROVE"
                      ? "Optional approval notes..."
                      : selectedAction === "UNLOCK"
                      ? "Explain what needs to be corrected..."
                      : "Optional notes..."
                  }
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            )}

            {/* Lost Reason (for Cancel) */}
            {selectedAction === "CANCEL" && (
              <div className="mb-6">
                <label className="mb-1.5 block text-sm font-medium text-zinc-700">
                  Lost Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  required
                  rows={2}
                  placeholder="Why was this lead lost?"
                  className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            )}

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
                disabled={loading || !selectedAction || (selectedAction === "CANCEL" && !lostReason)}
                className={`rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 ${
                  selectedAction === "APPROVE"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : selectedAction === "UNLOCK"
                    ? "bg-amber-600 hover:bg-amber-700"
                    : selectedAction === "CANCEL"
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-zinc-400"
                }`}
              >
                {loading
                  ? "Processing..."
                  : selectedAction === "APPROVE"
                  ? "Approve Lead"
                  : selectedAction === "UNLOCK"
                  ? "Unlock & Return"
                  : selectedAction === "CANCEL"
                  ? "Cancel Lead"
                  : "Select Action"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
