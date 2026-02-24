"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useMessenger } from "./messenger-context";
import ConversationList from "./conversation-list";
import MessageList from "./message-list";
import MessageInput from "./message-input";
import EmployeeInfoPanel from "./employee-info-panel";
import { apiGet } from "@/lib/api";
import type { Conversation } from "./types";

interface FullMessengerContentProps {
  initialConversationId?: string;
}

export default function FullMessengerContent({ initialConversationId }: FullMessengerContentProps) {
  const { myEmployeeId, onlineUsers } = useMessenger();

  const [activeId, setActiveId] = useState<string | null>(initialConversationId ?? null);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(true);

  useEffect(() => {
    if (!activeId) {
      setConversation(null);
      return;
    }
    apiGet<Conversation>(`/v1/messenger/conversations/${activeId}`)
      .then(setConversation)
      .catch(() => setConversation(null));
  }, [activeId]);

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
        : "Select a conversation";

  const isOnline =
    conversation?.type === "DIRECT" &&
    otherParticipants.length > 0 &&
    onlineUsers.has(otherParticipants[0].employeeId);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  return (
    <div className="flex h-full">
      {/* Left - Conversations */}
      <ConversationList
        activeConversationId={activeId}
        onSelectConversation={handleSelectConversation}
      />

      {/* Center - Chat */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-50/50">
        {activeId && conversation ? (
          <>
            {/* Chat header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-100 bg-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative">
                  {conversation.type === "GROUP" ? (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-sm font-semibold">
                      {(conversation.name ?? "G").charAt(0).toUpperCase()}
                    </div>
                  ) : otherParticipants[0]?.employee.avatar ? (
                    <img
                      src={otherParticipants[0].employee.avatar}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-semibold">
                      {otherParticipants[0]
                        ? `${otherParticipants[0].employee.firstName.charAt(0)}${otherParticipants[0].employee.lastName.charAt(0)}`
                        : "?"}
                    </div>
                  )}
                  {isOnline && (
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-white" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    {displayName}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    {conversation.type === "GROUP"
                      ? `${conversation.participants.length} members`
                      : isOnline
                        ? "Active now"
                        : "Offline"}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowInfoPanel(!showInfoPanel)}
                  className={`p-2 rounded-lg transition-colors ${
                    showInfoPanel
                      ? "bg-emerald-50 text-emerald-600"
                      : "hover:bg-zinc-100 text-zinc-400"
                  }`}
                  title="Toggle info panel"
                >
                  <svg
                    className="w-[18px] h-[18px]"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.8}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages + Input */}
            <MessageList
              conversationId={activeId}
              conversation={conversation}
            />
            <MessageInput conversationId={activeId} />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-zinc-100 flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-zinc-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
                  />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">
                Select a conversation to start messaging
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Right - Info Panel (foldable) */}
      {showInfoPanel && activeId && conversation && (
        <EmployeeInfoPanel
          conversation={conversation}
          onClose={() => setShowInfoPanel(false)}
        />
      )}
    </div>
  );
}
