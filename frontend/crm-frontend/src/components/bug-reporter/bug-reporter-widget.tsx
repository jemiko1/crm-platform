"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useScreenRecorder } from "./hooks/use-screen-recorder";
import { useActionLogger } from "./hooks/use-action-logger";
import { useConsoleCapture } from "./hooks/use-console-capture";
import { useNetworkCapture } from "./hooks/use-network-capture";
import { useI18nContext } from "@/contexts/i18n-context";
import RecordingBar from "./recording-bar";
import BugReporterModal from "./bug-reporter-modal";

type Category = "BUG" | "IMPROVEMENT" | "UI_ISSUE" | "PERFORMANCE";
type WidgetState = "idle" | "menu" | "recording" | "submitting";

export default function BugReporterWidget() {
  const { t } = useI18nContext();
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<WidgetState>("idle");
  const [category, setCategory] = useState<Category>("BUG");
  const [captured, setCaptured] = useState<{
    actionLog: unknown[];
    consoleLog: unknown[];
    networkLog: unknown[];
    videoBlob: Blob | null;
    screenshotFiles: File[];
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

    setCaptured({ actionLog, consoleLog, networkLog, videoBlob, screenshotFiles: [] });
    setState("submitting");
  }, [screen, actions, consoleCap, network]);

  const handleScreenshotsOnly = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      setCaptured({
        actionLog: [],
        consoleLog: [],
        networkLog: [],
        videoBlob: null,
        screenshotFiles: files,
      });
      setState("submitting");
    };
    input.click();
    setState("idle");
  }, []);

  const handleDescriptionOnly = useCallback(() => {
    setCaptured({
      actionLog: [],
      consoleLog: [],
      networkLog: [],
      videoBlob: null,
      screenshotFiles: [],
    });
    setState("submitting");
  }, []);

  useEffect(() => {
    screen.setOnEnded(handleStopRecording);
  }, [screen, handleStopRecording]);

  const handleModalClose = useCallback(() => {
    setCaptured(null);
    setState("idle");
  }, []);

  if (!mounted) return null;

  const fab = (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 49999 }}>
      {/* Popover menu */}
      {state === "menu" && (
        <div
          ref={menuRef}
          className="absolute bottom-16 right-0 w-72 rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 p-5 space-y-4"
        >
          <h3 className="text-sm font-semibold text-zinc-900">{t("bugReporter.title", "Report a Bug")}</h3>

          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "BUG", label: t("bugReporter.categoryBug", "Bug") },
                { value: "IMPROVEMENT", label: t("bugReporter.categoryImprovement", "Improvement") },
                { value: "UI_ISSUE", label: t("bugReporter.categoryUiIssue", "UI Issue") },
                { value: "PERFORMANCE", label: t("bugReporter.categoryPerformance", "Performance") },
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

          <div className="space-y-2">
            {browserSupported && (
              <button
                type="button"
                onClick={handleStartRecording}
                className="w-full flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left hover:bg-zinc-50 transition"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-900">{t("bugReporter.recordVideo", "Record Video")}</p>
                  <p className="text-xs text-zinc-500">{t("bugReporter.recordVideoHint", "Record screen while reproducing the bug")}</p>
                </div>
              </button>
            )}

            <button
              type="button"
              onClick={handleScreenshotsOnly}
              className="w-full flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left hover:bg-zinc-50 transition"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-900">{t("bugReporter.uploadScreenshots", "Upload Screenshots")}</p>
                <p className="text-xs text-zinc-500">{t("bugReporter.uploadScreenshotsHint", "Attach images of the issue")}</p>
              </div>
            </button>

            <button
              type="button"
              onClick={handleDescriptionOnly}
              className="w-full flex items-center gap-3 rounded-xl border border-zinc-200 px-4 py-3 text-left hover:bg-zinc-50 transition"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#52525b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </span>
              <div>
                <p className="text-sm font-medium text-zinc-900">{t("bugReporter.descriptionOnly", "Description Only")}</p>
                <p className="text-xs text-zinc-500">{t("bugReporter.descriptionOnlyHint", "Describe the issue without attachments")}</p>
              </div>
            </button>
          </div>
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
        aria-label={t("bugReporter.title", "Report a Bug")}
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
