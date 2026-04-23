import * as net from "net";
import { EventEmitter } from "events";
import { createLogger } from "./logger";

const log = createLogger("AMI");

export interface AmiEvent {
  Event: string;
  [key: string]: string;
}

export interface AmiClientOptions {
  host: string;
  port: number;
  username: string;
  secret: string;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  pingIntervalMs: number;
}

/**
 * H9 — Detect half-open SSH tunnels. The bridge reaches Asterisk via an
 * autossh tunnel on the VM. If autossh dies but the local listener stays
 * up (half-open), `socket.connect()` succeeds but no AMI greeting ever
 * arrives. Without this timeout the bridge would sit idle forever.
 * 15 s is comfortably longer than any legitimate Asterisk startup delay.
 */
const GREETING_TIMEOUT_MS = 15_000;

export class AmiClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = "";
  private connected = false;
  private loggedIn = false;
  private greetingReceived = false;
  private greetingTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private actionCounter = 0;
  private shuttingDown = false;
  private pendingActions = new Map<
    string,
    { resolve: (resp: Record<string, string>) => void; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(private readonly opts: AmiClientOptions) {
    super();
  }

  connect(): void {
    if (this.shuttingDown) return;
    this.cleanup();

    log.info(`Connecting to ${this.opts.host}:${this.opts.port}...`);
    const socket = new net.Socket();
    this.socket = socket;

    socket.setEncoding("utf-8");
    socket.setKeepAlive(true, 10000);

    socket.connect(this.opts.port, this.opts.host);

    socket.on("connect", () => {
      log.info("TCP connected, waiting for greeting...");
      this.connected = true;
      this.reconnectAttempt = 0;
      // H9 — arm the greeting watchdog. If Asterisk's "Asterisk Call
      // Manager/x" banner doesn't arrive within 15 s we destroy the
      // socket and let the close handler trigger scheduleReconnect.
      this.armGreetingTimeout();
    });

    socket.on("data", (chunk: string) => {
      this.buffer += chunk;
      this.parseBuffer();
    });

    socket.on("error", (err) => {
      log.error("Socket error", err.message);
    });

    socket.on("close", () => {
      const wasLoggedIn = this.loggedIn;
      this.connected = false;
      this.loggedIn = false;
      this.stopPing();
      this.clearGreetingTimeout();

      for (const [id, pending] of this.pendingActions) {
        clearTimeout(pending.timer);
        pending.resolve({ Response: "Error", Message: "Disconnected" });
      }
      this.pendingActions.clear();

      if (wasLoggedIn) {
        this.emit("disconnected");
      }

      if (!this.shuttingDown) {
        this.scheduleReconnect();
      }
    });
  }

  async disconnect(): Promise<void> {
    this.shuttingDown = true;
    this.stopPing();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.loggedIn) {
      try {
        await this.sendAction({ Action: "Logoff" });
      } catch {
        // ignore
      }
    }

    this.cleanup();
    log.info("Disconnected gracefully");
  }

  isConnected(): boolean {
    return this.loggedIn;
  }

  async sendAction(
    action: Record<string, string>,
  ): Promise<Record<string, string>> {
    return new Promise((resolve) => {
      if (!this.connected || !this.socket) {
        resolve({ Response: "Error", Message: "Not connected" });
        return;
      }

      const actionId = `crm-${++this.actionCounter}`;
      const lines = Object.entries({ ...action, ActionID: actionId })
        .map(([k, v]) => `${k}: ${v}`)
        .join("\r\n");

      const timer = setTimeout(() => {
        this.pendingActions.delete(actionId);
        resolve({ Response: "Error", Message: "Timeout" });
      }, 10000);

      this.pendingActions.set(actionId, { resolve, timer });
      this.socket.write(lines + "\r\n\r\n");
    });
  }

  // ── Private ──────────────────────────────────────────────

  private login(): void {
    if (!this.socket) return;
    const msg =
      `Action: Login\r\n` +
      `Username: ${this.opts.username}\r\n` +
      `Secret: ${this.opts.secret}\r\n` +
      `Events: on\r\n` +
      `\r\n`;
    this.socket.write(msg);
  }

  private armGreetingTimeout(): void {
    this.clearGreetingTimeout();
    this.greetingTimer = setTimeout(() => {
      if (!this.greetingReceived) {
        log.error(
          `No AMI greeting within ${GREETING_TIMEOUT_MS}ms — likely a half-open SSH tunnel. Destroying socket to trigger reconnect.`,
        );
        this.socket?.destroy();
      }
    }, GREETING_TIMEOUT_MS);
  }

  private clearGreetingTimeout(): void {
    if (this.greetingTimer) {
      clearTimeout(this.greetingTimer);
      this.greetingTimer = null;
    }
  }

  private parseBuffer(): void {
    if (!this.greetingReceived) {
      const nlIdx = this.buffer.indexOf("\r\n");
      if (nlIdx === -1) return;
      const firstLine = this.buffer.slice(0, nlIdx);
      if (firstLine.startsWith("Asterisk Call Manager")) {
        this.greetingReceived = true;
        this.clearGreetingTimeout();
        this.buffer = this.buffer.slice(nlIdx + 2);
        log.info("Greeting received, sending Login...");
        this.login();
      }
    }

    const delimiter = "\r\n\r\n";
    let idx: number;

    while ((idx = this.buffer.indexOf(delimiter)) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + delimiter.length);

      if (!block.trim()) continue;
      const parsed = this.parseBlock(block);
      if (!parsed) continue;

      this.handleParsed(parsed);
    }
  }

  private parseBlock(block: string): Record<string, string> | null {
    const result: Record<string, string> = {};
    const lines = block.split("\r\n");

    for (const line of lines) {
      const colonIdx = line.indexOf(": ");
      if (colonIdx === -1) {
        if (line.startsWith("Asterisk Call Manager")) continue;
        continue;
      }
      const key = line.slice(0, colonIdx);
      const value = line.slice(colonIdx + 2);
      result[key] = value;
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  private handleParsed(msg: Record<string, string>): void {
    // Handle action responses
    if (msg.ActionID && this.pendingActions.has(msg.ActionID)) {
      const pending = this.pendingActions.get(msg.ActionID)!;
      clearTimeout(pending.timer);
      this.pendingActions.delete(msg.ActionID);
      pending.resolve(msg);
      return;
    }

    // Handle login response (no ActionID)
    if (msg.Response === "Success" && !this.loggedIn && msg.Message?.includes("Authentication accepted")) {
      this.loggedIn = true;
      log.info("Logged in to AMI successfully");
      this.startPing();
      this.emit("ready");
      return;
    }

    if (msg.Response === "Error" && !this.loggedIn) {
      log.error("AMI login failed", msg.Message);
      this.socket?.destroy();
      return;
    }

    // Handle events
    if (msg.Event) {
      this.emit("event", msg as AmiEvent);
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(async () => {
      if (!this.loggedIn) return;
      try {
        const resp = await this.sendAction({ Action: "Ping" });
        if (resp.Response !== "Success") {
          log.warn("Ping failed, connection may be stale");
        }
      } catch {
        log.warn("Ping threw, connection may be stale");
      }
    }, this.opts.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempt++;
    const delay = Math.min(
      this.opts.reconnectBaseMs * Math.pow(2, this.reconnectAttempt - 1),
      this.opts.reconnectMaxMs,
    );
    log.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private cleanup(): void {
    this.stopPing();
    this.buffer = "";

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    this.connected = false;
    this.loggedIn = false;
    this.greetingReceived = false;
  }
}
