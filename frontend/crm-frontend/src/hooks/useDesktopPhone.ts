"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiPost } from "@/lib/api";

const BRIDGE_URL = "http://127.0.0.1:19876";
const POLL_INTERVAL = 60_000;
// Grace period: require N consecutive failed polls before surfacing the
// "bridge-unreachable" state in the UI. Prevents a single transient blip
// (fetch timeout, sleeping laptop wake-up, etc.) from flashing the banner.
const UNREACHABLE_THRESHOLD = 2;

/**
 * Reduced /status payload — the bridge no longer leaks user NAME or
 * EXTENSION. Only a UUID is returned so the web UI can detect a paired-to-
 * different-user mismatch. The UUID alone is not sensitive (it's not an
 * email, display name, or SIP extension).
 */
interface PhoneStatus {
  running: boolean;
  loggedIn: boolean;
  // Reduced payload (audit/P1-12) — the bridge's /status endpoint no longer
  // leaks the softphone user's name or SIP extension. Only the user UUID is
  // returned so the web UI can still detect a different-user mismatch.
  user: { id: string } | null;
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

interface SwitchUserResponse {
  ok: boolean;
  user: { id: string };
  bridgeToken: string;
}

interface UseDesktopPhoneResult {
  /** Legacy boolean — true when status.running. */
  appDetected: boolean;
  /** Legacy — bridge's logged-in user (or null). */
  appUser: PhoneStatus["user"];
  /** UUID of the operator currently paired to the softphone, if any. */
  appUserId: string | null;
  /** Legacy — whether bridge reports SIP registered. */
  sipRegistered: boolean;
  /** Legacy boolean mismatch (true only when state === 'mismatch'). */
  mismatch: boolean;
  /** New: full state machine for UI consumers. */
  phoneState: DesktopPhoneState;
  switchingUser: boolean;
  /** Run the device-token → /switch-user handshake. Pairs the softphone to
   *  the current web UI user and stores the new X-Bridge-Token in memory. */
  switchUser: () => Promise<void>;
  dial: (number: string) => Promise<boolean>;
}

/**
 * Module-level bridge-token store. Shared with other components (e.g.
 * `click-to-call.tsx`) via `getBridgeToken()` / `setBridgeToken()`. Kept
 * in memory only; NEVER persisted.
 */
let bridgeTokenMem: string | null = null;
const bridgeTokenListeners = new Set<() => void>();

export function getBridgeToken(): string | null {
  return bridgeTokenMem;
}

export function setBridgeToken(token: string | null): void {
  bridgeTokenMem = token;
  bridgeTokenListeners.forEach((cb) => cb());
}

function subscribeBridgeToken(cb: () => void): () => void {
  bridgeTokenListeners.add(cb);
  return () => {
    bridgeTokenListeners.delete(cb);
  };
}

/**
 * Perform the /auth/device-token → /switch-user handshake. Stores the
 * new bridge token in module-level memory and returns it. Any consumer
 * (`dial()`, `click-to-call.tsx`) will pick it up automatically on next
 * call.
 */
export async function performBridgeHandshake(): Promise<SwitchUserResponse | null> {
  try {
    const { handshakeToken } = await apiPost<{ handshakeToken: string }>(
      "/auth/device-token",
      {},
    );
    const res = await fetch(`${BRIDGE_URL}/switch-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handshakeToken }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as SwitchUserResponse;
    if (data.bridgeToken) {
      setBridgeToken(data.bridgeToken);
    }
    return data;
  } catch {
    return null;
  }
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
  // Force re-renders when module-level bridge token changes.
  const [, setTokenVersion] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return subscribeBridgeToken(() => setTokenVersion((v) => v + 1));
  }, []);

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
  const appUser = status?.loggedIn ? status.user ?? null : null;
  const appUserId = appUser?.id ?? null;
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
      const result = await performBridgeHandshake();
      if (!result) throw new Error("Failed to switch user on phone app");
      await fetchStatus();
    } catch (err) {
      console.error("[DesktopPhone] switch-user failed:", err);
    } finally {
      setSwitchingUser(false);
    }
  }, [currentUserId, fetchStatus]);

  const dial = useCallback(async (number: string): Promise<boolean> => {
    // Helper — single POST with current token
    async function attemptDial(): Promise<Response | null> {
      const token = getBridgeToken();
      if (!token) return null;
      try {
        return await fetch(`${BRIDGE_URL}/dial`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Bridge-Token": token,
          },
          body: JSON.stringify({ number }),
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        return null;
      }
    }

    // Attempt once; if we have no token OR it was rejected as stale,
    // run the handshake to (re)pair and retry once.
    let res = await attemptDial();
    if (!res || res.status === 401) {
      const handshake = await performBridgeHandshake();
      if (!handshake) return false;
      res = await attemptDial();
    }
    return !!res?.ok;
  }, []);

  return {
    appDetected,
    appUser,
    appUserId,
    sipRegistered,
    mismatch,
    phoneState,
    switchingUser,
    switchUser,
    dial,
  };
}
