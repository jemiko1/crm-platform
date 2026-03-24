"use client";

import type { FeedPost } from "../types";
import { FeedAnnouncementCard } from "./cards/feed-announcement-card";
import { FeedEventCard } from "./cards/feed-event-card";
import { FeedPollCard } from "./cards/feed-poll-card";
import { FeedRecognitionCard } from "./cards/feed-recognition-card";
import { FeedStandardCard } from "./cards/feed-standard-card";

function FeedPostSkeleton() {
  return (
    <div className="animate-pulse rounded-3xl border border-zinc-200/80 bg-white/80 p-5 shadow-sm">
      <div className="flex gap-3">
        <div className="h-11 w-11 shrink-0 rounded-2xl bg-zinc-200" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-2/5 rounded bg-zinc-200" />
          <div className="h-3 w-1/3 rounded bg-zinc-100" />
        </div>
      </div>
      <div className="mt-4 h-20 rounded-2xl bg-zinc-100" />
      <div className="mt-3 flex gap-2">
        <div className="h-8 w-16 rounded-full bg-zinc-100" />
        <div className="h-8 w-16 rounded-full bg-zinc-100" />
      </div>
    </div>
  );
}

export function FeedPostStream({
  posts,
  loading,
  savedIds,
  onToggleSave,
  pollVotes,
  onVotePoll,
  eventRsvp,
  onRsvp,
  announcementAck,
  onAcknowledge,
  emojiPicks,
  onToggleReaction,
}: {
  posts: FeedPost[];
  /** When true, shows skeleton placeholders (for future API loading). */
  loading?: boolean;
  savedIds: Set<string>;
  onToggleSave: (id: string) => void;
  pollVotes: Record<string, string>;
  onVotePoll: (postId: string, optionId: string) => void;
  eventRsvp: Record<string, "going" | "maybe" | "declined">;
  onRsvp: (postId: string, status: "going" | "maybe" | "declined") => void;
  announcementAck: Set<string>;
  onAcknowledge: (id: string) => void;
  emojiPicks: Record<string, Record<string, boolean>>;
  onToggleReaction: (postId: string, emoji: string) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading feed">
        <FeedPostSkeleton />
        <FeedPostSkeleton />
        <FeedPostSkeleton />
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-zinc-200 bg-white/70 px-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-2xl" aria-hidden>
          ✨
        </div>
        <h3 className="mt-4 text-lg font-semibold text-zinc-900">Nothing here yet</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-600">
          Try another tab, follow more teammates, or save posts you want to revisit. The conversation starts with you.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((post) => {
        if (post.kind === "standard") {
          return (
            <FeedStandardCard
              key={post.id}
              post={post}
              saved={savedIds.has(post.id)}
              onToggleSave={() => onToggleSave(post.id)}
              emojiPicks={emojiPicks[post.id]}
              onToggleReaction={(emoji) => onToggleReaction(post.id, emoji)}
            />
          );
        }
        if (post.kind === "announcement") {
          return (
            <FeedAnnouncementCard
              key={post.id}
              post={post}
              saved={savedIds.has(post.id)}
              onToggleSave={() => onToggleSave(post.id)}
              acknowledged={announcementAck.has(post.id)}
              onAcknowledge={() => onAcknowledge(post.id)}
            />
          );
        }
        if (post.kind === "poll") {
          return (
            <FeedPollCard
              key={post.id}
              post={post}
              saved={savedIds.has(post.id)}
              onToggleSave={() => onToggleSave(post.id)}
              selectedId={pollVotes[post.id]}
              onVote={(optionId) => onVotePoll(post.id, optionId)}
            />
          );
        }
        if (post.kind === "event") {
          return (
            <FeedEventCard
              key={post.id}
              post={post}
              saved={savedIds.has(post.id)}
              onToggleSave={() => onToggleSave(post.id)}
              rsvp={eventRsvp[post.id]}
              onRsvp={(s) => onRsvp(post.id, s)}
            />
          );
        }
        return (
          <FeedRecognitionCard
            key={post.id}
            post={post}
            saved={savedIds.has(post.id)}
            onToggleSave={() => onToggleSave(post.id)}
          />
        );
      })}
    </div>
  );
}
