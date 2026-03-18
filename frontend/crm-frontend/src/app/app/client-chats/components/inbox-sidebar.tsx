"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api";
import type { ConversationSummary, PaginatedResponse, ChannelType, ConversationStatus } from "../types";
import { useClientChatSocket } from "../hooks/useClientChatSocket";
import FilterBar from "./filter-bar";
import ChannelBadge from "./channel-badge";

interface InboxSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  isManager?: boolean;
  notify?: (title: string, body: string) => void;
  soundToggle?: React.ReactNode;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function statusDot(status: ConversationStatus) {
  const colors: Record<ConversationStatus, string> = {
    OPEN: "bg-emerald-500",
    PENDING: "bg-amber-400",
    CLOSED: "bg-gray-400",
    SPAM: "bg-red-400",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

export default function InboxSidebar({ selectedId, onSelect, isManager, notify, soundToggle }: InboxSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelType | "">("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "">("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const isInitialLoad = useRef(true);
  const lastSeenRef = useRef<Record<string, string>>({});
  const notifyRef = useRef(notify);
  const selectedRef = useRef(selectedId);
  notifyRef.current = notify;
  selectedRef.current = selectedId;
  const { on, off, isConnected } = useClientChatSocket();

  useEffect(() => {
    apiGet<any>("/auth/me")
      .then((data) => {
        const user = data?.user || data;
        if (user?.id) setCurrentUserId(user.id);
      })
      .catch(() => {});
  }, []);

  const fetchConversations = useCallback(async () => {
    if (isInitialLoad.current) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      if (search) params.set("search", search);
      if (channelFilter) params.set("channelType", channelFilter);
      if (statusFilter) params.set("status", statusFilter);

      const res = await apiGet<PaginatedResponse<ConversationSummary>>(
        `/v1/clientchats/conversations?${params}`,
      );

      const wasInitial = isInitialLoad.current;
      const prevSeen = lastSeenRef.current;
      const nextSeen: Record<string, string> = {};

      for (const conv of res.data) {
        const ts = conv.lastMessageAt ?? "";
        nextSeen[conv.id] = ts;

        if (!wasInitial && ts && prevSeen[conv.id] && ts !== prevSeen[conv.id]) {
          const lastMsg = conv.messages?.[0];
          if (
            lastMsg?.direction === "IN" &&
            conv.id !== selectedRef.current &&
            notifyRef.current
          ) {
            const name = lastMsg.participant?.displayName ?? conv.channelType;
            notifyRef.current(name, lastMsg.text ?? "");
            setUnreadMap((prev) => ({
              ...prev,
              [conv.id]: (prev[conv.id] ?? 0) + 1,
            }));
          }
        }
      }
      lastSeenRef.current = nextSeen;

      setConversations((prev) => {
        if (
          prev.length === res.data.length &&
          prev.every((c, i) => c.id === res.data[i].id && c.lastMessageAt === res.data[i].lastMessageAt)
        ) {
          return prev;
        }
        return res.data;
      });
      setTotalPages(res.meta.totalPages);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
      isInitialLoad.current = false;
    }
  }, [page, search, channelFilter, statusFilter]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const pollInterval = isConnected ? 30000 : 5000;
  useEffect(() => {
    const interval = setInterval(fetchConversations, pollInterval);
    return () => clearInterval(interval);
  }, [fetchConversations, pollInterval]);

  useEffect(() => { setPage(1); }, [search, channelFilter, statusFilter]);

  useEffect(() => {
    const handleNewConversation = () => {
      fetchConversations();
    };

    const handleConversationUpdated = (conv: any) => {
      setConversations((prev) => {
        if (
          !isManager &&
          currentUserId &&
          conv.assignedUserId !== currentUserId
        ) {
          return prev.filter((c) => c.id !== conv.id);
        }
        return prev.map((c) =>
          c.id === conv.id
            ? { ...c, status: conv.status ?? c.status, assignedUserId: conv.assignedUserId ?? c.assignedUserId, lastMessageAt: conv.lastMessageAt ?? c.lastMessageAt }
            : c,
        );
      });
    };

    const handleNewMessage = (data: { conversationId: string; message: any }) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === data.conversationId);
        if (idx === -1) {
          fetchConversations();
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessageAt: data.message.sentAt ?? new Date().toISOString(),
          messages: [
            {
              text: data.message.text,
              sentAt: data.message.sentAt,
              direction: data.message.direction,
              participant: data.message.participant ?? null,
            },
          ],
        };
        updated.sort((a, b) => {
          const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return tb - ta;
        });
        return updated;
      });

      if (data.conversationId !== selectedId) {
        setUnreadMap((prev) => ({
          ...prev,
          [data.conversationId]: (prev[data.conversationId] ?? 0) + 1,
        }));

        if (data.message.direction === "IN" && notify) {
          const wsName = data.message.participant?.displayName ?? "New message";
          notify(wsName, data.message.text ?? "");
        }
      }
    };

    on("conversation:new", handleNewConversation);
    on("conversation:updated", handleConversationUpdated);
    on("message:new", handleNewMessage);

    return () => {
      off("conversation:new", handleNewConversation);
      off("conversation:updated", handleConversationUpdated);
      off("message:new", handleNewMessage);
    };
  }, [on, off, fetchConversations, selectedId, notify]);

  useEffect(() => {
    if (selectedId) {
      setUnreadMap((prev) => {
        if (!prev[selectedId]) return prev;
        const next = { ...prev };
        delete next[selectedId];
        return next;
      });
    }
  }, [selectedId]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            {isManager ? "All Chats" : "My Chats"}
          </h2>
          <div className="flex items-center gap-2">
            <Link
              href="/app/client-chats/analytics"
              title="Chat Analytics"
              className="text-gray-400 hover:text-emerald-600 transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
            </Link>
            {soundToggle}
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500" : "bg-gray-300"}`}
              title={isConnected ? "Live" : "Polling"}
            />
          </div>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        channelFilter={channelFilter}
        onChannelChange={setChannelFilter}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">No conversations found</div>
        ) : (
          conversations.map((conv) => {
            const lastMsg = conv.messages?.[0];
            const clientName = conv.client
              ? `${conv.client.firstName ?? ""} ${conv.client.lastName ?? ""}`.trim() || "Client"
              : null;
            const participantName = lastMsg?.participant?.displayName ?? null;
            const displayName = clientName || participantName || conv.externalConversationId.slice(0, 16);
            const unread = unreadMap[conv.id] ?? 0;

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-emerald-50/50 transition-colors ${
                  selectedId === conv.id ? "bg-emerald-50 border-l-2 border-l-emerald-500" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    {statusDot(conv.status)}
                    <span className="text-sm font-medium text-gray-800 truncate max-w-[140px]">
                      {displayName}
                    </span>
                    {unread > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-emerald-500 rounded-full">
                        {unread}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ChannelBadge channel={conv.channelType} />
                    <span className="text-xs text-gray-400">{timeAgo(conv.lastMessageAt)}</span>
                  </div>
                </div>
                {lastMsg && (
                  <p className="text-xs text-gray-500 truncate">
                    {lastMsg.direction === "OUT" ? "You: " : ""}
                    {lastMsg.text}
                  </p>
                )}
                {conv.assignedUser && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    → {conv.assignedUser.email}
                  </p>
                )}
              </button>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 text-xs">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-gray-500">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
