"use client";

import { format, parseISO } from "date-fns";
import type { PollPost } from "../../types";
import { FEED_BRAND } from "../../feed-constants";
import { FeedAvatar } from "../feed-avatar";
import { FeedSaveButton } from "../feed-save-button";
import { PollOptionBars } from "../poll-option-bars";
import { feedTimeLabel } from "../post-helpers";

export function FeedPollCard({
  post,
  saved,
  onToggleSave,
  selectedId,
  onVote,
}: {
  post: PollPost;
  saved: boolean;
  onToggleSave: () => void;
  selectedId?: string;
  onVote: (optionId: string) => void;
}) {
  const total = post.options.reduce((s, o) => s + o.votes, 0);
  const closes = parseISO(post.closesAt);

  return (
    <article className="rounded-3xl border border-[rgba(0,86,83,0.22)] bg-gradient-to-br from-[rgba(0,86,83,0.05)] via-white to-white p-4 sm:p-5 shadow-[0_18px_44px_-28px_rgba(0,86,83,0.12)]">
      <header className="flex justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <FeedAvatar name={post.author.name} initials={post.author.initials} src={post.author.avatarUrl} />
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: FEED_BRAND }}>
              Poll
            </div>
            <div className="truncate text-xs text-zinc-500">
              {post.author.name} · {feedTimeLabel(post.createdAt)}
            </div>
          </div>
        </div>
        <FeedSaveButton saved={saved} onToggle={onToggleSave} title="Save" />
      </header>
      <h3 className="mt-4 text-lg font-semibold text-zinc-900">{post.question}</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Closes {format(closes, "MMM d, yyyy HH:mm")} · {post.anonymous ? "Anonymous voting" : "Named voting"}
      </p>
      <div className="mt-4">
        <PollOptionBars
          options={post.options}
          totalVotes={total}
          selectedId={selectedId}
          onSelect={onVote}
          size="md"
        />
      </div>
      <p className="mt-3 text-center text-xs text-zinc-500">
        {selectedId ? "Tap an option to change your vote." : "Tap an option to cast your vote."}
      </p>
    </article>
  );
}
