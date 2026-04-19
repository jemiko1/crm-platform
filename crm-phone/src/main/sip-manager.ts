import { EventEmitter } from "events";
import WebSocketNode from "ws";
(globalThis as any).WebSocket = WebSocketNode;

import { UserAgent, Registerer, Invitation, Inviter, SessionState } from "sip.js";
import type { Session } from "sip.js";
import type { ActiveCall, CallState, TelephonyExtensionInfo } from "../shared/types";

export class SipManager extends EventEmitter {
  private ua: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private currentSession: Session | null = null;
  private _registered = false;
  private _callState: CallState = "idle";
  private _activeCall: ActiveCall | null = null;
  private _muted = false;
  private _sipHost: string | null = null;

  get registered(): boolean {
    return this._registered;
  }

  get callState(): CallState {
    return this._callState;
  }

  get activeCall(): ActiveCall | null {
    return this._activeCall;
  }

  async register(ext: TelephonyExtensionInfo): Promise<void> {
    await this.unregister();

    // SECURITY (audit/P0-C): do not log sipPassword or its length.
    console.log(
      `[SIP] register() called extension=${ext.extension} server=${ext.sipServer ?? "none"} hasPassword=${!!ext.sipPassword}`,
    );

    if (!ext.sipServer) {
      console.log("[SIP] ABORT: No SIP server");
      this.emit("error", "No SIP server configured for this extension");
      return;
    }

    if (!ext.sipPassword) {
      console.log("[SIP] ABORT: No SIP password");
      this.emit("error", "No SIP password configured for this extension");
      return;
    }

    // Accept self-signed TLS certs from internal PBX servers
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

    this._sipHost = ext.sipServer;
    const wssUrl = `wss://${this._sipHost}:8089/ws`;
    const sipUri = `sip:${ext.extension}@${this._sipHost}`;
    console.log("[SIP] Connecting to:", wssUrl, "URI:", sipUri);

    const uri = UserAgent.makeURI(sipUri);
    if (!uri) {
      console.log("[SIP] ABORT: Invalid SIP URI");
      this.emit("error", `Invalid SIP URI for extension ${ext.extension}`);
      return;
    }

    this.ua = new UserAgent({
      uri,
      authorizationUsername: ext.extension,
      authorizationPassword: ext.sipPassword,
      transportOptions: {
        server: wssUrl,
      },
      displayName: ext.displayName,
      logLevel: "warn",
    });

    this.ua.delegate = {
      onInvite: (invitation: Invitation) => this.handleIncoming(invitation),
    };

    console.log("[SIP] Starting UserAgent...");
    try {
      await this.ua.start();
      console.log("[SIP] UserAgent started OK");
    } catch (err: any) {
      console.log("[SIP] UserAgent start FAILED:", err.message, err.stack);
      this.emit("error", `SIP transport failed: ${err.message}`);
      return;
    }

    this.registerer = new Registerer(this.ua, {
      expires: 300,
    });

    this.registerer.stateChange.addListener((state) => {
      console.log("[SIP] Registration state:", state);
      this._registered = state === "Registered";
      this.emit("registration-state", this._registered);
    });

    console.log("[SIP] Sending REGISTER...");
    try {
      await this.registerer.register();
      console.log("[SIP] REGISTER request sent successfully");
    } catch (err: any) {
      console.log("[SIP] REGISTER FAILED:", err.message, err.stack);
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
        if (
          this.currentSession.state === SessionState.Established ||
          this.currentSession.state === SessionState.Establishing
        ) {
          this.currentSession.bye();
        }
      } catch {
        /* ignore */
      }
      this.currentSession = null;
    }

    if (this.registerer) {
      try {
        await this.registerer.unregister();
      } catch {
        /* ignore */
      }
      this.registerer = null;
    }

    this._registered = false;

    if (this.ua) {
      try {
        await this.ua.stop();
      } catch {
        /* ignore */
      }
      this.ua = null;
    }

    this.emit("registration-state", false);
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

  async answer(): Promise<void> {
    if (this.currentSession instanceof Invitation) {
      try {
        await this.currentSession.accept();
      } catch (err: any) {
        this.emit("error", `Answer failed: ${err.message}`);
      }
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
    } catch {
      /* ignore */
    }

    this.currentSession = null;
    this._callState = "idle";
    this._activeCall = null;
    this._muted = false;
    this.emitStateChange();
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
      const options = { requestOptions: { body: { contentDisposition: "render", contentType: "application/dtmf-relay", content: `Signal=${tone}\r\nDuration=160` } } };
      this.currentSession.info(options).catch(() => {});
    }
  }

  toggleMute(): boolean {
    this._muted = !this._muted;
    this.emit("mute-state", this._muted);
    return this._muted;
  }

  private handleIncoming(invitation: Invitation): void {
    const remoteNumber =
      invitation.remoteIdentity.uri.user || "Unknown";

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
  }

  private setupSession(
    session: Session,
    direction: "inbound" | "outbound",
    remoteNumber: string,
  ): void {
    this.currentSession = session;

    session.stateChange.addListener((state) => {
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

  private emitStateChange(): void {
    this.emit("state-change", {
      callState: this._callState,
      activeCall: this._activeCall,
      registered: this._registered,
      muted: this._muted,
    });
  }
}
