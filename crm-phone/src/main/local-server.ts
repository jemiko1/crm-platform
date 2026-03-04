import express from "express";
import cors from "cors";
import type { Server } from "http";
import { getSession, setSession, getCrmBaseUrl } from "./session-store";
import type { AppLoginResponse } from "../shared/types";

const PORT = 19876;

export function startLocalServer(_unused: unknown, callbacks: {
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
    res.json({
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
      setSession(data);
      callbacks.onSessionChanged(data);
      res.json({ ok: true, user: data.user, extension: data.telephonyExtension?.extension });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/logout", async (_req, res) => {
    setSession(null);
    callbacks.onSessionChanged(null);
    res.json({ ok: true });
  });

  const server = app.listen(PORT, "127.0.0.1", () => {
    console.log(`[CRM28 Phone] Local bridge listening on http://127.0.0.1:${PORT}`);
  });

  server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[CRM28 Phone] Port ${PORT} already in use -- another instance running?`);
      process.exit(1);
    }
  });

  return server;
}
