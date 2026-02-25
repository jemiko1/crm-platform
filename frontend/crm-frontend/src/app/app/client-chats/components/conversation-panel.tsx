"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiGet } from "@/lib/api";
import type { ConversationDetail, ChatMessage, PaginatedResponse } from "../types";
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
  const bottomRef = useRef<HTMLDivElement>(null);

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
      setMessages(res.data);
    } catch {
      setMessages([]);
    }
  }, [conversationId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchConversation(), fetchMessages()]);
    setLoading(false);
  }, [fetchConversation, fetchMessages]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  return (
    <div className="flex flex-col h-full">
      <ConversationHeader conversation={conversation} onUpdate={loadAll} />

      <div className="flex-1 overflow-y-auto px-4 py-4 bg-gradient-to-b from-gray-50/50 to-white/30">
        {messages.length === 0 ? (
          <div className="text-center text-sm text-gray-400 mt-8">No messages yet</div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      <ReplyBox conversationId={conversationId} onSent={fetchMessages} />
    </div>
  );
}
