"use client";

import { format, formatDistanceToNow, isToday, isTomorrow, parseISO } from "date-fns";
import type { AnnouncementPost, BirthdayPerson, FeaturedPoll, NewJoiner, SidebarEvent, SpotlightKudos } from "../types";
import { BTN_PRIMARY_SM } from "../feed-ui";
import { FEED_SECTION } from "../feed-scroll";
import { FeedAvatar } from "./feed-avatar";
import { FeedSidebarCard } from "./feed-sidebar-card";
import { PollOptionBars } from "./poll-option-bars";

function birthdayLabel(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return "Today";
  if (isTomorrow(d)) return "Tomorrow";
  return format(d, "EEE, MMM d");
}

export function FeedSidebar({
  birthdays,
  events,
  pinnedAnnouncements,
  newJoiners,
  spotlight,
  featuredPoll,
  featuredPollSelectedId,
  onVoteFeatured,
  wishesSentIds,
  onSendWishes,
}: {
  birthdays: BirthdayPerson[];
  events: SidebarEvent[];
  pinnedAnnouncements: AnnouncementPost[];
  newJoiners: NewJoiner[];
  spotlight: SpotlightKudos[];
  featuredPoll: FeaturedPoll;
  featuredPollSelectedId?: string;
  onVoteFeatured: (optionId: string) => void;
  wishesSentIds: Set<string>;
  onSendWishes: (birthdayId: string) => void;
}) {
  const pollTotal = featuredPoll.options.reduce((s, o) => s + o.votes, 0);

  return (
    <div className="space-y-4">
      <FeedSidebarCard id={FEED_SECTION.birthdays} title="Upcoming birthdays" subtitle="Celebrate your teammates" icon="🎂">
        {birthdays.length === 0 ? (
          <p className="text-sm text-zinc-500">No upcoming birthdays in this window.</p>
        ) : (
          <ul className="space-y-3">
            {birthdays.map((b) => {
              const sent = wishesSentIds.has(b.id);
              return (
                <li
                  key={b.id}
                  className="flex flex-col gap-2 rounded-2xl border border-zinc-100 bg-gradient-to-r from-amber-50/50 to-white px-3 py-2.5 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <FeedAvatar name={b.name} initials={b.initials} src={b.avatarUrl} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-900">{b.name}</div>
                      <div className="text-xs text-zinc-500">
                        {b.department} · {birthdayLabel(b.date)}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={sent}
                    onClick={() => onSendWishes(b.id)}
                    className={`shrink-0 ${BTN_PRIMARY_SM} w-full sm:w-auto`}
                  >
                    {sent ? "Sent ✓" : "Send wishes"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </FeedSidebarCard>

      <FeedSidebarCard id={FEED_SECTION.events} title="Upcoming events" subtitle="Don’t miss what’s next" icon="📅">
        {events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events scheduled.</p>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="rounded-2xl border border-zinc-100 bg-zinc-50/50 px-3 py-2.5">
                <div className="text-sm font-medium leading-snug text-zinc-900">{e.title}</div>
                <div className="mt-1 text-xs text-zinc-500">
                  {format(parseISO(e.startsAt), "EEE MMM d · HH:mm")} · {e.location}
                </div>
              </li>
            ))}
          </ul>
        )}
      </FeedSidebarCard>

      <FeedSidebarCard id={FEED_SECTION.announcements} title="Pinned announcements" subtitle="Leadership & HR" icon="📌">
        {pinnedAnnouncements.length === 0 ? (
          <p className="text-sm text-zinc-500">No pinned items right now.</p>
        ) : (
          <ul className="space-y-2">
            {pinnedAnnouncements.map((a) => (
              <li
                key={a.id}
                className="rounded-2xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm font-medium text-zinc-900"
              >
                {a.title}
              </li>
            ))}
          </ul>
        )}
      </FeedSidebarCard>

      <FeedSidebarCard id={FEED_SECTION.joiners} title="New joiners" subtitle="Welcome them in the feed" icon="👋">
        {newJoiners.length === 0 ? (
          <p className="text-sm text-zinc-500">No recent joiners to show.</p>
        ) : (
          <ul className="space-y-3">
            {newJoiners.map((j) => (
              <li key={j.id} className="flex gap-3 rounded-2xl border border-violet-100 bg-violet-50/30 px-3 py-2">
                <FeedAvatar name={j.name} initials={j.initials} src={j.avatarUrl} size="sm" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-zinc-900">{j.name}</div>
                  <div className="text-xs text-zinc-600">
                    {j.role} · {j.department}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    Joined {formatDistanceToNow(parseISO(j.joinedAt), { addSuffix: true })}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </FeedSidebarCard>

      <FeedSidebarCard id={FEED_SECTION.spotlight} title="Employee spotlight" subtitle="Recent kudos" icon="✨">
        {spotlight.length === 0 ? (
          <p className="text-sm text-zinc-500">Kudos will appear here as teammates recognize each other.</p>
        ) : (
          <ul className="space-y-3">
            {spotlight.map((s) => (
              <li key={s.id} className="rounded-2xl border border-[rgba(0,86,83,0.15)] bg-[rgba(0,86,83,0.04)] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <FeedAvatar name={s.to.name} initials={s.to.initials} size="sm" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-semibold text-zinc-900">{s.to.name}</span>
                    <span className="text-xs text-zinc-500"> · {s.category}</span>
                  </div>
                </div>
                <p className="mt-1.5 line-clamp-2 text-xs text-zinc-600">{s.excerpt}</p>
                <div className="mt-1 text-[11px] text-zinc-400">From {s.from.name}</div>
              </li>
            ))}
          </ul>
        )}
      </FeedSidebarCard>

      <section
        id={FEED_SECTION.featuredPoll}
        className="rounded-3xl border-2 border-[rgba(0,86,83,0.35)] bg-gradient-to-br from-[rgba(0,86,83,0.06)] to-white p-4 shadow-[0_20px_48px_-26px_rgba(0,86,83,0.2)]"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden>
            📊
          </span>
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Featured poll</h2>
            <p className="text-xs text-zinc-500">Team pick — your voice counts</p>
          </div>
        </div>
        <p className="mt-3 text-sm font-medium leading-snug text-zinc-900">{featuredPoll.question}</p>
        <p className="mt-1 text-[11px] text-zinc-500">
          {featuredPoll.anonymous ? "Anonymous" : "Named"} · {featuredPoll.totalVotes} votes so far
        </p>
        {featuredPoll.options.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">No options to display.</p>
        ) : (
          <div className="mt-3">
            <PollOptionBars
              options={featuredPoll.options}
              totalVotes={pollTotal}
              selectedId={featuredPollSelectedId}
              onSelect={onVoteFeatured}
              size="sm"
            />
          </div>
        )}
      </section>
    </div>
  );
}
