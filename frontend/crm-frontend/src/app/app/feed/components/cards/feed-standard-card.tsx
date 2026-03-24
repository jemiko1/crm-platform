"use client";

import type { StandardPost } from "../../types";
import { CARD_POST, REACTION_ACTIVE, REACTION_IDLE } from "../../feed-ui";
import { FeedAvatar } from "../feed-avatar";
import { FeedSaveButton } from "../feed-save-button";
import { feedTimeLabel, PinBadge } from "../post-helpers";

export function FeedStandardCard({
  post,
  saved,
  onToggleSave,
  emojiPicks,
  onToggleReaction,
}: {
  post: StandardPost;
  saved: boolean;
  onToggleSave: () => void;
  emojiPicks?: Record<string, boolean>;
  onToggleReaction: (emoji: string) => void;
}) {
  const rx = Object.fromEntries(
    post.reactions.map((r) => [r.emoji, r.count + (emojiPicks?.[r.emoji] ? 1 : 0)]),
  );

  return (
    <article className={CARD_POST}>
      <header className="flex gap-3">
        <FeedAvatar name={post.author.name} initials={post.author.initials} src={post.author.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-zinc-900">{post.author.name}</span>
            {post.pinned && <PinBadge />}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {post.author.department} · {feedTimeLabel(post.createdAt)}
          </div>
        </div>
        <FeedSaveButton saved={saved} onToggle={onToggleSave} />
      </header>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">{post.text}</p>
      {post.imageUrl && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.imageUrl} alt="" className="h-48 w-full object-cover sm:h-56" />
        </div>
      )}
      {post.attachmentLabel && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          <span aria-hidden>📄</span>
          <span className="truncate font-medium">{post.attachmentLabel}</span>
        </div>
      )}
      <footer className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {post.reactions.map((r) => {
            const picked = Boolean(emojiPicks?.[r.emoji]);
            return (
              <button
                key={r.emoji}
                type="button"
                onClick={() => onToggleReaction(r.emoji)}
                className={[
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  picked ? REACTION_ACTIVE : REACTION_IDLE,
                ].join(" ")}
              >
                <span>{r.emoji}</span>
                <span className="tabular-nums">{rx[r.emoji] ?? r.count}</span>
              </button>
            );
          })}
        </div>
        <button type="button" className="text-left text-xs font-semibold text-zinc-500 hover:text-zinc-800 sm:text-right">
          {post.commentsCount} comments
        </button>
      </footer>
    </article>
  );
}
