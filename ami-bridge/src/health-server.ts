import * as http from "http";
import { createLogger } from "./logger";

const log = createLogger("Health");

export interface HealthStats {
  ami: { connected: boolean; activeCalls: number };
  buffer: { size: number };
  poster: {
    totalPosted: number;
    totalErrors: number;
    lastSuccessAt: string | null;
    minutesSinceSuccess: number | null;
  };
}

type StatsProvider = () => HealthStats;

export function startHealthServer(
  port: number,
  getStats: StatsProvider,
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      const stats = getStats();
      const healthy = stats.ami.connected;

      res.writeHead(healthy ? 200 : 503, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          service: "ami-bridge",
          status: healthy ? "healthy" : "degraded",
          uptime: process.uptime(),
          timestamp: new Date().toISOString(),
          ...stats,
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end("Not Found");
  });

  server.listen(port, "0.0.0.0", () => {
    log.info(`Health server listening on http://0.0.0.0:${port}/health`);
  });

  return server;
}
