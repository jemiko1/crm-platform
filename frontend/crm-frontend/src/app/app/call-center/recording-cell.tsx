"use client";

import { useState } from "react";
import { apiPost } from "@/lib/api";
import { useI18n } from "@/hooks/useI18n";
import { InlineAudioPlayer } from "./audio-player";

interface Props {
  recordingId: string | null;
  initiallyAvailable: boolean;
}

/**
 * Smart recording cell for Call Logs.
 *
 * Two states:
 *  - Not cached → show "Request Recording" button. Click triggers backend
 *    SCP-fetch from Asterisk, then swaps to the audio player.
 *  - Cached → show the InlineAudioPlayer directly.
 *
 * Why on-demand: the VM doesn't bulk-sync every recording. Operators
 * typically only need a small percentage. Fetching the specific file
 * when they click is faster and uses less disk than mirroring the whole
 * Asterisk recordings tree.
 */
export function RecordingCell({ recordingId, initiallyAvailable }: Props) {
  const { t } = useI18n();
  const [available, setAvailable] = useState(initiallyAvailable);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!recordingId) {
    return <span className="text-xs text-zinc-400">—</span>;
  }

  if (available) {
    return (
      <div className="flex items-center gap-1.5">
        <InlineAudioPlayer recordingId={recordingId} compact />
        <a
          href={`/v1/telephony/recordings/${recordingId}/download`}
          download
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition"
          title={t("callCenter.logs.downloadRecordingHint", "Download recording to your computer")}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </a>
      </div>
    );
  }

  async function handleFetch() {
    if (!recordingId) return;
    setFetching(true);
    setError(null);
    try {
      await apiPost(`/v1/telephony/recordings/${recordingId}/fetch`, {});
      setAvailable(true);
    } catch (err: any) {
      setError(err?.message ?? "Failed");
    } finally {
      setFetching(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleFetch}
        disabled={fetching}
        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-wait transition"
        title={t("callCenter.logs.requestRecordingHint", "Pull this recording from Asterisk")}
      >
        {fetching ? (
          <>
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            {t("callCenter.logs.requestingRecording", "Fetching...")}
          </>
        ) : (
          <>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" />
            </svg>
            {t("callCenter.logs.requestRecording", "Request")}
          </>
        )}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
