/**
 * Mock feed payloads — shape mirrors a future GET /feed-style response.
 * All timestamps are derived from MOCK_FEED_NOW_MS so data is stable across refreshes
 * (swap to `Date.now()` or API dates when wiring the backend).
 */
import type {
  BirthdayPerson,
  FeaturedPoll,
  FeedAuthor,
  FeedHighlight,
  FeedPost,
  NewJoiner,
  PollPost,
  SidebarEvent,
  SpotlightKudos,
} from "./types";
import { FEED_SECTION } from "./feed-scroll";

/** Fixed “now” for deterministic mock dates (ISO week/month labels stay consistent). */
export const MOCK_FEED_NOW_MS = new Date("2026-03-24T12:00:00.000Z").getTime();

const t = (offsetMs: number) => new Date(MOCK_FEED_NOW_MS + offsetMs).toISOString();

/** Mock “current user” follows these author ids (for Following tab). */
export const MOCK_FOLLOWING_AUTHOR_IDS = [
  "auth-nino",
  "auth-luka",
  "auth-hr",
  "auth-ana",
];

const authors: Record<string, FeedAuthor> = {
  nino: {
    id: "auth-nino",
    name: "Nino Kvaratskhelia",
    initials: "NK",
    department: "People & Culture",
  },
  luka: {
    id: "auth-luka",
    name: "Luka Beridze",
    initials: "LB",
    department: "Engineering",
  },
  ana: {
    id: "auth-ana",
    name: "Ana Gventsadze",
    initials: "AG",
    department: "Customer Success",
  },
  giorgi: {
    id: "auth-giorgi",
    name: "Giorgi Maisuradze",
    initials: "GM",
    department: "Field Operations",
  },
  hr: {
    id: "auth-hr",
    name: "HR — CRM28",
    initials: "HR",
    department: "People & Culture",
  },
  tea: {
    id: "auth-tea",
    name: "Tea Lomidze",
    initials: "TL",
    department: "Sales",
  },
  dato: {
    id: "auth-dato",
    name: "Dato Shavadze",
    initials: "DS",
    department: "Product",
  },
};

