"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

export default function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  return (
    <>
      {/* Full pill search bar on sm+ screens */}
      <button
        onClick={() => setOpen(true)}
        className="hidden sm:flex items-center gap-2 h-10 pl-3 pr-4 rounded-full bg-zinc-100 hover:bg-zinc-200/80 transition-colors text-zinc-500 text-sm min-w-[220px]"
        title="Search (Ctrl+K)"
      >
        <svg className="w-4 h-4 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <span className="text-zinc-400">Search CRM</span>
      </button>

      {/* Icon-only search button on mobile */}
      <button
        onClick={() => setOpen(true)}
        className="sm:hidden w-10 h-10 flex items-center justify-center rounded-full bg-zinc-100 hover:bg-zinc-200/80 transition-colors"
        title="Search (Ctrl+K)"
      >
        <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[60000] flex items-start justify-center pt-[12vh]"
            onClick={() => { setOpen(false); setQuery(""); }}
          >
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100">
                <svg className="w-5 h-5 text-zinc-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search buildings, clients, employees..."
                  className="flex-1 bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400"
                />
                <kbd className="text-xs px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200 text-zinc-400 font-mono">ESC</kbd>
              </div>
              <div className="p-6 text-sm text-zinc-400 text-center min-h-[80px] flex items-center justify-center">
                {query ? "Type to search across CRM..." : "Start typing to search"}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
