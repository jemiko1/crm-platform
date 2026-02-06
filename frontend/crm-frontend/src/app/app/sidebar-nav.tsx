"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/lib/use-permissions";

const BRAND_GREEN = "rgb(8,117,56)";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  requiredPermission?: string; // If set, item is only shown when user has this permission
};

export default function SidebarNav() {
  const pathname = usePathname();
  const { hasPermission, loading } = usePermissions();

  const items: NavItem[] = [
    { href: "/app/dashboard", label: "Dashboard", icon: <IconDashboard /> },
    { href: "/app/buildings", label: "Buildings", icon: <IconBuilding />, requiredPermission: "buildings.menu" },
    { href: "/app/clients", label: "Clients", icon: <IconClients />, requiredPermission: "clients.menu" },
    { href: "/app/incidents", label: "Incidents", icon: <IconIncident />, requiredPermission: "incidents.menu" },
    { href: "/app/assets", label: "Assets", icon: <IconWrench />, requiredPermission: "assets.menu" },
    { href: "/app/work-orders", label: "Work Orders", icon: <IconClipboard />, requiredPermission: "work_orders.menu" },
    { href: "/app/sales/dashboard", label: "Sales", icon: <IconSales />, requiredPermission: "sales.menu" },
    { href: "/app/inventory", label: "Inventory", icon: <IconBox />, requiredPermission: "inventory.menu" },
    { href: "/app/employees", label: "Employees", icon: <IconEmployees />, requiredPermission: "employees.menu" },
    { href: "/app/admin", label: "Admin", icon: <IconAdmin />, requiredPermission: "admin.menu" },
  ];

  // Filter items based on permissions (show only unpermissioned items like Dashboard while loading)
  const visibleItems = loading
    ? items.filter((item) => !item.requiredPermission)
    : items.filter((item) => !item.requiredPermission || hasPermission(item.requiredPermission));

  const settingsHref = "/app/settings";
  const isSettingsActive =
    pathname === settingsHref || pathname.startsWith(settingsHref + "/");

  return (
    <nav className="px-2 pb-3">
      <div className="space-y-2">
        {visibleItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <RailItem
              key={item.href}
              href={item.href}
              label={item.label}
              icon={item.icon}
              isActive={isActive}
            />
          );
        })}
      </div>

      <div className="my-3 h-px bg-white/60" />

      <RailItem
        href={settingsHref}
        label="Settings"
        icon={<IconSettings />}
        isActive={isSettingsActive}
      />
    </nav>
  );
}

function RailItem({
  href,
  label,
  icon,
  isActive,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      className={[
        "group relative w-full rounded-3xl px-2 py-3 transition",
        "flex flex-col items-center justify-center gap-2",
        isActive
          ? "bg-white shadow-sm ring-1 ring-zinc-200"
          : "bg-white/60 hover:bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)] ring-1 ring-transparent",
      ].join(" ")}
    >
      <span
        className={[
          "absolute left-1 top-3 bottom-3 w-1 rounded-full transition-opacity",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
        ].join(" ")}
        style={{ backgroundColor: BRAND_GREEN }}
      />

      <span
        className={[
          "grid place-items-center rounded-2xl border transition",
          "h-12 w-12",
          isActive
            ? "bg-white border-zinc-200 shadow-sm"
            : "bg-white/80 border-white/70",
        ].join(" ")}
      >
        <span
          className={[
            "transition-opacity",
            isActive ? "opacity-100" : "opacity-80 group-hover:opacity-100",
          ].join(" ")}
          style={isActive ? { color: BRAND_GREEN } : undefined}
        >
          {icon}
        </span>
      </span>

      <span
        className={[
          "text-[11px] font-medium leading-tight text-center px-1",
          isActive ? "text-zinc-900" : "text-zinc-600 group-hover:text-zinc-900",
        ].join(" ")}
      >
        {label}
      </span>

      <span
        className="h-2 w-2 rounded-full transition-opacity"
        style={{
          backgroundColor: BRAND_GREEN,
          opacity: isActive ? 1 : 0,
        }}
      />
    </Link>
  );
}

/* Simple inline icons (no libraries) */
function IconDashboard() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 13.5V20a1 1 0 0 0 1 1h5.5v-7.5H4Zm9.5 0V21H19a1 1 0 0 0 1-1v-6.5h-6.5ZM4 4v7.5h7.5V4H5a1 1 0 0 0-1 1Zm9.5 0v7.5H20V5a1 1 0 0 0-1-1h-5.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconBuilding() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 7h2M9 11h2M9 15h2M13 7h2M13 11h2M13 15h2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 21h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClients() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 21a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 8.5a3 3 0 0 1 0 5.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconIncident() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 9v4M12 17h.01"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M14.5 6.2a5 5 0 0 0-6.7 6.7L4 16.7V20h3.3l3.8-3.8a5 5 0 0 0 6.7-6.7l-2.1 2.1-2.8-2.8 2.6-2.6Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconClipboard() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 4h6l1 2h3v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6h3l1-2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 4a2 2 0 0 0 0 4h6a2 2 0 0 0 0-4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 12h7M8.5 15.5h7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconBox() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M4 8.5 12 4l8 4.5v9L12 22l-8-4.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 22v-9.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M4 8.5l8 4.5 8-4.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconEmployees() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 21a8 8 0 0 1 16 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M20 8.5a3 3 0 0 1 0 5.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2L2 7l10 5 10-5-10-5z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M2 17l10 5 10-5M2 12l10 5 10-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 2v5M12 12v5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M19.4 13a7.8 7.8 0 0 0 0-2l2-1.2-2-3.4-2.3.7a7.7 7.7 0 0 0-1.7-1l-.3-2.4H11l-.3 2.4a7.7 7.7 0 0 0-1.7 1l-2.3-.7-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.7a7.7 7.7 0 0 0 1.7 1l.3 2.4h4.1l.3-2.4a7.7 7.7 0 0 0 1.7-1l2.3.7 2-3.4-2-1.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconSales() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}