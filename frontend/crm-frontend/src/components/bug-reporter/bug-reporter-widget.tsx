"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useScreenRecorder } from "./hooks/use-screen-recorder";
import { useActionLogger } from "./hooks/use-action-logger";
import { useConsoleCapture } from "./hooks/use-console-capture";
import { useNetworkCapture } from "./hooks/use-network-capture";
import RecordingBar from "./recording-bar";
import BugReporterModal from "./bug-reporter-modal";

type Category = "BUG" | "IMPROVEMENT" | "UI_ISSUE" | "PERFORMANCE";
type WidgetState = "idle" | "menu" | "recording" | "submitting";

export default function BugReporterWidget() {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<WidgetState>("idle");
  const [category, setCategory] = useState<Category>("BUG");
  const [captured, setCaptured] = useState<{
    actionLog: unknown[];
    consoleLog: unknown[];
    networkLog: unknown[];
    videoBlob: Blob | null;
  } | null>(null);
  const [browserSupported, setBrowserSupported] = useState(true);
  const menuRef = useRef<HTMLDivElement>(null);

  const screen = useScreenRecorder();
  const actions = useActionLogger();
  const consoleCap = useConsoleCapture();
  const network = useNetworkCapture();

  useEffect(() => {
    setMounted(true);
    if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getDisplayMedia) {
      setBrowserSupported(false);
    }
  }, []);

  useEffect(() => {
    if (state !== "menu") return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setState("idle");
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [state]);

  const handleStartRecording = useCallback(async () => {
    setState("idle");

    actions.start();
    consoleCap.start();
    network.start();

    const ok = await screen.start();
    if (!ok) {
      actions.stop();
      consoleCap.stop();
      network.stop();
      return;
    }

    setState("recording");
  }, [screen, actions, consoleCap, network]);

  const handleStopRecording = useCallback(() => {
    const videoBlob = screen.stop();
    const actionLog = actions.stop();
    const consoleLog = consoleCap.stop();
    const networkLog = network.stop();

    setCaptured({ actionLog, consoleLog, networkLog, videoBlob });
    setState("submitting");
  }, [screen, actions, consoleCap, network]);

  useEffect(() => {
    screen.setOnEnded(handleStopRecording);
  }, [screen, handleStopRecording]);

  const handleModalClose = useCallback(() => {
    setCaptured(null);
    setState("idle");
  }, []);

  if (!mounted) return null;

  const fab = (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 9999 }}>
      {/* Popover menu */}
      {state === "menu" && (
        <div
          ref={menuRef}
          className="absolute bottom-16 right-0 w-72 rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-zinc-900">Report a Bug</h3>

          {!browserSupported && (
            <p className="text-xs text-red-600">
              Screen recording is not supported in this browser. Other captures will still work.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "BUG", label: "Bug" },
                { value: "IMPROVEMENT", label: "Improvement" },
                { value: "UI_ISSUE", label: "UI Issue" },
                { value: "PERFORMANCE", label: "Performance" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCategory(opt.value)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                  category === opt.value
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <p className="text-xs text-zinc-500">
            Click Start, then reproduce the issue. Click Stop when done.
          </p>

          <button
            type="button"
            onClick={handleStartRecording}
            className="w-full rounded-2xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition"
          >
            Start Recording
          </button>
        </div>
      )}

      {/* FAB button */}
      <button
        type="button"
        onClick={() => {
          if (state === "idle") setState("menu");
          else if (state === "menu") setState("idle");
        }}
        disabled={state === "recording" || state === "submitting"}
        className={`relative flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all ${
          state === "recording"
            ? "bg-red-600 cursor-default"
            : "bg-teal-800 hover:bg-teal-900 hover:scale-105"
        }`}
        aria-label="Report a bug"
      >
        {state === "recording" ? (
          <span className="relative flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-white" />
          </span>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3.003 3.003 0 116 0v1" />
            <path d="M12 20c-3.3 0-6-2.7-6-6v-3a6 6 0 0112 0v3c0 3.3-2.7 6-6 6z" />
            <path d="M12 20v2M6 13H2M22 13h-4M6 17H4M20 17h-2" />
          </svg>
        )}

        {state === "idle" && (
          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
        )}
      </button>
    </div>
  );

  return (
    <>
      {createPortal(fab, document.body)}

      {state === "recording" && (
        <RecordingBar onStop={handleStopRecording} />
      )}

      {captured && (
        <BugReporterModal
          open={state === "submitting"}
          onClose={handleModalClose}
          category={category}
          captured={captured}
        />
      )}
    </>
  );
}
