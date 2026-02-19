"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { useMessenger, useMessageBus } from "./messenger-context";
import MessageItem from "./message-item";
import TypingIndicator from "./typing-indicator";
import { apiGet } from "@/lib/api";
import type { Message, MessageStatus, Conversation, Participant } from "./types";
import { format, isToday, isYesterday } from "date-fns";

interface MessageListProps {
  conversationId: string;
  conversation?: Conversation | null;
  compact?: boolean;
}

function formatDateSeparator(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMMM d, yyyy");
}

export default function MessageList({
  conversationId,
  conversation,
  compact,
}: MessageListProps) {
  const { loadMessages, markAsRead, myEmployeeId, socket } = useMessenger();
  const subscribeToMessages = useMessageBus();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(
    new Map(),
  );
  const [readStatus, setReadStatus] = useState<Record<string, string | null>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const loadingMoreRef = useRef(false);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Fetch read status for other participants
  const fetchReadStatus = useCallback(() => {
    apiGet<Array<{ employeeId: string; lastReadAt: string | null }>>(
      `/v1/messenger/conversations/${conversationId}/read-status`,
    )
      .then((data) => {
        const map: Record<string, string | null> = {};
        for (const p of data) map[p.employeeId] = p.lastReadAt;
        setReadStatus(map);
      })
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    fetchReadStatus();
  }, [fetchReadStatus]);

  // Poll read status every 5s so seen indicators stay fresh
  useEffect(() => {
    const interval = setInterval(fetchReadStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchReadStatus]);

  // Compute message status (sent/delivered/seen) for my messages
  const getMessageStatus = useCallback(
    (msg: Message): MessageStatus => {
      if (msg.senderId !== myEmployeeId) return "sent";
      const otherReads = Object.entries(readStatus).filter(
        ([eid]) => eid !== myEmployeeId,
      );
      if (otherReads.length === 0) return "sent";

      const msgTime = new Date(msg.createdAt).getTime();
      const readValues = otherReads.map(([, ts]) => ts).filter(Boolean) as string[];
      if (readValues.length === 0) return "sent";

      const allSeen = readValues.every((ts) => new Date(ts).getTime() >= msgTime);
      if (allSeen) return "seen";
      const anySeen = readValues.some((ts) => new Date(ts).getTime() >= msgTime);
      if (anySeen) return "delivered";
      return "sent";
    },
    [myEmployeeId, readStatus],
  );

  // Find which participants have seen up to a given message
  const getSeenBy = useCallback(
    (msg: Message): Participant[] => {
      if (msg.senderId !== myEmployeeId) return [];
      if (!conversation) return [];

      const msgTime = new Date(msg.createdAt).getTime();
      const seenParticipants: Participant[] = [];

      for (const [eid, ts] of Object.entries(readStatus)) {
        if (eid === myEmployeeId || !ts) continue;
        if (new Date(ts).getTime() >= msgTime) {
          const p = conversation.participants.find((pp) => pp.employeeId === eid);
          if (p) seenParticipants.push(p);
        }
      }
      return seenParticipants;
    },
    [myEmployeeId, readStatus, conversation],
  );

  // Add a message to the list with deduplication
  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      return [...prev, msg];
    });

    if (isAtBottomRef.current) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }

    markAsRead(conversationId);
  }, [conversationId, markAsRead]);

  // Initial load
  useEffect(() => {
    setMessages([]);
    setLoading(true);
    setHasMore(false);
    setNextCursor(null);

    loadMessages(conversationId)
      .then((data) => {
        setMessages(data.items.slice().reverse());
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
        setTimeout(() => {
          bottomRef.current?.scrollIntoView({ behavior: "instant" });
        }, 50);
      })
      .finally(() => setLoading(false));

    markAsRead(conversationId);
  }, [conversationId, loadMessages, markAsRead]);

  // Subscribe to message bus
  useEffect(() => {
    const unsubscribe = subscribeToMessages(conversationId, (msg: Message) => {
      addMessage(msg);
    });
    return unsubscribe;
  }, [conversationId, subscribeToMessages, addMessage]);

  // Socket events: edits, deletes, typing, reads
  useEffect(() => {
    if (!socket) return;

    function handleMessageEdited(msg: Message) {
      if (msg.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
      );
    }

    function handleMessageDeleted({ messageId }: { messageId: string }) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isDeleted: true, content: "" }
            : m,
        ),
      );
    }

    function handleTypingStart({ employeeId }: { employeeId: string }) {
      if (employeeId === myEmployeeId) return;
      const participant = conversation?.participants.find(
        (p) => p.employeeId === employeeId,
      );
      if (participant) {
        setTypingUsers((prev) => {
          const next = new Map(prev);
          next.set(employeeId, participant.employee.firstName);
          return next;
        });
      }
    }

    function handleTypingStop({ employeeId }: { employeeId: string }) {
      setTypingUsers((prev) => {
        const next = new Map(prev);
        next.delete(employeeId);
        return next;
      });
    }

    function handleMessageRead(data: { employeeId: string; conversationId?: string }) {
      if (data.conversationId && data.conversationId !== conversationId) return;
      if (data.employeeId === myEmployeeId) return;
      setReadStatus((prev) => ({
        ...prev,
        [data.employeeId]: new Date().toISOString(),
      }));
    }

    socket.on("message:edited", handleMessageEdited);
    socket.on("message:deleted", handleMessageDeleted);
    socket.on("typing:start", handleTypingStart);
    socket.on("typing:stop", handleTypingStop);
    socket.on("message:read", handleMessageRead);

    return () => {
      socket.off("message:edited", handleMessageEdited);
      socket.off("message:deleted", handleMessageDeleted);
      socket.off("typing:start", handleTypingStart);
      socket.off("typing:stop", handleTypingStop);
      socket.off("message:read", handleMessageRead);
    };
  }, [socket, conversationId, myEmployeeId, conversation, markAsRead]);

  // Polling fallback for new messages
  useEffect(() => {
    const interval = setInterval(() => {
      const current = messagesRef.current;
      if (current.length === 0) return;

      const lastMsg = current[current.length - 1];
      const params = new URLSearchParams();
      params.set("after", lastMsg.createdAt);
      params.set("limit", "50");

      apiGet<MessagesResponse>(
        `/v1/messenger/conversations/${conversationId}/messages?${params}`,
      )
        .then((data) => {
          if (data.items.length > 0) {
            const reversed = data.items.slice().reverse();
            for (const msg of reversed) {
              addMessage(msg);
            }
          }
        })
        .catch(() => {});
    }, 3000);

    return () => clearInterval(interval);
  }, [conversationId, addMessage]);

  // Scroll handler
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isAtBottomRef.current = distFromBottom < 50;

    if (el.scrollTop < 100 && hasMore && !loadingMoreRef.current) {
      loadingMoreRef.current = true;
      const prevHeight = el.scrollHeight;

      loadMessages(conversationId, nextCursor ?? undefined)
        .then((data) => {
          setMessages((prev) => [...data.items.slice().reverse(), ...prev]);
          setHasMore(data.hasMore);
          setNextCursor(data.nextCursor);

          requestAnimationFrame(() => {
            if (el) {
              el.scrollTop = el.scrollHeight - prevHeight;
            }
          });
        })
        .finally(() => {
          loadingMoreRef.current = false;
        });
    }
  }, [hasMore, nextCursor, conversationId, loadMessages]);

  // Build message list with date separators + compute which message is the
  // "last seen" by each participant (for the Facebook-style seen avatar)
  const messagesWithSeparators = useMemo(() => {
    const result: Array<
      | { type: "date"; date: string }
      | { type: "message"; message: Message; showAvatar: boolean; showName: boolean; seenBy: Participant[] }
    > = [];
    let lastDate = "";
    let lastSenderId = "";

    // For each participant who has read, find the last message they've seen
    // so we only show the avatar once (below the furthest-read message)
    const lastSeenMsgIdx = new Map<string, number>();
    for (const [eid, ts] of Object.entries(readStatus)) {
      if (eid === myEmployeeId || !ts) continue;
      const readTime = new Date(ts).getTime();
      let bestIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (
          messages[i].senderId === myEmployeeId &&
          new Date(messages[i].createdAt).getTime() <= readTime
        ) {
          bestIdx = i;
          break;
        }
      }
      if (bestIdx >= 0) lastSeenMsgIdx.set(eid, bestIdx);
    }

    // Invert: for each message index, which participants have their "last seen" there
    const seenByAtIdx = new Map<number, string[]>();
    for (const [eid, idx] of lastSeenMsgIdx) {
      if (!seenByAtIdx.has(idx)) seenByAtIdx.set(idx, []);
      seenByAtIdx.get(idx)!.push(eid);
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgDate = new Date(msg.createdAt).toDateString();

      if (msgDate !== lastDate) {
        result.push({ type: "date", date: msg.createdAt });
        lastDate = msgDate;
        lastSenderId = "";
      }

      const showAvatar = msg.senderId !== lastSenderId;
      const showName =
        conversation?.type === "GROUP" && msg.senderId !== lastSenderId;

      // Collect participants whose "last seen" is this message
      const seenEids = seenByAtIdx.get(i) ?? [];
      const seenBy = seenEids
        .map((eid) => conversation?.participants.find((p) => p.employeeId === eid))
        .filter(Boolean) as Participant[];

      result.push({ type: "message", message: msg, showAvatar, showName, seenBy });
      lastSenderId = msg.senderId;
    }

    return result;
  }, [messages, conversation, readStatus, myEmployeeId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overscroll-contain"
    >
      {hasMore && (
        <div className="text-center py-3">
          <span className="text-xs text-zinc-400">Loading older messages...</span>
        </div>
      )}

      <div className="py-2">
        {messagesWithSeparators.map((item, idx) => {
          if (item.type === "date") {
            return (
              <div key={`date-${idx}`} className="flex justify-center py-2">
                <span className="px-3 py-0.5 rounded-full bg-zinc-100 text-[10px] text-zinc-500 font-medium">
                  {formatDateSeparator(item.date)}
                </span>
              </div>
            );
          }

          const msgWithStatus = {
            ...item.message,
            status: getMessageStatus(item.message),
          };

          return (
            <MessageItem
              key={item.message.id}
              message={msgWithStatus}
              isMine={item.message.senderId === myEmployeeId}
              showAvatar={item.showAvatar}
              showName={item.showName}
              seenBy={item.seenBy}
            />
          );
        })}

        {typingUsers.size > 0 && (
          <TypingIndicator
            name={Array.from(typingUsers.values()).join(", ")}
          />
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}

interface MessagesResponse {
  items: Message[];
  hasMore: boolean;
  nextCursor: string | null;
}
