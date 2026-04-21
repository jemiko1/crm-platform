import { useCallback, useEffect, useRef, useState } from "react";
import type { DndState } from "../../shared/types";

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
        const res: IpcResult = await window.crmPhone.dnd.myState();
        if (cancelled) return;
        if (res.ok && res.data) {
          const state = res.data as DndState;
          setIsOn(!!state.enabled);
        }
      } catch {
        // Silently default to off — next toggle surfaces real error.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const toggle = useCallback(async (target: boolean): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res: IpcResult = target
        ? await window.crmPhone.dnd.enable()
        : await window.crmPhone.dnd.disable();
      if (!res.ok) {
        setError(res.reason || `Failed to ${target ? "enable" : "disable"} DND`);
        return false;
      }
      setIsOn(target);
      return true;
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
