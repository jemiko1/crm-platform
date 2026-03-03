import { UserAgent, Registerer, Invitation, Inviter, SessionState } from "sip.js";
import type { Session } from "sip.js";
import type { ActiveCall, CallState, TelephonyExtensionInfo } from "../shared/types";

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

    if (this.registerer) {
      try { await this.registerer.unregister(); } catch { /* ignore */ }
      this.registerer = null;
    }

    this._registered = false;

    if (this.ua) {
      try { await this.ua.stop(); } catch { /* ignore */ }
      this.ua = null;
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
    if (this.currentSession?.state === SessionState.Established) {
      try {
        await this.currentSession.invite({ requestDelegate: undefined });
        this._callState = "hold";
        if (this._activeCall) this._activeCall.state = "hold";
        this.emitStateChange();
      } catch (err: any) {
        this.emit("error", `Hold failed: ${err.message}`);
      }
    }
  }

  async unhold(): Promise<void> {
    if (this.currentSession?.state === SessionState.Established) {
      try {
        await this.currentSession.invite({ requestDelegate: undefined });
        this._callState = "connected";
        if (this._activeCall) this._activeCall.state = "connected";
        this.emitStateChange();
      } catch (err: any) {
        this.emit("error", `Unhold failed: ${err.message}`);
      }
    }
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
    this.emit("mute-state", this._muted);
    return this._muted;
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
          break;
        case SessionState.Established:
          this._callState = "connected";
          if (this._activeCall) {
            this._activeCall.state = "connected";
            this._activeCall.answeredAt = new Date().toISOString();
          }
          break;
        case SessionState.Terminated:
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
