"use client";

import { useState } from "react";
import type { ChatMessage } from "../types";

interface Attachment {
  type: string;
  mediaId?: string;
  mimeType?: string;
  filename?: string;
  latitude?: number;
  longitude?: number;
  name?: string;
}

function MediaAttachment({ att, isOutbound }: { att: Attachment; isOutbound?: boolean }) {
  const [error, setError] = useState(false);

  if (!att.mediaId && att.type !== "location") return null;

  if (att.type === "location" && att.latitude != null && att.longitude != null) {
    const label = att.name || `${att.latitude}, ${att.longitude}`;
    const mapUrl = `https://www.google.com/maps?q=${att.latitude},${att.longitude}`;
    return (
      <a
        href={mapUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-xs underline ${isOutbound ? "text-teal-100" : "text-blue-600 dark:text-blue-300"}`}
      >
        📍 {label}
      </a>
    );
  }

  const src = `/v1/clientchats/media/${att.mediaId}`;

  if (att.type === "image" || att.type === "sticker") {
    if (error) {
      return <p className="text-xs italic opacity-70">[Image unavailable]</p>;
    }
    return (
      <img
        src={src}
        alt={att.filename || "image"}
        className="max-w-[280px] max-h-[320px] rounded-lg mt-1 cursor-pointer"
        loading="lazy"
        onError={() => setError(true)}
        onClick={() => window.open(src, "_blank")}
      />
    );
  }

  if (att.type === "video") {
    return (
      <video
        src={src}
        controls
        className="max-w-[280px] max-h-[240px] rounded-lg mt-1"
        preload="metadata"
      />
    );
  }

  if (att.type === "audio") {
    return <audio src={src} controls className="mt-1 max-w-[260px]" preload="metadata" />;
  }

  if (att.type === "document") {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 mt-1 rounded-lg transition-colors ${
          isOutbound
            ? "bg-teal-800 hover:bg-teal-900 text-white"
            : "bg-gray-100 hover:bg-gray-200"
        }`}
      >
        <span>📄</span>
        <span className="underline">{att.filename || "Document"}</span>
      </a>
    );
  }

  return null;
}

export default function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isOutbound = msg.direction === "OUT";
  const time = new Date(msg.sentAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const senderLabel = isOutbound
    ? msg.senderUser?.email ?? "Agent"
    : msg.participant?.displayName ?? "Visitor";

  const attachments = (Array.isArray(msg.attachments) ? msg.attachments : []) as Attachment[];
  const hasMedia = attachments.length > 0;
  const isMediaOnly = hasMedia && (!msg.text || msg.text.match(/^\[(image|video|audio|document|sticker)\]$/i));

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
          isOutbound
            ? "bg-teal-800 text-white rounded-br-md"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-md"
        }`}
      >
        <p className={`text-xs font-medium mb-0.5 ${isOutbound ? "text-teal-100" : "text-gray-400"}`}>
          {senderLabel}
        </p>
        {hasMedia && (
          <div className="space-y-1">
            {attachments.map((att, i) => (
              <MediaAttachment key={i} att={att} isOutbound={isOutbound} />
            ))}
          </div>
        )}
        {!isMediaOnly && (
          <p className="text-sm whitespace-pre-wrap break-words">{msg.text}</p>
        )}
        <p className={`text-[10px] mt-1 text-right ${isOutbound ? "text-teal-200" : "text-gray-400"}`}>
          {time}
        </p>
      </div>
    </div>
  );
}
