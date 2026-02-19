"use client";

import { useState, useRef, useEffect } from "react";
import { format, isToday, isYesterday } from "date-fns";
import type { Message, MessageReaction, MessageStatus, Participant } from "./types";
import { useMessenger } from "./messenger-context";
import { apiPost } from "@/lib/api";

interface MessageItemProps {
  message: Message;
  isMine: boolean;
  showAvatar?: boolean;
  showName?: boolean;
  seenBy?: Participant[];
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return `Yesterday ${format(d, "HH:mm")}`;
  return format(d, "dd/MM HH:mm");
}

function StatusIcon({ status }: { status?: MessageStatus }) {
  if (!status || status === "sent") {
    return (
      <svg className="w-3.5 h-3.5 text-zinc-300" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    );
  }
  if (status === "delivered") {
    return (
      <div className="flex -space-x-1.5">
        <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        <svg className="w-3.5 h-3.5 text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  return (
    <div className="flex -space-x-1.5">
      <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
    </div>
  );
}

function groupReactions(reactions: MessageReaction[]) {
  const groups = new Map<string, { emoji: string; count: number; employees: string[]; employeeIds: string[] }>();
  for (const r of reactions) {
    if (!groups.has(r.emoji)) {
      groups.set(r.emoji, { emoji: r.emoji, count: 0, employees: [], employeeIds: [] });
    }
    const g = groups.get(r.emoji)!;
    g.count++;
    const name = r.employeeFirstName || r.employee?.firstName || "";
    if (name) g.employees.push(name);
    g.employeeIds.push(r.employeeId);
  }
  return Array.from(groups.values());
}

export default function MessageItem({
  message,
  isMine,
  showAvatar,
  showName,
  seenBy,
}: MessageItemProps) {
  const { myEmployeeId, socket } = useMessenger();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [localReactions, setLocalReactions] = useState<MessageReaction[]>(
    message.reactions ?? [],
  );
  const emojiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalReactions(message.reactions ?? []);
  }, [message.reactions]);

  useEffect(() => {
    if (!socket) return;

    function handleReaction(data: {
      messageId: string;
      emoji: string;
      employeeId: string;
      added: boolean;
    }) {
      if (data.messageId !== message.id) return;
      setLocalReactions((prev) => {
        if (data.added) {
          if (prev.some((r) => r.emoji === data.emoji && r.employeeId === data.employeeId)) return prev;
          return [...prev, { emoji: data.emoji, employeeId: data.employeeId, employeeFirstName: "" }];
        }
        return prev.filter(
          (r) => !(r.emoji === data.emoji && r.employeeId === data.employeeId),
        );
      });
    }

    socket.on("message:reaction", handleReaction);
    return () => { socket.off("message:reaction", handleReaction); };
  }, [socket, message.id]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    function handleClick(e: MouseEvent) {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showEmojiPicker]);

  const handleReact = (emoji: string) => {
    setLocalReactions((prev) => {
      const existing = prev.find(
        (r) => r.emoji === emoji && r.employeeId === (myEmployeeId ?? ""),
      );
      if (existing) {
        return prev.filter(
          (r) => !(r.emoji === emoji && r.employeeId === (myEmployeeId ?? "")),
        );
      }
      return [
        ...prev,
        { emoji, employeeId: myEmployeeId ?? "", employeeFirstName: "You" },
      ];
    });

    if (socket?.connected) {
      socket.emit("message:react", { messageId: message.id, emoji });
    } else {
      apiPost(`/v1/messenger/messages/${message.id}/reactions`, {
        emoji,
      }).catch(() => {});
    }
    setShowEmojiPicker(false);
  };

  if (message.isDeleted) {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} px-3 py-0.5`}>
        <div className="px-3 py-1.5 rounded-xl bg-zinc-100 text-xs text-zinc-400 italic">
          Message deleted
        </div>
      </div>
    );
  }

  if (message.type === "SYSTEM") {
    return (
      <div className="flex justify-center py-1">
        <span className="px-3 py-1 rounded-full bg-zinc-100 text-[11px] text-zinc-500">
          {message.content}
        </span>
      </div>
    );
  }

  const reactionGroups = groupReactions(localReactions);

  // Avatar element (rendered once, placed in the layout)
  const avatarEl = !isMine && showAvatar ? (
    message.sender.avatar ? (
      <img
        src={message.sender.avatar}
        alt=""
        className="w-7 h-7 rounded-full object-cover shrink-0"
      />
    ) : (
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[10px] font-semibold shrink-0">
        {message.sender.firstName.charAt(0)}
        {message.sender.lastName.charAt(0)}
      </div>
    )
  ) : !isMine ? (
    <div className="w-7 shrink-0" />
  ) : null;

  return (
    <div
      className={`flex ${isMine ? "justify-end" : "justify-start"} px-3 py-0.5 group`}
    >
      {/* Row: avatar + content column. items-start so avatar aligns to top of bubble */}
      <div className={`flex items-start gap-2 max-w-[80%] ${isMine ? "flex-row-reverse" : ""}`}>
        {avatarEl}

        {/* Content column: name, bubble, reactions, meta */}
        <div className="min-w-0">
          {!isMine && showName && (
            <span className="text-[10px] text-zinc-500 ml-1 mb-0.5 block">
              {message.sender.firstName}
            </span>
          )}

          {/* Reply preview */}
          {message.replyTo && (
            <div
              className={`text-[10px] px-2 py-1 rounded-lg mb-0.5 border-l-2 ${
                isMine
                  ? "bg-emerald-400/20 border-emerald-400 text-emerald-100"
                  : "bg-zinc-100 border-zinc-300 text-zinc-500"
              }`}
            >
              <span className="font-medium">
                {message.replyTo.sender.firstName}
              </span>
              : {message.replyTo.content.substring(0, 60)}
              {message.replyTo.content.length > 60 ? "..." : ""}
            </div>
          )}

          {/* Message bubble */}
          <div
            className={`inline-block px-3 py-2 rounded-2xl text-sm leading-relaxed break-words ${
              isMine
                ? "bg-emerald-500 text-white rounded-br-md"
                : "bg-zinc-100 text-zinc-900 rounded-bl-md"
            }`}
          >
            {message.content}
          </div>

          {/* Reactions display */}
          {reactionGroups.length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-0.5 ${isMine ? "justify-end" : ""}`}>
              {reactionGroups.map((rg) => (
                <button
                  key={rg.emoji}
                  onClick={() => handleReact(rg.emoji)}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all ${
                    rg.employeeIds.includes(myEmployeeId ?? "")
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                  }`}
                  title={rg.employees.join(", ")}
                >
                  <span>{rg.emoji}</span>
                  {rg.count > 1 && <span className="text-[10px] font-medium">{rg.count}</span>}
                </button>
              ))}
            </div>
          )}

          {/* Time, edited badge, status, emoji action */}
          <div
            className={`flex items-center gap-1 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}
          >
            <span className="text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">
              {formatMessageTime(message.createdAt)}
            </span>
            {message.isEdited && (
              <span className="text-[10px] text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">edited</span>
            )}
            {isMine && !(seenBy && seenBy.length > 0) && (message.status ?? "sent") !== "seen" && (
              <StatusIcon status={message.status ?? "sent"} />
            )}

            {/* Emoji reaction button */}
            <div className="relative" ref={emojiRef}>
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-zinc-200/60 rounded transition-all text-zinc-400 hover:text-zinc-600"
                title="React"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 0 1-6.364 0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75Zm-.375 0h.008v.015h-.008V9.75Z" />
                </svg>
              </button>

              {showEmojiPicker && (
                <div
                  className={`absolute ${isMine ? "right-0" : "left-0"} bottom-full mb-1 flex items-center gap-0.5 px-1.5 py-1 bg-white rounded-xl shadow-lg border border-zinc-200 z-10`}
                >
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReact(emoji)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-zinc-100 text-base transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Facebook-style seen avatars */}
          {seenBy && seenBy.length > 0 && (
            <div className={`flex items-center gap-0.5 mt-0.5 ${isMine ? "justify-end" : "justify-start"}`}>
              {seenBy.slice(0, 5).map((p) => (
                <div key={p.employeeId} title={`Seen by ${p.employee.firstName} ${p.employee.lastName}`}>
                  {p.employee.avatar ? (
                    <img
                      src={p.employee.avatar}
                      alt={p.employee.firstName}
                      className="w-3.5 h-3.5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-[6px] font-bold">
                      {p.employee.firstName.charAt(0)}
                    </div>
                  )}
                </div>
              ))}
              {seenBy.length > 5 && (
                <span className="text-[8px] text-zinc-400 ml-0.5">+{seenBy.length - 5}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
