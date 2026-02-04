"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiPost, ApiError } from "@/lib/api";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: string;
};

type DismissEmployeeModalProps = {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function DismissEmployeeModal({
  employee,
  open,
  onClose,
  onSuccess,
}: DismissEmployeeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setConfirmText("");
      setError(null);
    }
  }, [open]);

  async function handleDismiss() {
    if (!employee) return;

    if (confirmText !== "DISMISS") {
      setError("Please type DISMISS to confirm");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/employees/${employee.id}/dismiss`, {});
      onSuccess();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to dismiss employee");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !employee) return null;

  const isAlreadyTerminated = employee.status === "TERMINATED";

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100">
                <IconAlert />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Dismiss Employee
                </h2>
              </div>
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

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
              <div className="text-sm text-rose-700">{error}</div>
            </div>
          )}

          {isAlreadyTerminated ? (
            <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <div className="text-sm text-amber-700">
                This employee is already terminated.
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
                <div className="text-sm text-rose-700">
                  <strong>Warning:</strong> This action will:
                </div>
                <ul className="mt-2 list-disc list-inside text-sm text-rose-700 space-y-1">
                  <li>Set the employee status to <strong>TERMINATED</strong></li>
                  <li>Deactivate their user account (if they have one)</li>
                </ul>
              </div>

              <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="text-sm text-zinc-700">
                  <strong>Employee:</strong> {employee.firstName} {employee.lastName}
                </div>
                <div className="text-sm text-zinc-600 mt-1">
                  {employee.email}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-900">
                  Type <span className="font-mono bg-zinc-100 px-1.5 py-0.5 rounded text-rose-600">DISMISS</span> to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  placeholder="DISMISS"
                  className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                />
              </div>
            </>
          )}

          <div className="flex items-center justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancel
            </button>
            {!isAlreadyTerminated && (
              <button
                type="button"
                onClick={handleDismiss}
                disabled={loading || confirmText !== "DISMISS"}
                className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {loading ? "Dismissing..." : "Dismiss Employee"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
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

function IconAlert() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-rose-600">
      <path
        d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
