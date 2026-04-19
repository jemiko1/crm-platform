"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiPost } from "@/lib/api";

const BRIDGE_URL = "http://127.0.0.1:19876";
const POLL_INTERVAL = 60_000;
// Grace period: require N consecutive failed polls before surfacing the
// "bridge-unreachable" state in the UI. Prevents a single transient blip
// (fetch timeout, sleeping laptop wake-up, etc.) from flashing the banner.
const UNREACHABLE_THRESHOLD = 2;

interface PhoneStatus {
  running: boolean;
  loggedIn: boolean;
  user: { id: string; name: string; extension: string } | null;
  sipRegistered: boolean;
  callState: string;
}

/**
 * Discriminated union describing the relationship between the web-UI session
 * (currentUserId) and the local softphone bridge running on 127.0.0.1:19876.
 *
 * - 'idle'                — no currentUserId yet (hook still initializing).
 * - 'match'               — bridge reachable; its logged-in user matches web UI.
 * - 'mismatch'            — bridge reachable but logged in as a different user.
 *                           (Calls will attribute to the wrong agent.)
 * - 'bridge-unreachable'  — bridge could not be contacted after N polls.
 *                           Softphone likely not running. Calls won't attribute
 *                           to this operator at all.
 */
export type DesktopPhoneState =
  | { state: "idle" }
  | { state: "match"; appUser: PhoneStatus["user"] }
  | {
      state: "mismatch";
      bridgeUser: NonNullable<PhoneStatus["user"]>;
      webUserId: string;
    }
  | { state: "bridge-unreachable"; lastError: string | null };

interface UseDesktopPhoneResult {
  /** Legacy boolean — true when status.running. */
  appDetected: boolean;
  /** Legacy — bridge's logged-in user (or null). */
  appUser: PhoneStatus["user"];
  /** Legacy — whether bridge reports SIP registered. */
  sipRegistered: boolean;
  /** Legacy boolean mismatch (true only when state === 'mismatch'). */
  mismatch: boolean;
  /** New: full state machine for UI consumers. */
  phoneState: DesktopPhoneState;
  switchingUser: boolean;
  switchUser: () => Promise<void>;
  dial: (number: string) => Promise<boolean>;
}

export function useDesktopPhone(
  currentUserId: string | null,
): UseDesktopPhoneResult {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [switchingUser, setSwitchingUser] = useState(false);
  // Counts consecutive failed polls. Only exposed as 'bridge-unreachable'
  // once it reaches UNREACHABLE_THRESHOLD.
  const [failedPolls, setFailedPolls] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = (await res.json()) as PhoneStatus;
        setStatus(data);
        setFailedPolls(0);
        setLastError(null);
      } else {
        setStatus(null);
        setFailedPolls((n) => n + 1);
        setLastError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setStatus(null);
      setFailedPolls((n) => n + 1);
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    timerRef.current = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchStatus]);

  const appDetected = !!status?.running;
  const appUser = status?.loggedIn ? status.user : null;
  const sipRegistered = status?.sipRegistered ?? false;

  // Compute the discriminated-union state for the banner / UI.
  let phoneState: DesktopPhoneState;
  if (!currentUserId) {
    phoneState = { state: "idle" };
  } else if (status && appUser) {
    // Bridge reachable and reports a logged-in user.
    if (appUser.id === currentUserId) {
      phoneState = { state: "match", appUser };
    } else {
      phoneState = {
        state: "mismatch",
        bridgeUser: appUser,
        webUserId: currentUserId,
      };
    }
  } else if (status && !appUser) {
    // Bridge reachable but not logged in — treat as 'match' for banner
    // purposes (no conflicting user to warn about). If the bridge is up
    // but nobody is logged in, no calls will be attributed anyway and
    // the 'Launch softphone' CTA on bridge-unreachable isn't relevant.
    phoneState = { state: "match", appUser: null };
  } else if (failedPolls >= UNREACHABLE_THRESHOLD) {
    phoneState = { state: "bridge-unreachable", lastError };
  } else {
    // Below grace threshold — don't surface anything yet. Treat as
    // tentatively-matching so the banner stays hidden during transient
    // blips or initial load.
    phoneState = { state: "match", appUser: null };
  }

  const mismatch = phoneState.state === "mismatch";

  const switchUser = useCallback(async () => {
    if (!currentUserId) return;
    setSwitchingUser(true);
    try {
      const { handshakeToken } = await apiPost<{ handshakeToken: string }>(
        "/auth/device-token",
        {},
      );

      const switchRes = await fetch(`${BRIDGE_URL}/switch-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handshakeToken }),
      });
      if (!switchRes.ok) throw new Error("Failed to switch user on phone app");

      await fetchStatus();
    } catch (err) {
      console.error("[DesktopPhone] switch-user failed:", err);
    } finally {
      setSwitchingUser(false);
    }
  }, [currentUserId, fetchStatus]);

  const dial = useCallback(async (number: string): Promise<boolean> => {
    try {
      const res = await fetch(`${BRIDGE_URL}/dial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number }),
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    appDetected,
    appUser,
    sipRegistered,
    mismatch,
    phoneState,
    switchingUser,
    switchUser,
    dial,
  };
}
