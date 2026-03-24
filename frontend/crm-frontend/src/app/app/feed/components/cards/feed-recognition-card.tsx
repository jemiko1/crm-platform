"use client";

import { useEffect, useState } from "react";
import type { RecognitionPost } from "../../types";
import { BTN_PRIMARY, BTN_SECONDARY, INLINE_STATUS } from "../../feed-ui";
import { FeedAvatar } from "../feed-avatar";
import { FeedSaveButton } from "../feed-save-button";
import { feedTimeLabel, kudosStyles } from "../post-helpers";

export function FeedRecognitionCard({
  post,
  saved,
  onToggleSave,
}: {
  post: RecognitionPost;
  saved: boolean;
  onToggleSave: () => void;
}) {
  const st = kudosStyles[post.category];
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 5000);
    return () => window.clearTimeout(t);
  }, [note]);

  return (
    <article
      className={[
        "rounded-3xl border-2 bg-gradient-to-br p-4 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.18)] sm:p-5",
        st.border,
        st.bg,
      ].join(" ")}
    >
      <header className="flex justify-between gap-2">
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${st.chip}`}>
          🏅 {post.category}
        </span>
        <FeedSaveButton saved={saved} onToggle={onToggleSave} title="Save" />
      </header>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <FeedAvatar name={post.recognized.name} initials={post.recognized.initials} size="lg" ring />
          <div>
            <div className="text-lg font-semibold text-zinc-900">{post.recognized.name}</div>
            <div className="text-xs text-zinc-600">{post.recognized.department}</div>
          </div>
        </div>
        <div className="hidden h-10 w-px bg-zinc-200 sm:block" />
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
          <span className="text-zinc-400">from</span>
          <FeedAvatar name={post.author.name} initials={post.author.initials} size="sm" />
          <span className="font-medium text-zinc-800">{post.author.name}</span>
          <span className="text-zinc-400">· {feedTimeLabel(post.createdAt)}</span>
        </div>
      </div>
      <p className="mt-4 text-sm italic leading-relaxed text-zinc-800">“{post.message}”</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" className={`w-full sm:w-auto ${BTN_PRIMARY}`} onClick={() => setNote("Kudos queued — this will post when the feed API is connected.")}>
          Send kudos
        </button>
        <button type="button" className={`w-full sm:w-auto ${BTN_SECONDARY}`} onClick={() => setNote("Comments will open in a thread once messaging is wired.")}>
          Comment
        </button>
      </div>
      {note && (
        <p role="status" className={`mt-3 ${INLINE_STATUS}`}>
          {note}
        </p>
      )}
    </article>
  );
}
