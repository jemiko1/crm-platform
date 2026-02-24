"use client";

import { createPortal } from "react-dom";
import { useMessenger } from "./messenger-context";
import ChatBubble from "./chat-bubble";
import { useEffect, useState } from "react";

export default function ChatBubbleContainer() {
  const { activeChats } = useMessenger();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || activeChats.length === 0) return null;

  return createPortal(
    <>
      {activeChats.map((chat, idx) => (
        <ChatBubble
          key={chat.conversationId}
          conversationId={chat.conversationId}
          index={idx}
          minimized={chat.minimized}
        />
      ))}
    </>,
    document.body,
  );
}
