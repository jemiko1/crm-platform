"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiGetList } from "@/lib/api";
import type { ConversationSummary, PaginatedResponse, ChannelType, ConversationStatus, AgentOption } from "../types";
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

export default function InboxSidebar({ selectedId, onSelect, isManager, notify, soundToggle }: InboxSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelType[]>([]);
  const [assignedFilter, setAssignedFilter] = useState("");
  const [activeTab, setActiveTab] = useState<ConversationStatus>("LIVE");
  const [agents, setAgents] = useState<AgentOption[]>([]);
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
    if (isManager) {
      apiGetList<{ userId: string; user: { id: string; email: string }; firstName?: string; lastName?: string }>(
        "/v1/employees?limit=200",
      ).then((emps) => {
        setAgents(
          emps
            .filter((e) => e.user?.id || e.userId)
            .map((e) => ({
              id: e.user?.id ?? e.userId,
              email: e.user?.email ?? "",
              name: [e.firstName, e.lastName].filter(Boolean).join(" ") || undefined,
            })),
        );
      }).catch(() => {});
    }
  }, [isManager]);

  const fetchConversations = useCallback(async () => {
    if (isInitialLoad.current) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "25");
      params.set("status", activeTab);
      if (search) params.set("search", search);
      if (channelFilter.length > 0) params.set("channelType", channelFilter.join(","));
      if (assignedFilter) params.set("filterAssignedTo", assignedFilter);

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
  }, [page, search, channelFilter, assignedFilter, activeTab]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  const pollInterval = isConnected ? 30000 : 5000;
  useEffect(() => {
    const interval = setInterval(fetchConversations, pollInterval);
    return () => clearInterval(interval);
  }, [fetchConversations, pollInterval]);

  useEffect(() => { setPage(1); }, [search, channelFilter, assignedFilter, activeTab]);

  useEffect(() => {
    const handleNewConversation = (conv: any) => {
      fetchConversations();
      if (notify && conv?.id !== selectedId) {
        const name = conv?.client
          ? [conv.client.firstName, conv.client.lastName].filter(Boolean).join(" ") || "New customer"
          : conv?.participant?.displayName || "New conversation";
        notify(name, "New conversation started");
      }
    };

    const handleConversationUpdated = (conv: any) => {
      setConversations((prev) => {
        const existsInList = prev.some((c) => c.id === conv.id);
        if (!existsInList) {
          fetchConversations();
          return prev;
        }

        if (
          !isManager &&
          currentUserId &&
          conv.assignedUserId &&
          conv.assignedUserId !== currentUserId
        ) {
          return prev.filter((c) => c.id !== conv.id);
        }
        return prev.map((c) =>
          c.id === conv.id
            ? {
                ...c,
                status: conv.status ?? c.status,
                assignedUserId: conv.assignedUserId !== undefined ? conv.assignedUserId : c.assignedUserId,
                assignedUser: conv.assignedUser !== undefined ? conv.assignedUser : c.assignedUser,
                lastMessageAt: conv.lastMessageAt ?? c.lastMessageAt,
              }
            : c,
        );
      });
    };

    const handleNewMessage = (data: { conversationId: string; message: any }) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === data.conversationId);
        if (idx === -1) {
          fetchConversations();
          if (data.message.direction === "IN" && notify) {
            const wsName = data.message.participant?.displayName ?? "New message";
            notify(wsName, data.message.text ?? "");
          }
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

    // Server emits this to an operator socket when its queue-room membership
    // changed (manager edited today's schedule). Refresh to pick up / drop
    // unassigned chats according to the new membership. Fire-and-forget.
    const handleMembershipChanged = (payload: { inQueue: boolean }) => {
      void payload;
      fetchConversations();
    };

    on("conversation:new", handleNewConversation);
    on("conversation:updated", handleConversationUpdated);
    on("message:new", handleNewMessage);
    on("queue:membership-changed", handleMembershipChanged);

    return () => {
      off("conversation:new", handleNewConversation);
      off("conversation:updated", handleConversationUpdated);
      off("message:new", handleNewMessage);
      off("queue:membership-changed", handleMembershipChanged);
    };
  }, [on, off, fetchConversations, selectedId, notify, isManager, currentUserId]);

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

  function getAssignedName(conv: ConversationSummary): string | null {
    if (!conv.assignedUser) return null;
    const emp = conv.assignedUser.employee;
    if (emp) return `${emp.firstName} ${emp.lastName}`.trim();
    return conv.assignedUser.email;
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">
            {isManager ? "All Chats" : "My Chats"}
          </h2>
          <div className="flex items-center gap-2">
            {soundToggle}
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? "bg-teal-500" : "bg-gray-300"}`}
              title={isConnected ? "Live" : "Polling"}
            />
          </div>
        </div>

        {/* Live / Closed tabs */}
        <div className="flex rounded-lg bg-gray-100 p-0.5">
          <button
            onClick={() => setActiveTab("LIVE")}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              activeTab === "LIVE"
                ? "bg-white text-teal-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${activeTab === "LIVE" ? "bg-teal-500 animate-pulse" : "bg-gray-400"}`} />
              Live Chats
            </span>
          </button>
          <button
            onClick={() => setActiveTab("CLOSED")}
            className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
              activeTab === "CLOSED"
                ? "bg-white text-gray-700 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${activeTab === "CLOSED" ? "bg-gray-500" : "bg-gray-400"}`} />
              Closed
            </span>
          </button>
        </div>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        channelFilter={channelFilter}
        onChannelChange={setChannelFilter}
        assignedFilter={assignedFilter}
        onAssignedChange={setAssignedFilter}
        agents={agents}
        isManager={isManager}
      />

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">Loading...</div>
        ) : conversations.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-400">
            {activeTab === "LIVE" ? "No live conversations" : "No closed conversations"}
          </div>
        ) : (
          conversations.map((conv) => {
            const lastMsg = conv.messages?.[0];
            const clientName = conv.client
              ? `${conv.client.firstName ?? ""} ${conv.client.lastName ?? ""}`.trim() || "Client"
              : null;
            const displayName = clientName || conv.participant?.displayName || "Unknown Customer";
            const unread = unreadMap[conv.id] ?? 0;
            const assignedName = getAssignedName(conv);

            return (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-teal-50/50 transition-colors ${
                  selectedId === conv.id ? "bg-teal-50 border-l-2 border-l-emerald-500" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1 min-w-0">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="min-w-0 flex-1 text-sm font-medium text-gray-800 truncate">
                      {displayName}
                    </span>
                    {unread > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-teal-700 rounded-full">
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
                {assignedName ? (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    Assigned to: {assignedName}
                  </p>
                ) : (
                  <p className="text-xs text-amber-600 mt-0.5 font-medium">
                    Unassigned
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
