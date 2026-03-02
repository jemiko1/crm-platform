"use client";

import { useEffect, useState } from "react";
import { useDesktopPhone } from "@/hooks/useDesktopPhone";

export default function PhoneMismatchBanner() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user?.id) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  const { appDetected, appUser, mismatch, switchingUser, switchUser } =
    useDesktopPhone(currentUserId);

  if (!appDetected || !mismatch || !appUser) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-sm shadow-lg">
      <span>
        Phone app is logged in as <strong>{appUser.name}</strong> (ext{" "}
        {appUser.extension}). Statistics may be incorrect.
      </span>
      <button
        onClick={switchUser}
        disabled={switchingUser}
        className="ml-4 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium disabled:opacity-50"
      >
        {switchingUser ? "Switching..." : "Switch Phone to My Account"}
      </button>
    </div>
  );
}
