"use client";

import { useState, useCallback } from "react";
import { apiPostFormData } from "@/lib/api";

export type SubmitPhase = "idle" | "uploading" | "processing" | "done" | "error";

interface SubmitPayload {
  description: string;
  severity: string;
  category: string;
  pageUrl: string;
  browserInfo: Record<string, unknown>;
  actionLog: unknown[];
  consoleLog: unknown[];
  networkLog: unknown[];
  screenshots?: unknown[];
}

interface SubmitResult {
  id: string;
  githubIssueUrl?: string | null;
  status: string;
}

export function useBugReportSubmit() {
  const [phase, setPhase] = useState<SubmitPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const submit = useCallback(
    async (payload: SubmitPayload, videoBlob: Blob | null, screenshotFiles?: File[]) => {
      setPhase("uploading");
      setError(null);
      setResult(null);

      try {
        const fd = new FormData();
        fd.append("data", JSON.stringify(payload));
        if (videoBlob) {
          fd.append("video", videoBlob, "recording.webm");
        }
        if (screenshotFiles) {
          for (const file of screenshotFiles) {
            fd.append("screenshots", file, file.name);
          }
        }

        const res = await apiPostFormData<SubmitResult>(
          "/v1/bug-reports",
          fd,
        );

        setResult(res);
        setPhase("done");
        return res;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Submission failed";
        setError(msg);
        setPhase("error");
        return null;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setError(null);
    setResult(null);
  }, []);

  return { phase, error, result, submit, reset };
}
