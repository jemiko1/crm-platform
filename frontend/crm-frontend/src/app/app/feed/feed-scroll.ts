/**
 * DOM ids for scroll targets from highlight chips and deep links.
 * Keep in sync with `id` props on layout wrappers in `page.tsx` / `feed-sidebar.tsx`.
 */
export const FEED_SECTION = {
  composer: "feed-section-composer",
  stream: "feed-section-stream",
  birthdays: "feed-section-birthdays",
  events: "feed-section-events",
  announcements: "feed-section-announcements",
  joiners: "feed-section-joiners",
  spotlight: "feed-section-spotlight",
  featuredPoll: "feed-section-featured-poll",
} as const;

export type FeedSectionId = (typeof FEED_SECTION)[keyof typeof FEED_SECTION];

export function scrollToFeedSection(elementId: string) {
  if (typeof document === "undefined") return;
  document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}
