"use client";

import { useEffect, useState } from "react";
import type { EventPost } from "../../types";
import { BTN_PRIMARY, BTN_SECONDARY, INLINE_STATUS, INLINE_STATUS_INFO } from "../../feed-ui";
import { FeedAvatar } from "../feed-avatar";
import { FeedSaveButton } from "../feed-save-button";
import { feedEventWhenLabel, feedTimeLabel, PinBadge } from "../post-helpers";

export function FeedEventCard({
  post,
  saved,
  onToggleSave,
  rsvp,
  onRsvp,
}: {
  post: EventPost;
  saved: boolean;
  onToggleSave: () => void;
  rsvp?: "going" | "maybe" | "declined";
  onRsvp: (s: "going" | "maybe" | "declined") => void;
}) {
  const [calendarNote, setCalendarNote] = useState<string | null>(null);

  useEffect(() => {
    if (!calendarNote) return;
    const t = window.setTimeout(() => setCalendarNote(null), 6000);
    return () => window.clearTimeout(t);
  }, [calendarNote]);

  return (
    <article className="rounded-3xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/40 via-white to-white p-4 sm:p-5 shadow-[0_18px_44px_-28px_rgba(79,70,229,0.15)]">
      <header className="flex justify-between gap-3">
        <div className="flex gap-3">
          <FeedAvatar name={post.author.name} initials={post.author.initials} src={post.author.avatarUrl} />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Event</div>
            <div className="text-xs text-zinc-500">
              {post.author.name} · posted {feedTimeLabel(post.createdAt)}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {post.pinned && <PinBadge />}
          <FeedSaveButton saved={saved} onToggle={onToggleSave} title="Save" />
        </div>
      </header>
      <h3 className="mt-4 text-xl font-semibold text-zinc-900">{post.title}</h3>
      <dl className="mt-3 space-y-2 text-sm text-zinc-700">
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="w-24 shrink-0 font-semibold text-zinc-500">When</dt>
          <dd>{feedEventWhenLabel(post.startsAt)}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="w-24 shrink-0 font-semibold text-zinc-500">Where</dt>
          <dd className="break-words">{post.location}</dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="w-24 shrink-0 font-semibold text-zinc-500">Host</dt>
          <dd className="flex items-center gap-2">
            <FeedAvatar name={post.organizer.name} initials={post.organizer.initials} size="sm" />
            {post.organizer.name}
          </dd>
        </div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
          <dt className="w-24 shrink-0 font-semibold text-zinc-500">Going</dt>
          <dd>
            <span className="tabular-nums">{post.attendeeCount}</span> teammates
          </dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {(["going", "maybe", "declined"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onRsvp(s)}
            className={[`w-full capitalize sm:w-auto`, rsvp === s ? BTN_PRIMARY : BTN_SECONDARY].join(" ")}
          >
            {s === "going" ? "Going" : s === "maybe" ? "Maybe" : "Can’t go"}
          </button>
        ))}
        <button
          type="button"
          className={`w-full sm:w-auto ${BTN_SECONDARY}`}
          onClick={() =>
            setCalendarNote(
              "Calendar export will open here once your account is connected to Outlook or Google.",
            )
          }
        >
          Add to calendar
        </button>
      </div>
      {calendarNote && (
        <p
          role="status"
          className={`mt-3 ${INLINE_STATUS} ${INLINE_STATUS_INFO}`}
        >
          {calendarNote}
        </p>
      )}
    </article>
  );
}
