import ringtoneUrl from "./ringtonenew.wav?url";

let audio: HTMLAudioElement | null = null;
let isPlaying = false;

export function startRingtone(): void {
  if (isPlaying) return;
  isPlaying = true;

  audio = new Audio(ringtoneUrl);
  audio.loop = true;
  audio.volume = 0.8;
  audio.play().catch((e) => {
    console.error("[Ringtone] play failed:", e.message);
  });
}

export function stopRingtone(): void {
  isPlaying = false;
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
    audio.src = "";
    audio = null;
  }
}

export function isRinging(): boolean {
  return isPlaying;
}
