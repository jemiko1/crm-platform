"use client";

import { useCallback, useMemo, useState } from "react";
import type { AnnouncementPost, FeedHighlightAction, FeedPost, FeedTab, PollPost } from "./types";
import {
  MOCK_FEED_POSTS,
  MOCK_BIRTHDAYS,
  MOCK_FEATURED_POLL,
  MOCK_HIGHLIGHTS,
  MOCK_NEW_JOINERS,
  MOCK_SIDEBAR_EVENTS,
  MOCK_SPOTLIGHT,
} from "./mock-data";
import { FEED_BRAND } from "./feed-constants";
import { FEED_SECTION, scrollToFeedSection } from "./feed-scroll";
import { cloneFeedPosts, filterFeedPostsByTab, sortFeedPostsByDateDesc } from "./feed-utils";
import { FeedComposer } from "./components/feed-composer";
import { FeedTabs } from "./components/feed-tabs";
import { FeedHighlightsRow } from "./components/feed-highlights";
import { FeedPostStream } from "./components/feed-post-stream";
import { FeedSidebar } from "./components/feed-sidebar";

export default function CompanyFeedPage() {
  const [tab, setTab] = useState<FeedTab>("all");
  const [posts, setPosts] = useState<FeedPost[]>(() => sortFeedPostsByDateDesc(cloneFeedPosts(MOCK_FEED_POSTS)));
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set(["post-1", "evt-1"]));
  const [pollVotes, setPollVotes] = useState<Record<string, string>>({});
  const [eventRsvp, setEventRsvp] = useState<Record<string, "going" | "maybe" | "declined">>({});
  const [announcementAck, setAnnouncementAck] = useState<Set<string>>(new Set());
  const [emojiPicks, setEmojiPicks] = useState<Record<string, Record<string, boolean>>>({});
  const [wishesSentIds, setWishesSentIds] = useState<Set<string>>(new Set());
  /** Toggle to `true` to preview skeleton loading UI (e.g. while wiring `useSWR`). */
  const [feedLoading] = useState(false);

  const onHighlightNavigate = useCallback((action: FeedHighlightAction) => {
    if (action.tab) setTab(action.tab);
    if (action.scrollToId) {
      const id = action.scrollToId;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollToFeedSection(id));
      });
    }
  }, []);

  const toggleSave = useCallback((id: string) => {
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleVotePoll = useCallback((postId: string, optionId: string) => {
    let previous: string | undefined;
    setPollVotes((prevVote) => {
      previous = prevVote[postId];
      return { ...prevVote, [postId]: optionId };
    });
    setPosts((prevPosts) =>
      prevPosts.map((p) => {
        if (p.kind !== "poll" || p.id !== postId) return p;
        const nextOpts = p.options.map((o) => {
          let v = o.votes;
          if (previous === o.id) v = Math.max(0, v - 1);
          if (optionId === o.id) v = v + 1;
          return { ...o, votes: v };
        });
        return { ...p, options: nextOpts };
      }),
    );
  }, []);

  const toggleReaction = useCallback((postId: string, emoji: string) => {
    setEmojiPicks((prev) => {
      const forPost = { ...prev[postId] };
      forPost[emoji] = !forPost[emoji];
      return { ...prev, [postId]: forPost };
    });
  }, []);

  const filteredPosts = useMemo(
    () => filterFeedPostsByTab(posts, tab, savedIds),
    [posts, tab, savedIds],
  );

  const sortedFiltered = useMemo(() => sortFeedPostsByDateDesc(filteredPosts), [filteredPosts]);

  const pinnedAnnouncements = useMemo(
    () =>
      (posts.filter((p) => p.kind === "announcement" && p.pinned) as AnnouncementPost[]).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [posts],
  );

  const featuredPollData = useMemo(() => {
    const p = posts.find((x) => x.kind === "poll" && x.id === MOCK_FEATURED_POLL.id) as PollPost | undefined;
    if (!p) return MOCK_FEATURED_POLL;
    const totalVotes = p.options.reduce((s, o) => s + o.votes, 0);
    return {
      id: p.id,
      question: p.question,
      options: p.options.map((o) => ({ ...o })),
      closesAt: p.closesAt,
      anonymous: p.anonymous,
      totalVotes,
    };
  }, [posts]);

  return (
    <div className="space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-white/60 bg-white/90 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.22)]">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-50 via-teal-50/80 to-amber-50/40 opacity-50"
          aria-hidden
        />
        <div className="pointer-events-none absolute -right-20 -top-16 h-48 w-48 rounded-full bg-[rgba(0,86,83,0.12)] blur-3xl" />
        <div className="relative p-5 sm:p-7">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/60 bg-white/80 px-3 py-1 text-xs font-medium text-zinc-700">
            <span className="h-2 w-2 animate-pulse rounded-full" style={{ backgroundColor: FEED_BRAND }} />
            Internal hub · Not operational data
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Company feed</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
            Announcements, polls, events, birthdays, and kudos — a warmer space for teammates to connect. Work orders and
            service tools stay in their own modules.
          </p>
        </div>
      </header>

      <FeedHighlightsRow items={MOCK_HIGHLIGHTS} onNavigate={onHighlightNavigate} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-4">
          <div id={FEED_SECTION.composer}>
            <FeedComposer currentUserName="You" currentUserInitials="ME" />
          </div>
          <FeedTabs active={tab} onChange={setTab} savedCount={savedIds.size} />
          <div id={FEED_SECTION.stream}>
            <FeedPostStream
              posts={sortedFiltered}
              loading={feedLoading}
              savedIds={savedIds}
              onToggleSave={toggleSave}
              pollVotes={pollVotes}
              onVotePoll={handleVotePoll}
              eventRsvp={eventRsvp}
              onRsvp={(id, s) => setEventRsvp((r) => ({ ...r, [id]: s }))}
              announcementAck={announcementAck}
              onAcknowledge={(id) => setAnnouncementAck((a) => new Set(a).add(id))}
              emojiPicks={emojiPicks}
              onToggleReaction={toggleReaction}
            />
          </div>
        </div>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-[72px]">
          <FeedSidebar
            birthdays={MOCK_BIRTHDAYS}
            events={MOCK_SIDEBAR_EVENTS}
            pinnedAnnouncements={pinnedAnnouncements}
            newJoiners={MOCK_NEW_JOINERS}
            spotlight={MOCK_SPOTLIGHT}
            featuredPoll={featuredPollData}
            featuredPollSelectedId={pollVotes[MOCK_FEATURED_POLL.id]}
            onVoteFeatured={(optionId) => handleVotePoll(MOCK_FEATURED_POLL.id, optionId)}
            wishesSentIds={wishesSentIds}
            onSendWishes={(id) => setWishesSentIds((s) => new Set(s).add(id))}
          />
        </aside>
      </div>
    </div>
  );
}
