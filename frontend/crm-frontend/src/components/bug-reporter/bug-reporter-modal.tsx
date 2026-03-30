"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useBugReportSubmit, type SubmitPhase } from "./hooks/use-bug-report-submit";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Category = "BUG" | "IMPROVEMENT" | "UI_ISSUE" | "PERFORMANCE";

interface CapturedData {
  actionLog: unknown[];
  consoleLog: unknown[];
  networkLog: unknown[];
  videoBlob: Blob | null;
}

interface BugReporterModalProps {
  open: boolean;
  onClose: () => void;
  category: Category;
  captured: CapturedData;
}

const SEVERITY_OPTIONS: { value: Severity; label: string; color: string; bg: string }[] = [
  { value: "CRITICAL", label: "Critical", color: "text-red-700", bg: "bg-red-100 border-red-300 hover:bg-red-200" },
  { value: "HIGH", label: "High", color: "text-orange-700", bg: "bg-orange-100 border-orange-300 hover:bg-orange-200" },
  { value: "MEDIUM", label: "Medium", color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-300 hover:bg-yellow-200" },
  { value: "LOW", label: "Low", color: "text-green-700", bg: "bg-green-100 border-green-300 hover:bg-green-200" },
];

const CATEGORY_OPTIONS: { value: Category; label: string }[] = [
  { value: "BUG", label: "Bug" },
  { value: "IMPROVEMENT", label: "Improvement" },
  { value: "UI_ISSUE", label: "UI Issue" },
  { value: "PERFORMANCE", label: "Performance" },
];

const PHASE_LABELS: Record<SubmitPhase, string> = {
  idle: "",
  uploading: "Submitting report...",
  processing: "Processing...",
  done: "",
  error: "",
};

export default function BugReporterModal({
  open,
  onClose,
  category: initialCategory,
  captured,
}: BugReporterModalProps) {
  const [mounted, setMounted] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("MEDIUM");
  const [category, setCategory] = useState<Category>(initialCategory);
  const contentRef = useRef<HTMLDivElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const { phase, error, result, submit, reset } = useBugReportSubmit();

  const handleDiscard = useCallback(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    setDescription("");
    setSeverity("MEDIUM");
    reset();
    onClose();
  }, [onClose, reset, videoUrl]);

  useEffect(() => {
    setMounted(true);
    return () => {
      setVideoUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (open && captured.videoBlob && !videoUrl) {
      setVideoUrl(URL.createObjectURL(captured.videoBlob));
    }
  }, [open, captured.videoBlob, videoUrl]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "idle") handleDiscard();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, phase, handleDiscard]);

  const handleSubmit = async () => {
    if (!description.trim()) return;

    await submit(
      {
        description,
        severity,
        category,
        pageUrl: window.location.href,
        browserInfo: {
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          screenResolution: `${screen.width}x${screen.height}`,
          language: navigator.language,
          platform: navigator.platform,
        },
        actionLog: captured.actionLog,
        consoleLog: captured.consoleLog,
        networkLog: captured.networkLog,
      },
      captured.videoBlob,
    );
  };

  if (!mounted || !open) return null;

  const consoleErrors = (captured.consoleLog as Array<Record<string, unknown>>).filter(
    (e) => e.level === "error",
  ).length;
  const failedRequests = (captured.networkLog as Array<Record<string, unknown>>).filter(
    (e) => typeof e.status === "number" && (e.status as number) >= 400,
  ).length;

  const isSubmitting = phase === "uploading" || phase === "processing";

  const modalContent = (
    <div
      className="fixed inset-0 z-[50010] flex items-center justify-center p-4"
      onClick={(e) => {
        if (contentRef.current && !contentRef.current.contains(e.target as Node) && !isSubmitting) {
          handleDiscard();
        }
      }}
    >
      <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm" />

      <div
        ref={contentRef}
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-3xl bg-white shadow-2xl ring-1 ring-zinc-200 overflow-hidden"
        style={{ zIndex: 1 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            {phase === "done" ? "Report Submitted" : "Submit Bug Report"}
          </h2>
          {!isSubmitting && (
            <button
              type="button"
              onClick={handleDiscard}
              className="rounded-full p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {phase === "done" && result ? (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M20 6L9 17l-5-5" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-zinc-700 font-medium">Bug report submitted successfully!</p>
              {result.githubIssueUrl && (
                <a
                  href={result.githubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-teal-700 underline hover:text-teal-900"
                >
                  View GitHub Issue
                </a>
              )}
              {!result.githubIssueUrl && (
                <p className="text-xs text-zinc-500">
                  AI analysis and GitHub issue creation are processing in the background.
                </p>
              )}
              <button
                type="button"
                onClick={handleDiscard}
                className="mt-4 rounded-2xl bg-teal-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 transition"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Category</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCategory(opt.value)}
                      disabled={isSubmitting}
                      className={`rounded-xl border px-3.5 py-1.5 text-sm font-medium transition ${
                        category === opt.value
                          ? "border-teal-600 bg-teal-50 text-teal-800"
                          : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Severity</label>
                <div className="flex flex-wrap gap-2">
                  {SEVERITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSeverity(opt.value)}
                      disabled={isSubmitting}
                      className={`rounded-xl border px-3.5 py-1.5 text-sm font-semibold transition ${
                        severity === opt.value
                          ? `${opt.bg} ${opt.color} ring-2 ring-offset-1 ring-current`
                          : `${opt.bg} ${opt.color}`
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="აღწერეთ პრობლემა დეტალურად..."
                  rows={5}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none resize-y disabled:opacity-50"
                />
              </div>

              {/* Video preview */}
              {videoUrl && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">Recording Preview</label>
                  <video
                    src={videoUrl}
                    controls
                    className="w-full max-h-48 rounded-xl border border-zinc-200 bg-zinc-900"
                  />
                </div>
              )}

              {/* Capture summary badges */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                  {captured.actionLog.length} actions
                </span>
                {consoleErrors > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    {consoleErrors} console errors
                  </span>
                )}
                {failedRequests > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {failedRequests} failed requests
                  </span>
                )}
                {captured.videoBlob && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polygon points="23 7 16 12 23 17 23 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/></svg>
                    Video recorded
                  </span>
                )}
              </div>

              {/* Error */}
              {phase === "error" && error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {phase !== "done" && (
          <div className="flex items-center justify-end gap-3 border-t border-zinc-200 px-6 py-4">
            {isSubmitting && (
              <span className="mr-auto text-sm text-zinc-500 flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-teal-700" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {PHASE_LABELS[phase]}
              </span>
            )}
            <button
              type="button"
              onClick={handleDiscard}
              disabled={isSubmitting}
              className="rounded-2xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !description.trim()}
              className="rounded-2xl bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 transition disabled:opacity-50"
            >
              {phase === "error" ? "Retry" : "გაგზავნა"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
