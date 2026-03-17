"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { apiGet } from "@/lib/api";
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);
  const { on, off, isConnected } = useClientChatSocket();

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
    await Promise.all([fetchConversation(), fetchMessages()]);
    setLoading(false);
  }, [fetchConversation, fetchMessages]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const pollInterval = isConnected ? 15000 : 5000;
  useEffect(() => {
    const interval = setInterval(fetchMessages, pollInterval);
    return () => clearInterval(interval);
  }, [fetchMessages, pollInterval]);

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

    on("message:new", handleNewMessage);
    on("conversation:updated", handleConversationUpdated);

    return () => {
      off("message:new", handleNewMessage);
      off("conversation:updated", handleConversationUpdated);
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

      <ReplyBox
        conversationId={conversationId}
        channelType={conversation.channelType}
        clientName={
          conversation.client
            ? [conversation.client.firstName, conversation.client.lastName].filter(Boolean).join(" ")
            : undefined
        }
        onSent={fetchMessages}
      />
    </div>
  );
}
