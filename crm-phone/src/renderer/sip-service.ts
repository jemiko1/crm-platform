import { UserAgent, Registerer, Invitation, Inviter, SessionState } from "sip.js";
import type { Session } from "sip.js";
import type { ActiveCall, CallState, TelephonyExtensionInfo } from "../shared/types";
import { startRingback, stopRingback } from "./ringback";

type SipEventCallback = (data: any) => void;

function rlog(...args: any[]) {
  console.log(...args);
  window.crmPhone?.log?.("info", ...args);
}
function rerr(...args: any[]) {
  console.error(...args);
  window.crmPhone?.log?.("error", ...args);
}

/**
 * Exponential-backoff ladder for SIP re-registration after a drop. Starts at
 * 2s, caps at 60s. Never gives up — SIP must stay alive for the entire
 * operator session. Once the softphone logs out the whole stack is torn down
 * via `unregister()`, which cancels any pending retry.
 */
const REGISTER_BACKOFF_MS = [2_000, 4_000, 8_000, 15_000, 30_000, 60_000];

class SipService {
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private currentSession: Session | null = null;
  private _registered = false;
  private _callState: CallState = "idle";
  private _activeCall: ActiveCall | null = null;
  private _muted = false;
  private _sipHost: string | null = null;
  private remoteAudioEl: HTMLAudioElement | null = null;
  private listeners = new Map<string, Set<SipEventCallback>>();
  /** Cached extension info from the last successful `register()` call, used
   *  when we need to fully rebuild the UserAgent after a transport death.
   *  Cleared only in `unregister()`. Contains `sipPassword` — kept in
   *  renderer memory only; see P0-B/C (fix/audit/sip-password-memory-only).
   *  TODO: when P0-B/C lands, swap this for a request to the narrow
   *  `/v1/telephony/sip-credentials` endpoint on every re-register.  */
  private currentExt: TelephonyExtensionInfo | null = null;
  /** When true, state is "logged in and should be registered". Controls
   *  whether `scheduleReRegister()` fires or no-ops. Set by `register()`,
   *  cleared by `unregister()` so operator logout is respected. */
  private shouldStayRegistered = false;
  private reRegisterTimer: ReturnType<typeof setTimeout> | null = null;
  private reRegisterAttempt = 0;
  /** Guards against two concurrent re-register paths (Registerer state +
   *  Transport state) firing near-simultaneously. */
  private reRegisterInFlight = false;
  private lastRegistrationTs: number | null = null;
  private lastRegistrationError: string | null = null;
  /** Heartbeat posting loop (30s while registered + on any state change). */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  get registered() { return this._registered; }
  get callState() { return this._callState; }
  get activeCall() { return this._activeCall; }
  get muted() { return this._muted; }

  on(event: string, cb: SipEventCallback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
  }

  off(event: string, cb: SipEventCallback) {
    this.listeners.get(event)?.delete(cb);
  }

