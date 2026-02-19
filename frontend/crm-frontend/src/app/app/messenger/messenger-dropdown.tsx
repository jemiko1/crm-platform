"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useMessenger } from "./messenger-context";
import ConversationItem from "./conversation-item";
import { apiGet, apiPost } from "@/lib/api";
import type { Employee } from "./types";

interface MessengerDropdownProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "groups", label: "Groups" },
  { key: "unread", label: "Unread" },
] as const;

export default function MessengerDropdown({
  anchorRef,
  onClose,
}: MessengerDropdownProps) {
  const {
    conversations,
    loadConversations,
    openChat,
    openFullMessenger,
  } = useMessenger();

  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Employee[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // Position the dropdown
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [anchorRef]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  // Load conversations on mount and filter change
  useEffect(() => {
    setLoading(true);
    loadConversations(filter === "all" ? undefined : filter)
      .then((data) => {
        setHasMore(data.hasMore);
        setNextCursor(data.nextCursor);
      })
      .finally(() => setLoading(false));
  }, [filter, loadConversations]);

  // Search employees
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

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const data = await loadConversations(
        filter === "all" ? undefined : filter,
        undefined,
        nextCursor,
      );
      setHasMore(data.hasMore);
      setNextCursor(data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [nextCursor, loading, filter, loadConversations]);

  const handleStartChat = useCallback(
    async (employeeId: string) => {
      try {
        const conv = await apiPost<{ id: string }>(
          "/v1/messenger/conversations",
          {
            type: "DIRECT",
            participantIds: [employeeId],
          },
        );
        openChat(conv.id);
        onClose();
      } catch {
        /* ignore */
      }
    },
    [openChat, onClose],
  );

  const handleConversationClick = useCallback(
    (conversationId: string) => {
      openChat(conversationId);
      onClose();
    },
    [openChat, onClose],
  );

  const handleOpenFullMessenger = useCallback(() => {
    openFullMessenger();
    onClose();
  }, [openFullMessenger, onClose]);

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-[60000] w-[380px] max-h-[540px] bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col"
      style={{ top: pos.top, right: pos.right }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-zinc-100">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-base font-semibold text-zinc-900">Messenger</h3>
          <button
            onClick={handleOpenFullMessenger}
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Open Messenger
          </button>
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

        {/* Tabs */}
        {!search && (
          <div className="flex gap-1">
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-2">
        {search && isSearching ? (
          /* Employee search results */
          searchResults.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-400">
              No employees found
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="px-2 py-1 text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                People
              </div>
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
            {loading ? "Loading..." : "No conversations yet"}
          </div>
        ) : (
          <div className="space-y-0.5">
            {conversations.map((conv) => (
              <ConversationItem
                key={conv.id}
                conversation={conv}
                onClick={() => handleConversationClick(conv.id)}
              />
            ))}
            {hasMore && (
              <button
                onClick={handleLoadMore}
                disabled={loading}
                className="w-full py-2 text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                {loading ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
