"use client";

import { useState, useEffect, useRef } from "react";
import TasksIcon from "./tasks-icon";
import HeaderSearch from "./header-search";
import HeaderNotifications from "./header-notifications";
import HeaderMessengerIcon from "./header-messenger-icon";
import HeaderSettings from "./header-settings";
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-white shadow-[0_4px_16px_-2px_rgba(0,0,0,0.15)]">
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

          {/* Logo - on desktop centered above sidebar, on mobile next to hamburger */}
          <a href="/app/dashboard" className="shrink-0 lg:w-[108px] lg:flex lg:justify-center" title="CRM Platform" aria-label="CRM28 Home">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 196 72"
              className="h-9"
              style={{ maxWidth: '98px' }}
              aria-label="CRM28"
            >
              <defs>
                <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#007a75" />
                  <stop offset="100%" stopColor="#003e3c" />
                </linearGradient>
                <clipPath id="logoClip">
                  <rect x="124" y="0" width="72" height="72" rx="15.5" ry="15.5" />
                </clipPath>
              </defs>
              <text
                x="0"
                y="36"
                dominantBaseline="central"
                textAnchor="start"
                fontFamily="var(--font-outfit), 'Helvetica Neue', Arial, sans-serif"
                fontWeight="700"
                fontSize="52"
                letterSpacing="3"
                fill="#1A140D"
              >
                CRM
              </text>
              <rect x="124" y="0" width="72" height="72" rx="15.5" ry="15.5" fill="url(#logoGradient)" />
              <rect x="124" y="0" width="72" height="36" rx="15.5" ry="15.5" fill="white" fillOpacity="0.07" clipPath="url(#logoClip)" />
              <text
                x="160"
                y="47"
                textAnchor="middle"
                dominantBaseline="auto"
                fontFamily="Georgia, 'Times New Roman', serif"
                fontWeight="700"
                fontSize="46"
                letterSpacing="-1"
                fill="rgba(255,255,255,0.97)"
              >
                28
              </text>
            </svg>
          </a>

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
            <HeaderSettings />
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
          className={`absolute top-0 left-0 bottom-0 w-[280px] sm:w-[320px] max-w-[85vw] bg-white/95 backdrop-blur-xl shadow-xl border-r border-zinc-200/80 transition-[transform] duration-300 ease-out overflow-y-auto pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] ${
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
