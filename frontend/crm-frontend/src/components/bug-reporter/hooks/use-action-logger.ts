"use client";

import { useRef, useCallback, useState, useEffect } from "react";

interface ActionEntry {
  timestamp: number;
  type: "click" | "input" | "change" | "scroll" | "navigation" | "focus";
  target: {
    tagName: string;
    id: string;
    className: string;
    textContent: string;
    selector: string;
    rect: { x: number; y: number; width: number; height: number };
  };
  value?: string;
  url?: string;
}

const MAX_ENTRIES = 500;

function uniqueSelector(el: Element): string {
  if (el.id) return `#${el.id}`;
  const tag = el.tagName.toLowerCase();
  const parent = el.parentElement;
  if (!parent) return tag;
  const siblings = Array.from(parent.children).filter(
    (c) => c.tagName === el.tagName,
  );
  if (siblings.length === 1) return `${uniqueSelector(parent)} > ${tag}`;
  const idx = siblings.indexOf(el) + 1;
  return `${uniqueSelector(parent)} > ${tag}:nth-child(${idx})`;
}

function targetInfo(el: Element) {
  const rect = el.getBoundingClientRect();
  return {
    tagName: el.tagName.toLowerCase(),
    id: el.id || "",
    className:
      typeof el.className === "string" ? el.className.slice(0, 200) : "",
    textContent: (el.textContent || "").trim().slice(0, 100),
    selector: uniqueSelector(el).slice(0, 300),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
  };
}

function isPasswordField(el: Element): boolean {
  return (
    el.tagName === "INPUT" &&
    (el as HTMLInputElement).type === "password"
  );
}

export function useActionLogger() {
  const log = useRef<ActionEntry[]>([]);
  const cleanups = useRef<Array<() => void>>([]);
  const [active, setActive] = useState(false);

  const push = (entry: ActionEntry) => {
    if (log.current.length >= MAX_ENTRIES) log.current.shift();
    log.current.push(entry);
  };

  const start = useCallback(() => {
    log.current = [];
    const fns: Array<() => void> = [];

    const onClick = (e: MouseEvent) => {
      const el = e.target as Element;
      if (!el) return;
      push({
        timestamp: Date.now(),
        type: "click",
        target: targetInfo(el),
      });
    };

    const onInput = (e: Event) => {
      const el = e.target as Element;
      if (!el) return;
      push({
        timestamp: Date.now(),
        type: "input",
        target: targetInfo(el),
        value: isPasswordField(el) ? "***" : (el as HTMLInputElement).value?.slice(0, 200),
      });
    };

    const onChange = (e: Event) => {
      const el = e.target as Element;
      if (!el) return;
      push({
        timestamp: Date.now(),
        type: "change",
        target: targetInfo(el),
        value: isPasswordField(el) ? "***" : (el as HTMLInputElement).value?.slice(0, 200),
      });
    };

    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        push({
          timestamp: Date.now(),
          type: "scroll",
          target: {
            tagName: "window",
            id: "",
            className: "",
            textContent: "",
            selector: "window",
            rect: { x: 0, y: Math.round(window.scrollY), width: window.innerWidth, height: window.innerHeight },
          },
        });
      }, 300);
    };

    const onPopstate = () => {
      push({
        timestamp: Date.now(),
        type: "navigation",
        target: {
          tagName: "window",
          id: "",
          className: "",
          textContent: "",
          selector: "window",
          rect: { x: 0, y: 0, width: 0, height: 0 },
        },
        url: window.location.href,
      });
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("popstate", onPopstate);

    fns.push(
      () => document.removeEventListener("click", onClick, true),
      () => document.removeEventListener("input", onInput, true),
      () => document.removeEventListener("change", onChange, true),
      () => document.removeEventListener("scroll", onScroll, true),
      () => window.removeEventListener("popstate", onPopstate),
    );

    cleanups.current = fns;
    setActive(true);
  }, []);

  const stop = useCallback((): ActionEntry[] => {
    cleanups.current.forEach((fn) => fn());
    cleanups.current = [];
    setActive(false);
    return [...log.current];
  }, []);

  useEffect(() => {
    return () => {
      cleanups.current.forEach((fn) => fn());
      cleanups.current = [];
    };
  }, []);

  return { active, start, stop };
}
