"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

// ── Types ──────────────────────────────────────────────

export type ModalType = "building" | "client" | "employee" | "workOrder" | "incident" | "messenger";

export interface StackEntry {
  type: ModalType;
  id: string;
  key: string;
}

export interface ModalContextValue {
  openModal: (type: ModalType, id: string) => void;
  closeModal: () => void;
  closeAllModals: () => void;
  stack: StackEntry[];
  /** Dispatch a lightweight refresh event so modals/pages can re-fetch data */
  emitRefresh: () => void;
  /** Subscribe to refresh events; returns unsubscribe fn */
  onRefresh: (cb: () => void) => () => void;
}

const ModalContext = createContext<ModalContextValue>({
  openModal: () => {},
  closeModal: () => {},
  closeAllModals: () => {},
  stack: [],
  emitRefresh: () => {},
  onRefresh: () => () => {},
});

export const useModalContext = () => useContext(ModalContext);

// ── Helpers ────────────────────────────────────────────

const HISTORY_STATE_KEY = "__modalStack";

let _keyCounter = 0;
function nextKey(type: ModalType, id: string) {
  return `${type}-${id}-${++_keyCounter}`;
}

function stackTopToQueryString(entry: StackEntry | undefined): string {
  if (!entry) return "";
  return `${entry.type}=${encodeURIComponent(entry.id)}`;
}

/** Read a single modal entry from URL search params (for initial hydration) */
export function readEntryFromParams(params: URLSearchParams): StackEntry | null {
  const modalTypes: ModalType[] = ["messenger", "incident", "workOrder", "employee", "client", "building"];
  for (const type of modalTypes) {
    const value = params.get(type);
    if (value) {
      return { type, id: value, key: nextKey(type, value) };
    }
  }
  return null;
}

// ── Provider Component ─────────────────────────────────

