import type { ReactNode } from "react";
import Link from "next/link";
import LogoutButton from "./logout-button";
import UserBadge from "./user-badge";

const BRAND_GREEN = "rgb(8,117,56)";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* App background (same family as login) */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-200 via-emerald-100 to-slate-200" />
      <div className="absolute inset-0 bg-slate-900/12" />
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-emerald-500/30 blur-3xl" />
      <div className="absolute top-24 -right-24 h-96 w-96 rounded-full bg-emerald-600/25 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-slate-600/20 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.22] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.22)_1px,transparent_0)] bg-[length:22px_22px]" />

      <div className="relative w-full px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sidebar */}
          <aside className="lg:col-span-3">
            <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.35)] overflow-hidden">
              <div className="p-5 border-b border-white/60">
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-2xl shadow"
                    style={{ backgroundColor: BRAND_GREEN }}
                  />
                  <div className="leading-tight">
                    <div className="text-sm font-semibold text-zinc-900">
                      CRM Platform
                    </div>
                    <div className="text-xs text-zinc-500">HOA Operations</div>
                  </div>
                </div>
              </div>

              <nav className="p-3 space-y-1">
                <NavLink href="/app/dashboard" label="Dashboard" />
                <NavLink href="/app/buildings" label="Buildings" />
                <NavLink href="/app/assets" label="Assets" />
                <NavLink href="/app/work-orders" label="Work Orders" />
                <NavLink href="/app/inventory" label="Inventory" />
                <NavLink href="/app/admin/users" label="Users" />
              </nav>

              <div className="p-4 border-t border-white/60 bg-white/60">
                <LogoutButton />
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="lg:col-span-9 space-y-4">
            {/* Top bar */}
            <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)]">
              <div className="px-6 py-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-zinc-900">
                    Workspace
                  </div>
                  <div className="text-xs text-zinc-500">
                    Protected area: /app/*
                  </div>
                </div>

                <UserBadge />
              </div>
            </div>

            {/* Content container */}
            <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)]">
              <div className="p-6">{children}</div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl px-3 py-2.5 text-sm text-zinc-700 hover:bg-white/70 hover:text-zinc-900"
    >
      {label}
    </Link>
  );
}
