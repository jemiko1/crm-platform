"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/lib/use-permissions";
import { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";

const BRAND_GREEN = "rgb(8,117,56)";
const STORAGE_KEY = "crm28_menu_order";

type NavItemDef = {
  href: string;
  label: string;
  labelKey: string;
  iconKey: string;
  requiredPermission?: string;
};

const ALL_ITEMS: NavItemDef[] = [
  { href: "/app/dashboard", label: "Dashboard", labelKey: "sidebar.dashboard", iconKey: "dashboard" },
  { href: "/app/buildings", label: "Buildings", labelKey: "sidebar.buildings", iconKey: "building", requiredPermission: "buildings.menu" },
  { href: "/app/clients", label: "Clients", labelKey: "sidebar.clients", iconKey: "clients", requiredPermission: "clients.menu" },
  { href: "/app/incidents", label: "Incidents", labelKey: "sidebar.incidents", iconKey: "incident", requiredPermission: "incidents.menu" },
  { href: "/app/assets", label: "Assets", labelKey: "sidebar.assets", iconKey: "wrench", requiredPermission: "assets.menu" },
  { href: "/app/work-orders", label: "Work Orders", labelKey: "sidebar.workOrders", iconKey: "clipboard", requiredPermission: "work_orders.menu" },
  { href: "/app/sales/dashboard", label: "Sales", labelKey: "sidebar.sales", iconKey: "sales", requiredPermission: "sales.menu" },
  { href: "/app/inventory", label: "Inventory", labelKey: "sidebar.inventory", iconKey: "box", requiredPermission: "inventory.menu" },
  { href: "/app/employees", label: "Employees", labelKey: "sidebar.employees", iconKey: "employees", requiredPermission: "employees.menu" },
  { href: "/app/client-chats", label: "Client Chats", labelKey: "sidebar.clientChats", iconKey: "clientChats", requiredPermission: "client_chats.menu" },
  { href: "/app/admin", label: "Admin", labelKey: "sidebar.admin", iconKey: "admin", requiredPermission: "admin.menu" },
];

const ICON_MAP: Record<string, React.ReactNode> = {
  dashboard: <IconDashboard />,
  building: <IconBuilding />,
  clients: <IconClients />,
  incident: <IconIncident />,
  wrench: <IconWrench />,
  clipboard: <IconClipboard />,
  sales: <IconSales />,
  box: <IconBox />,
  employees: <IconEmployees />,
  clientChats: <IconClientChats />,
  admin: <IconAdmin />,
};

async function fetchUserId(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.user || data;
    return user?.id || user?.sub || null;
  } catch {
    return null;
  }
}

function loadOrder(userId: string): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data[userId] ?? null;
  } catch {
    return null;
  }
}

function saveOrder(userId: string, order: string[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : {};
    data[userId] = order;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

function applyOrder(items: NavItemDef[], order: string[] | null): NavItemDef[] {
  if (!order) return items;
  const map = new Map(items.map((it) => [it.href, it]));
  const ordered: NavItemDef[] = [];
  for (const href of order) {
    const item = map.get(href);
    if (item) {
      ordered.push(item);
      map.delete(href);
    }
  }
  for (const item of map.values()) {
    ordered.push(item);
  }
  return ordered;
}

export default function SidebarNav() {
  const pathname = usePathname();
  const { hasPermission, loading } = usePermissions();
  const { t } = useI18n();
  const [customizing, setCustomizing] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [savedOrder, setSavedOrder] = useState<string[] | null>(null);
  const [draftOrder, setDraftOrder] = useState<NavItemDef[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchUserId().then((uid) => {
      if (cancelled || !uid) return;
      setUserId(uid);
      setSavedOrder(loadOrder(uid));
    });
    return () => { cancelled = true; };
  }, []);

  const visibleItems = loading
    ? ALL_ITEMS.filter((item) => !item.requiredPermission)
    : ALL_ITEMS.filter((item) => !item.requiredPermission || hasPermission(item.requiredPermission));

  const orderedItems = applyOrder(visibleItems, savedOrder);

  const startCustomizing = useCallback(() => {
    setDraftOrder([...orderedItems]);
    setCustomizing(true);
  }, [orderedItems]);

  const saveCustomization = useCallback(() => {
    if (!userId) return;
    const order = draftOrder.map((it) => it.href);
    saveOrder(userId, order);
    setSavedOrder(order);
    setCustomizing(false);
  }, [userId, draftOrder]);

  const cancelCustomization = useCallback(() => {
    setCustomizing(false);
  }, []);

  const resetToDefault = useCallback(() => {
    if (!userId) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        delete data[userId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch { /* ignore */ }
    setSavedOrder(null);
    setCustomizing(false);
  }, [userId]);

  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    setDraftOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  if (customizing) {
    return (
      <CustomizeMode
        items={draftOrder}
        onMove={moveItem}
        onSave={saveCustomization}
        onCancel={cancelCustomization}
        onReset={resetToDefault}
      />
    );
  }

  return (
    <nav className="px-2 pb-3">
      <div className="space-y-2">
        {orderedItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <RailItem
              key={item.href}
              href={item.href}
              label={t(item.labelKey, item.label)}
              icon={ICON_MAP[item.iconKey]}
              isActive={isActive}
            />
          );
        })}
      </div>

      <div className="my-3 h-px bg-white/60" />

      <button
        onClick={startCustomizing}
        className="group relative w-full rounded-3xl px-2 py-3 transition flex flex-col items-center justify-center gap-2 bg-white/60 hover:bg-white shadow-[0_1px_0_rgba(0,0,0,0.02)] ring-1 ring-transparent cursor-pointer"
      >
        <span className="grid place-items-center rounded-2xl border transition h-12 w-12 bg-white/80 border-white/70">
          <span className="opacity-80 group-hover:opacity-100 transition-opacity">
            <IconCustomize />
          </span>
        </span>
        <span className="text-[11px] font-medium leading-tight text-center px-1 text-zinc-600 group-hover:text-zinc-900">
          Customize
        </span>
      </button>
    </nav>
  );
}

