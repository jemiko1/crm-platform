"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useDesktopPhone } from "@/hooks/useDesktopPhone";

// Download URL for the Electron softphone installer. Served by nginx on the VM
// at https://crm28.asg.ge/downloads/phone/. See auto-updater feed in crm-phone.
const SOFTPHONE_DOWNLOAD_URL = "https://crm28.asg.ge/downloads/phone/";

export default function PhoneMismatchBanner() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<any>("/auth/me")
      .then((data) => {
        if (data?.user?.id) setCurrentUserId(data.user.id);
      })
      .catch(() => {});
  }, []);

  const { phoneState, switchingUser, switchUser } =
    useDesktopPhone(currentUserId);

  if (phoneState.state === "idle" || phoneState.state === "match") {
    return null;
  }

  if (phoneState.state === "mismatch") {
    const { bridgeUser } = phoneState;
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-sm shadow-lg">
        <span>
          Phone app is logged in as <strong>{bridgeUser.name}</strong> (ext{" "}
          {bridgeUser.extension}). Calls will be attributed to the wrong agent.
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

  // phoneState.state === 'bridge-unreachable'
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white px-4 py-2 flex items-center justify-between text-sm shadow-lg">
      <span>
        Softphone not detected. Calls won&apos;t attribute correctly.
      </span>
      <a
        href={SOFTPHONE_DOWNLOAD_URL}
        target="_blank"
        rel="noreferrer"
        className="ml-4 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium"
      >
        Launch softphone
      </a>
    </div>
  );
}
