"use client";

import type { ChannelType } from "../types";

const channelConfig: Record<ChannelType, { label: string; bg: string; text: string }> = {
  WEB: { label: "Web", bg: "bg-blue-100", text: "text-blue-700" },
  VIBER: { label: "Viber", bg: "bg-purple-100", text: "text-purple-700" },
  FACEBOOK: { label: "Facebook", bg: "bg-indigo-100", text: "text-indigo-700" },
  TELEGRAM: { label: "Telegram", bg: "bg-sky-100", text: "text-sky-700" },
  WHATSAPP: { label: "WhatsApp", bg: "bg-green-100", text: "text-green-700" },
};

export default function ChannelBadge({ channel }: { channel: ChannelType }) {
  const cfg = channelConfig[channel] ?? { label: channel, bg: "bg-gray-100", text: "text-gray-700" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}
