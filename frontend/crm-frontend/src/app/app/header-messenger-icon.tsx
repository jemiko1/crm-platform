"use client";

import { useState, useRef, useEffect } from "react";
import { useMessenger } from "./messenger/messenger-context";
import MessengerDropdown from "./messenger/messenger-dropdown";

export default function HeaderMessengerIcon() {
  const { unreadCount, openFullMessenger } = useMessenger();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const handleClick = () => {
    if (isMobile) {
      openFullMessenger();
    } else {
      setOpen(!open);
    }
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={handleClick}
        className={`relative w-10 h-10 flex items-center justify-center rounded-full transition-colors ${
          open
            ? "bg-emerald-100 text-emerald-600"
            : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
        }`}
        title="Messenger"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.477 2 2 6.145 2 11.243c0 2.907 1.434 5.503 3.678 7.199V22l3.378-1.874c.9.252 1.855.388 2.844.388h.1c5.523 0 10-4.145 10-9.243S17.523 2 12 2Zm1.07 12.457-2.55-2.725-4.976 2.725 5.47-5.814 2.613 2.725 4.913-2.725-5.47 5.814Z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ring-2 ring-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && !isMobile && (
        <MessengerDropdown
          anchorRef={btnRef}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
