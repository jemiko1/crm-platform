import { config } from "./config";
import { AmiClient, AmiEvent } from "./ami-client";
import { EventMapper } from "./event-mapper";
import { EventBuffer } from "./event-buffer";
import { CrmPoster } from "./crm-poster";
import { startHealthServer } from "./health-server";
import { createLogger } from "./logger";

const log = createLogger("Main");

async function main(): Promise<void> {
  log.info("═══════════════════════════════════════════");
  log.info("  AMI Bridge starting");
  log.info("═══════════════════════════════════════════");

  const ami = new AmiClient({
    host: config.ami.host,
    port: config.ami.port,
    username: config.ami.username,
    secret: config.ami.secret,
    reconnectBaseMs: config.ami.reconnectBaseMs,
    reconnectMaxMs: config.ami.reconnectMaxMs,
    pingIntervalMs: config.ami.pingIntervalMs,
  });

  const mapper = new EventMapper();

  const poster = new CrmPoster({
    baseUrl: config.crm.baseUrl,
    ingestSecret: config.crm.ingestSecret,
    timeoutMs: config.crm.timeoutMs,
    retryAttempts: config.crm.retryAttempts,
    retryBaseMs: config.crm.retryBaseMs,
  });

  const buffer = new EventBuffer(
    config.buffer.maxSize,
    config.buffer.flushIntervalMs,
    (events) => poster.post(events),
  );

  // Wire AMI events through mapper → buffer → poster
  ami.on("event", (evt: AmiEvent) => {
    try {
      const crmEvents = mapper.map(evt);
      if (crmEvents.length > 0) {
        buffer.push(crmEvents);
      }
    } catch (err: any) {
      log.error(`Mapper error for ${evt.Event}: ${err.message}`);
    }
  });

  ami.on("ready", () => {
    log.info("AMI connected and ready — listening for events");
  });

  ami.on("disconnected", () => {
    log.warn("AMI disconnected — will reconnect automatically");
  });

  // Health endpoint
  const healthServer = startHealthServer(config.healthPort, () => {
    const stats = poster.getStats();
    return {
      ami: { connected: ami.isConnected(), activeCalls: mapper.getActiveCallCount() },
      buffer: { size: buffer.size },
      poster: {
        totalPosted: stats.totalPosted,
        totalErrors: stats.totalErrors,
        lastSuccessAt: stats.lastSuccessAt?.toISOString() ?? null,
        minutesSinceSuccess: stats.minutesSinceSuccess,
      },
    };
  });

  const STALE_INGEST_THRESHOLD_MINS = 5;
  const STALE_CALL_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

  const statusInterval = setInterval(() => {
    const stats = poster.getStats();
    log.info(
      `Status: connected=${ami.isConnected()}, activeCalls=${mapper.getActiveCallCount()}, ` +
        `buffered=${buffer.size}, posted=${stats.totalPosted}, errors=${stats.totalErrors}, ` +
        `lastSuccess=${stats.lastSuccessAt?.toISOString() ?? 'never'}`,
    );
    if (stats.minutesSinceSuccess !== null && stats.minutesSinceSuccess >= STALE_INGEST_THRESHOLD_MINS) {
      log.warn(
        `ALERT: No successful CRM ingest for ${stats.minutesSinceSuccess} minute(s). ` +
          `Check CRM backend health or TELEPHONY_INGEST_SECRET mismatch.`,
      );
    }
    const purged = mapper.purgeStale(STALE_CALL_TTL_MS);
    if (purged > 0) {
      log.warn(`Purged ${purged} stale call(s) older than 4 hours (missed Hangup)`);
    }
  }, 60_000);

  // Graceful shutdown
  async function shutdown(signal: string): Promise<void> {
    log.info(`${signal} received, shutting down...`);
    clearInterval(statusInterval);
    healthServer.close();
    buffer.stop();

    try {
      await buffer.flushRemaining();
    } catch (err: any) {
      log.error(`Failed to flush remaining events: ${err.message}`);
    }

    await ami.disconnect();
    const stats = poster.getStats();
    log.info(`Final stats: posted=${stats.totalPosted}, errors=${stats.totalErrors}`);
    log.info("Goodbye.");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Windows: handle Ctrl+C
  if (process.platform === "win32") {
    process.on("SIGHUP", () => shutdown("SIGHUP"));
  }

  // Start
  buffer.start();
  ami.connect();
}

main().catch((err) => {
  log.error(`Fatal error: ${err.message}`, err);
  process.exit(1);
});