export const MOCK_FEED_POSTS: FeedPost[] = [
  {
    id: "post-1",
    kind: "standard",
    author: authors.luka,
    createdAt: t(-1000 * 60 * 45),
    text: "Huge thanks to everyone who stayed late to polish the client onboarding flow. The small details matter — you made it feel effortless.",
    reactions: [
      { emoji: "👏", count: 24 },
      { emoji: "❤️", count: 11 },
      { emoji: "🎉", count: 8 },
    ],
    commentsCount: 6,
  },
  {
    id: "post-2",
    kind: "recognition",
    author: authors.ana,
    createdAt: t(-1000 * 60 * 120),
    recognized: authors.giorgi,
    category: "Customer Care",
    message:
      "Giorgi went out of his way to help a resident understand their new portal — patient, clear, and kind. That’s the CRM28 standard.",
  },
  {
    id: "ann-1",
    kind: "announcement",
    author: authors.hr,
    createdAt: t(-1000 * 60 * 180),
    pinned: true,
    important: true,
    mustRead: true,
    title: "Office hours update for spring",
    content:
      "Starting April 1, core hours are 10:00–16:00 Tbilisi time on-site, with flexible remote blocks outside that window. Your manager can help align team coverage.",
  },
  {
    id: "poll-1",
    kind: "poll",
    author: authors.tea,
    createdAt: t(-1000 * 60 * 200),
    question: "Where should we host the summer team social?",
    closesAt: t(1000 * 60 * 60 * 24 * 3),
    anonymous: true,
    options: [
      { id: "p1-a", label: "Vake park picnic", votes: 34 },
      { id: "p1-b", label: "Rooftop downtown", votes: 22 },
      { id: "p1-c", label: "Escape room + dinner", votes: 18 },
    ],
  },
  {
    id: "post-3",
    kind: "standard",
    author: authors.nino,
    createdAt: t(-1000 * 60 * 260),
    text: "Reminder: our internal learning budget renews next month. If you’ve been eyeing a course or certification, ping me — happy to help with approvals.",
    imageUrl:
      "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80",
    reactions: [
      { emoji: "🙌", count: 15 },
      { emoji: "📚", count: 9 },
    ],
    commentsCount: 4,
  },
  {
    id: "evt-1",
    kind: "event",
    author: authors.nino,
    createdAt: t(-1000 * 60 * 300),
    pinned: true,
    title: "All-hands: Q2 direction & customer stories",
    startsAt: t(1000 * 60 * 60 * 26),
    endsAt: t(1000 * 60 * 60 * 27.5),
    location: "Main office — Studio A + Zoom",
    organizer: authors.nino,
    attendeeCount: 87,
  },
  {
    id: "post-4",
    kind: "standard",
    author: authors.dato,
    createdAt: t(-1000 * 60 * 400),
    text: "Fun fact Friday: our messenger saved ~420 context switches this week alone. Shout-out to the team for keeping comms in one place.",
    attachmentLabel: "team-metrics-march.pdf",
    reactions: [{ emoji: "😄", count: 31 }],
    commentsCount: 12,
  },
  {
    id: "rec-2",
    kind: "recognition",
    author: authors.luka,
    createdAt: t(-1000 * 60 * 520),
    recognized: authors.tea,
    category: "Teamwork",
    message:
      "Tea coordinated three departments for the enterprise pilot without a single dropped ball. Calm energy, sharp follow-through.",
  },
  {
    id: "ann-2",
    kind: "announcement",
    author: authors.hr,
    createdAt: t(-1000 * 60 * 600),
    important: false,
    mustRead: false,
    title: "New coffee partner in the kitchen",
    content:
      "We’re piloting a local roaster for the next month. Feedback cards are on the counter — let us know what you think.",
  },
  {
    id: "poll-2",
    kind: "poll",
    author: authors.nino,
    createdAt: t(-1000 * 60 * 720),
    question: "Preferred slot for weekly “no-meeting” focus time?",
    closesAt: t(1000 * 60 * 60 * 20),
    anonymous: false,
    options: [
      { id: "p2-a", label: "Tuesday AM", votes: 41 },
      { id: "p2-b", label: "Wednesday PM", votes: 28 },
      { id: "p2-c", label: "Friday AM", votes: 19 },
    ],
  },
  {
    id: "post-5",
    kind: "standard",
    author: authors.ana,
    createdAt: t(-1000 * 60 * 900),
    text: "Sharing a template I use for stakeholder updates — steal it, remix it, make it yours. Link in thread (mock).",
    reactions: [
      { emoji: "🔥", count: 7 },
      { emoji: "💬", count: 5 },
    ],
    commentsCount: 2,
  },
  {
    id: "evt-2",
    kind: "event",
    author: authors.tea,
    createdAt: t(-1000 * 60 * 960),
    title: "Volunteer afternoon: community greening",
    startsAt: t(1000 * 60 * 60 * 72),
    endsAt: t(1000 * 60 * 60 * 76),
    location: "Meet at HQ lobby → shuttle to site",
    organizer: authors.tea,
    attendeeCount: 23,
  },
  {
    id: "rec-3",
    kind: "recognition",
    author: authors.giorgi,
    createdAt: t(-1000 * 60 * 1100),
    recognized: authors.luka,
    category: "Great Job",
    message:
      "Luka shipped the performance patch ahead of schedule and documented everything so ops could self-serve. Legend.",
  },
  {
    id: "post-6",
    kind: "standard",
    author: authors.nino,
    createdAt: t(-1000 * 60 * 1400),
    text: "Welcome to everyone who joined this month — we’re glad you’re here. Introduce yourself in the comments when you’re ready; no pressure.",
    reactions: [
      { emoji: "👋", count: 52 },
      { emoji: "✨", count: 19 },
    ],
    commentsCount: 28,
  },
];

export const MOCK_BIRTHDAYS: BirthdayPerson[] = [
  {
    id: "bd-1",
    name: "Salome Zoidze",
    initials: "SZ",
    department: "Finance",
    date: new Date(MOCK_FEED_NOW_MS).toISOString().slice(0, 10),
  },
  {
    id: "bd-2",
    name: "Nikoloz Chkheidze",
    initials: "NC",
    department: "Engineering",
    date: t(1000 * 60 * 60 * 24 * 2).slice(0, 10),
  },
  {
    id: "bd-3",
    name: "Mariam Kapanadze",
    initials: "MK",
    department: "People & Culture",
    date: t(1000 * 60 * 60 * 24 * 4).slice(0, 10),
  },
  {
    id: "bd-4",
    name: "Levan Tsiklauri",
    initials: "LT",
    department: "Sales",
    date: t(1000 * 60 * 60 * 24 * 6).slice(0, 10),
  },
  {
    id: "bd-5",
    name: "Ketevan Jorbenadze",
    initials: "KJ",
    department: "Customer Success",
    date: t(1000 * 60 * 60 * 24 * 9).slice(0, 10),
  },
];

