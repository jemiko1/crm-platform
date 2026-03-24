"use client";

import type { FeedTab } from "../types";
import { TAB_ACTIVE, TAB_IDLE } from "../feed-ui";

const TABS: { id: FeedTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "following", label: "Following" },
  { id: "announcements", label: "Announcements" },
  { id: "polls", label: "Polls" },
  { id: "events", label: "Events" },
  { id: "recognition", label: "Recognition" },
  { id: "saved", label: "Saved" },
];

export function FeedTabs({
  active,
  onChange,
  savedCount,
}: {
  active: FeedTab;
  onChange: (t: FeedTab) => void;
  savedCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Feed filters">
      {TABS.map((t) => {
        const isSaved = t.id === "saved";
        const label = isSaved && savedCount > 0 ? `${t.label} (${savedCount})` : t.label;
        const on = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.id)}
            className={[
              "rounded-lg px-3 py-2 text-sm font-medium transition md:rounded-2xl md:px-3.5",
              "border shadow-sm",
              on ? TAB_ACTIVE : TAB_IDLE,
            ].join(" ")}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
