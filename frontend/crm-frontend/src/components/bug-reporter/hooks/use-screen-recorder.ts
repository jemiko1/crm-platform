"use client";

import { useRef, useCallback, useState } from "react";

const MAX_RECORDING_MS = 3 * 60 * 1000;

function pickCodec(): string {
  for (const codec of [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm;codecs=h264",
    "video/webm",
  ]) {
    if (MediaRecorder.isTypeSupported(codec)) return codec;
  }
  return "video/webm";
}

export function useScreenRecorder() {
  const mediaStream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEndedRef = useRef<(() => void) | null>(null);
  const [recording, setRecording] = useState(false);

  const stop = useCallback((): Blob | null => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }

    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.stop();
    }

    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach((t) => t.stop());
      mediaStream.current = null;
    }

    recorder.current = null;
    setRecording(false);

    if (chunks.current.length === 0) return null;
    return new Blob(chunks.current, { type: "video/webm" });
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        // Let Chrome show all options (Tab, Window, Screen)
        // preferCurrentTab is better than displaySurface for localhost
        preferCurrentTab: true,
      } as any);

      mediaStream.current = stream;
      chunks.current = [];

      const mimeType = pickCodec();
      const mr = new MediaRecorder(stream, { mimeType });

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      stream.getVideoTracks()[0].addEventListener("ended", () => {
        if (onEndedRef.current) onEndedRef.current();
      });

      mr.start(1000);
      recorder.current = mr;
      setRecording(true);

      timer.current = setTimeout(() => {
        if (onEndedRef.current) onEndedRef.current();
      }, MAX_RECORDING_MS);

      return true;
    } catch {
      return false;
    }
  }, []);

  const setOnEnded = useCallback((fn: () => void) => {
    onEndedRef.current = fn;
  }, []);

  return { recording, start, stop, setOnEnded };
}
