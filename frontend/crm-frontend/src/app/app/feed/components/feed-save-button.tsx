"use client";

import { FEED_BRAND } from "../feed-constants";
import { BTN_GHOST_ICON, BTN_GHOST_ICON_ACTIVE } from "../feed-ui";

export function FeedSaveButton({
  saved,
  onToggle,
  title,
}: {
  saved: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title ?? (saved ? "Remove save" : "Save post")}
      onClick={onToggle}
      className={saved ? BTN_GHOST_ICON_ACTIVE : BTN_GHOST_ICON}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill={saved ? FEED_BRAND : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M6 4h12a1 1 0 0 1 1 1v15l-8-4-8 4V5a1 1 0 0 1 1-1z" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