export function ModalStackProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<StackEntry[]>([]);
  const stackRef = useRef<StackEntry[]>([]);
  stackRef.current = stack;

  const historyDepthRef = useRef(0);
  const handlingPopstateRef = useRef(false);

  // Lightweight refresh event bus
  const refreshListenersRef = useRef<Set<() => void>>(new Set());

  const emitRefresh = useCallback(() => {
    refreshListenersRef.current.forEach((cb) => {
      try { cb(); } catch {}
    });
  }, []);

  const onRefresh = useCallback((cb: () => void) => {
    refreshListenersRef.current.add(cb);
    return () => { refreshListenersRef.current.delete(cb); };
  }, []);

  // ── URL Sync helpers ──────────────────────────────────

  const buildUrl = useCallback((topEntry: StackEntry | undefined) => {
    const base = window.location.pathname;
    if (!topEntry) return base;
    return `${base}?${stackTopToQueryString(topEntry)}`;
  }, []);

  const syncUrlToStack = useCallback((newStack: StackEntry[], push: boolean) => {
    if (handlingPopstateRef.current) return;
    const top = newStack[newStack.length - 1];
    const url = buildUrl(top);
    const statePayload = { [HISTORY_STATE_KEY]: newStack.map(e => ({ type: e.type, id: e.id, key: e.key })) };

    if (push && newStack.length > 0) {
      window.history.pushState(statePayload, "", url);
      historyDepthRef.current += 1;
    } else {
      window.history.replaceState(statePayload, "", url);
    }
  }, [buildUrl]);

  // ── Popstate handler (browser back/forward) ───────────

  useEffect(() => {
    function handlePopstate(event: PopStateEvent) {
      handlingPopstateRef.current = true;

      const stateStack = event.state?.[HISTORY_STATE_KEY];

      if (Array.isArray(stateStack)) {
        setStack(stateStack);
        stackRef.current = stateStack;
        if (historyDepthRef.current > 0) historyDepthRef.current -= 1;
      } else {
        setStack([]);
        stackRef.current = [];
        historyDepthRef.current = 0;
      }

      requestAnimationFrame(() => {
        handlingPopstateRef.current = false;
      });
    }

    window.addEventListener("popstate", handlePopstate);
    return () => window.removeEventListener("popstate", handlePopstate);
  }, []);

  // ── Stack operations ──────────────────────────────────

  const openModal = useCallback((type: ModalType, id: string) => {
    const current = stackRef.current;
    const existingIdx = current.findIndex(e => e.type === type && e.id === id);

    let newStack: StackEntry[];
    if (existingIdx >= 0) {
      // Bring to front
      newStack = [...current];
      const [moved] = newStack.splice(existingIdx, 1);
      newStack.push(moved);
      setStack(newStack);
      stackRef.current = newStack;
      syncUrlToStack(newStack, false);
    } else {
      const entry: StackEntry = { type, id, key: nextKey(type, id) };
      newStack = [...current, entry];
      setStack(newStack);
      stackRef.current = newStack;
      syncUrlToStack(newStack, true);
    }
  }, [syncUrlToStack]);

  const closeModal = useCallback(() => {
    const current = stackRef.current;
    if (current.length === 0) return;

    const newStack = current.slice(0, -1);
    setStack(newStack);
    stackRef.current = newStack;

    if (historyDepthRef.current > 0) {
      historyDepthRef.current -= 1;
      window.history.back();
    } else {
      syncUrlToStack(newStack, false);
    }
  }, [syncUrlToStack]);

  const closeAllModals = useCallback(() => {
    const depth = historyDepthRef.current;
    setStack([]);
    stackRef.current = [];
    historyDepthRef.current = 0;

    if (depth > 0) {
      window.history.go(-depth);
    } else {
      syncUrlToStack([], false);
    }
  }, [syncUrlToStack]);

  // ── Expose to ModalManager for URL-based init ─────────

  /** Called by ModalManager on mount to seed the stack from the URL */
  const _seedFromUrl = useCallback((entry: StackEntry) => {
    if (stackRef.current.length > 0) return; // Already has entries
    const newStack = [entry];
    setStack(newStack);
    stackRef.current = newStack;
    syncUrlToStack(newStack, false);
  }, [syncUrlToStack]);

  /** Called by ModalManager when it restores from history.state */
  const _restoreFromState = useCallback((entries: StackEntry[]) => {
    if (stackRef.current.length > 0) return;
    setStack(entries);
    stackRef.current = entries;
  }, []);

  /** Called by ModalManager when Next.js searchParams change externally */
  const _syncFromSearchParams = useCallback((entry: StackEntry) => {
    if (handlingPopstateRef.current) return;

    const currentTop = stackRef.current[stackRef.current.length - 1];
    if (currentTop && currentTop.type === entry.type && currentTop.id === entry.id) {
      return;
    }

    const existingIdx = stackRef.current.findIndex(e => e.type === entry.type && e.id === entry.id);
    let newStack: StackEntry[];
    if (existingIdx >= 0) {
      newStack = [...stackRef.current];
      const [moved] = newStack.splice(existingIdx, 1);
      newStack.push(moved);
    } else {
      newStack = [...stackRef.current, entry];
    }

    setStack(newStack);
    stackRef.current = newStack;
    syncUrlToStack(newStack, false);
  }, [syncUrlToStack]);

  /** Called when searchParams have no modal params */
  const _clearStack = useCallback(() => {
    if (stackRef.current.length > 0) {
      setStack([]);
      stackRef.current = [];
      historyDepthRef.current = 0;
    }
  }, []);

  const contextValue: ModalContextValue = React.useMemo(
    () => ({ openModal, closeModal, closeAllModals, stack, emitRefresh, onRefresh }),
    [openModal, closeModal, closeAllModals, stack, emitRefresh, onRefresh]
  );

  return (
    <ModalContext.Provider value={contextValue}>
      <ModalStackInternalsContext.Provider value={{ _seedFromUrl, _restoreFromState, _syncFromSearchParams, _clearStack, handlingPopstateRef }}>
        {children}
      </ModalStackInternalsContext.Provider>
    </ModalContext.Provider>
  );
}

// Internal context for ModalManager URL sync (not for public use)
interface ModalStackInternals {
  _seedFromUrl: (entry: StackEntry) => void;
  _restoreFromState: (entries: StackEntry[]) => void;
  _syncFromSearchParams: (entry: StackEntry) => void;
  _clearStack: () => void;
  handlingPopstateRef: React.RefObject<boolean>;
}

const ModalStackInternalsContext = createContext<ModalStackInternals>({
  _seedFromUrl: () => {},
  _restoreFromState: () => {},
  _syncFromSearchParams: () => {},
  _clearStack: () => {},
  handlingPopstateRef: { current: false },
});

export const useModalStackInternals = () => useContext(ModalStackInternalsContext);
