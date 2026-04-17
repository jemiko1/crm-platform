"use client";

import { useRef, useState } from "react";

interface Props {
  recordingId: string;
  /** Hide the time indicator and use a tighter layout (for table cells). Seek bar is always shown. */
  compact?: boolean;
}

function formatTime(sec: number): string {
  if (!isFinite(sec) || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function InlineAudioPlayer({ recordingId, compact }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const toggle = () => {
    const el = audioRef.current;
    if (!el || error) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      setLoading(true);
      el.play()
        .then(() => {
          setPlaying(true);
          setLoading(false);
        })
        .catch(() => {
          setError(true);
          setLoading(false);
        });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const val = Number(e.target.value);
    el.currentTime = val;
    setProgress(val);
  };

  const skip = (delta: number) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const next = Math.max(0, Math.min(duration, el.currentTime + delta));
    el.currentTime = next;
    setProgress(next);
  };

  return (
    <div
      className={[
        "flex items-center gap-2",
        compact ? "min-w-[220px]" : "rounded-xl bg-zinc-50 px-3 py-2 min-w-[300px]",
      ].join(" ")}
    >
      <audio
        ref={audioRef}
        src={`/v1/telephony/recordings/${recordingId}/audio`}
        preload="metadata"
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration ?? 0;
          if (isFinite(d)) setDuration(d);
        }}
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime ?? 0)}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onError={() => setError(true)}
      />

      {/* Rewind 10s */}
      <button
        onClick={() => skip(-10)}
        disabled={!duration || error}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Back 10s"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.5 3C7.81 3 4 6.81 4 11.5S7.81 20 12.5 20s8.5-3.81 8.5-8.5h-2c0 3.58-2.92 6.5-6.5 6.5S6 15.08 6 11.5 8.92 5 12.5 5V8l4-4-4-4v3z" />
        </svg>
      </button>

      {/* Play / Pause */}
      <button
        onClick={toggle}
        disabled={error}
        className={[
          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white transition",
          error
            ? "bg-zinc-300 cursor-not-allowed"
            : "bg-teal-600 hover:bg-teal-700",
        ].join(" ")}
        title={error ? "Recording unavailable" : playing ? "Pause" : "Play"}
      >
        {loading ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5,3 19,12 5,21" />
          </svg>
        )}
      </button>

      {/* Forward 10s */}
      <button
        onClick={() => skip(10)}
        disabled={!duration || error}
        className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
        title="Forward 10s"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M11.5 3v3C7.92 6 5 8.92 5 12.5S7.92 19 11.5 19 18 16.08 18 12.5h2c0 4.69-3.81 8.5-8.5 8.5S3 17.19 3 12.5 6.81 4 11.5 4V1l4 4-4 4V3z" />
        </svg>
      </button>

      {/* Seek bar (always shown) */}
      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.1}
        value={progress}
        onChange={handleSeek}
        disabled={!duration || error}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
      />

      {/* Time indicator */}
      <span className="text-xs tabular-nums text-zinc-500 whitespace-nowrap">
        {error ? "—" : `${formatTime(progress)} / ${formatTime(duration)}`}
      </span>
    </div>
  );
}
