"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/hooks/useI18n";
import { usePermissions } from "@/lib/use-permissions";
import { PermissionGuard } from "@/lib/permission-guard";

const BRAND = "rgb(8,117,56)";

const TABS = [
  { href: "/app/call-center", label: "Overview", labelKey: "callCenter.tabs.overview", permission: "call_center.statistics" },
  { href: "/app/call-center/logs", label: "Call Logs", labelKey: "callCenter.tabs.logs", anyPermission: ["call_logs.own", "call_logs.department", "call_logs.department_tree", "call_logs.all"] },
  { href: "/app/call-center/missed", label: "Missed Calls", labelKey: "callCenter.tabs.missed", permission: "missed_calls.access" },
  { href: "/app/call-center/live", label: "Live Monitor", labelKey: "callCenter.tabs.live", permission: "call_center.live" },
  // Breaks tab — managers see currently-on-break operators + history.
  // anyPermission: live-monitor managers see active breaks;
  // statistics-only managers see history tab inside the page.
  { href: "/app/call-center/breaks", label: "Breaks", labelKey: "callCenter.tabs.breaks", anyPermission: ["call_center.live", "call_center.statistics"] },
  { href: "/app/call-center/reports", label: "Reports", labelKey: "callCenter.tabs.reports", permission: "call_center.reports" },
  { href: "/app/call-center/quality", label: "Quality", labelKey: "callCenter.tabs.quality", permission: "call_center.quality" },
  { href: "/app/call-center/statistics", label: "Statistics", labelKey: "callCenter.tabs.statistics", permission: "call_center.statistics" },
];

export default function CallCenterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { hasPermission, hasAnyPermission } = usePermissions();

  const visibleTabs = TABS.filter((tab) => {
    if (tab.permission && !hasPermission(tab.permission)) return false;
    if (tab.anyPermission && !hasAnyPermission(tab.anyPermission)) return false;
    return true;
  });

  // Match current path to a tab (most specific match wins)
  const currentTab = [...TABS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((tab) =>
      tab.href === "/app/call-center"
        ? pathname === "/app/call-center"
        : pathname.startsWith(tab.href),
    );
  const canAccessCurrentTab = !currentTab
    ? true
    : (currentTab.permission ? hasPermission(currentTab.permission) : true) &&
      (currentTab.anyPermission ? hasAnyPermission(currentTab.anyPermission) : true);

  return (
    <PermissionGuard permission="call_center.menu">
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
          {visibleTabs.map((tab) => {
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

        {canAccessCurrentTab ? (
          children
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="max-w-sm rounded-2xl bg-rose-50 p-8 ring-1 ring-rose-200 text-center">
              <div className="text-base font-semibold text-rose-900">
                {t("common.noPermissionTitle", "Insufficient Permissions")}
              </div>
              <div className="mt-2 text-sm text-rose-700">
                {t("common.noPermission", "You do not have permission to access this page.")}
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}
