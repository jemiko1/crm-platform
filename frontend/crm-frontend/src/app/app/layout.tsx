import type { ReactNode } from "react";
import SidebarNav from "./sidebar-nav";
import ProfileMenu from "./profile-menu";

const BRAND_GREEN = "rgb(8,117,56)";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* App background */}
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-200 via-emerald-100 to-slate-200" />
      <div className="absolute inset-0 bg-slate-900/12" />
      <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-emerald-500/30 blur-3xl" />
      <div className="absolute top-24 -right-24 h-96 w-96 rounded-full bg-emerald-600/25 blur-3xl" />
      <div className="absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-slate-600/20 blur-3xl" />
      <div className="absolute inset-0 opacity-[0.22] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.22)_1px,transparent_0)] bg-[length:22px_22px]" />

      {/* Layout wrapper */}
      <div className="relative w-full">
        <div className="flex">
          {/* Left Rail Sidebar (fixed, full height, internal scroll) */}
          <aside className="hidden lg:block fixed left-4 top-6 bottom-6 w-[108px] shrink-0 z-40">
            <div className="h-full">
              <div className="h-full rounded-[32px] bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col">
                {/* Logo */}
                <div className="px-3 pt-4 pb-3 flex items-center justify-center border-b border-white/60 shrink-0">
                  <div
                    className="h-10 w-10 rounded-2xl shadow"
                    style={{ backgroundColor: BRAND_GREEN }}
                    title="CRM Platform"
                  />
                </div>

                <div
  className={[
    "flex-1 overflow-y-auto overscroll-contain",
    // ✅ Hide scrollbar cross-browser (no plugin)
    "[scrollbar-width:none]", // Firefox
    "[-ms-overflow-style:none]", // IE/old Edge
    "[&::-webkit-scrollbar]:w-0",
    "[&::-webkit-scrollbar]:h-0",
  ].join(" ")}
>
  <SidebarNav />
</div>

                {/* Subtle bottom fade hint */}
                <div className="shrink-0 h-6 bg-gradient-to-t from-white/80 to-transparent pointer-events-none" />
              </div>
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 space-y-4 min-w-0 px-4 py-6 lg:pl-[148px]">
            {/* Top bar */}
            <div className="rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_30px_70px_-22px_rgba(0,0,0,0.25)]">
              <div className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900">
                    Workspace
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    Protected area: /app/*
                  </div>
                </div>

                {/* Top-right profile dropdown */}
                <ProfileMenu />
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
