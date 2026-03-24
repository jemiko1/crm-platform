"use client";

import type { AnnouncementPost } from "../../types";
import { FEED_BRAND } from "../../feed-constants";
import { BTN_PRIMARY } from "../../feed-ui";
import { FeedAvatar } from "../feed-avatar";
import { FeedSaveButton } from "../feed-save-button";
import { feedTimeLabel, PinBadge } from "../post-helpers";

export function FeedAnnouncementCard({
  post,
  saved,
  onToggleSave,
  acknowledged,
  onAcknowledge,
}: {
  post: AnnouncementPost;
  saved: boolean;
  onToggleSave: () => void;
  acknowledged: boolean;
  onAcknowledge: () => void;
}) {
  return (
    <article
      className={[
        "rounded-3xl border-2 p-4 shadow-[0_24px_55px_-30px_rgba(0,0,0,0.25)] sm:p-6",
        post.important ? "border-zinc-800/25 bg-gradient-to-br from-zinc-50 to-white" : "border-zinc-200/90 bg-white",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {post.important && (
            <span className="rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
              Important
            </span>
          )}
          {post.mustRead && (
            <span
              className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{ backgroundColor: FEED_BRAND }}
            >
              Must read
            </span>
          )}
          {post.pinned && <PinBadge />}
        </div>
        <FeedSaveButton saved={saved} onToggle={onToggleSave} title="Save" />
      </div>
      <div className="mt-4 flex gap-3">
        <FeedAvatar name={post.author.name} initials={post.author.initials} src={post.author.avatarUrl} />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Announcement</div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {post.author.name} · {post.author.department} · {feedTimeLabel(post.createdAt)}
          </div>
        </div>
      </div>
      <h2 className="mt-4 text-xl font-semibold tracking-tight text-zinc-900">{post.title}</h2>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{post.content}</p>
      {post.mustRead && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={onAcknowledge}
            disabled={acknowledged}
            className={BTN_PRIMARY}
          >
            {acknowledged ? "Acknowledged" : "Acknowledge"}
          </button>
          {!acknowledged && (
            <span className="text-xs text-zinc-500">Please confirm you’ve read this update.</span>
          )}
        </div>
      )}
    </article>
  );
}
