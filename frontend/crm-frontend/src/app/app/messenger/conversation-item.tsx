"use client";

import { formatDistanceToNow } from "date-fns";
import { useMessenger } from "./messenger-context";
import type { Conversation } from "./types";

interface ConversationItemProps {
  conversation: Conversation;
  onClick: () => void;
  compact?: boolean;
  isActive?: boolean;
}

export default function ConversationItem({
  conversation,
  onClick,
  compact,
  isActive,
}: ConversationItemProps) {
  const { myEmployeeId, onlineUsers } = useMessenger();

  const otherParticipants = conversation.participants.filter(
    (p) => p.employeeId !== myEmployeeId,
  );

  const displayName =
    conversation.type === "GROUP"
      ? conversation.name ?? "Group Chat"
      : otherParticipants.length > 0
        ? `${otherParticipants[0].employee.firstName} ${otherParticipants[0].employee.lastName}`
        : "Unknown";

  const avatarUrl =
    conversation.type === "GROUP"
      ? conversation.avatarUrl
      : otherParticipants[0]?.employee.avatar;

  const isOnline =
    conversation.type === "DIRECT" &&
    otherParticipants.length > 0 &&
    onlineUsers.has(otherParticipants[0].employeeId);

  const timeAgo = conversation.lastMessageAt
    ? formatDistanceToNow(new Date(conversation.lastMessageAt), {
        addSuffix: false,
      })
    : null;

  const unread = conversation.unreadCount ?? 0;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
        isActive
          ? "bg-emerald-50 border border-emerald-100"
          : "hover:bg-zinc-50"
      }`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-semibold">
            {conversation.type === "GROUP"
              ? displayName.charAt(0).toUpperCase()
              : otherParticipants[0]
                ? `${otherParticipants[0].employee.firstName.charAt(0)}${otherParticipants[0].employee.lastName.charAt(0)}`
                : "?"}
          </div>
        )}
        {isOnline && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`text-sm truncate ${
              unread > 0 ? "font-semibold text-zinc-900" : "font-medium text-zinc-800"
            }`}
          >
            {displayName}
          </span>
          {timeAgo && (
            <span className="text-[10px] text-zinc-400 shrink-0">
              {timeAgo}
            </span>
          )}
        </div>
        {!compact && conversation.lastMessageText && (
          <p
            className={`text-xs truncate mt-0.5 ${
              unread > 0 ? "text-zinc-700 font-medium" : "text-zinc-500"
            }`}
          >
            {conversation.lastMessageText}
          </p>
        )}
      </div>

      {/* Unread badge */}
      {unread > 0 && (
        <div className="shrink-0 min-w-[20px] h-5 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[10px] font-bold px-1.5">
          {unread > 99 ? "99+" : unread}
        </div>
      )}
    </button>
  );
}
