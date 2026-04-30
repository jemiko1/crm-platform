import express from "express";
import cors from "cors";
import { randomBytes } from "crypto";
import { dialog } from "electron";
import type { Server } from "http";
import { getSession, setSession, getCrmBaseUrl } from "./session-store";
import type { AppLoginResponse } from "../shared/types";

const PORT = 19876;

/**
 * Exact-match origin allow-list. `origin.includes("localhost")` was unsafe —
 * `https://evil-localhost.example.com` matched. Now we require exact string
 * equality, plus anything in the optional BRIDGE_ALLOWED_ORIGINS env var.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:4002",   // dev frontend
  "http://127.0.0.1:4002",   // dev alt
  "https://crm28.asg.ge",    // production web
];

function buildAllowedOrigins(): Set<string> {
  const extra = (process.env.BRIDGE_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

/**
 * Per-session bridge token. Rotated every time the softphone logs in
 * (or swaps users via /switch-user). /dial, /switch-user, /logout all
 * require the caller to present this value as the X-Bridge-Token header.
 *
 * The token is 32 random bytes hex-encoded (64 chars). Only kept in
 * memory — never persisted. The web UI fetches it via the existing
 * /auth/device-token → /switch-user handshake and holds it in memory for
 * the lifetime of the browser tab.
 */
let currentBridgeToken: string | null = null;

function rotateBridgeToken(): string {
  currentBridgeToken = randomBytes(32).toString("hex");
  return currentBridgeToken;
}

function clearBridgeToken(): void {
  currentBridgeToken = null;
}

export function getCurrentBridgeToken(): string | null {
  return currentBridgeToken;
}

/**
 * Called from index.ts when the Electron main-process completes an
 * `/auth/app-login` (native softphone login) — rotates the bridge token so
 * any cached token in a web UI is invalidated.
 */
export function onSoftphoneLogin(): void {
  rotateBridgeToken();
}

export function onSoftphoneLogout(): void {
  clearBridgeToken();
}

