"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const SOUND_PREF_KEY = "clientchat_sound_enabled";
const BANNER_DISMISSED_KEY = "clientchat_notif_dismissed";

let audioEl: HTMLAudioElement | null = null;
let audioUnlocked = false;

function getAudioEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio("/notification-pop.wav");
    audioEl.volume = 0.5;
    audioEl.preload = "auto";
  }
  return audioEl;
}

function unlockAudio() {
  if (audioUnlocked) return;
  const el = getAudioEl();
  if (!el) return;
  el.volume = 0;
  el.play().then(() => {
    el.pause();
    el.currentTime = 0;
    el.volume = 0.5;
    audioUnlocked = true;
  }).catch(() => {});
}

function playNotificationSound() {
  unlockAudio();
  const el = getAudioEl();
  if (!el) return;
  el.currentTime = 0;
  el.volume = 0.5;
  el.play().catch(() => {
    audioUnlocked = false;
  });
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }

    const stored = localStorage.getItem(SOUND_PREF_KEY);
    if (stored !== null) setSoundEnabled(stored === "true");

    const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissed === "true") setBannerDismissed(true);

    getAudioEl();

    const onInteraction = () => {
      unlockAudio();
    };
    document.addEventListener("click", onInteraction);
    document.addEventListener("keydown", onInteraction);
    return () => {
      document.removeEventListener("click", onInteraction);
      document.removeEventListener("keydown", onInteraction);
    };
  }, []);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "true");
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(SOUND_PREF_KEY, String(next));
      return next;
    });
  }, []);

  const notify = useCallback(
    (title: string, body: string) => {
      if (permission === "granted" && document.hidden) {
        try {
          const n = new Notification(title, {
            body: body.slice(0, 80),
            icon: "/favicon.ico",
            tag: "clientchat-msg",
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          // Notification API not available
        }
      }

      if (soundEnabled) {
        playNotificationSound();
      }
    },
    [permission, soundEnabled],
  );

  const showBanner = permission === "default" && !bannerDismissed && typeof window !== "undefined" && "Notification" in window;

  return {
    permission,
    soundEnabled,
    showBanner,
    requestPermission,
    dismissBanner,
    toggleSound,
    notify,
  };
}
