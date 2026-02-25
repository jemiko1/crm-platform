"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";

interface ReplyBoxProps {
  conversationId: string;
  onSent: () => void;
}

export default function ReplyBox({ conversationId, onSent }: ReplyBoxProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await apiPost(`/v1/clientchats/conversations/${conversationId}/reply`, {
        text: text.trim(),
      });
      setText("");
      onSent();
    } catch {
      // keep text for retry
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="border-t border-gray-200 p-3 bg-white/60">
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a reply..."
          rows={2}
          className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white/80"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || sending}
          className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 disabled:opacity-40 transition-colors"
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
