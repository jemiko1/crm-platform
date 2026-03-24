export type FeedTab =
  | "all"
  | "following"
  | "announcements"
  | "polls"
  | "events"
  | "recognition"
  | "saved";

export type ComposerMode =
  | "post"
  | "poll"
  | "announcement"
  | "event"
  | "recognition"
  | "upload";

export type RecognitionCategory =
  | "Teamwork"
  | "Leadership"
  | "Helpful"
  | "Great Job"
  | "Customer Care";

export type PostKind = "standard" | "announcement" | "poll" | "event" | "recognition";

export interface FeedAuthor {
  id: string;
  name: string;
  avatarUrl?: string;
  initials: string;
  department: string;
}

export interface BasePost {
  id: string;
  kind: PostKind;
  author: FeedAuthor;
  createdAt: string;
  pinned?: boolean;
}

export interface StandardPost extends BasePost {
  kind: "standard";
  text: string;
  imageUrl?: string;
  attachmentLabel?: string;
  reactions: { emoji: string; count: number }[];
  commentsCount: number;
}

export interface AnnouncementPost extends BasePost {
  kind: "announcement";
  title: string;
  content: string;
  important: boolean;
  mustRead?: boolean;
}

export interface PollOption {
  id: string;
  label: string;
  votes: number;
}

export interface PollPost extends BasePost {
  kind: "poll";
  question: string;
  options: PollOption[];
  closesAt: string;
  anonymous: boolean;
}

export interface EventPost extends BasePost {
  kind: "event";
  title: string;
  startsAt: string;
  endsAt?: string;
  location: string;
  organizer: FeedAuthor;
  attendeeCount: number;
}

export interface RecognitionPost extends BasePost {
  kind: "recognition";
  recognized: FeedAuthor;
  category: RecognitionCategory;
  message: string;
}

export type FeedPost =
  | StandardPost
  | AnnouncementPost
  | PollPost
  | EventPost
  | RecognitionPost;

export interface BirthdayPerson {
  id: string;
  name: string;
  initials: string;
  department: string;
  date: string;
  avatarUrl?: string;
}

export interface SidebarEvent {
  id: string;
  title: string;
  startsAt: string;
  location: string;
}

export interface NewJoiner {
  id: string;
  name: string;
  role: string;
  department: string;
  joinedAt: string;
  initials: string;
  avatarUrl?: string;
}

export interface SpotlightKudos {
  id: string;
  from: FeedAuthor;
  to: FeedAuthor;
  category: RecognitionCategory;
  excerpt: string;
  at: string;
}

export interface FeaturedPoll {
  id: string;
  question: string;
  options: PollOption[];
  closesAt: string;
  anonymous: boolean;
  totalVotes: number;
}

/**
 * Highlight chip navigation. Optional `tab` switches the feed filter; optional `scrollToId`
 * scrolls a section into view (use ids from `feed-scroll.ts`). API can return the same shape.
 */
export interface FeedHighlightAction {
  tab?: FeedTab;
  scrollToId?: string;
}

export interface FeedHighlight {
  id: string;
  tone: "birthday" | "event" | "joiner" | "poll" | "announcement";
  label: string;
  sublabel?: string;
  action: FeedHighlightAction;
}
