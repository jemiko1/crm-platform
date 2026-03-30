"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface RecordingBarProps {
  onStop: () => void;
}

export default function RecordingBar({ onStop }: RecordingBarProps) {
  const [mounted, setMounted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - t0), 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) return null;

  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 h-12 flex items-center justify-center gap-4 px-4 text-white text-sm font-semibold shadow-lg"
      style={{ zIndex: 10001, background: "linear-gradient(135deg, #dc2626, #b91c1c)" }}
    >
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-white" />
      </span>

      <span>Recording... {timeStr}</span>

      <button
        type="button"
        onClick={onStop}
        className="ml-4 rounded-full bg-white/20 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/30 transition"
      >
        Stop Recording
      </button>
    </div>,
    document.body,
  );
}
