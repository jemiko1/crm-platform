"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const SOUND_PREF_KEY = "clientchat_sound_enabled";
const BANNER_DISMISSED_KEY = "clientchat_notif_dismissed";

const BEEP_DATA_URI =
  "data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Mj4eBdGhrf4eLhXxwZGx4goiGfnJmbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZW15g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cWVseYOIhX1xZWx5g4iFfXFlbHmDiIV9cQ==";

let audioInstance: HTMLAudioElement | null = null;

function playNotificationSound() {
  try {
    if (!audioInstance) {
      audioInstance = new Audio(BEEP_DATA_URI);
      audioInstance.volume = 0.5;
    }
    audioInstance.currentTime = 0;
    audioInstance.play().catch(() => {});
  } catch {
    // Audio not supported
  }
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
          // Notification API not available in this context
        }
      }

      if (soundEnabled && document.hidden) {
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
