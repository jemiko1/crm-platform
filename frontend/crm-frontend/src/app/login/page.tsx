"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/app/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) throw new Error("Invalid credentials");

      void remember; // UI-only for now

      router.push(next);
      router.refresh();
    } catch {
      setError("Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 flex items-center justify-center relative overflow-hidden">
      {/* Darker abstract background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-200 via-emerald-100 to-slate-200" />

      {/* Slight dark overlay for better contrast */}
      <div className="absolute inset-0 bg-slate-900/15" />

      {/* Soft blobs (stronger) */}
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-emerald-500/35 blur-3xl" />
      <div className="absolute top-24 -right-24 h-96 w-96 rounded-full bg-emerald-600/30 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-slate-600/25 blur-3xl" />

      {/* Subtle grid */}
      <div className="absolute inset-0 opacity-[0.25] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.22)_1px,transparent_0)] bg-[length:22px_22px]" />

      {/* Card */}
      <div className="relative w-full max-w-sm">
        <div className="rounded-3xl bg-white/90 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.45)]">
          <div className="p-6 sm:p-7">
            {/* Logo */}
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3">
                <span className="text-2xl font-bold text-zinc-900">CRM28</span>
              </div>

              <h1 className="text-xl font-semibold text-zinc-900">Sign in</h1>
              <p className="text-sm text-zinc-500 mt-1">
                HOA Management • Operations Workspace
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-700">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 shadow-sm"
                  placeholder="admin@crm.local"
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-700">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-300 shadow-sm"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-zinc-700 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-200"
                  />
                  Remember me
                </label>

                <Link
                  href="#"
                  className="text-sm text-zinc-600 hover:text-zinc-900"
                >
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-[rgb(8,117,56)] text-white py-3 text-sm font-medium shadow hover:opacity-95 disabled:opacity-50"
              >
                {loading ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>
        </div>

        <div className="mt-5 text-center text-xs text-white/80">
          Secure sign-in • Protected workspace
        </div>
      </div>
    </div>
  );
}
