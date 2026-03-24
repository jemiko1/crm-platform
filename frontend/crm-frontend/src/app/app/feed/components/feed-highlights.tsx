"use client";

import type { ReactNode } from "react";
import type { FeedHighlight, FeedHighlightAction } from "../types";

const toneStyles: Record<
  FeedHighlight["tone"],
  { border: string; bg: string; icon: ReactNode }
> = {
  birthday: {
    border: "border-amber-200/90",
    bg: "from-amber-50/90 to-orange-50/50",
    icon: (
      <span className="text-lg" aria-hidden>
        🎂
      </span>
    ),
  },
  event: {
    border: "border-sky-200/90",
    bg: "from-sky-50/90 to-indigo-50/40",
    icon: (
      <span className="text-lg" aria-hidden>
        📅
      </span>
    ),
  },
  joiner: {
    border: "border-violet-200/90",
    bg: "from-violet-50/90 to-fuchsia-50/40",
    icon: (
      <span className="text-lg" aria-hidden>
        👋
      </span>
    ),
  },
  poll: {
    border: "border-[rgba(0,86,83,0.25)]",
    bg: "from-[rgba(0,86,83,0.08)] to-teal-50/40",
    icon: (
      <span className="text-lg" aria-hidden>
        📊
      </span>
    ),
  },
  announcement: {
    border: "border-zinc-300/90",
    bg: "from-zinc-50/95 to-stone-50/50",
    icon: (
      <span className="text-lg" aria-hidden>
        📣
      </span>
    ),
  },
};

export function FeedHighlightsRow({
  items,
  onNavigate,
}: {
  items: FeedHighlight[];
  onNavigate: (action: FeedHighlightAction) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((h) => {
        const s = toneStyles[h.tone];
        return (
          <button
            key={h.id}
            type="button"
            onClick={() => onNavigate(h.action)}
            className={[
              "rounded-2xl border p-3.5 text-left flex gap-3 items-start",
              "bg-gradient-to-br shadow-[0_12px_36px_-18px_rgba(0,0,0,0.18)]",
              "hover:shadow-[0_16px_40px_-16px_rgba(0,0,0,0.22)] transition-shadow",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(0,86,83)] focus-visible:ring-offset-2",
              s.border,
              s.bg,
            ].join(" ")}
          >
            <div className="mt-0.5">{s.icon}</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{h.label}</div>
              <div className="mt-0.5 truncate text-sm font-medium text-zinc-900">{h.sublabel}</div>
              <div className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[rgb(0,86,83)]">
                Go
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="opacity-80" aria-hidden>
                  <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
