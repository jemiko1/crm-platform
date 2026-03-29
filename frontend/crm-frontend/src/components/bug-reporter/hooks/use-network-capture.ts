"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface NetworkEntry {
  timestamp: number;
  method: string;
  url: string;
  requestBody?: unknown;
  status: number;
  statusText: string;
  duration: number;
  responseBody?: unknown;
  error?: string;
  flagged: boolean;
}

const MAX_ENTRIES = 300;
const IGNORE_PATTERNS = ["/v1/bug-reports", "/analytics", "/telemetry"];
function truncate(val: unknown, max: number): unknown {
  if (typeof val === "string") return val.slice(0, max);
  try {
    const s = JSON.stringify(val);
    return s.length > max ? s.slice(0, max) + "…" : val;
  } catch {
    return "[unserializable]";
  }
}

function shouldIgnore(url: string): boolean {
  return IGNORE_PATTERNS.some((p) => url.includes(p));
}

export function useNetworkCapture() {
  const entries = useRef<NetworkEntry[]>([]);
  const cleanups = useRef<Array<() => void>>([]);
  const [active, setActive] = useState(false);

  const push = (entry: NetworkEntry) => {
    if (entries.current.length >= MAX_ENTRIES) entries.current.shift();
    entries.current.push(entry);
  };

  const start = useCallback(() => {
    entries.current = [];
    const fns: Array<() => void> = [];

    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      if (shouldIgnore(url)) return originalFetch(input, init);

      const method = init?.method || "GET";
      const t0 = Date.now();
      let requestBody: unknown = undefined;
      if (init?.body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
        try {
          requestBody =
            typeof init.body === "string"
              ? truncate(init.body, 1024)
              : "[FormData/Blob]";
        } catch {
          requestBody = undefined;
        }
      }

      try {
        const res = await originalFetch(input, init);
        const duration = Date.now() - t0;
        const flagged = res.status >= 400 || duration > 3000;

        let responseBody: unknown = undefined;
        if (res.status >= 400) {
          try {
            const clone = res.clone();
            const text = await clone.text();
            responseBody = truncate(text, 2048);
          } catch {
            /* ignore */
          }
        }

        push({
          timestamp: t0,
          method: method.toUpperCase(),
          url,
          requestBody,
          status: res.status,
          statusText: res.statusText,
          duration,
          responseBody,
          flagged,
        });

        return res;
      } catch (err) {
        push({
          timestamp: t0,
          method: method.toUpperCase(),
          url,
          requestBody,
          status: 0,
          statusText: "",
          duration: Date.now() - t0,
          error: (err as Error).message,
          flagged: true,
        });
        throw err;
      }
    };
    fns.push(() => {
      window.fetch = originalFetch;
    });

    const OrigXHR = window.XMLHttpRequest;
    const origOpen = OrigXHR.prototype.open;
    const origSend = OrigXHR.prototype.send;

    OrigXHR.prototype.open = function (method: string, url: string | URL) {
      (this as any).__bugMeta = {
        method: method.toUpperCase(),
        url: String(url),
        t0: 0,
      };
      return origOpen.apply(this, arguments as any);
    };

    OrigXHR.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      const meta = (this as any).__bugMeta;
      if (!meta || shouldIgnore(meta.url)) {
        return origSend.apply(this, arguments as any);
      }

      meta.t0 = Date.now();
      const requestBody =
        typeof body === "string" ? truncate(body, 1024) : undefined;

      this.addEventListener("loadend", () => {
        const duration = Date.now() - meta.t0;
        const flagged = this.status >= 400 || duration > 3000;

        let responseBody: unknown = undefined;
        if (this.status >= 400) {
          try {
            responseBody = truncate(this.responseText, 2048);
          } catch {
            /* ignore */
          }
        }

        push({
          timestamp: meta.t0,
          method: meta.method,
          url: meta.url,
          requestBody,
          status: this.status,
          statusText: this.statusText,
          duration,
          responseBody,
          flagged,
        });
      });

      this.addEventListener("error", () => {
        push({
          timestamp: meta.t0,
          method: meta.method,
          url: meta.url,
          requestBody,
          status: 0,
          statusText: "",
          duration: Date.now() - meta.t0,
          error: "Network error",
          flagged: true,
        });
      });

      return origSend.apply(this, arguments as any);
    };

    fns.push(() => {
      OrigXHR.prototype.open = origOpen;
      OrigXHR.prototype.send = origSend;
    });

    cleanups.current = fns;
    setActive(true);
  }, []);

  const stop = useCallback((): NetworkEntry[] => {
    cleanups.current.forEach((fn) => fn());
    cleanups.current = [];
    setActive(false);
    return [...entries.current];
  }, []);

  useEffect(() => {
    return () => {
      cleanups.current.forEach((fn) => fn());
      cleanups.current = [];
    };
  }, []);

  return { active, start, stop };
}
