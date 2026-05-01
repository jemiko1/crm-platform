"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api";
import { useDesktopPhone } from "@/hooks/useDesktopPhone";
import { usePermissions } from "@/lib/use-permissions";

// VM-hosted installer behind the same nginx that serves the auto-updater
// (vm-configs/nginx-ssl.conf, location /downloads/phone/). Switched off the
// public GitHub Releases URL so employees keep working when the repo goes
// private. Replace the file at C:/crm/downloads/phone/CRM28-Phone-Setup.exe
// on the Windows VM on each release; the path stays stable so this URL
// never has to change.
const SOFTPHONE_DOWNLOAD_URL =
  "https://crm28.asg.ge/downloads/phone/CRM28-Phone-Setup.exe";

export default function PhoneMismatchBanner() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  useEffect(() => {
    apiGet<any>("/auth/me")
      .then((data) => {
        if (data?.user?.id) {
          setCurrentUserId(data.user.id);
          // Display name preference: full name → email → blank
          const fullName = [data.user.firstName, data.user.lastName]
            .filter(Boolean)
            .join(" ")
            .trim();
          setCurrentUserName(fullName || data.user.email || null);
        }
      })
      .catch(() => {});
  }, []);

  const { phoneState, switchingUser, switchUser } =
    useDesktopPhone(currentUserId);
  const { hasPermission } = usePermissions();

  // The banner is always rendered as `fixed`, so it doesn't take space in the
  // document flow on its own. Without this, when the banner appears it
  // overlaps the top of the sidebar and the top of the main content. Setting
  // `--banner-h` on the document root lets the layout's content padding-top
  // and sidebar `top` grow to make room for the banner — and shrink back to
  // 0 when the banner is hidden. ~36px matches the rendered banner height
  // (px-4 py-2 + text-sm + py-1 button). One CSS variable shared across
  // layout.tsx + sidebar — no React context needed.
  const isBannerVisible =
    phoneState.state !== "idle" &&
    phoneState.state !== "match" &&
    !(phoneState.state === "not-logged-in" && !hasPermission("softphone.handshake"));

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--banner-h",
      isBannerVisible ? "36px" : "0px",
    );
  }, [isBannerVisible]);

  if (phoneState.state === "idle" || phoneState.state === "match") {
    return null;
  }

  if (phoneState.state === "not-logged-in") {
    // SSO handoff banner — softphone is open but no operator is signed in
    // yet. Permission-gated so non-softphone users don't see a useless
    // CTA. Click triggers the same /auth/device-token → /switch-user
    // handshake that the user-switch flow uses; the softphone main
    // process pops a native Allow/Deny dialog before the session is set.
    if (!hasPermission("softphone.handshake")) {
      return null;
    }
    const display = currentUserName ?? "your account";
    return (
      <div className="fixed top-[52px] left-0 right-0 z-40 bg-teal-700 text-white px-4 py-2 flex items-center justify-between text-sm shadow-lg">
        <span>
          Softphone is open but not signed in.
        </span>
        <button
          onClick={switchUser}
          disabled={switchingUser}
          className="ml-4 px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-medium disabled:opacity-50"
        >
          {switchingUser ? "Signing in..." : `Sign in to softphone as ${display}`}
        </button>
      </div>
    );
  }

  if (phoneState.state === "mismatch") {
    // Payload no longer includes the softphone user's name/extension (audit/P1-12
    // trims bridge /status output). We only know there IS a different user paired.
    return (
      <div className="fixed top-[52px] left-0 right-0 z-40 bg-amber-600 text-white px-4 py-2 flex items-center justify-between text-sm shadow-lg">
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
    <div className="fixed top-[52px] left-0 right-0 z-40 bg-red-600 text-white px-4 py-2 flex items-center justify-between text-sm shadow-lg">
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
