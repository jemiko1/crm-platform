import { useCallback, useEffect, useRef, useState } from "react";
import { sipService } from "../sip-service";
import type { BreakSession, TelephonyExtensionInfo } from "../../shared/types";

/**
 * Coordinates the Break lifecycle between the softphone UI and SIP stack.
 *
 * Invariant: while `active` is non-null, the SIP stack MUST be
 * unregistered. Keeping a registered SIP during break would defeat the
 * whole point — Asterisk would keep queuing calls to a break-taking
 * operator. The transition order is load-bearing:
 *
 *   start():  backend POST → (success) → sipService.unregister() → setActive(session)
 *   end():    backend POST → (success) → fetch creds → sipService.register() → setActive(null)
 *
 * If the SIP transition throws mid-way, `active` still reflects the
 * backend state (source of truth) — the user is on-break per CRM even
 * if SIP isn't fully torn down. The cron auto-close safety net at
 * COMPANY_WORK_END_HOUR + 12h hard cap picks up any ghost session.
 */
export interface UseBreakResult {
  active: BreakSession | null;
  loading: boolean;
  error: string | null;
  /**
   * Start a break. Returns true on success. On success, SIP has been
   * unregistered and the Break modal should render. On failure,
   * `error` is populated (e.g. "on an active call", "no extension").
   */
  start: () => Promise<boolean>;
  /**
   * End the current break. Resumes SIP using the cached extension info
   * from the last successful login / session-restore. Returns true on
   * success. Idempotent — calling end() with no active break is a no-op
   * that returns true.
   */
  end: (extForReRegister: TelephonyExtensionInfo | null) => Promise<boolean>;
  /**
   * Clear `active` without calling the backend. Used by logout path
   * where the backend side is being torn down anyway; we don't want
   * to leave the modal up while the login page renders.
   */
  reset: () => void;
}

type IpcResult =
  | { ok: true; data: any }
  | { ok: false; status?: number; reason: string };

export function useBreak(enabled: boolean): UseBreakResult {
  const [active, setActive] = useState<BreakSession | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guard against overlapping start/end calls — e.g. operator spam-
  // clicking Resume during network latency. `inFlight` short-circuits
  // any second call until the first settles. Use a ref so the guard
  // survives re-renders without triggering them.
  const inFlight = useRef(false);

  /**
   * Cold-start / session-restore path: ask backend whether the current
   * user already has an active break. If yes, render the modal and
   * (critically) do NOT let useAuth register SIP. The caller handles
   * that coordination — this hook just publishes the state.
   */
  useEffect(() => {
    if (!enabled) {
      setActive(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res: IpcResult = await window.crmPhone.break.myCurrent();
        if (cancelled) return;
        if (res.ok && res.data) {
          setActive({
            id: res.data.id,
            startedAt: res.data.startedAt,
            extension: res.data.extension,
          });
        }
      } catch {
        // Network hiccup on restore — treat as "no active break" and
        // proceed with normal login flow. Next user action will
        // surface a fresh error if the backend is truly down.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const start = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const res: IpcResult = await window.crmPhone.break.start();
      if (!res.ok) {
        setError(res.reason || "Failed to start break");
        return false;
      }
      // Backend accepted. Now tear down SIP — this is the moment the
      // operator is "actually on break" from Asterisk's perspective.
      await sipService.unregister();
      setActive({
        id: res.data.id,
        startedAt: res.data.startedAt,
        extension: res.data.extension,
      });
      return true;
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  const end = useCallback(
    async (extForReRegister: TelephonyExtensionInfo | null): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setLoading(true);
      setError(null);
      try {
        const res: IpcResult = await window.crmPhone.break.end();
        if (!res.ok) {
          setError(res.reason || "Failed to end break");
          return false;
        }
        // Backend closed the session (or returned null — idempotent).
        // Resume SIP if we have fresh credentials; if not, the caller
        // is responsible for fetching them. Most callers will pass the
        // creds they just obtained.
        setActive(null);
        if (extForReRegister) {
          await sipService.register(extForReRegister);
        }
        return true;
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setActive(null);
    setError(null);
  }, []);

  return { active, loading, error, start, end, reset };
}