/* ── Customize Mode ── */

function CustomizeMode({
  items,
  onMove,
  onSave,
  onCancel,
  onReset,
}: {
  items: NavItemDef[];
  onMove: (from: number, to: number) => void;
  onSave: () => void;
  onCancel: () => void;
  onReset: () => void;
}) {
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
    setDraggingIdx(idx);
  };

  const handleDragEnter = (idx: number) => {
    dragOverItem.current = idx;
    setOverIdx(idx);
  };

  const handleDragEnd = () => {
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      onMove(dragItem.current, dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDraggingIdx(null);
    setOverIdx(null);
  };

  return (
    <nav className="px-2 pb-3">
      <div className="mb-2 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          Drag to reorder
        </span>
      </div>

      <div className="space-y-1.5">
        {items.map((item, idx) => (
          <div
            key={item.href}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragEnter={() => handleDragEnter(idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className={`relative flex items-center gap-2 rounded-2xl px-2 py-2 cursor-grab active:cursor-grabbing transition-all select-none ${
              draggingIdx === idx
                ? "opacity-50 scale-95 bg-emerald-50 ring-1 ring-emerald-300"
                : overIdx === idx && draggingIdx !== null
                ? "bg-emerald-50/60 ring-1 ring-emerald-200"
                : "bg-white/60 hover:bg-white ring-1 ring-transparent"
            }`}
          >
            <span className="text-zinc-300 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="5" r="1.5" />
                <circle cx="15" cy="5" r="1.5" />
                <circle cx="9" cy="12" r="1.5" />
                <circle cx="15" cy="12" r="1.5" />
                <circle cx="9" cy="19" r="1.5" />
                <circle cx="15" cy="19" r="1.5" />
              </svg>
            </span>
            <span className="shrink-0" style={{ color: "rgb(8,117,56)" }}>
              {ICON_MAP[item.iconKey]}
            </span>
            <span className="text-[11px] font-medium text-zinc-700 truncate">
              {item.label}
            </span>

            {/* Up/Down buttons for accessibility */}
            <div className="ml-auto flex flex-col gap-0.5 shrink-0">
              <button
                onClick={(e) => { e.stopPropagation(); if (idx > 0) onMove(idx, idx - 1); }}
                disabled={idx === 0}
                className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-20 disabled:cursor-not-allowed transition"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); if (idx < items.length - 1) onMove(idx, idx + 1); }}
                disabled={idx === items.length - 1}
                className="w-5 h-5 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 disabled:opacity-20 disabled:cursor-not-allowed transition"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1.5 px-1">
        <button
          onClick={onSave}
          className="w-full py-2 rounded-xl text-[11px] font-semibold text-white transition"
          style={{ backgroundColor: BRAND_GREEN }}
        >
          Save Order
        </button>
        <button
          onClick={onCancel}
          className="w-full py-2 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-[11px] font-semibold text-zinc-600 transition"
        >
          Cancel
        </button>
        <button
          onClick={onReset}
          className="w-full py-1.5 rounded-xl text-[10px] font-medium text-zinc-400 hover:text-zinc-600 transition"
        >
          Reset to Default
        </button>
      </div>
    </nav>
  );
}

/* ── Rail Item ── */

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

/* ── Icons ── */

function IconCustomize() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="8" cy="6" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="16" cy="12" r="2" fill="currentColor" opacity="0.4" />
      <circle cx="10" cy="18" r="2" fill="currentColor" opacity="0.4" />
    </svg>
  );
}

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

function IconClientChats() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8 10h8M8 13h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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
