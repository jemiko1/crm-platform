"use client";

import { useRef, useState } from "react";

interface Props {
  recordingId: string;
  compact?: boolean;
}

export function InlineAudioPlayer({ recordingId, compact }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      el.play();
    }
    setPlaying(!playing);
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const el = audioRef.current;
    if (!el) return;
    const val = Number(e.target.value);
    el.currentTime = val;
    setProgress(val);
  };

  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "rounded-xl bg-zinc-50 px-3 py-2"}`}>
      <audio
        ref={audioRef}
        src={`/v1/telephony/recordings/${recordingId}/audio`}
        preload="metadata"
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onTimeUpdate={() => setProgress(audioRef.current?.currentTime ?? 0)}
        onEnded={() => setPlaying(false)}
      />
      <button onClick={toggle} className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-white hover:bg-teal-700">
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        )}
      </button>
      {!compact && (
        <>
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={progress}
            onChange={handleSeek}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-teal-600"
          />
          <span className="text-xs text-zinc-500 tabular-nums">
            {formatTime(progress)} / {formatTime(duration)}
          </span>
        </>
      )}
    </div>
  );
}
