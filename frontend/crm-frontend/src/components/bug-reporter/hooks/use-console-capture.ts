"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface ConsoleEntry {
  timestamp: number;
  level: "error" | "warn" | "log" | "info";
  message: string;
  stack?: string;
  args: unknown[];
}

const MAX_ENTRIES = 200;

function safeSerialize(val: unknown, depth = 0): unknown {
  if (depth > 3) return "[max depth]";
  if (val === null || val === undefined) return val;
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") return val;
  if (val instanceof Error) return { name: val.name, message: val.message, stack: val.stack };
  if (Array.isArray(val)) return val.slice(0, 10).map((v) => safeSerialize(v, depth + 1));
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const key of Object.keys(val as Record<string, unknown>)) {
      if (count++ > 20) break;
      out[key] = safeSerialize((val as Record<string, unknown>)[key], depth + 1);
    }
    return out;
  }
  return String(val);
}

export function useConsoleCapture() {
  const entries = useRef<ConsoleEntry[]>([]);
  const originals = useRef<Record<string, (...args: unknown[]) => void>>({});
  const cleanups = useRef<Array<() => void>>([]);
  const [active, setActive] = useState(false);

  const push = (entry: ConsoleEntry) => {
    if (entries.current.length >= MAX_ENTRIES) entries.current.shift();
    entries.current.push(entry);
  };

  const start = useCallback(() => {
    entries.current = [];
    const fns: Array<() => void> = [];

    for (const level of ["error", "warn", "log", "info"] as const) {
      const original = console[level].bind(console);
      originals.current[level] = original;

      console[level] = (...args: unknown[]) => {
        original(...args);
        const first = args[0];
        const message =
          first instanceof Error
            ? first.message
            : typeof first === "string"
              ? first
              : String(first);
        push({
          timestamp: Date.now(),
          level,
          message: message.slice(0, 2000),
          stack: first instanceof Error ? first.stack : undefined,
          args: args.map((a) => safeSerialize(a)),
        });
      };

      fns.push(() => {
        console[level] = original as any;
      });
    }

    const onError = (e: ErrorEvent) => {
      push({
        timestamp: Date.now(),
        level: "error",
        message: e.message?.slice(0, 2000) || "Unknown error",
        stack: e.error?.stack,
        args: [{ filename: e.filename, lineno: e.lineno, colno: e.colno }],
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason;
      push({
        timestamp: Date.now(),
        level: "error",
        message:
          reason instanceof Error
            ? reason.message.slice(0, 2000)
            : String(reason).slice(0, 2000),
        stack: reason instanceof Error ? reason.stack : undefined,
        args: [{ type: "unhandledrejection" }],
      });
    };

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    fns.push(
      () => window.removeEventListener("error", onError),
      () => window.removeEventListener("unhandledrejection", onRejection),
    );

    cleanups.current = fns;
    setActive(true);
  }, []);

  const stop = useCallback((): ConsoleEntry[] => {
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
