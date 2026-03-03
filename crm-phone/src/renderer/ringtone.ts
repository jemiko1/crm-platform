let audioCtx: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let ringInterval: ReturnType<typeof setInterval> | null = null;
let isPlaying = false;

export function startRingtone(): void {
  if (isPlaying) return;
  isPlaying = true;

  audioCtx = new AudioContext();
  gainNode = audioCtx.createGain();
  gainNode.connect(audioCtx.destination);
  gainNode.gain.value = 0;

  oscillator = audioCtx.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = 440;
  oscillator.connect(gainNode);
  oscillator.start();

  let on = true;
  const toggle = () => {
    if (!gainNode || !oscillator) return;
    if (on) {
      oscillator.frequency.value = 440;
      gainNode.gain.setTargetAtTime(0.3, audioCtx!.currentTime, 0.02);
      setTimeout(() => {
        if (!gainNode || !oscillator) return;
        oscillator.frequency.value = 480;
      }, 200);
    } else {
      gainNode.gain.setTargetAtTime(0, audioCtx!.currentTime, 0.02);
    }
    on = !on;
  };

  toggle();
  ringInterval = setInterval(toggle, 500);
}

export function stopRingtone(): void {
  isPlaying = false;
  if (ringInterval) { clearInterval(ringInterval); ringInterval = null; }
  if (oscillator) { try { oscillator.stop(); } catch {} oscillator = null; }
  if (gainNode) { gainNode.disconnect(); gainNode = null; }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
}

export function isRinging(): boolean {
  return isPlaying;
}
