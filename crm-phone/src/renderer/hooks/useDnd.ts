import { useCallback, useEffect, useRef, useState } from "react";
import type { DndState } from "../../shared/types";

/**
 * Diagnostic log helper. Writes to the renderer devtools console AND
 * the main-process log file (%APPDATA%/crm-phone/crm-phone-debug.log)
 * so post-mortem debugging doesn't need the user to have devtools
 * open. Introduced in v1.10.2 after a field report that the DND click
 * silently failed with no visible log trail.
 */
function dlog(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[DND]", ...args);
  window.crmPhone?.log?.("info", "[DND]", ...args);
}
function derr(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.error("[DND]", ...args);
  window.crmPhone?.log?.("error", "[DND]", ...args);
}

/**
 * DND (do-not-disturb) state + toggle. Semantics:
 *  - Flipping DND does NOT touch SIP — the softphone stays registered.
 *    Only queue dispatch is paused via AMI QueuePause.
 *  - State is not stored in the CRM DB (Silent Override Risk #20).
 *    Backend reads it from the in-memory AMI cache. Cold start reads
 *    it too, so if the user had DND on and restarted the softphone,
 *    the toggle reflects reality.
 *  - If AMI is down at the moment of enable/disable, the backend call
 *    fails (400) and the UI surfaces `error`. We don't optimistically
 *    flip local state on failure — lying would be worse than a red
 *    toast.
 */
export interface UseDndResult {
  enabled: boolean;
  loading: boolean;
  error: string | null;
  enable: () => Promise<boolean>;
  disable: () => Promise<boolean>;
  /** Forget local state without hitting the backend — for logout. */
  reset: () => void;
}

type IpcResult =
  | { ok: true; data: any }
  | { ok: false; status?: number; reason: string };

export function useDnd(enabled: boolean): UseDndResult {
  const [isOn, setIsOn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Prevent two toggle clicks during a slow AMI round-trip from
  // racing each other and inverting the state twice.
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setIsOn(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (!window.crmPhone?.dnd?.myState) {
          derr("myState: window.crmPhone.dnd is missing — preload mismatch?");
          return;
        }
        dlog("hydrating DND state from backend…");
        const res: IpcResult = await window.crmPhone.dnd.myState();
        if (cancelled) return;
        if (res.ok && res.data) {
          const state = res.data as DndState;
          dlog("hydrated:", state);
          setIsOn(!!state.enabled);
        } else if (!res.ok) {
          derr("hydration returned not-ok:", res);
          // Surface the backend's reason so the user knows why the UI
          // says "off" — either their extension is missing or AMI is
          // unreachable. Fixes the v1.10.1 silent-fail bug.
          setError(res.reason || "Could not read DND state");
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        derr("hydration threw:", msg);
        setError(msg);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const toggle = useCallback(async (target: boolean): Promise<boolean> => {
    if (inFlight.current) {
      dlog(`toggle(${target}): already in-flight, skipping`);
      return false;
    }
    inFlight.current = true;
    setLoading(true);
    setError(null);
    dlog(`toggle(${target}): starting`);
    try {
      if (!window.crmPhone?.dnd?.enable || !window.crmPhone?.dnd?.disable) {
        const msg =
          "window.crmPhone.dnd.enable/disable is missing. This usually " +
          "means the app is running an older preload bundle than the " +
          "renderer expects. Reinstall the softphone to fix.";
        derr(msg);
        setError(msg);
        return false;
      }
      const res: IpcResult = target
        ? await window.crmPhone.dnd.enable()
        : await window.crmPhone.dnd.disable();
      dlog(`toggle(${target}): backend returned`, res);
      if (!res.ok) {
        setError(
          res.reason || `Failed to ${target ? "enable" : "disable"} DND`,
        );
        return false;
      }
      setIsOn(target);
      return true;
    } catch (err) {
      // Before v1.10.2 this error propagated out of the async click
      // handler into React's unhandled-rejection void — the user saw
      // no visible feedback. We now catch and surface it.
      const msg = err instanceof Error ? err.message : String(err);
      derr(`toggle(${target}) threw:`, msg);
      setError(msg);
      return false;
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  const enable = useCallback(() => toggle(true), [toggle]);
  const disable = useCallback(() => toggle(false), [toggle]);

  const reset = useCallback(() => {
    setIsOn(false);
    setError(null);
  }, []);

  return { enabled: isOn, loading, error, enable, disable, reset };
}
