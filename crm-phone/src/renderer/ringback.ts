/**
 * Synthesized ringback tone for outbound calls, so operators hear that
 * the remote phone is ringing instead of silence.
 *
 * Uses WebAudio with a 425Hz sine wave (Georgian/European ringback tone
 * standard — Asterisk's default is the same). Cadence: 1s on / 4s off
 * (ETSI/ITU-T European standard).
 *
 * We use a local synthesis rather than relying on Asterisk's early-media
 * (183 Session Progress with SDP) because:
 *  1. SIP.js's Inviter defaults to earlyMedia:false, dropping carrier
 *     ringback audio.
 *  2. Enabling earlyMedia can cause double-audio if both local synthesis
 *     and carrier ringback play simultaneously.
 *  3. Synthesized ringback is deterministic — operators always hear the
 *     same thing regardless of the peer.
 */

let ctx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let oscillator: OscillatorNode | null = null;
let cadenceTimer: ReturnType<typeof setInterval> | null = null;
let playing = false;

export function startRingback(): void {
  if (playing) return;
  playing = true;

  try {
    const AudioCtx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) {
      console.warn("[ringback] WebAudio API not available");
      return;
    }
    ctx = new AudioCtx();

    gainNode = ctx.createGain();
    gainNode.gain.value = 0; // start muted
    gainNode.connect(ctx.destination);

    oscillator = ctx.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = 425; // Hz — Georgian/European standard
    oscillator.connect(gainNode);
    oscillator.start();

    // Cadence: 1 second on, 4 seconds off, repeating
    const toneOn = () => {
      if (!ctx || !gainNode || !playing) return;
      const now = ctx.currentTime;
      // Small attack/release envelope to avoid clicks
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gainNode.gain.setValueAtTime(0.15, now + 0.98);
      gainNode.gain.linearRampToValueAtTime(0, now + 1.0);
    };

    toneOn(); // immediately
    cadenceTimer = setInterval(toneOn, 5000); // 1s on + 4s off = 5s cycle
  } catch (e: any) {
    console.error("[ringback] Failed to start:", e.message);
    playing = false;
  }
}

export function stopRingback(): void {
  if (!playing) return;
  playing = false;

  if (cadenceTimer) {
    clearInterval(cadenceTimer);
    cadenceTimer = null;
  }

  try {
    if (gainNode && ctx) {
      // Fast fade-out to avoid click
      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
    }
    oscillator?.stop();
    oscillator?.disconnect();
    gainNode?.disconnect();
    ctx?.close();
  } catch {
    /* ignore cleanup errors */
  }

  oscillator = null;
  gainNode = null;
  ctx = null;
}
