"use client";

import { useState, useCallback } from "react";
import { useI18n } from "@/hooks/useI18n";

const BRIDGE_URL = "http://127.0.0.1:19876";

interface ClickToCallProps {
  number: string;
  children?: React.ReactNode;
  className?: string;
}

export function ClickToCall({ number, children, className }: ClickToCallProps) {
  const { t } = useI18n();
  const [status, setStatus] = useState<"idle" | "dialing" | "error" | "no-app">("idle");

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      // Prevent parent row click handlers from firing (row navigate, etc.)
      e.stopPropagation();
      setStatus("dialing");
      try {
        const res = await fetch(`${BRIDGE_URL}/dial`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ number }),
          signal: AbortSignal.timeout(3000),
        });

        if (res.ok) {
          setStatus("idle");
        } else {
          setStatus("error");
          setTimeout(() => setStatus("idle"), 3000);
        }
      } catch {
        setStatus("no-app");
        setTimeout(() => setStatus("idle"), 3000);
      }
    },
    [number],
  );

  const title =
    status === "no-app"
      ? t("clickToCall.noApp", "Softphone not running. Open CRM28 Phone and log in.")
      : status === "error"
        ? t("clickToCall.failed", "Failed to dial. Check that the softphone is registered.")
        : t("clickToCall.call", "Call {number}").replace("{number}", number);

  return (
    <button
      onClick={handleClick}
      title={title}
      disabled={status === "dialing"}
      className={
        className ||
        "inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 disabled:opacity-50 text-sm"
      }
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.97.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.84.57 2.81.7A2 2 0 0 1 22 16.92Z" />
      </svg>
      {children || number}
      {status === "no-app" && (
        <span className="text-xs text-amber-600 ml-1">{t("clickToCall.appNotFound", "(app not found)")}</span>
      )}
      {status === "error" && (
        <span className="text-xs text-red-500 ml-1">{t("clickToCall.failedShort", "(failed)")}</span>
      )}
    </button>
  );
}
