"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useBugReportSubmit, type SubmitPhase } from "./hooks/use-bug-report-submit";
import { useI18nContext } from "@/contexts/i18n-context";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
type Category = "BUG" | "IMPROVEMENT" | "UI_ISSUE" | "PERFORMANCE";

interface CapturedData {
  actionLog: unknown[];
  consoleLog: unknown[];
  networkLog: unknown[];
  videoBlob: Blob | null;
  screenshotFiles: File[];
}

interface BugReporterModalProps {
  open: boolean;
  onClose: () => void;
  category: Category;
  captured: CapturedData;
}

const SEVERITY_STYLES: { value: Severity; i18nKey: string; fallback: string; color: string; bg: string }[] = [
  { value: "CRITICAL", i18nKey: "bugReporter.severityCritical", fallback: "Critical", color: "text-red-700", bg: "bg-red-100 border-red-300 hover:bg-red-200" },
  { value: "HIGH", i18nKey: "bugReporter.severityHigh", fallback: "High", color: "text-orange-700", bg: "bg-orange-100 border-orange-300 hover:bg-orange-200" },
  { value: "MEDIUM", i18nKey: "bugReporter.severityMedium", fallback: "Medium", color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-300 hover:bg-yellow-200" },
  { value: "LOW", i18nKey: "bugReporter.severityLow", fallback: "Low", color: "text-green-700", bg: "bg-green-100 border-green-300 hover:bg-green-200" },
];

const CATEGORY_KEYS: { value: Category; i18nKey: string; fallback: string }[] = [
  { value: "BUG", i18nKey: "bugReporter.categoryBug", fallback: "Bug" },
  { value: "IMPROVEMENT", i18nKey: "bugReporter.categoryImprovement", fallback: "Improvement" },
  { value: "UI_ISSUE", i18nKey: "bugReporter.categoryUiIssue", fallback: "UI Issue" },
  { value: "PERFORMANCE", i18nKey: "bugReporter.categoryPerformance", fallback: "Performance" },
];

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
  const [screenshots, setScreenshots] = useState<File[]>(captured.screenshotFiles ?? []);
  const [screenshotPreviews, setScreenshotPreviews] = useState<string[]>([]);

  const { t } = useI18nContext();
  const { phase, error, result, submit, reset } = useBugReportSubmit();

  const phaseLabels: Record<SubmitPhase, string> = {
    idle: "",
    uploading: t("bugReporter.phaseUploading", "Submitting report..."),
    processing: t("bugReporter.phaseProcessing", "Processing..."),
    done: "",
    error: "",
  };

  const handleDiscard = useCallback(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(null);
    }
    screenshotPreviews.forEach((u) => URL.revokeObjectURL(u));
    setScreenshotPreviews([]);
    setScreenshots([]);
    setDescription("");
    setSeverity("MEDIUM");
    reset();
    onClose();
  }, [onClose, reset, videoUrl, screenshotPreviews]);

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

  // Generate previews when screenshots change
  useEffect(() => {
    const urls = screenshots.map((f) => URL.createObjectURL(f));
    setScreenshotPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [screenshots]);

  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase === "idle") handleDiscard();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open, phase, handleDiscard]);

  const handleAddScreenshots = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : [];
      if (files.length > 0) {
        setScreenshots((prev) => [...prev, ...files]);
      }
    };
    input.click();
  }, []);

  const handleRemoveScreenshot = useCallback((index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
      screenshots,
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
            {phase === "done" ? t("bugReporter.reportSubmitted", "Report Submitted") : t("bugReporter.submitBugReport", "Submit Bug Report")}
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
              <p className="text-zinc-700 font-medium">{t("bugReporter.submitSuccess", "Bug report submitted successfully!")}</p>
              {result.githubIssueUrl && (
                <a
                  href={result.githubIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-sm text-teal-700 underline hover:text-teal-900"
                >
                  {t("bugReporter.viewGithubIssue", "View GitHub Issue")}
                </a>
              )}
              {!result.githubIssueUrl && (
                <p className="text-xs text-zinc-500">
                  {t("bugReporter.githubProcessing", "GitHub issue creation is processing in the background.")}
                </p>
              )}
              <button
                type="button"
                onClick={handleDiscard}
                className="mt-4 rounded-2xl bg-teal-800 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 transition"
              >
                {t("common.close", "Close")}
              </button>
            </div>
          ) : (
            <>
              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">{t("bugReporter.category", "Category")}</label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_KEYS.map((opt) => (
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
                      {t(opt.i18nKey, opt.fallback)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">{t("bugReporter.severity", "Severity")}</label>
                <div className="flex flex-wrap gap-2">
                  {SEVERITY_STYLES.map((opt) => (
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
                      {t(opt.i18nKey, opt.fallback)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-2">{t("common.description", "Description")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isSubmitting}
                  placeholder={t("bugReporter.descriptionPlaceholder", "Describe the problem in detail...")}
                  rows={4}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 outline-none resize-y disabled:opacity-50"
                />
              </div>

              {/* Video preview */}
              {videoUrl && (
                <div>
                  <label className="block text-sm font-medium text-zinc-700 mb-2">{t("bugReporter.recordingPreview", "Recording Preview")}</label>
                  <video
                    src={videoUrl}
                    controls
                    className="w-full max-h-48 rounded-xl border border-zinc-200 bg-zinc-900"
                  />
                </div>
              )}

              {/* Screenshots */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-zinc-700">
                    {t("bugReporter.screenshots", "Screenshots")} {screenshots.length > 0 && `(${screenshots.length})`}
                  </label>
                  {!isSubmitting && (
                    <button
                      type="button"
                      onClick={handleAddScreenshots}
                      className="text-xs font-medium text-teal-700 hover:text-teal-900 transition"
                    >
                      {t("bugReporter.addImages", "+ Add Images")}
                    </button>
                  )}
                </div>
                {screenshots.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2">
                    {screenshotPreviews.map((url, i) => (
                      <div key={i} className="relative group">
                        <img
                          src={url}
                          alt={`${t("bugReporter.screenshots", "Screenshot")} ${i + 1}`}
                          className="w-full h-24 object-cover rounded-lg border border-zinc-200"
                        />
                        {!isSubmitting && (
                          <button
                            type="button"
                            onClick={() => handleRemoveScreenshot(i)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-zinc-900/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  !isSubmitting && (
                    <button
                      type="button"
                      onClick={handleAddScreenshots}
                      className="w-full rounded-xl border-2 border-dashed border-zinc-200 px-4 py-4 text-center hover:border-zinc-300 transition"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="mx-auto mb-1 text-zinc-400" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span className="text-xs text-zinc-500">{t("bugReporter.clickToAddScreenshots", "Click to add screenshots")}</span>
                    </button>
                  )
                )}
              </div>

              {/* Capture summary badges */}
              {(captured.actionLog.length > 0 || consoleErrors > 0 || failedRequests > 0 || captured.videoBlob) && (
                <div className="flex flex-wrap gap-2">
                  {captured.actionLog.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      {captured.actionLog.length} {t("bugReporter.actions", "actions")}
                    </span>
                  )}
                  {consoleErrors > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-600">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                      {consoleErrors} {t("bugReporter.consoleErrors", "console errors")}
                    </span>
                  )}
                  {failedRequests > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {failedRequests} {t("bugReporter.failedRequests", "failed requests")}
                    </span>
                  )}
                  {captured.videoBlob && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><polygon points="23 7 16 12 23 17 23 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2" stroke="currentColor" strokeWidth="2"/></svg>
                      {t("bugReporter.videoRecorded", "Video recorded")}
                    </span>
                  )}
                </div>
              )}

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
                {phaseLabels[phase]}
              </span>
            )}
            <button
              type="button"
              onClick={handleDiscard}
              disabled={isSubmitting}
              className="rounded-2xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 transition disabled:opacity-50"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting || !description.trim()}
              className="rounded-2xl bg-teal-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-900 transition disabled:opacity-50"
            >
              {phase === "error" ? t("common.retry", "Retry") : t("bugReporter.submit", "Submit")}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
