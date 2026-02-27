"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api";
import type { ConversationSummary, PaginatedResponse, ChannelType, ConversationStatus } from "../types";
import FilterBar from "./filter-bar";
import ChannelBadge from "./channel-badge";

interface InboxSidebarProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
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

export default function InboxSidebar({ selectedId, onSelect }: InboxSidebarProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<ChannelType | "">("");
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | "">("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
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
      setConversations(res.data);
      setTotalPages(res.meta.totalPages);
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, channelFilter, statusFilter]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    const interval = setInterval(fetchConversations, 10000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  useEffect(() => { setPage(1); }, [search, channelFilter, statusFilter]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">Client Chats</h2>
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
