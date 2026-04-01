/**
 * Bridge Monitor — Dashboard server
 *
 * Serves a web UI that shows the status of both bridges (AMI Bridge + Core Sync Bridge)
 * running under PM2 on this VM. Provides:
 * - Real-time status from health endpoints
 * - PM2 process info (uptime, restarts, memory, CPU)
 * - Log tailing
 * - Restart/stop/start controls
 *
 * Ports:
 *   Dashboard: 3200 (configurable via MONITOR_PORT)
 *   AMI Bridge health: 3100
 *   Core Sync Bridge health: 3101
 */

const http = require("http");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.env.MONITOR_PORT || "3200", 10);

// ── Helpers ─────────────────────────────────────────────

function fetchJson(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ ok: true, data: JSON.parse(data) });
        } catch {
          resolve({ ok: false, error: "Invalid JSON" });
        }
      });
    });
    req.on("error", (err) => resolve({ ok: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "Timeout" });
    });
  });
}

function pm2Jlist() {
  try {
    const raw = execSync("pm2 jlist", { encoding: "utf-8", timeout: 5000 });
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function pm2Action(name, action) {
  try {
    execFileSync("pm2", [action, name], { encoding: "utf-8", timeout: 10000 });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function readLogTail(filePath, lines = 80) {
  try {
    if (!fs.existsSync(filePath)) return `[File not found: ${filePath}]`;
    const content = fs.readFileSync(filePath, "utf-8");
    const allLines = content.split("\n");
    return allLines.slice(-lines).join("\n");
  } catch (err) {
    return `[Error reading log: ${err.message}]`;
  }
}

// ── API Handlers ────────────────────────────────────────

async function handleApiStatus(res) {
  const pm2Processes = pm2Jlist();

  const amiBridge = pm2Processes.find((p) => p.name === "ami-bridge") || null;
  const coreBridge =
    pm2Processes.find((p) => p.name === "core-sync-bridge") || null;

  const [amiHealth, coreHealth] = await Promise.all([
    fetchJson("http://127.0.0.1:3100/health"),
    fetchJson("http://127.0.0.1:3101/health"),
  ]);

  const result = {
    timestamp: new Date().toISOString(),
    bridges: {
      "ami-bridge": {
        pm2: amiBridge
          ? {
              status: amiBridge.pm2_env?.status || "unknown",
              pid: amiBridge.pid,
              uptime: amiBridge.pm2_env?.pm_uptime || null,
              restarts: amiBridge.pm2_env?.restart_time || 0,
              memory: amiBridge.monit?.memory || 0,
              cpu: amiBridge.monit?.cpu || 0,
            }
          : null,
        health: amiHealth.ok ? amiHealth.data : { error: amiHealth.error },
      },
      "core-sync-bridge": {
        pm2: coreBridge
          ? {
              status: coreBridge.pm2_env?.status || "unknown",
              pid: coreBridge.pid,
              uptime: coreBridge.pm2_env?.pm_uptime || null,
              restarts: coreBridge.pm2_env?.restart_time || 0,
              memory: coreBridge.monit?.memory || 0,
              cpu: coreBridge.monit?.cpu || 0,
            }
          : null,
        health: coreHealth.ok
          ? coreHealth.data
          : { error: coreHealth.error },
      },
    },
  };

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}

function handleApiAction(req, res) {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    try {
      const { bridge, action } = JSON.parse(body);
      if (typeof bridge !== "string" || !["ami-bridge", "core-sync-bridge"].includes(bridge)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid bridge name" }));
        return;
      }
      if (typeof action !== "string" || !["restart", "stop", "start"].includes(action)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid action" }));
        return;
      }
      const result = pm2Action(bridge, action);
      res.writeHead(result.ok ? 200 : 500, {
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify(result));
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON body" }));
    }
  });
}

function handleApiLogs(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const bridge = url.searchParams.get("bridge");
  const type = url.searchParams.get("type") || "out"; // out or error

  const logPaths = {
    "ami-bridge": {
      out: "C:\\ami-bridge\\logs\\out.log",
      error: "C:\\ami-bridge\\logs\\error.log",
    },
    "core-sync-bridge": {
      out: "C:\\core-sync-bridge\\logs\\out.log",
      error: "C:\\core-sync-bridge\\logs\\error.log",
    },
  };

  if (!logPaths[bridge]) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid bridge name" }));
    return;
  }

  if (!["out", "error"].includes(type)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid log type (use 'out' or 'error')" }));
    return;
  }

  const logFile = logPaths[bridge][type];
  const content = readLogTail(logFile, 100);

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(content);
}

// ── Server ──────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/") {
      const html = fs.readFileSync(
        path.join(__dirname, "dashboard.html"),
        "utf-8",
      );
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
      return;
    }

    if (req.method === "GET" && req.url === "/api/status") {
      await handleApiStatus(res);
      return;
    }

    if (req.method === "POST" && req.url === "/api/action") {
      handleApiAction(req, res);
      return;
    }

    if (req.method === "GET" && req.url?.startsWith("/api/logs")) {
      handleApiLogs(req, res);
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Bridge Monitor dashboard: http://localhost:${PORT}`);
});
