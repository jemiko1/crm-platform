"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { apiPost, ApiError } from "@/lib/api";

const BRAND = "rgb(8, 117, 56)";

type Employee = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
};

type ResetPasswordModalProps = {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function ResetPasswordModal({
  employee,
  open,
  onClose,
  onSuccess,
}: ResetPasswordModalProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiPost(`/v1/employees/${employee.id}/reset-password`, {
        newPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 1500);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to reset password");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open || !mounted || !employee) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-md rounded-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-zinc-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">
                Reset Password
              </h2>
              <p className="mt-1 text-sm text-zinc-600">
                for {employee.firstName} {employee.lastName}
              </p>
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200">
              <div className="text-sm text-rose-700">{error}</div>
            </div>
          )}

          {success && (
            <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <div className="text-sm text-emerald-700">
                Password reset successfully!
              </div>
            </div>
          )}

          {!success && (
            <>
              <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                <div className="text-sm text-amber-700">
                  <strong>Warning:</strong> This will immediately change the user's password.
                  They will need to use the new password to log in.
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-900">
                  New Password <span className="text-rose-600">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 characters"
                  className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-zinc-900">
                  Confirm Password <span className="text-rose-600">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="mt-2 w-full rounded-2xl border border-zinc-300 px-4 py-2.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
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
                  disabled={loading || !newPassword || !confirmPassword}
                  className="rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: BRAND }}
                >
                  {loading ? "Resetting..." : "Reset Password"}
                </button>
              </div>
            </>
          )}
        </form>
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
