"use client";

import { format, formatDistanceToNow, isToday, isTomorrow, parseISO } from "date-fns";
import type { RecognitionCategory } from "../types";

export function feedTimeLabel(iso: string) {
  const d = parseISO(iso);
  const rel = formatDistanceToNow(d, { addSuffix: true });
  const clock = format(d, "MMM d · HH:mm");
  return `${rel} · ${clock}`;
}

export function feedEventWhenLabel(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return `Today · ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, "HH:mm")}`;
  return format(d, "EEE, MMM d · HH:mm");
}

export function PinBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-900/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
      <span aria-hidden>📌</span> Pinned
    </span>
  );
}

export const kudosStyles: Record<
  RecognitionCategory,
  { chip: string; border: string; bg: string }
> = {
  Teamwork: {
    chip: "bg-sky-100 text-sky-800 ring-sky-200/80",
    border: "border-sky-200/70",
    bg: "from-sky-50/80 via-white to-indigo-50/40",
  },
  Leadership: {
    chip: "bg-violet-100 text-violet-800 ring-violet-200/80",
    border: "border-violet-200/70",
    bg: "from-violet-50/80 via-white to-fuchsia-50/40",
  },
  Helpful: {
    chip: "bg-amber-100 text-amber-900 ring-amber-200/80",
    border: "border-amber-200/70",
    bg: "from-amber-50/80 via-white to-orange-50/40",
  },
  "Great Job": {
    chip: "bg-[rgba(0,86,83,0.12)] text-[rgb(0,86,83)] ring-[rgba(0,86,83,0.2)]",
    border: "border-[rgba(0,86,83,0.25)]",
    bg: "from-[rgba(0,86,83,0.06)] via-white to-teal-50/40",
  },
  "Customer Care": {
    chip: "bg-rose-100 text-rose-800 ring-rose-200/80",
    border: "border-rose-200/70",
    bg: "from-rose-50/80 via-white to-orange-50/30",
  },
};