export const MOCK_SIDEBAR_EVENTS: SidebarEvent[] = [
  {
    id: "se-1",
    title: "All-hands: Q2 direction & customer stories",
    startsAt: t(1000 * 60 * 60 * 26),
    location: "Studio A + Zoom",
  },
  {
    id: "se-2",
    title: "Volunteer afternoon: community greening",
    startsAt: t(1000 * 60 * 60 * 72),
    location: "HQ lobby",
  },
  {
    id: "se-3",
    title: "Design critique: internal feed v2",
    startsAt: t(1000 * 60 * 60 * 30),
    location: "Remote",
  },
  {
    id: "se-4",
    title: "Lunch & learn: wellbeing micro-habits",
    startsAt: t(1000 * 60 * 60 * 52),
    location: "Kitchen + Zoom",
  },
];

export const MOCK_NEW_JOINERS: NewJoiner[] = [
  {
    id: "nj-1",
    name: "Saba Rurua",
    role: "Frontend Engineer",
    department: "Engineering",
    joinedAt: t(-1000 * 60 * 60 * 24 * 2),
    initials: "SR",
  },
  {
    id: "nj-2",
    name: "Eka Machavariani",
    role: "Operations Associate",
    department: "Field Operations",
    joinedAt: t(-1000 * 60 * 60 * 24 * 5),
    initials: "EM",
  },
  {
    id: "nj-3",
    name: "Zura Abashidze",
    role: "Account Executive",
    department: "Sales",
    joinedAt: t(-1000 * 60 * 60 * 24 * 9),
    initials: "ZA",
  },
];

export const MOCK_SPOTLIGHT: SpotlightKudos[] = [
  {
    id: "sk-1",
    from: authors.ana,
    to: authors.giorgi,
    category: "Customer Care",
    excerpt: "patient, clear, and kind with a new resident…",
    at: t(-1000 * 60 * 120),
  },
  {
    id: "sk-2",
    from: authors.luka,
    to: authors.tea,
    category: "Teamwork",
    excerpt: "coordinated three departments without a dropped ball…",
    at: t(-1000 * 60 * 520),
  },
];

function pollTotal(options: { votes: number }[]) {
  return options.reduce((s, o) => s + o.votes, 0);
}

const pollPost = MOCK_FEED_POSTS.find((p) => p.kind === "poll" && p.id === "poll-1") as PollPost | undefined;

export const MOCK_FEATURED_POLL: FeaturedPoll = pollPost
  ? {
      id: pollPost.id,
      question: pollPost.question,
      options: pollPost.options.map((o) => ({ ...o })),
      closesAt: pollPost.closesAt,
      anonymous: pollPost.anonymous,
      totalVotes: pollTotal(pollPost.options),
    }
  : {
      id: "poll-fallback",
      question: "Featured poll",
      options: [],
      closesAt: t(0),
      anonymous: true,
      totalVotes: 0,
    };

export const MOCK_HIGHLIGHTS: FeedHighlight[] = [
  {
    id: "hl-1",
    tone: "birthday",
    label: "Birthday today",
    sublabel: MOCK_BIRTHDAYS[0]?.name ?? "Teammate",
    action: { scrollToId: FEED_SECTION.birthdays },
  },
  {
    id: "hl-2",
    tone: "event",
    label: "Event tomorrow",
    sublabel: "All-hands: Q2 direction",
    action: { tab: "events", scrollToId: FEED_SECTION.stream },
  },
  {
    id: "hl-3",
    tone: "joiner",
    label: "New teammate",
    sublabel: MOCK_NEW_JOINERS[0]?.name ?? "Welcome",
    action: { scrollToId: FEED_SECTION.joiners },
  },
  {
    id: "hl-4",
    tone: "poll",
    label: "Poll ending soon",
    sublabel: "Focus time vote",
    action: { tab: "polls", scrollToId: FEED_SECTION.stream },
  },
  {
    id: "hl-5",
    tone: "announcement",
    label: "Must-read posted",
    sublabel: "Office hours update",
    action: { tab: "announcements", scrollToId: FEED_SECTION.stream },
  },
];