export function startLocalServer(_unused: unknown, callbacks: {
  onSessionChanged: (session: AppLoginResponse | null) => void;
  onDial?: (number: string) => Promise<boolean> | boolean;
  getSipRegistered?: () => boolean;
}): Server {
  const app = express();
  const allowed = buildAllowedOrigins();

  app.use(cors({
    origin: (origin, cb) => {
      // Non-browser callers (Electron itself, curl, etc.) don't send Origin.
      // Mutating endpoints still require the X-Bridge-Token header, so this
      // is safe.
      if (!origin) return cb(null, true);
      if (allowed.has(origin)) return cb(null, true);
      return cb(new Error(`Origin not allowed: ${origin}`));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "X-Bridge-Token"],
  }));

  app.use(express.json());

  /**
   * Require a valid X-Bridge-Token header. Used on every state-changing
   * endpoint. Returns true if request should continue, false if it sent
   * 401 already.
   */
  function requireBridgeToken(req: express.Request, res: express.Response): boolean {
    const token = req.header("x-bridge-token");
    if (!currentBridgeToken) {
      res.status(401).json({ error: "Bridge not ready (no active session)" });
      return false;
    }
    if (!token || token !== currentBridgeToken) {
      res.status(401).json({ error: "Invalid or stale bridge token" });
      return false;
    }
    return true;
  }

  /**
   * /status — unauthenticated; reduced payload so a malicious local
   * process cannot harvest the operator's name / email / extension.
   *
   * We DO include `user.id` (an opaque UUID) so the web UI can detect
   * "the softphone is paired to a different CRM user" and prompt the
   * operator before hijacking the softphone via /switch-user. The UUID
   * on its own is not useful to an attacker without a valid JWT.
   */
  app.get("/status", (_req, res) => {
    const session = getSession();
    const sipRegistered = callbacks.getSipRegistered?.() ?? false;
    res.json({
      running: true,
      loggedIn: !!session,
      user: session ? { id: session.user.id } : null,
      sipRegistered,
      callState: "IDLE",
    });
  });

  app.post("/switch-user", async (req, res) => {
    const { handshakeToken } = req.body;
    if (!handshakeToken) {
      return res.status(400).json({ error: "handshakeToken required" });
    }

    try {
      const baseUrl = getCrmBaseUrl();
      const response = await fetch(`${baseUrl}/auth/exchange-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handshakeToken }),
      });

      if (!response.ok) {
        const body = await response.text();
        return res.status(response.status).json({ error: body });
      }

      const data = (await response.json()) as AppLoginResponse;

      // B9 — require explicit operator confirmation before a page on
      // crm28.asg.ge (or any allowlisted origin) can sign in or swap
      // the softphone to a CRM user. Without this, any XSS in the CRM
      // web app can mint a bridge token for itself and POST /dial through
      // the operator's softphone (toll-fraud / vishing vector). The
      // native Electron dialog cannot be triggered from the renderer or
      // from a browser tab — it requires a real keystroke or click in
      // the softphone main window, which is the security boundary.
      //
      // Skip the prompt when the incoming session matches the currently
      // logged-in user — that's a legitimate token-refresh flow, not
      // a hijack attempt.
      //
      // Two prompt variants:
      //   - First-time SSO sign-in (no current session): "sign in" wording
      //   - User switch (different operator already paired): "switch" wording
      const current = getSession();
      const isSameUser = current?.user?.id === data.user?.id;
      if (!isSameUser) {
        const newName =
          data.user?.firstName || data.user?.lastName
            ? `${data.user.firstName ?? ""} ${data.user.lastName ?? ""}`.trim()
            : data.user?.email ?? "new user";
        const isFirstSignIn = !current;
        const title = isFirstSignIn
          ? "Sign in to softphone"
          : "Softphone user switch";
        const message = isFirstSignIn
          ? `CRM Web is requesting to sign in to softphone as ${newName}. Allow?`
          : `Allow the CRM web app to switch the softphone to ${newName}?`;
        const detail = isFirstSignIn
          ? `Only allow this if you initiated the sign-in yourself from the CRM web app.`
          : `Currently signed in as: ${current.user?.email ?? "current user"}\n\nOnly allow this if you initiated it yourself from the CRM.`;
        const answer = await dialog.showMessageBox({
          type: "question",
          buttons: ["Allow", "Deny"],
          defaultId: 1,
          cancelId: 1,
          title,
          message,
          detail,
        });
        if (answer.response !== 0) {
          return res.status(403).json({
            error: isFirstSignIn ? "Sign-in denied" : "User switch denied",
          });
        }
      }

      setSession(data);
      callbacks.onSessionChanged(data);
      // Rotate the bridge token on user swap. The caller (web UI that
      // just initiated the swap) gets the new token in the response and
      // MUST use it for all subsequent /dial calls. Any other tab or
      // process holding the previous token is automatically invalidated.
      const bridgeToken = rotateBridgeToken();
      res.json({
        ok: true,
        user: { id: data.user.id },
        bridgeToken,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/dial", async (req, res) => {
    if (!requireBridgeToken(req, res)) return;

    const { number } = req.body;
    if (!number || typeof number !== "string") {
      return res.status(400).json({ error: "number is required" });
    }

    // Sanitize: strip formatting, validate phone number format
    const cleaned = number.replace(/[\s\-()]/g, "");
    if (!/^\+?\d{3,20}$/.test(cleaned)) {
      return res.status(400).json({ error: "Invalid phone number format" });
    }

    const session = getSession();
    if (!session) {
      return res.status(401).json({ error: "Not logged in" });
    }

    try {
      if (callbacks.onDial) {
        const ok = await callbacks.onDial(number);
        res.json({ ok, number });
      } else {
        res.status(501).json({ error: "Dial not supported in this build" });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/logout", async (req, res) => {
    if (!requireBridgeToken(req, res)) return;

    setSession(null);
    callbacks.onSessionChanged(null);
    clearBridgeToken();
    res.json({ ok: true });
  });

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[CRM28 Phone] Local bridge listening on http://127.0.0.1:${PORT}`);
    console.log(`[CRM28 Phone] Allowed origins: ${Array.from(allowed).join(", ")}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[CRM28 Phone] Port ${PORT} already in use -- another instance running?`);
      process.exit(1);
    }
  });

  return server;
}
