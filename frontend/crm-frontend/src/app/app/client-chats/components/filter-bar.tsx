"use client";

import { useState, useRef, useEffect } from "react";
import type { ChannelType, AgentOption } from "../types";

const CHANNELS: { value: ChannelType; label: string }[] = [
  { value: "WEB", label: "Web" },
  { value: "VIBER", label: "Viber" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TELEGRAM", label: "Telegram" },
  { value: "WHATSAPP", label: "WhatsApp" },
];

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  channelFilter: ChannelType[];
  onChannelChange: (v: ChannelType[]) => void;
  assignedFilter: string;
  onAssignedChange: (v: string) => void;
  agents: AgentOption[];
  isManager?: boolean;
}

export default function FilterBar({
  search,
  onSearchChange,
  channelFilter,
  onChannelChange,
  assignedFilter,
  onAssignedChange,
  agents,
  isManager,
}: FilterBarProps) {
  const [channelOpen, setChannelOpen] = useState(false);
  const channelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (channelRef.current && !channelRef.current.contains(e.target as Node)) {
        setChannelOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggleChannel(ch: ChannelType) {
    if (channelFilter.includes(ch)) {
      onChannelChange(channelFilter.filter((c) => c !== ch));
    } else {
      onChannelChange([...channelFilter, ch]);
    }
  }

  const channelLabel =
    channelFilter.length === 0
      ? "All channels"
      : channelFilter.length === 1
        ? CHANNELS.find((c) => c.value === channelFilter[0])?.label ?? channelFilter[0]
        : `${channelFilter.length} channels`;

  return (
    <div className="flex flex-col gap-2 p-3 border-b border-gray-200">
      <input
        type="text"
        placeholder="Search conversations..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full bg-white/60 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
      />
      <div className="flex gap-2">
        {/* Multi-select channel dropdown */}
        <div ref={channelRef} className="relative flex-1">
          <button
            onClick={() => setChannelOpen(!channelOpen)}
            className="w-full bg-white/60 border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-left focus:outline-none focus:ring-2 focus:ring-teal-400 flex items-center justify-between"
          >
            <span className={channelFilter.length === 0 ? "text-gray-500" : "text-gray-800"}>
              {channelLabel}
            </span>
            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {channelOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
              {channelFilter.length > 0 && (
                <button
                  onClick={() => { onChannelChange([]); setChannelOpen(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-teal-800 hover:bg-gray-50 font-medium"
                >
                  Clear all
                </button>
              )}
              {CHANNELS.map((ch) => (
                <label
                  key={ch.value}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={channelFilter.includes(ch.value)}
                    onChange={() => toggleChannel(ch.value)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-teal-800 focus:ring-teal-500"
                  />
                  {ch.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Assigned to filter */}
        {isManager && (
          <select
            value={assignedFilter}
            onChange={(e) => onAssignedChange(e.target.value)}
            className="flex-1 bg-white/60 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            <option value="">All agents</option>
            <option value="__unassigned__">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.email}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
