"use client";

import type { ChatMessage } from "../types";

export default function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isOutbound = msg.direction === "OUT";
  const time = new Date(msg.sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const senderLabel = isOutbound
    ? msg.senderUser?.email ?? "Agent"
    : msg.participant?.displayName ?? "Visitor";

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
          isOutbound
            ? "bg-emerald-500 text-white rounded-br-md"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-md"
        }`}
      >
        <p className={`text-xs font-medium mb-0.5 ${isOutbound ? "text-emerald-100" : "text-gray-400"}`}>
          {senderLabel}
        </p>
        <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
        <p className={`text-[10px] mt-1 text-right ${isOutbound ? "text-emerald-200" : "text-gray-400"}`}>
          {time}
        </p>
      </div>
    </div>
  );
}
