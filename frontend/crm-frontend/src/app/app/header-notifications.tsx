"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { API_BASE } from "@/lib/api";

interface Notification {
  id: string;
  workOrderId: string;
  readAt: string | null;
  createdAt: string;
  workOrder?: { title: string; workOrderNumber: number };
}

export default function HeaderNotifications() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    async function fetchCount() {
      try {
        const res = await fetch(`${API_BASE}/v1/work-orders/notifications`, { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const arr = Array.isArray(data) ? data : data?.items ?? [];
        setNotifications(arr.slice(0, 10));
        setUnreadCount(arr.filter((n: Notification) => !n.readAt).length);
      } catch { /* ignore */ }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
          open
            ? "bg-emerald-100 text-emerald-600"
            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
        }`}
        title="Notifications"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2a7 7 0 0 0-7 7v3.528a1 1 0 0 1-.105.447l-1.717 3.433A1 1 0 0 0 4.073 18h15.854a1 1 0 0 0 .894-1.447l-.053-.105-1.664-3.329A1 1 0 0 1 19 12.672V9a7 7 0 0 0-7-7Zm0 20a3 3 0 0 1-2.83-2h5.66A3 3 0 0 1 12 22Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[60000] w-[360px] max-h-[480px] bg-white rounded-2xl shadow-2xl border border-zinc-200/80 overflow-hidden"
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs text-emerald-600 font-medium">{unreadCount} unread</span>
              )}
            </div>
            <div className="overflow-y-auto max-h-[400px]">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-zinc-400">No notifications yet</div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-zinc-50 hover:bg-zinc-50 transition-colors cursor-pointer ${!n.readAt ? "bg-emerald-50/30" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${!n.readAt ? "bg-emerald-500" : "bg-transparent"}`} />
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-900 truncate">Work Order #{n.workOrder?.workOrderNumber ?? ""}</p>
                        <p className="text-xs text-zinc-500 truncate">{n.workOrder?.title ?? "Notification"}</p>
                        <p className="text-[10px] text-zinc-400 mt-0.5">{new Date(n.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
