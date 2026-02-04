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
  user?: {
    id: string;
    isActive: boolean;
  } | null;
};

type ActivateEmployeeModalProps = {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ActivateEmployeeModal({
  employee,
  open,
  onClose,
  onSuccess,
}: ActivateEmployeeModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  async function handleActivate() {
    if (!employee) return;

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/employees/${employee.id}/activate`, {});
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to activate employee");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !employee) return null;

  const isNotTerminated = employee.status !== "TERMINATED";

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
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <IconActivate />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Activate Employee
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

          {success && (
            <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <div className="text-sm text-emerald-700">
                Employee has been successfully activated!
              </div>
            </div>
          )}

          {isNotTerminated ? (
            <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
              <div className="text-sm text-amber-700">
                This employee is not terminated. Only terminated employees can be activated.
              </div>
            </div>
          ) : !success && (
            <>
              <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200">
                <div className="text-sm text-emerald-700">
                  <strong>This action will:</strong>
                </div>
                <ul className="mt-2 list-disc list-inside text-sm text-emerald-700 space-y-1">
                  <li>Set the employee status to <strong>ACTIVE</strong></li>
                  {employee.user && (
                    <li>Reactivate their user account (allow login)</li>
                  )}
                </ul>
              </div>

              <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
                <div className="text-sm text-zinc-700">
                  <strong>Employee:</strong> {employee.firstName} {employee.lastName}
                </div>
                <div className="text-sm text-zinc-600 mt-1">
                  {employee.email}
                </div>
                {employee.user && (
                  <div className="text-sm text-blue-600 mt-1">
                    Has login account (currently disabled)
                  </div>
                )}
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
              {success ? "Close" : "Cancel"}
            </button>
            {!isNotTerminated && !success && (
              <button
                type="button"
                onClick={handleActivate}
                disabled={loading}
                className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
              >
                {loading ? "Activating..." : "Activate Employee"}
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

function IconActivate() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-emerald-600">
      <path
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
