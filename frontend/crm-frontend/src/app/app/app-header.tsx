"use client";

import { useState, useEffect, useRef } from "react";
import TasksIcon from "./tasks-icon";
import HeaderSearch from "./header-search";
import HeaderNotifications from "./header-notifications";
import HeaderMessengerIcon from "./header-messenger-icon";
import ProfileMenu from "./profile-menu";
import SidebarNav from "./sidebar-nav";

export default function AppHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-50 bg-white shadow-[0_4px_16px_-2px_rgba(0,0,0,0.15)]">
        <div className="flex items-center h-[52px] px-4">
          {/* Hamburger - visible below lg */}
          <button
            ref={btnRef}
            onClick={() => setMenuOpen(!menuOpen)}
            className="lg:hidden relative w-10 h-10 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200 transition-colors mr-2 shrink-0"
            aria-label="Toggle menu"
          >
            <div className="w-5 h-4 flex flex-col justify-between">
              <span
                className={`block h-[2px] w-5 bg-zinc-700 rounded-full transition-all duration-300 origin-center ${
                  menuOpen ? "translate-y-[7px] rotate-45" : ""
                }`}
              />
              <span
                className={`block h-[2px] w-5 bg-zinc-700 rounded-full transition-all duration-300 ${
                  menuOpen ? "opacity-0 scale-x-0" : ""
                }`}
              />
              <span
                className={`block h-[2px] w-5 bg-zinc-700 rounded-full transition-all duration-300 origin-center ${
                  menuOpen ? "-translate-y-[7px] -rotate-45" : ""
                }`}
              />
            </div>
          </button>

          {/* CRM28 - on desktop centered above sidebar, on mobile next to hamburger */}
          <span className="text-xl font-bold text-zinc-900 tracking-tight select-none shrink-0 lg:w-[108px] lg:text-center" title="CRM Platform">
            CRM28
          </span>

          {/* Spacer to align search with main content start on desktop */}
          <div className="hidden lg:block w-[24px] shrink-0" />

          {/* Search + Workspace */}
          <div className="hidden sm:flex items-center gap-6 shrink-0">
            <HeaderSearch />
            <div className="w-px h-6 bg-zinc-200" />
            <TasksIcon />
          </div>

          {/* Flexible spacer */}
          <div className="flex-1" />

          {/* Mobile search icon only (below sm) */}
          <div className="sm:hidden">
            <HeaderSearch />
          </div>

          {/* Right side - Action icons + Profile */}
          <div className="flex items-center gap-1 sm:gap-2">
            <HeaderMessengerIcon />
            <HeaderNotifications />
            <ProfileMenu />
          </div>
        </div>
      </header>

      {/* Mobile/Tablet slide-out menu overlay */}
      <div
        className={`lg:hidden fixed inset-0 z-[49] transition-opacity duration-300 ${
          menuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ top: 52 }}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/30 backdrop-blur-sm"
          onClick={() => setMenuOpen(false)}
        />

        {/* Slide-out panel */}
        <div
          ref={menuRef}
          className={`absolute top-0 left-0 bottom-0 w-[280px] max-w-[85vw] bg-white/95 backdrop-blur-xl shadow-[4px_0_24px_rgba(0,0,0,0.15)] transition-transform duration-300 ease-out overflow-y-auto ${
            menuOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* Mobile workspace link at top */}
          <div className="px-4 pt-4 pb-2 sm:hidden">
            <TasksIcon />
          </div>

          <div className="sm:hidden px-4 pb-2">
            <div className="h-px bg-zinc-200" />
          </div>

          {/* Navigation items */}
          <div onClick={() => setMenuOpen(false)}>
            <SidebarNav />
          </div>
        </div>
      </div>
    </>
  );
}
