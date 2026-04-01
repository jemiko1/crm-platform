import * as http from "http";
import { createLogger } from "./logger";

const log = createLogger("Health");

export interface HealthStats {
  poster: {
    totalPosted: number;
    totalErrors: number;
    lastSuccessAt: string | null;
    minutesSinceSuccess: number | null;
  };
  checkpoint: Record<string, unknown> | null;
}

type StatsProvider = () => HealthStats;

export function startHealthServer(
  port: number,
  getStats: StatsProvider,
): http.Server {
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      const stats = getStats();

      // Time-aware threshold: operators work 10:00-19:00 Tbilisi time (UTC+4).
      // During business hours, flag degraded after 30 min with no sync.
      // After hours, relax to 4 hours since no Core edits are expected.
      const hour = new Date().getUTCHours() + 4; // UTC+4 for Georgia
      const isBusinessHours = (hour % 24) >= 10 && (hour % 24) < 19;
      const thresholdMinutes = isBusinessHours ? 30 : 240;

      const healthy =
        stats.poster.minutesSinceSuccess === null ||
        stats.poster.minutesSinceSuccess < thresholdMinutes;

      res.writeHead(healthy ? 200 : 503, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(
        JSON.stringify({
          service: "core-sync-bridge",
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
