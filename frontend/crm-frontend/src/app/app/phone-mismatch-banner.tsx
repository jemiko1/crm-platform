"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useDesktopPhone } from "@/hooks/useDesktopPhone";

// Stable URL on the VM that always serves the latest installer. Nginx
// rewrites Content-Disposition so the browser saves it with a
// version-less filename. Public, no auth, no VPN — anyone on the
// public internet who can reach the CRM web app can also download
// the softphone.
//
// Why VM and not `https://github.com/jemiko1/crm-platform/releases/latest`:
// the GitHub repo is going private, so unauthenticated GitHub release
// fetches will 404. The "VM gets out of sync" worry that originally
// pushed us toward GitHub (PR #305) is solved by the release script —
// `pnpm run release` always refreshes this stable copy as part of the
// same atomic command that builds + uploads the versioned installer.
// See docs/SOFTPHONE_RELEASE_PROCEDURE.md.
const SOFTPHONE_DOWNLOAD_URL =
  "https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup.exe";

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
