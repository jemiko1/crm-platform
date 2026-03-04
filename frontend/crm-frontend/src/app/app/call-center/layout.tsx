"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/hooks/useI18n";

const BRAND = "rgb(8,117,56)";

const TABS = [
  { href: "/app/call-center", label: "Dashboard", labelKey: "callCenter.tabs.dashboard" },
  { href: "/app/call-center/logs", label: "Call Logs", labelKey: "callCenter.tabs.logs" },
  { href: "/app/call-center/live", label: "Live Monitor", labelKey: "callCenter.tabs.live" },
  { href: "/app/call-center/callbacks", label: "Callbacks", labelKey: "callCenter.tabs.callbacks" },
  { href: "/app/call-center/quality", label: "Quality", labelKey: "callCenter.tabs.quality" },
  { href: "/app/call-center/agents", label: "Agents", labelKey: "callCenter.tabs.agents" },
];

export default function CallCenterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-200">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: BRAND }} />
          {t("callCenter.badge", "Call Center")}
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl">
          {t("callCenter.title", "Call Center")}
        </h1>
        <p className="mt-1 text-sm text-zinc-600">
          {t("callCenter.description", "Monitor calls, agent performance, and queue analytics in real time.")}
        </p>
      </div>

      <div className="flex items-center gap-1 rounded-2xl bg-zinc-100/80 p-1">
        {TABS.map((tab) => {
          const isActive =
            tab.href === "/app/call-center"
              ? pathname === "/app/call-center"
              : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                "rounded-xl px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                  : "text-zinc-500 hover:text-zinc-700 hover:bg-white/60",
              ].join(" ")}
            >
              {t(tab.labelKey, tab.label)}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
