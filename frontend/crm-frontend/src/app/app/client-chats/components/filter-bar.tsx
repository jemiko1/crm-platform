"use client";

import type { ChannelType, ConversationStatus } from "../types";

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  channelFilter: ChannelType | "";
  onChannelChange: (v: ChannelType | "") => void;
  statusFilter: ConversationStatus | "";
  onStatusChange: (v: ConversationStatus | "") => void;
}

const selectClasses =
  "bg-white/60 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400";

export default function FilterBar({
  search,
  onSearchChange,
  channelFilter,
  onChannelChange,
  statusFilter,
  onStatusChange,
}: FilterBarProps) {
  return (
    <div className="flex flex-col gap-2 p-3 border-b border-gray-200">
      <input
        type="text"
        placeholder="Search conversations..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full bg-white/60 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
      />
      <div className="flex gap-2">
        <select
          value={channelFilter}
          onChange={(e) => onChannelChange(e.target.value as ChannelType | "")}
          className={selectClasses}
        >
          <option value="">All channels</option>
          <option value="WEB">Web</option>
          <option value="VIBER">Viber</option>
          <option value="FACEBOOK">Facebook</option>
          <option value="TELEGRAM">Telegram</option>
          <option value="WHATSAPP">WhatsApp</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusChange(e.target.value as ConversationStatus | "")}
          className={selectClasses}
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="PENDING">Pending</option>
          <option value="CLOSED">Closed</option>
          <option value="SPAM">Spam</option>
        </select>
      </div>
    </div>
  );
}
