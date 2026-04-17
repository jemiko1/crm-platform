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

    try {
      await this.ua.start();
      rlog("[SIP-R] UserAgent started");
    } catch (err: any) {
      rerr("[SIP-R] Transport failed:", err.message);
      this.emit("error", `SIP transport failed: ${err.message}`);
      return;
    }

    this.registerer = new Registerer(this.ua, { expires: 300 });
    this.registerer.stateChange.addListener((state) => {
      rlog("[SIP-R] Registration:", state);
      this._registered = state === "Registered";
      this.emit("registration-state", this._registered);
      window.crmPhone?.sip?.reportStatus?.(this._registered);
    });

    try {
      await this.registerer.register();
    } catch (err: any) {
      rerr("[SIP-R] Register failed:", err.message);
      this.emit("error", `SIP registration failed: ${err.message}`);
    }
  }

  async unregister(): Promise<void> {
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
