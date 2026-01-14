"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

const BRAND_GREEN = "rgb(8,117,56)";

type UserInfo = {
  email: string;
  role: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  position?: {
    name: string;
    code: string;
  } | null;
  department?: {
    name: string;
    code: string;
  } | null;
  isSuperAdmin?: boolean;
};

function initialsOf(name?: string | null, surname?: string | null) {
  const a = (name ?? "").trim().slice(0, 1).toUpperCase();
  const b = (surname ?? "").trim().slice(0, 1).toUpperCase();
  const v = (a + b).trim();
  return v || "U";
}

function roleLabelOf(userInfo: UserInfo) {
  if (userInfo.isSuperAdmin) {
    return "Super Admin";
  }
  if (userInfo.position?.name) {
    return userInfo.position.name;
  }
  const r = (userInfo.role ?? "").toUpperCase();
  if (r === "CALL_CENTER") return "Call Center";
  if (r === "TECHNICIAN") return "Technician";
  if (r === "WAREHOUSE") return "Warehouse";
  if (r === "MANAGER") return "Manager";
  if (r === "ADMIN") return "Admin";
  return r || "User";
}

type MenuPos = {
  top: number;
  left: number;
  width: number;
};

export default function ProfileMenu() {
  const router = useRouter();

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const [loadingMe, setLoadingMe] = useState(true);
  const [me, setMe] = useState<UserInfo>({
    email: "",
    role: "",
    firstName: null,
    lastName: null,
    avatarUrl: null,
    position: null,
    department: null,
    isSuperAdmin: false,
  });

  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Fetch /auth/me (cookie-based)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadingMe(true);
        const res = await fetch("http://localhost:3000/auth/me", {
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed /auth/me");
        const data = await res.json();

        // Extract user data from response
        const userData = data?.user || data;

        const next: UserInfo = {
          email: userData?.email ?? "",
          role: userData?.role ?? "",
          firstName: userData?.firstName ?? null,
          lastName: userData?.lastName ?? null,
          avatarUrl: userData?.avatarUrl ?? null,
          position: userData?.position ?? null,
          department: userData?.department ?? null,
          isSuperAdmin: userData?.isSuperAdmin ?? false,
        };

        if (!cancelled) setMe(next);
      } catch {
        // keep defaults
      } finally {
        if (!cancelled) setLoadingMe(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const displayName = useMemo(() => {
    const full = `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim();
    return full || me.email;
  }, [me]);

  const roleLabel = useMemo(() => roleLabelOf(me), [me]);

  function computePosition() {
    const el = btnRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const panelWidth = 288; // w-72
    const gap = 8;

    // Right-align panel with the button (like your current design)
    const left = Math.max(12, rect.right - panelWidth);
    const top = rect.bottom + gap;

    setPos({
      top: Math.round(top + window.scrollY),
      left: Math.round(left + window.scrollX),
      width: panelWidth,
    });
  }

  function openMenu() {
    computePosition();
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  // Reposition on resize/scroll while open
  useEffect(() => {
    if (!open) return;

    const onScroll = () => computePosition();
    const onResize = () => computePosition();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click + ESC
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function logout() {
    try {
      await fetch("http://localhost:3000/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      closeMenu();
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        className={[
          "flex items-center gap-3 rounded-2xl px-3 py-2 transition",
          "bg-white/70 hover:bg-white shadow-sm ring-1 ring-white/60",
        ].join(" ")}
      >
        {/* Avatar */}
        <div className="relative h-10 w-10 overflow-hidden rounded-2xl ring-1 ring-white/60 bg-white grid place-items-center">
          {me.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={me.avatarUrl}
              alt="Profile"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-sm font-semibold text-zinc-800">
              {initialsOf(me.firstName, me.lastName)}
            </span>
          )}

          <span
            className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white"
            style={{ backgroundColor: BRAND_GREEN }}
          />
        </div>

        {/* Name + role */}
        <div className="hidden sm:block text-left leading-tight">
          <div className="text-sm font-semibold text-zinc-900">
            {loadingMe ? "Loading..." : displayName}
          </div>
          <div className="text-xs text-zinc-600">{roleLabel}</div>
        </div>

        <span className="text-zinc-600">▾</span>
      </button>

      {/* Portal menu */}
      {mounted && open && pos
        ? createPortal(
            <>
              {/* Overlay (always on top of app, below panel) */}
              <div
                className="fixed inset-0 z-[9998]"
                onMouseDown={closeMenu}
                aria-hidden="true"
              />

              {/* Panel */}
              <div
                className="fixed z-[9999]"
                style={{
                  top: pos.top - window.scrollY,
                  left: pos.left - window.scrollX,
                  width: pos.width,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="overflow-hidden rounded-3xl bg-white shadow-[0_30px_70px_-22px_rgba(0,0,0,0.35)] ring-1 ring-zinc-200">
                  <div className="p-4 border-b border-zinc-200">
                    <div className="text-sm font-semibold text-zinc-900">
                      {displayName}
                    </div>
                    <div className="mt-1 text-xs text-zinc-600">{me.email}</div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {roleLabel}
                      </div>
                      {me.department && (
                        <div className="inline-flex items-center gap-2 rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
                          {me.department.name}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-2">
                    <MenuLink href="/app/profile" label="My profile details" />
                    <MenuLink href="/app/activities" label="My activities" />
                    <MenuLink href="/app/settings" label="Settings" />
                  </div>

                  <div className="p-2 border-t border-zinc-200 bg-zinc-50">
                    <button
                      type="button"
                      onClick={logout}
                      className="w-full rounded-2xl px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95 active:scale-[0.99]"
                      style={{ backgroundColor: BRAND_GREEN }}
                    >
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </>,
            document.body
          )
        : null}
    </>
  );
}

function MenuLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block rounded-2xl px-4 py-2.5 text-sm text-zinc-800 hover:bg-emerald-50 hover:text-zinc-900 transition"
    >
      {label}
    </Link>
  );
}
