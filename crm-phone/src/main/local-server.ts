import express from "express";
import cors from "cors";
import type { Server } from "http";
import type { SipManager } from "./sip-manager";
import { getSession, setSession, getCrmBaseUrl } from "./session-store";
import type { BridgeStatusResponse, AppLoginResponse } from "../shared/types";

const PORT = 19876;

export function startLocalServer(sipManager: SipManager, callbacks: {
  onSessionChanged: (session: AppLoginResponse | null) => void;
}): Server {
  const app = express();

  app.use(cors({
    origin: (origin, cb) => {
      if (
        !origin ||
        origin.includes("crm28.asg.ge") ||
        origin.includes("localhost") ||
        origin.includes("127.0.0.1")
      ) {
        cb(null, true);
      } else {
        cb(new Error("Blocked by CORS"));
      }
    },
    credentials: true,
  }));

  app.use(express.json());

  app.get("/status", (_req, res) => {
    const session = getSession();
    const response: BridgeStatusResponse = {
      running: true,
      loggedIn: !!session,
      user: session
        ? {
            id: session.user.id,
            name: session.user.firstName
              ? `${session.user.firstName} ${session.user.lastName || ""}`.trim()
              : session.user.email,
            extension: session.telephonyExtension?.extension || "",
          }
        : null,
      callState: sipManager.callState,
      activeCall: sipManager.activeCall,
      sipRegistered: sipManager.registered,
    };
    res.json(response);
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
      setSession(data);

      if (data.telephonyExtension) {
        await sipManager.unregister();
        await sipManager.register(data.telephonyExtension);
      } else {
        await sipManager.unregister();
      }

      callbacks.onSessionChanged(data);
      res.json({ ok: true, user: data.user, extension: data.telephonyExtension?.extension });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/logout", async (_req, res) => {
    await sipManager.unregister();
    setSession(null);
    callbacks.onSessionChanged(null);
    res.json({ ok: true });
  });

  app.post("/dial", async (req, res) => {
    const { number } = req.body;
    if (!number) {
      return res.status(400).json({ error: "number required" });
    }

    if (!sipManager.registered) {
      return res.status(409).json({ error: "SIP not registered" });
    }

    try {
      await sipManager.dial(number);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/call-state", (_req, res) => {
    res.json({
      callState: sipManager.callState,
      activeCall: sipManager.activeCall,
      sipRegistered: sipManager.registered,
    });
  });

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[CRM Phone] Local bridge listening on http://127.0.0.1:${PORT}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[CRM Phone] Port ${PORT} already in use -- another instance running?`);
      process.exit(1);
    }
  });

  return server;
}
