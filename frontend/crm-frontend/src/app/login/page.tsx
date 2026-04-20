"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { API_BASE, apiPost } from "@/lib/api";
import { setBridgeToken } from "@/hooks/useDesktopPhone";

const BRIDGE_URL = "http://127.0.0.1:19876";

function apiUnreachableMessage(): string {
  return "Cannot reach the CRM API on port 3000. From backend/crm-backend run: pnpm start:dev. If the terminal shows EADDRINUSE, port 3000 is already in use—stop the other Node process (PowerShell: netstat -ano | findstr :3000, then taskkill /PID <pid> /F) and start the backend again.";
}

function loginFailureMessage(res: Response, body: unknown): string {
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    return apiUnreachableMessage();
  }
  if (typeof body === "object" && body !== null && "message" in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.filter((x) => typeof x === "string").join(", ");
  }
  return "Invalid email or password";
}

function isLikelyNetworkFailure(message: string): boolean {
  return (
    message === "Failed to fetch" ||
    message === "Load failed" ||
    message.includes("NetworkError") ||
    message.includes("ECONNRESET")
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/app/buildings";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phoneMismatch, setPhoneMismatch] = useState<{
    appUserId: string;
  } | null>(null);
  const [switchingPhone, setSwitchingPhone] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  /** @returns true if CRM Phone is logged in as a different user (show modal, skip redirect). */
  async function checkDesktopPhone(loggedInUserId: string): Promise<boolean> {
    try {
      const res = await fetch(`${BRIDGE_URL}/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) return false;
      const status = await res.json();
      if (status.loggedIn && status.user && status.user.id !== loggedInUserId) {
        // /status intentionally does NOT return user name / extension —
        // those would leak operator identity to any local process. We
        // only get a UUID; the banner text is generic.
        setPhoneMismatch({ appUserId: status.user.id });
        return true;
      }
    } catch {
      // App not running
    }
    return false;
  }

  async function handleSwitchPhone() {
    setSwitchingPhone(true);
    try {
      const { handshakeToken } = await apiPost<{ handshakeToken: string }>("/auth/device-token", {});

      const res = await fetch(`${BRIDGE_URL}/switch-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handshakeToken }),
      });
      if (!res.ok) throw new Error("Switch failed");
      // The bridge now returns a fresh X-Bridge-Token on every successful
      // switch-user. Persist in module memory so /dial calls from any
      // component can attach it.
      const data = (await res.json()) as { bridgeToken?: string };
      if (data?.bridgeToken) {
        setBridgeToken(data.bridgeToken);
      }

      setPhoneMismatch(null);
      router.push(next);
      router.refresh();
    } catch {
      setError("Failed to switch phone app user");
    } finally {
      setSwitchingPhone(false);
    }
  }

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

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(loginFailureMessage(res, body));
      }

      void remember; // UI-only for now

      const data = await res.json();
      const userId = data?.user?.id;
      const phoneBlocksRedirect =
        userId ? await checkDesktopPhone(userId) : false;

      if (!phoneBlocksRedirect) {
        router.push(next);
        router.refresh();
      }
    } catch (err: unknown) {
      let msg =
        err instanceof Error ? err.message : "Invalid email or password";
      if (isLikelyNetworkFailure(msg)) {
        msg = apiUnreachableMessage();
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 flex items-center justify-center relative overflow-hidden">
      {/* Darker abstract background */}
      <div className="absolute inset-0 bg-gradient-to-br from-teal-200 via-teal-100 to-slate-200" />

      {/* Slight dark overlay for better contrast */}
      <div className="absolute inset-0 bg-slate-900/15" />

      {/* Soft blobs (stronger) */}
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-teal-700/35 blur-3xl" />
      <div className="absolute top-24 -right-24 h-96 w-96 rounded-full bg-teal-800/30 blur-3xl" />
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
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-700 shadow-sm"
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
                  className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-teal-200 focus:border-teal-700 shadow-sm"
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
                    className="h-4 w-4 rounded border-zinc-300 text-teal-700 focus:ring-teal-200"
                  />
                  Remember me
                </label>

                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-sm text-zinc-600 hover:text-zinc-900"
                >
                  Forgot password?
                </button>
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

      {mounted &&
        phoneMismatch &&
        createPortal(
          <div className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm mx-4 space-y-4">
              <h3 className="text-lg font-semibold text-zinc-900">Phone App Mismatch</h3>
              <p className="text-sm text-zinc-600">
                The CRM Phone app on this PC is logged in as a different user.
                Switch the phone to your account?
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPhoneMismatch(null);
                    router.push(next);
                    router.refresh();
                  }}
                  className="flex-1 px-4 py-2 rounded-xl border border-zinc-200 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleSwitchPhone}
                  disabled={switchingPhone}
                  className="flex-1 px-4 py-2 rounded-xl bg-teal-800 text-white text-sm font-medium hover:bg-teal-900 disabled:opacity-50"
                >
                  {switchingPhone ? "Switching..." : "Switch Phone"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {mounted &&
        showForgotModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[50000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setShowForgotModal(false)}
            role="presentation"
          >
            <div
              className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="forgot-password-title"
            >
              <h3 id="forgot-password-title" className="text-lg font-semibold text-zinc-900">
                Forgot password?
              </h3>
              <p className="text-sm text-zinc-600">
                Password resets are handled by your administrator. Please contact them to regain access to your account.
              </p>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-full px-4 py-2 rounded-xl bg-teal-800 text-white text-sm font-medium hover:bg-teal-900"
              >
                Close
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
