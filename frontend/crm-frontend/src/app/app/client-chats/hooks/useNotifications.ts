"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const SOUND_PREF_KEY = "clientchat_sound_enabled";
const BANNER_DISMISSED_KEY = "clientchat_notif_dismissed";

let audioCtxWarmedUp = false;

function warmUpAudio() {
  console.log("NOTIFY: warmUpAudio called");
  if (audioCtxWarmedUp) {
    console.log("NOTIFY: warmUpAudio skipped — already warmed up");
    return;
  }
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) {
      console.log("NOTIFY: warmUpAudio FAILED — no AudioContext available");
      return;
    }
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.value = 0;
    osc.start();
    osc.stop(ctx.currentTime + 0.01);
    ctx.close();
    audioCtxWarmedUp = true;
    console.log("NOTIFY: warmUpAudio SUCCESS — AudioContext unlocked");
  } catch (e) {
    console.log("NOTIFY: warmUpAudio FAILED", e);
  }
}

function playNotificationSound() {
  console.log("NOTIFY: playNotificationSound called");
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) {
      console.log("NOTIFY: playNotificationSound FAILED — no AudioContext");
      return;
    }
    const ctx = new AC();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 800;
    gain.gain.value = 0.3;
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
    console.log("NOTIFY: oscillator sound played (800Hz, 150ms)");
    setTimeout(() => ctx.close(), 300);
  } catch (e) {
    console.log("NOTIFY: playNotificationSound FAILED", e);
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

    console.log("NOTIFY: useNotifications init");

    if (typeof window !== "undefined" && "Notification" in window) {
      console.log("NOTIFY: Notification.permission =", Notification.permission);
      setPermission(Notification.permission);
    } else {
      console.log("NOTIFY: Notification API not available");
    }

    const stored = localStorage.getItem(SOUND_PREF_KEY);
    console.log("NOTIFY: stored soundEnabled =", stored);
    if (stored !== null) setSoundEnabled(stored === "true");

    const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    if (dismissed === "true") setBannerDismissed(true);

    const onInteraction = () => {
      console.log("NOTIFY: first user interaction detected — warming up audio");
      warmUpAudio();
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
      } else {
        console.log("NOTIFY: skipping browser notification (permission=" + permission + ", hidden=" + document.hidden + ")");
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
