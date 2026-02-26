"use client";

import { useState, useEffect, useMemo } from "react";
import { useMessenger } from "./messenger-context";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    setMatches(m.matches);
    const h = () => setMatches(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, [query]);
  return matches;
}
import MessageList from "./message-list";
import MessageInput from "./message-input";
import { apiGet } from "@/lib/api";
import type { Conversation } from "./types";

interface ChatBubbleProps {
  conversationId: string;
  index: number;
  minimized: boolean;
}

export default function ChatBubble({
  conversationId,
  index,
  minimized,
}: ChatBubbleProps) {
  const {
    closeChat,
    minimizeChat,
    restoreChat,
    openFullMessenger,
    myEmployeeId,
    onlineUsers,
  } = useMessenger();

  const [conversation, setConversation] = useState<Conversation | null>(null);

  // Only fetch conversation once we know our own employee id
  useEffect(() => {
    if (!myEmployeeId) return;
    apiGet<Conversation>(`/v1/messenger/conversations/${conversationId}`)
      .then(setConversation)
      .catch(() => {});
  }, [conversationId, myEmployeeId]);

  const otherParticipants = useMemo(
    () =>
      conversation?.participants.filter(
        (p) => p.employeeId !== myEmployeeId,
      ) ?? [],
    [conversation, myEmployeeId],
  );

  const displayName =
    conversation?.type === "GROUP"
      ? conversation.name ?? "Group Chat"
      : otherParticipants.length > 0
        ? `${otherParticipants[0].employee.firstName} ${otherParticipants[0].employee.lastName}`
        : "Chat";

  const avatarUrl =
    conversation?.type === "GROUP"
      ? conversation.avatarUrl
      : otherParticipants[0]?.employee.avatar;

  const isOnline =
    conversation?.type === "DIRECT" &&
    otherParticipants.length > 0 &&
    onlineUsers.has(otherParticipants[0].employeeId);

  const isMobile = useMediaQuery("(max-width: 1023px)");
  const rightOffset = 24 + index * 344;
  const bottomOffset = minimized ? 24 + index * 56 : 24 + index * 458;

  const positionStyle = isMobile
    ? { left: 8, right: 8, bottom: bottomOffset }
    : { right: rightOffset, bottom: 0 };

  return (
    <div
      className="fixed z-[55000] transition-all duration-200"
      style={positionStyle}
    >
      {minimized ? (
        /* Minimized bar */
        <div
          role="button"
          tabIndex={0}
          onClick={() => restoreChat(conversationId)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") restoreChat(conversationId); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-t-xl shadow-lg border border-b-0 border-zinc-200 hover:bg-zinc-50 transition-colors min-w-[200px] w-full max-w-[calc(100vw-16px)] lg:max-w-none cursor-pointer"
        >
          <div className="relative">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="w-7 h-7 rounded-full object-cover"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[10px] font-semibold">
                {displayName.charAt(0)}
              </div>
            )}
            {isOnline && (
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
            )}
          </div>
          <span className="text-sm font-medium text-zinc-900 truncate max-w-[140px]">
            {displayName}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeChat(conversationId);
            }}
            className="ml-auto p-0.5 hover:bg-zinc-200 rounded text-zinc-400"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      ) : (
        /* Full chat bubble */
        <div className="w-full max-w-[calc(100vw-16px)] lg:w-[328px] h-[450px] max-h-[70vh] lg:max-h-[450px] bg-white rounded-t-2xl shadow-2xl border border-b-0 border-zinc-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-zinc-100 bg-white shrink-0">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-semibold">
                  {displayName.charAt(0)}
                </div>
              )}
              {isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-zinc-900 truncate">
                {displayName}
              </div>
              <div className="text-[10px] text-zinc-500">
                {isOnline ? "Active now" : "Offline"}
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              {/* Expand to full messenger */}
              <button
                onClick={() => {
                  openFullMessenger(conversationId);
                  closeChat(conversationId);
                }}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors"
                title="Open in Messenger"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                  />
                </svg>
              </button>
              {/* Minimize */}
              <button
                onClick={() => minimizeChat(conversationId)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors"
                title="Minimize"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 12h14"
                  />
                </svg>
              </button>
              {/* Close */}
              <button
                onClick={() => closeChat(conversationId)}
                className="p-1.5 hover:bg-zinc-100 rounded-lg text-zinc-400 transition-colors"
                title="Close"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <MessageList
            conversationId={conversationId}
            conversation={conversation}
            compact
          />

          {/* Input */}
          <MessageInput conversationId={conversationId} compact />
        </div>
      )}
    </div>
  );
}
