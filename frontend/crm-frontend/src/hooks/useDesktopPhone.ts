"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiPost } from "@/lib/api";

const BRIDGE_URL = "http://127.0.0.1:19876";
const POLL_INTERVAL = 60_000;

interface PhoneStatus {
  running: boolean;
  loggedIn: boolean;
  user: { id: string; name: string; extension: string } | null;
  sipRegistered: boolean;
  callState: string;
}

interface UseDesktopPhoneResult {
  appDetected: boolean;
  appUser: PhoneStatus["user"];
  sipRegistered: boolean;
  mismatch: boolean;
  switchingUser: boolean;
  switchUser: () => Promise<void>;
  dial: (number: string) => Promise<boolean>;
}

export function useDesktopPhone(currentUserId: string | null): UseDesktopPhoneResult {
  const [status, setStatus] = useState<PhoneStatus | null>(null);
  const [switchingUser, setSwitchingUser] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BRIDGE_URL}/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
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
  const mismatch = !!(
    currentUserId &&
    appUser &&
    appUser.id !== currentUserId
  );

  const switchUser = useCallback(async () => {
    if (!currentUserId) return;
    setSwitchingUser(true);
    try {
      const { handshakeToken } = await apiPost<{ handshakeToken: string }>("/auth/device-token", {});

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

  return { appDetected, appUser, sipRegistered, mismatch, switchingUser, switchUser, dial };
}
