import type { FeedPost, FeedTab } from "./types";
import { MOCK_FOLLOWING_AUTHOR_IDS } from "./mock-data";

export function cloneFeedPosts(source: FeedPost[]): FeedPost[] {
  return JSON.parse(JSON.stringify(source)) as FeedPost[];
}

export function sortFeedPostsByDateDesc(list: FeedPost[]): FeedPost[] {
  return [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function filterFeedPostsByTab(
  list: FeedPost[],
  tab: FeedTab,
  savedIds: Set<string>,
): FeedPost[] {
  switch (tab) {
    case "following":
      return list.filter((p) => MOCK_FOLLOWING_AUTHOR_IDS.includes(p.author.id));
    case "announcements":
      return list.filter((p) => p.kind === "announcement");
    case "polls":
      return list.filter((p) => p.kind === "poll");
    case "events":
      return list.filter((p) => p.kind === "event");
    case "recognition":
      return list.filter((p) => p.kind === "recognition");
    case "saved":
      return list.filter((p) => savedIds.has(p.id));
    default:
      return list;
  }
}
