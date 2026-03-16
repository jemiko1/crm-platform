"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const SOUND_PREF_KEY = "clientchat_sound_enabled";
const BANNER_DISMISSED_KEY = "clientchat_notif_dismissed";

let audioEl: HTMLAudioElement | null = null;
let audioUnlocked = false;

function getAudioEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audioEl) {
    audioEl = new Audio("/notification.wav");
    audioEl.volume = 0.5;
    audioEl.preload = "auto";
    console.log("NOTIFY: audio element created, src=/notification.wav");
  }
  return audioEl;
}

function unlockAudio() {
  if (audioUnlocked) return;
  const el = getAudioEl();
  if (!el) return;
  console.log("NOTIFY: unlockAudio — playing silent to unlock");
  el.volume = 0;
  el.play().then(() => {
    el.pause();
    el.currentTime = 0;
    el.volume = 0.5;
    audioUnlocked = true;
    console.log("NOTIFY: unlockAudio SUCCESS");
  }).catch((e) => {
    console.log("NOTIFY: unlockAudio FAILED", e?.message);
  });
}

function playNotificationSound() {
  console.log("NOTIFY: playNotificationSound called, unlocked=" + audioUnlocked);
  const el = getAudioEl();
  if (!el) return;
  el.currentTime = 0;
  el.volume = 0.5;
  el.play().then(() => {
    console.log("NOTIFY: audio.play() SUCCESS");
  }).catch((e) => {
    console.log("NOTIFY: audio.play() FAILED", e?.message);
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

    console.log("NOTIFY: useNotifications init");

    if (typeof window !== "undefined" && "Notification" in window) {
      console.log("NOTIFY: Notification.permission =", Notification.permission);
      setPermission(Notification.permission);
    }

    const stored = localStorage.getItem(SOUND_PREF_KEY);
    console.log("NOTIFY: stored soundEnabled =", stored);
    if (stored !== null) setSoundEnabled(stored === "true");

    const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissed === "true") setBannerDismissed(true);

    getAudioEl();

    const onInteraction = () => {
      console.log("NOTIFY: user interaction — unlocking audio");
      unlockAudio();
      document.removeEventListener("click", onInteraction);
      document.removeEventListener("keydown", onInteraction);
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
    console.log("NOTIFY: requestPermission result =", result);
    setPermission(result);
  }, []);

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true);
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "true");
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      console.log("NOTIFY: toggleSound", prev, "->", next);
      localStorage.setItem(SOUND_PREF_KEY, String(next));
      return next;
    });
  }, []);

  const notify = useCallback(
    (title: string, body: string) => {
      console.log("NOTIFY: notify() called", {
        title,
        body: body.slice(0, 40),
        permission,
        soundEnabled,
        documentHidden: document.hidden,
      });

      if (permission === "granted" && document.hidden) {
        console.log("NOTIFY: creating browser notification");
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
          console.log("NOTIFY: browser notification created OK");
        } catch (e) {
          console.log("NOTIFY: browser notification FAILED", e);
        }
      }

      if (soundEnabled) {
        console.log("NOTIFY: soundEnabled=true, calling playNotificationSound");
        playNotificationSound();
      } else {
        console.log("NOTIFY: soundEnabled=false, skipping sound");
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
