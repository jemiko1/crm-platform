"use client";

import type { PollOption } from "../types";
import { POLL_BAR_FILL, POLL_OPTION_ACTIVE } from "../feed-ui";

export function PollOptionBars({
  options,
  totalVotes,
  selectedId,
  onSelect,
  size = "md",
}: {
  options: PollOption[];
  totalVotes: number;
  selectedId?: string;
  onSelect: (optionId: string) => void;
  size?: "md" | "sm";
}) {
  const total = totalVotes > 0 ? totalVotes : 1;
  const pad = size === "sm" ? "px-2.5 py-2 text-xs" : "px-3 py-2.5 text-sm";
  const radius = size === "sm" ? "rounded-xl" : "rounded-2xl";

  return (
    <ul className={size === "sm" ? "space-y-2" : "space-y-2.5"}>
      {options.map((o) => {
        const pct = Math.round((o.votes / total) * 100);
        const active = selectedId === o.id;
        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onSelect(o.id)}
              className={[
                "relative w-full overflow-hidden border text-left transition",
                radius,
                active ? POLL_OPTION_ACTIVE : "border-zinc-200 hover:border-zinc-300",
              ].join(" ")}
            >
              <span className={`absolute inset-y-0 left-0 ${POLL_BAR_FILL}`} style={{ width: `${pct}%` }} />
              <span className={`relative flex items-center justify-between gap-2 font-medium ${pad}`}>
                <span className="text-zinc-900">{o.label}</span>
                <span className="text-xs font-semibold text-zinc-600 tabular-nums">
                  {pct}% · {o.votes}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
