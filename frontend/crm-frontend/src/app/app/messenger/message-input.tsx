"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useMessenger } from "./messenger-context";

interface MessageInputProps {
  conversationId: string;
  compact?: boolean;
}

export default function MessageInput({
  conversationId,
  compact,
}: MessageInputProps) {
  const { sendMessage, sendTyping } = useMessenger();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMessage(conversationId, trimmed);
    setText("");
    sendTyping(conversationId, false);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [text, conversationId, sendMessage, sendTyping]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(e.target.value);

      // Auto-resize
      if (inputRef.current) {
        inputRef.current.style.height = "auto";
        inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
      }

      // Typing indicator with debounce
      sendTyping(conversationId, true);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(conversationId, false);
      }, 2000);
    },
    [conversationId, sendTyping],
  );

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className={`flex items-end gap-2 ${compact ? "px-3 py-2" : "px-4 py-3"} border-t border-zinc-100 bg-white`}
    >
      <textarea
        ref={inputRef}
        value={text}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        rows={1}
        className={`flex-1 resize-none outline-none text-sm text-zinc-900 placeholder:text-zinc-400 bg-zinc-100/60 rounded-xl ${
          compact ? "px-3 py-2" : "px-4 py-2.5"
        } max-h-[120px] overflow-y-auto`}
      />
      <button
        onClick={handleSend}
        disabled={!text.trim()}
        className={`shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-zinc-200 disabled:text-zinc-400 text-white transition-colors ${
          compact ? "p-2" : "p-2.5"
        }`}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
          />
        </svg>
      </button>
    </div>
  );
}
