"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import type { ConversationDetail, ChatMessage, PaginatedResponse } from "../types";
import { useClientChatSocket } from "../hooks/useClientChatSocket";
import ConversationHeader from "./conversation-header";
import MessageBubble from "./message-bubble";
import ReplyBox from "./reply-box";

interface ConversationPanelProps {
  conversationId: string;
}

export default function ConversationPanel({ conversationId }: ConversationPanelProps) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const { on, off, isConnected } = useClientChatSocket();

  // Inactivity alert state
  const [showInactivityAlert, setShowInactivityAlert] = useState(false);
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Previous conversation history
  const [prevMessages, setPrevMessages] = useState<ChatMessage[]>([]);
  const [prevLoading, setPrevLoading] = useState(false);
  const [prevMeta, setPrevMeta] = useState<{
    hasMore: boolean;
    previousConversationId: string | null;
    closedAt: string | null;
    page: number;
    convId: string;
  } | null>(null);

  useEffect(() => {
    apiGet<any>("/auth/me")
      .then((data) => {
        const user = data?.user || data;
        if (user?.id) setCurrentUserId(user.id);
      })
      .catch(() => {});
  }, []);

  const fetchConversation = useCallback(async () => {
    try {
      const conv = await apiGet<ConversationDetail>(`/v1/clientchats/conversations/${conversationId}`);
      setConversation(conv);
    } catch {
      setConversation(null);
    }
  }, [conversationId]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await apiGet<PaginatedResponse<ChatMessage>>(
        `/v1/clientchats/conversations/${conversationId}/messages?limit=100`,
      );
      setMessages((prev) => {
        const last = res.data[res.data.length - 1];
        const prevLast = prev[prev.length - 1];
        if (res.data.length === prev.length && last?.id === prevLast?.id) {
          return prev;
        }
        return res.data;
      });
    } catch {
      setMessages([]);
    }
  }, [conversationId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setPrevMessages([]);
    setPrevMeta(null);
    await Promise.all([fetchConversation(), fetchMessages()]);
    setLoading(false);
  }, [fetchConversation, fetchMessages]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const pollInterval = isConnected ? 15000 : 5000;
  useEffect(() => {
    const interval = setInterval(fetchMessages, pollInterval);
    return () => clearInterval(interval);
  }, [fetchMessages, pollInterval]);

  // Inactivity timer: starts after operator sends a reply, resets on inbound
  useEffect(() => {
    if (!conversation || conversation.status !== "LIVE") return;
    if (!messages.length) return;

    const lastMsg = messages[messages.length - 1];
    if (!lastMsg) return;

    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    setShowInactivityAlert(false);

    if (lastMsg.direction === "OUT") {
      inactivityTimerRef.current = setTimeout(() => {
        setShowInactivityAlert(true);
      }, 10 * 60 * 1000);
    }

    return () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [messages, conversation]);

  async function handleCloseFromAlert() {
    await apiPatch(`/v1/clientchats/conversations/${conversationId}/status`, { status: "CLOSED" });
    setShowInactivityAlert(false);
    loadAll();
  }

  function handleWaitMore() {
    setShowInactivityAlert(false);
    inactivityTimerRef.current = setTimeout(() => {
      setShowInactivityAlert(true);
    }, 10 * 60 * 1000);
  }

  // Load previous conversation history
  async function loadPreviousHistory() {
    const convId = prevMeta?.previousConversationId
      ? prevMeta.convId
      : conversationId;
    const page = prevMeta ? prevMeta.page + 1 : 1;

    const targetConvId = prevMeta?.previousConversationId
      ? prevMeta.convId
      : conversationId;

    setPrevLoading(true);
    try {
      const res = await apiGet<{
        data: ChatMessage[];
        meta: { hasMore: boolean; previousConversationId: string | null; closedAt: string; total: number; page: number };
      }>(`/v1/clientchats/conversations/${targetConvId}/history?page=${page}&limit=50`);

      setPrevMessages((prev) => [...res.data, ...prev]);
      setPrevMeta({
        hasMore: res.meta.hasMore,
        previousConversationId: res.meta.previousConversationId,
        closedAt: res.meta.closedAt,
        page: res.meta.page,
        convId: targetConvId,
      });
    } catch { /* silent */ } finally {
      setPrevLoading(false);
    }
  }

  // WebSocket handlers
  useEffect(() => {
    const handleNewMessage = (data: { conversationId: string; message: any }) => {
      if (data.conversationId !== conversationId) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === data.message.id)) return prev;
        return [...prev, data.message];
      });
    };

    const handleConversationUpdated = (conv: any) => {
      if (conv.id !== conversationId) return;
      fetchConversation();
    };

    const handlePaused = (data: { conversationId: string }) => {
      if (data.conversationId !== conversationId) return;
      fetchConversation();
    };

    const handleUnpaused = (data: { conversationId: string }) => {
      if (data.conversationId !== conversationId) return;
      fetchConversation();
    };

    on("message:new", handleNewMessage);
    on("conversation:updated", handleConversationUpdated);
    on("operator:paused", handlePaused);
    on("operator:unpaused", handleUnpaused);

    return () => {
      off("message:new", handleNewMessage);
      off("conversation:updated", handleConversationUpdated);
      off("operator:paused", handlePaused);
      off("operator:unpaused", handleUnpaused);
    };
  }, [on, off, conversationId, fetchConversation]);

  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Loading conversation...
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Conversation not found
      </div>
    );
  }

  const imPaused = conversation.pausedOperatorId === currentUserId;
  const hasPreviousConv = !!conversation.previousConversationId;

  return (
    <div className="flex flex-col h-full">
      <ConversationHeader conversation={conversation} currentUserId={currentUserId} onUpdate={loadAll} />

      {/* Pause banner for the paused operator */}
      {imPaused && (
        <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="10" y1="15" x2="10" y2="9" /><line x1="14" y1="15" x2="14" y2="9" />
          </svg>
          Manager has taken over this conversation. You can view but not send messages.
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gradient-to-b from-gray-50/50 to-white/30">
        {/* Load previous conversation button */}
        {hasPreviousConv && prevMessages.length === 0 && !prevLoading && (
          <div className="text-center mb-4">
            <button
              onClick={loadPreviousHistory}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
            >
              Load Previous Conversation
            </button>
          </div>
        )}

        {/* Load more from previous */}
        {prevMeta?.hasMore && (
          <div className="text-center mb-4">
            <button
              onClick={loadPreviousHistory}
              disabled={prevLoading}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {prevLoading ? "Loading..." : "Load More History"}
            </button>
          </div>
        )}

        {prevLoading && prevMessages.length === 0 && (
          <div className="text-center text-sm text-gray-400 mb-4">Loading history...</div>
        )}

        {/* Previous conversation messages */}
        {prevMessages.length > 0 && (
          <>
            {prevMessages.map((msg) => <MessageBubble key={`prev-${msg.id}`} msg={msg} />)}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gray-300" />
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">
                Previous conversation ended{prevMeta?.closedAt ? ` on ${new Date(prevMeta.closedAt).toLocaleDateString()}` : ""}
              </span>
              <div className="flex-1 h-px bg-gray-300" />
            </div>
          </>
        )}

        {/* Current conversation messages */}
        {messages.length === 0 ? (
          <div className="text-center text-sm text-gray-400 mt-8">No messages yet</div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Inactivity alert */}
      {showInactivityAlert && conversation.status === "LIVE" && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex items-center justify-between">
          <div className="text-sm text-amber-800">
            Customer has been inactive for 10 minutes. Close the chat or wait?
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCloseFromAlert}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600"
            >
              Close Chat
            </button>
            <button
              onClick={handleWaitMore}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-100"
            >
              Wait 10 min
            </button>
          </div>
        </div>
      )}

      <ReplyBox
        conversationId={conversationId}
        channelType={conversation.channelType}
        clientName={
          conversation.client
            ? [conversation.client.firstName, conversation.client.lastName].filter(Boolean).join(" ")
            : undefined
        }
        whatsappWindowOpen={conversation.whatsappWindowOpen}
        disabled={imPaused || conversation.status === "CLOSED"}
        disabledReason={
          imPaused
            ? "Manager has taken over this conversation"
            : conversation.status === "CLOSED"
              ? "This conversation is closed"
              : undefined
        }
        onSent={fetchMessages}
      />
    </div>
  );
}
