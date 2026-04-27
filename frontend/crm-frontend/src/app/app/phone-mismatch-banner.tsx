"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useDesktopPhone } from "@/hooks/useDesktopPhone";

// Always points at the latest release on GitHub — no codebase update
// needed per release. The previous `https://crm28.asg.ge/downloads/phone/`
// path returned 403 (nginx directory listing disabled) and the
// VM `downloads/phone/` folder gets out of sync with releases anyway.
// GitHub Releases is public + always up to date.
const SOFTPHONE_DOWNLOAD_URL =
  "https://github.com/jemiko1/crm-platform/releases/latest";

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
    // Payload no longer includes the softphone user's name/extension (audit/P1-12
    // trims bridge /status output). We only know there IS a different user paired.
    return (
      <div className="fixed top-0 left-0 right-0 z-[9999] bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-sm shadow-lg">
        <span>
          Softphone is paired to a different user. Calls will be attributed
          to the wrong agent.
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
        Download softphone
      </a>
    </div>
  );
}