  private emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach((cb) => cb(data));
  }

  private emitStateChange() {
    this.emit("state-change", {
      callState: this._callState,
      activeCall: this._activeCall,
      registered: this._registered,
      muted: this._muted,
    });
  }

  async register(ext: TelephonyExtensionInfo): Promise<void> {
    await this.unregister();

    if (!ext.sipServer || !ext.sipPassword) {
      rlog("[SIP-R] Missing sipServer or sipPassword");
      return;
    }

    // Cache before building the UA so an immediate transport death can
    // trigger a rebuild via scheduleReRegister() even though the Registerer
    // never reached Registered.
    this.currentExt = ext;
    this.shouldStayRegistered = true;
    this.reRegisterAttempt = 0;
    this.lastRegistrationError = null;

    this._sipHost = ext.sipServer;
    const wssUrl = `wss://${this._sipHost}:8089/ws`;
    const sipUri = `sip:${ext.extension}@${this._sipHost}`;
    rlog("[SIP-R] Connecting to:", wssUrl, "URI:", sipUri);

    const uri = UserAgent.makeURI(sipUri);
    if (!uri) {
      this.emit("error", `Invalid SIP URI: ${sipUri}`);
      return;
    }

    this.ua = new UserAgent({
      uri,
      authorizationUsername: ext.extension,
      authorizationPassword: ext.sipPassword,
      transportOptions: { server: wssUrl },
      displayName: ext.displayName,
      logLevel: "warn",
    });

    this.ua.delegate = {
      onInvite: (invitation: Invitation) => this.handleIncoming(invitation),
    };

    // Wire a transport-level watchdog BEFORE starting. SIP.js emits
    // onDisconnect when the WebSocket drops for any reason — network blip,
    // Wi-Fi roam, server restart, laptop sleep/wake, firewall idle timeout.
    // When that happens, the Registerer can silently stay "Registered" in
    // JavaScript land while Asterisk has long since forgotten the AOR —
    // hence the need to drive a fresh REGISTER ourselves.
    this.ua.transport.onDisconnect = (err?: Error) => {
      rlog("[SIP-R] Transport disconnected:", err?.message ?? "no error");
      this.lastRegistrationError = err?.message ?? "transport disconnected";
      // Flip the visible state immediately. If we wait for the Registerer
      // to notice, the UI dot stays green for the full expiry window.
      if (this._registered) {
        this._registered = false;
        this.emit("registration-state", false);
        this.notifyRegistrationChanged();
      }
      this.scheduleReRegister("transport-disconnect");
    };
    this.ua.transport.onConnect = () => {
      rlog("[SIP-R] Transport reconnected");
      // Transport is back. Immediately fire a fresh REGISTER — the existing
      // Registerer's own keep-alive may take up to `expires` seconds to
      // decide it needs to do this.
      this.scheduleReRegister("transport-reconnect", /* delayMs */ 0);
    };

    try {
      await this.ua.start();
      rlog("[SIP-R] UserAgent started");
    } catch (err: any) {
      rerr("[SIP-R] Transport failed:", err.message);
      this.lastRegistrationError = err?.message ?? "transport start failed";
      this.emit("error", `SIP transport failed: ${err.message}`);
      this.scheduleReRegister("transport-start-failed");
      return;
    }

    this.registerer = new Registerer(this.ua, { expires: 300 });
    this.registerer.stateChange.addListener((state) => {
      rlog("[SIP-R] Registration:", state);
      const wasRegistered = this._registered;
      this._registered = state === "Registered";
      this.emit("registration-state", this._registered);
      window.crmPhone?.sip?.reportStatus?.(this._registered);

      if (this._registered) {
        this.lastRegistrationTs = Date.now();
        this.lastRegistrationError = null;
        // Successful register: reset the backoff ladder so the NEXT drop
        // starts fresh at 2s instead of picking up from a stale attempt
        // count.
        this.reRegisterAttempt = 0;
      }

      if (wasRegistered !== this._registered) {
        // Any transition from Registered is a potential outage the backend
        // should know about — fire an immediate heartbeat.
        this.notifyRegistrationChanged();
      }

      // If the Registerer terminated but we're still supposed to be
      // registered, kick the re-register ladder. This catches expiry
      // timeouts and server-side 401/403 rejections.
      if (
        (state === "Unregistered" || state === "Terminated") &&
        this.shouldStayRegistered
      ) {
        this.scheduleReRegister(`registerer-state-${state}`);
      }
    });

    try {
      await this.registerer.register();
    } catch (err: any) {
      rerr("[SIP-R] Register failed:", err.message);
      this.lastRegistrationError = err?.message ?? "register failed";
      this.emit("error", `SIP registration failed: ${err.message}`);
      this.scheduleReRegister("register-failed");
    }

    // Start the 30s heartbeat loop. It runs for as long as the softphone
    // thinks it *should* be registered — even when actual registration is
    // bouncing. The backend side uses this to flip the manager dashboard
    // to "SIP DOWN" after 90s of silence.
    this.startHeartbeat();
  }

  /**
   * Schedule a re-register attempt with exponential backoff. Safe to call
   * multiple times — if a timer is already pending it's left alone unless
   * `delayMs` is explicitly 0 (transport reconnect path).
   *
   * Reason is logged only to help operators / support diagnose why the
   * softphone looks offline. It does NOT affect timing.
   */
  private scheduleReRegister(reason: string, delayMs?: number): void {
    if (!this.shouldStayRegistered) return;
    if (this.reRegisterInFlight) return;
    // Only replace a pending timer for the "urgent" transport-reconnect
    // path. Otherwise letting the existing timer run preserves the backoff
    // curve across overlapping events (Registerer terminated + onDisconnect
    // often fire within the same tick).
    if (this.reRegisterTimer && delayMs !== 0) return;

    const effectiveDelay =
      delayMs ??
      REGISTER_BACKOFF_MS[
        Math.min(this.reRegisterAttempt, REGISTER_BACKOFF_MS.length - 1)
      ];

    rlog(
      `[SIP-R] scheduleReRegister(${reason}) attempt=${this.reRegisterAttempt + 1} delay=${effectiveDelay}ms`,
    );

    if (this.reRegisterTimer) {
      clearTimeout(this.reRegisterTimer);
      this.reRegisterTimer = null;
    }

    this.reRegisterTimer = setTimeout(() => {
      this.reRegisterTimer = null;
      void this.performReRegister();
    }, effectiveDelay);
  }

  private async performReRegister(): Promise<void> {
    if (!this.shouldStayRegistered || this.reRegisterInFlight) return;
    this.reRegisterInFlight = true;
    try {
      // If transport is down, try SIP.js's reconnect() first. It tears down
      // and rebuilds the WebSocket. If SIP.js's version doesn't support it,
      // fall through to a full register() rebuild of the UA.
      if (this.ua && !this.ua.transport.isConnected()) {
        rlog("[SIP-R] Transport not connected — calling ua.reconnect()");
        try {
          await this.ua.reconnect();
        } catch (err: any) {
          rerr("[SIP-R] ua.reconnect() failed:", err?.message);
          this.lastRegistrationError = err?.message ?? "reconnect failed";
          // Rebuild from scratch on next attempt — the UA may be wedged.
          if (this.currentExt) {
            this.reRegisterAttempt += 1;
            await this.register(this.currentExt);
          }
          return;
        }
      }

      // Transport is live. Send a fresh REGISTER. If the Registerer was
      // Terminated, we need to build a new one because terminal state is
      // one-way in sip.js.
      if (!this.registerer || this.registerer.state === "Terminated") {
        if (this.ua) {
          this.registerer = new Registerer(this.ua, { expires: 300 });
          this.registerer.stateChange.addListener((state) => {
            rlog("[SIP-R] (rebuilt) Registration:", state);
            this._registered = state === "Registered";
            this.emit("registration-state", this._registered);
            window.crmPhone?.sip?.reportStatus?.(this._registered);
            if (this._registered) {
              this.lastRegistrationTs = Date.now();
              this.lastRegistrationError = null;
              this.reRegisterAttempt = 0;
              this.notifyRegistrationChanged();
            } else if (
              (state === "Unregistered" || state === "Terminated") &&
              this.shouldStayRegistered
            ) {
              this.scheduleReRegister(`rebuilt-registerer-${state}`);
            }
          });
        }
      }

      if (this.registerer) {
        try {
          await this.registerer.register();
          rlog("[SIP-R] re-register attempt sent");
        } catch (err: any) {
          rerr("[SIP-R] re-register failed:", err?.message);
          this.lastRegistrationError = err?.message ?? "re-register failed";
          this.reRegisterAttempt += 1;
          this.scheduleReRegister("reregister-rejected");
        }
      }
    } finally {
      this.reRegisterInFlight = false;
    }
  }

  /**
   * Fire an immediate heartbeat and (re)start the 30s loop. Called on any
   * registration state flip so the backend learns about outages without
   * waiting up to 30s for the next tick.
   */
  private notifyRegistrationChanged(): void {
    // Broadcast to other renderer frames via main process — the PhonePage
    // indicator and mismatch banner listen for this.
    window.crmPhone?.sip?.reportStatus?.(this._registered);
    window.crmPhone?.sip?.reportRegistrationChanged?.({
      registered: this._registered,
      lastAttempt: this.lastRegistrationTs ?? Date.now(),
      lastError: this.lastRegistrationError ?? undefined,
    });

    // Immediate heartbeat to the backend — do not wait for the next 30s
    // tick. If this fails (e.g. network down) the presence sweep on the
    // backend will flip the agent to SIP-DOWN within 90s regardless.
    this.postHeartbeat().catch(() => {
      // Heartbeat failures are non-critical at this layer; the cron sweep
      // provides the safety net.
    });
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      this.postHeartbeat().catch(() => {
        // Heartbeat failures are non-critical; the backend's stale-sweep
        // cron is the source of truth for manager-facing "SIP DOWN".
      });
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private async postHeartbeat(): Promise<void> {
    const ext = this.currentExt;
    if (!ext) return;
    try {
      await window.crmPhone?.sip?.reportPresence?.({
        state: this._registered ? "registered" : "unregistered",
        extension: ext.extension,
        ts: new Date().toISOString(),
        lastError: this.lastRegistrationError ?? undefined,
      });
    } catch (err: any) {
      rlog("[SIP-R] presence heartbeat failed:", err?.message ?? String(err));
    }
  }

  async unregister(): Promise<void> {
    // Stop the re-register loop BEFORE we tear down, otherwise a pending
    // timer or in-flight reconnect can race with the logout flow and
    // silently start a new UA pointing at stale credentials.
    this.shouldStayRegistered = false;
    this.reRegisterAttempt = 0;
    if (this.reRegisterTimer) {
      clearTimeout(this.reRegisterTimer);
      this.reRegisterTimer = null;
    }
    this.stopHeartbeat();
    // Fire a final "unregistered" heartbeat so the backend can flip the
    // manager board to SIP-DOWN immediately rather than waiting for the
    // 90s sweep.
    if (this.currentExt) {
      try {
        await window.crmPhone?.sip?.reportPresence?.({
          state: "unregistered",
          extension: this.currentExt.extension,
          ts: new Date().toISOString(),
        });
      } catch { /* swallow — not critical on logout */ }
    }
    this.currentExt = null;

    this.cleanupRemoteAudio();
    stopRingback();
    this._callState = "idle";
    this._activeCall = null;
    this._muted = false;
    this._sipHost = null;

    if (this.currentSession) {
      try {
        const s = this.currentSession;
        if (s.state === SessionState.Established || s.state === SessionState.Establishing) {
          (s as any).bye?.() ?? (s as any).cancel?.();
        }
      } catch { /* ignore */ }
      this.currentSession = null;
    }

    // Wait for the Registerer to actually transition to "Unregistered" before
    // returning. SIP.js's registerer.unregister() resolves as soon as the
    // REGISTER-with-Expires-0 request is *sent*, not when Asterisk ACKs it.
    // On user switch, if we don't wait, the new UserAgent registers before
    // Asterisk has cleaned up the old AOR contact — and inbound calls route
    // to the stale contact, silently failing. Capped at 3s to avoid hanging.
    if (this.registerer) {
      const reg = this.registerer;
      this.registerer = null;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const timeout = setTimeout(() => {
          rlog("[SIP-R] unregister() wait timed out after 3s");
          finish();
        }, 3000);
        try {
          reg.stateChange.addListener((state) => {
            if (state === "Unregistered" || state === "Terminated") {
              clearTimeout(timeout);
              finish();
            }
          });
          reg.unregister().catch((err) => {
            rlog("[SIP-R] unregister() rejected:", err?.message ?? err);
            clearTimeout(timeout);
            finish();
          });
        } catch (err: any) {
          rlog("[SIP-R] unregister() threw:", err?.message);
          clearTimeout(timeout);
          finish();
        }
      });
    }

    this._registered = false;

    if (this.ua) {
      const ua = this.ua;
      this.ua = null;
      try {
        await ua.stop();
      } catch { /* ignore */ }
      // Give the WebSocket transport a moment to actually close. Without this,
      // a new UserAgent can open its WSS connection while the old transport
      // is still in the process of closing, leaving Asterisk's PJSIP contact
      // record pointing at a dead socket.
      await new Promise((r) => setTimeout(r, 500));
    }

    this.emit("registration-state", false);
    this.emitStateChange();
    window.crmPhone?.sip?.reportStatus?.(false);
  }

  async answer(): Promise<void> {
    if (!(this.currentSession instanceof Invitation)) {
      rlog("[SIP-R] answer() - no current Invitation session");
      return;
    }
    rlog("[SIP-R] answer() - accepting invitation, session state:", this.currentSession.state);
    this._callState = "connecting";
    if (this._activeCall) this._activeCall.state = "connecting";
    this.emitStateChange();
    try {
      await this.currentSession.accept();
      rlog("[SIP-R] answer() - accept() completed");
    } catch (err: any) {
      rerr("[SIP-R] Answer failed:", err.message);
      this.emit("error", `Answer failed: ${err.message}`);
    }
  }

  async hangup(): Promise<void> {
    if (!this.currentSession) return;
    this.cleanupRemoteAudio();
    try {
      if (this.currentSession.state === SessionState.Established) {
        this.currentSession.bye();
      } else if (this.currentSession instanceof Invitation) {
        this.currentSession.reject();
      } else if (this.currentSession instanceof Inviter) {
        this.currentSession.cancel();
      }
    } catch { /* ignore */ }
    this.currentSession = null;
    this._callState = "idle";
    this._activeCall = null;
    this._muted = false;
    this.emitStateChange();
  }

  async dial(number: string): Promise<void> {
    if (!this.ua || !this._registered || !this._sipHost) {
      this.emit("error", "SIP not registered");
      return;
    }
    const target = UserAgent.makeURI(`sip:${number}@${this._sipHost}`);
    if (!target) {
      this.emit("error", `Invalid dial target: ${number}`);
      return;
    }
    const inviter = new Inviter(this.ua, target);
    this.setupSession(inviter, "outbound", number);

    this._callState = "dialing";
    this._activeCall = {
      id: Date.now().toString(),
      state: "dialing",
      direction: "outbound",
      remoteNumber: number,
      startedAt: new Date().toISOString(),
    };
    this.emitStateChange();

    try {
      await inviter.invite();
    } catch (err: any) {
      this._callState = "idle";
      this._activeCall = null;
      this.emitStateChange();
      this.emit("error", `Dial failed: ${err.message}`);
    }
  }

  async hold(): Promise<void> {
    if (!this.currentSession || this.currentSession.state !== SessionState.Established) return;
    rlog("[SIP-R] hold() requested");
    const pc = (this.currentSession as any).sessionDescriptionHandler?.peerConnection as RTCPeerConnection | undefined;
    if (pc) {
      pc.getSenders().forEach((s) => { if (s.track) s.track.enabled = false; });
    }
    if (this.remoteAudioEl) this.remoteAudioEl.muted = true;
    this._callState = "hold";
    if (this._activeCall) this._activeCall.state = "hold";
    this.emitStateChange();
  }

  async unhold(): Promise<void> {
    if (!this.currentSession || this.currentSession.state !== SessionState.Established) return;
    rlog("[SIP-R] unhold() requested");
    const pc = (this.currentSession as any).sessionDescriptionHandler?.peerConnection as RTCPeerConnection | undefined;
    if (pc) {
      pc.getSenders().forEach((s) => { if (s.track) s.track.enabled = true; });
    }
    if (this.remoteAudioEl) this.remoteAudioEl.muted = false;
    this._muted = false;
    this._callState = "connected";
    if (this._activeCall) this._activeCall.state = "connected";
    this.emitStateChange();
  }

  sendDtmf(tone: string): void {
    if (this.currentSession?.state === SessionState.Established) {
      const options = {
        requestOptions: {
          body: {
            contentDisposition: "render",
            contentType: "application/dtmf-relay",
            content: `Signal=${tone}\r\nDuration=160`,
          },
        },
      };
      this.currentSession.info(options).catch(() => {});
    }
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    if (this.currentSession?.state === SessionState.Established) {
      const pc = (this.currentSession as any).sessionDescriptionHandler?.peerConnection as RTCPeerConnection | undefined;
      if (pc) {
        pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === "audio") {
            sender.track.enabled = !this._muted;
          }
        });
      }
    }
    rlog("[SIP-R] Mute toggled:", this._muted);
    this.emitStateChange();
    return this._muted;
  }

  private attachRemoteAudio(session: Session): void {
    const pc = (session as any).sessionDescriptionHandler?.peerConnection as RTCPeerConnection | undefined;
    if (!pc) {
      rerr("[SIP-R] No peerConnection on session, cannot attach remote audio");
      return;
    }

    const remoteStream = new MediaStream();
    pc.getReceivers().forEach((receiver) => {
      if (receiver.track) {
        rlog("[SIP-R] Adding remote track:", receiver.track.kind, receiver.track.id);
        remoteStream.addTrack(receiver.track);
      }
    });

    pc.addEventListener("track", (event) => {
      rlog("[SIP-R] New remote track arrived:", event.track.kind, event.track.id);
      remoteStream.addTrack(event.track);
      if (this.remoteAudioEl) {
        this.remoteAudioEl.srcObject = remoteStream;
      }
    });

    this.cleanupRemoteAudio();
    const audio = document.createElement("audio");
    audio.srcObject = remoteStream;
    audio.autoplay = true;

    window.crmPhone?.settings?.get?.().then((settings: any) => {
      if (settings?.audioOutputDeviceId && typeof (audio as any).setSinkId === "function") {
        (audio as any).setSinkId(settings.audioOutputDeviceId).catch((e: any) =>
          rerr("[SIP-R] setSinkId failed:", e.message)
        );
      }
    });

    audio.play().then(() => {
      rlog("[SIP-R] Remote audio playback started, tracks:", remoteStream.getAudioTracks().length);
    }).catch((e) => {
      rerr("[SIP-R] Remote audio play() failed:", e.message);
    });

    this.remoteAudioEl = audio;
  }

  private cleanupRemoteAudio(): void {
    if (this.remoteAudioEl) {
      this.remoteAudioEl.pause();
      this.remoteAudioEl.srcObject = null;
      this.remoteAudioEl.remove();
      this.remoteAudioEl = null;
    }
  }

  private handleIncoming(invitation: Invitation): void {
    const remoteNumber = invitation.remoteIdentity.uri.user || "Unknown";
    rlog("[SIP-R] Incoming call from:", remoteNumber);
    this.setupSession(invitation, "inbound", remoteNumber);

    this._callState = "ringing";
    this._activeCall = {
      id: Date.now().toString(),
      state: "ringing",
      direction: "inbound",
      remoteNumber,
      remoteName: invitation.remoteIdentity.displayName || undefined,
      startedAt: new Date().toISOString(),
    };
    this.emitStateChange();
    this.emit("incoming-call", this._activeCall);
    window.crmPhone?.app?.show?.();
  }

  private setupSession(session: Session, direction: "inbound" | "outbound", remoteNumber: string): void {
    this.currentSession = session;
    session.stateChange.addListener((state) => {
      rlog("[SIP-R] Session state:", state, "for:", remoteNumber);
      switch (state) {
        case SessionState.Establishing:
          this._callState = direction === "outbound" ? "dialing" : "ringing";
          // Play a local ringback tone while the remote side rings.
          // Without this, operators hear nothing and don't know if the
          // call is progressing. Stopped on Established or Terminated.
          if (direction === "outbound") {
            startRingback();
          }
          break;
        case SessionState.Established:
          stopRingback();
          this._callState = "connected";
          if (this._activeCall) {
            this._activeCall.state = "connected";
            this._activeCall.answeredAt = new Date().toISOString();
          }
          this.attachRemoteAudio(session);
          break;
        case SessionState.Terminated:
          stopRingback();
          this.cleanupRemoteAudio();
          this.currentSession = null;
          this._callState = "idle";
          this._activeCall = null;
          this._muted = false;
          break;
      }
      this.emitStateChange();
    });
  }
}

export const sipService = new SipService();
