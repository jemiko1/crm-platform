"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiPatch, ApiError } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type WorkOrderDetail = {
  id: string;
  type: "INSTALLATION" | "DIAGNOSTIC" | "RESEARCH" | "DEACTIVATE" | "REPAIR_CHANGE" | "ACTIVATE" | "INSTALL" | "REPAIR";
  status: "CREATED" | "LINKED_TO_GROUP" | "IN_PROGRESS" | "PENDING_APPROVAL" | "APPROVED" | "CANCELED" | "COMPLETED" | "DONE" | "NEW" | "DISPATCHED" | "ACCEPTED";
  title: string;
  notes: string | null;
};

type EditWorkOrderModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  workOrder: WorkOrderDetail;
};

export default function EditWorkOrderModal({
  open,
  onClose,
  onSuccess,
  workOrder,
}: EditWorkOrderModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [formData, setFormData] = useState({
    status: workOrder.status,
    title: workOrder.title,
    notes: workOrder.notes || "",
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setFormData({
        status: workOrder.status,
        title: workOrder.title,
        notes: workOrder.notes || "",
      });
    }
  }, [open, workOrder]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiPatch(`/v1/work-orders/${workOrder.id}`, {
        status: formData.status,
        title: formData.title,
        notes: formData.notes || null,
      });

      onSuccess();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to update work order");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted) return null;

  const modalContent = (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
        <div
          className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="border-b border-zinc-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Edit Work Order</h2>
                <p className="mt-1 text-xs text-zinc-600">Update work order details</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-2xl p-2 text-zinc-600 hover:bg-zinc-100"
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="space-y-4">
              {/* Status */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Status <span className="text-red-600">*</span>
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  required
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                >
                  <option value="CREATED">Created</option>
                  <option value="LINKED_TO_GROUP">Linked to Group</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="PENDING_APPROVAL">Pending Approval</option>
                  <option value="APPROVED">Approved</option>
                  <option value="CANCELED">Canceled</option>
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  Title <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  required
                  placeholder="Work order title"
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={4}
                  placeholder="Additional notes..."
                  className="w-full rounded-2xl bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 resize-none"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 rounded-2xl bg-red-50 p-3 ring-1 ring-red-200">
                <div className="text-sm text-red-900">{error}</div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                style={{ backgroundColor: BRAND }}
              >
                {loading ? "Updating..." : "Update Work Order"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );

  return createPortal(modalContent, document.body);
}

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
