"use client";

import { useState, useEffect, useCallback } from "react";
import { useMessenger } from "./messenger-context";
import ConversationItem from "./conversation-item";
import CreateGroupDialog from "./create-group-dialog";
import { apiGet, apiPost } from "@/lib/api";
import type { Employee } from "./types";

interface ConversationListProps {
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "groups", label: "Groups" },
  { key: "unread", label: "Unread" },
] as const;

export default function ConversationList({
  activeConversationId,
  onSelectConversation,
}: ConversationListProps) {
  const { conversations: rawConversations, loadConversations } = useMessenger();
  const conversations = rawConversations ?? [];
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [canCreateGroup, setCanCreateGroup] = useState(false);

  // Check group creation permission
  useEffect(() => {
    apiGet<{ canCreateGroup: boolean }>("/v1/messenger/permissions")
      .then((data) => setCanCreateGroup(data.canCreateGroup))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations(filter === "all" ? undefined : filter)
      .then((data) => {
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      })
      .catch(() => {});
  }, [filter, loadConversations]);

  useEffect(() => {
    if (!search.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timeout = setTimeout(async () => {
      try {
        const results = await apiGet<Employee[]>(
          `/v1/messenger/search/employees?q=${encodeURIComponent(search)}`,
        );
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const handleStartChat = useCallback(
    async (employeeId: string) => {
      try {
        const conv = await apiPost<{ id: string }>(
          "/v1/messenger/conversations",
          { type: "DIRECT", participantIds: [employeeId] },
        );
        onSelectConversation(conv.id);
        setSearch("");
      } catch {
        /* ignore */
      }
    },
    [onSelectConversation],
  );

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor) return;
    const data = await loadConversations(
      filter === "all" ? undefined : filter,
      undefined,
      nextCursor,
    );
    setHasMore(data.hasMore);
    setNextCursor(data.nextCursor);
  }, [nextCursor, filter, loadConversations]);

  const handleGroupCreated = useCallback((conversationId: string) => {
    setShowCreateGroup(false);
    onSelectConversation(conversationId);
    loadConversations();
  }, [onSelectConversation, loadConversations]);

  return (
    <div className="w-full lg:w-[300px] border-r border-zinc-200 bg-white flex flex-col shrink-0">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-100">
        {/* Desktop: Chats | New Group on same row */}
        <div className="hidden lg:flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-zinc-900">Chats</h2>
          {canCreateGroup && (
            <button
              onClick={() => setShowCreateGroup(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium transition-colors"
              title="Create new group"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
              New Group
            </button>
          )}
        </div>

        {/* Mobile: Chats only on first row */}
        <div className="lg:hidden mb-3">
          <h2 className="text-base font-bold text-zinc-900">Chats</h2>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search people..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-zinc-100/80 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500/20 placeholder:text-zinc-400"
          />
        </div>

        {/* Tabs - mobile: New Group aligned left with All/Groups/Unread */}
        {!search && (
          <div className="flex flex-wrap items-center gap-1">
            {canCreateGroup && (
              <button
                onClick={() => setShowCreateGroup(true)}
                className="lg:hidden flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-medium transition-colors"
                title="Create new group"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
                New Group
              </button>
            )}
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  filter === f.key
                    ? "bg-emerald-100 text-emerald-700"
                    : "text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2">
        {search && isSearching ? (
          searchResults.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-400">
              No employees found
            </div>
          ) : (
            <div className="space-y-0.5">
              {searchResults.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => handleStartChat(emp.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 text-left transition-colors"
                >
                  {emp.avatar ? (
                    <img
                      src={emp.avatar}
                      alt=""
                      className="w-9 h-9 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-xs font-semibold">
                      {emp.firstName.charAt(0)}
                      {emp.lastName.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-800 truncate">
                      {emp.firstName} {emp.lastName}
                    </div>
                    <div className="text-xs text-zinc-500 truncate">
                      {emp.position?.name ?? emp.jobTitle ?? emp.email}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : conversations.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-400">
            No conversations yet
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                isActive={conv.id === activeConversationId}
                onClick={() => onSelectConversation(conv.id)}
              />
            ))}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                className="w-full py-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Load more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Create Group Dialog */}
      {showCreateGroup && (
        <CreateGroupDialog
          onClose={() => setShowCreateGroup(false)}
          onCreated={handleGroupCreated}
        />
      )}
    </div>
  );
}
