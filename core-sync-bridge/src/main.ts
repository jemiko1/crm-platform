/**
 * Core Sync Bridge — Main Entry Point
 *
 * Reads core MySQL database (READ-ONLY) and pushes changes
 * to CRM webhook endpoint on Railway.
 *
 * Schedule:
 * - Every 5 min:  Delta poll (changed records only)
 * - Every hour:   Count verification
 * - 3 AM nightly: Gap repair (fix mismatches)
 *
 * ⛔ ABSOLUTE RULE: NEVER WRITE TO CORE DATABASE
 */

import { config } from "./config";
import { testConnection, closePool } from "./mysql-client";
import { runDeltaPoll } from "./delta-poller";
import { runCountCheck, EntityCounts } from "./count-verifier";
import { runGapRepair } from "./gap-repairer";
import { getStats } from "./crm-poster";
import { startHealthServer } from "./health-server";
import { load as loadCheckpoint } from "./checkpoint";
import { createLogger } from "./logger";

const log = createLogger("Main");

const CRM_HEALTH_URL = config.crm.webhookUrl.replace(
  "/webhook",
  "/health",
);

/**
 * Fetch CRM entity counts from the health endpoint.
 */
async function getCrmCounts(): Promise<EntityCounts | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(CRM_HEALTH_URL, {
      headers: {
        Cookie: "", // Health endpoint requires JWT — this will need auth
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      log.warn(`CRM health endpoint returned ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as any;
    return {
      buildings: data.entityCounts?.buildings ?? 0,
      clients: data.entityCounts?.clients ?? 0,
      assets: data.entityCounts?.assets ?? 0,
    };
  } catch (err: any) {
    log.warn(`Failed to fetch CRM counts: ${err.message}`);
    return null;
  }
}

/**
 * Placeholder for fetching CRM entity IDs for gap repair.
 * TODO: Add a dedicated endpoint on CRM for this.
 */
async function getCrmEntityIds(
  _entity: string,
): Promise<number[] | null> {
  // For now, gap repair only logs mismatches.
  // CRM needs a GET /v1/integrations/core/entity-ids?type=building endpoint.
  log.warn(
    `getCrmEntityIds not yet implemented — gap repair will use count-only mode`,
  );
  return null;
}

async function main(): Promise<void> {
  log.info("═══════════════════════════════════════════════");
  log.info("  Core Sync Bridge starting");
  log.info("  ⛔ Core MySQL is READ-ONLY — no writes ever");
  log.info("═══════════════════════════════════════════════");

  // Test MySQL connectivity
  const mysqlOk = await testConnection();
  if (!mysqlOk) {
    log.error(
      "Cannot connect to core MySQL. Check VPN, credentials, and firewall.",
    );
    process.exit(1);
  }
  log.info("MySQL connection OK");

  // Health endpoint
  const healthServer = startHealthServer(config.healthPort, () => {
    const stats = getStats();
    let checkpoint: Record<string, unknown> | null = null;
    try {
      checkpoint = loadCheckpoint() as unknown as Record<string, unknown>;
    } catch { /* ignore */ }
    return {
      poster: {
        totalPosted: stats.totalPosted,
        totalErrors: stats.totalErrors,
        lastSuccessAt: stats.lastSuccessAt?.toISOString() ?? null,
        minutesSinceSuccess: stats.minutesSinceSuccess,
      },
      checkpoint,
    };
  });

  // ── Scheduling ────────────────────────────────────────

  const pollIntervalMs = config.polling.intervalMinutes * 60 * 1000;
  const countCheckIntervalMs =
    config.polling.countCheckIntervalMinutes * 60 * 1000;

  // Delta poll — every 5 minutes
  log.info(
    `Delta poll scheduled: every ${config.polling.intervalMinutes} minutes`,
  );
  const pollTimer = setInterval(() => {
    runDeltaPoll().catch((err) =>
      log.error(`Delta poll error: ${err.message}`),
    );
  }, pollIntervalMs);

  // Count verification — every hour
  log.info(
    `Count check scheduled: every ${config.polling.countCheckIntervalMinutes} minutes`,
  );
  const countTimer = setInterval(() => {
    runCountCheck(getCrmCounts).catch((err) =>
      log.error(`Count check error: ${err.message}`),
    );
  }, countCheckIntervalMs);

  // Nightly gap repair — check every minute if it's 3 AM
  let lastRepairDate = "";
  const nightlyTimer = setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const dateStr = now.toISOString().slice(0, 10);

    if (
      hour === config.polling.nightlyRepairHour &&
      dateStr !== lastRepairDate
    ) {
      lastRepairDate = dateStr;
      log.info("Nightly gap repair triggered");
      runGapRepair(getCrmEntityIds).catch((err) =>
        log.error(`Gap repair error: ${err.message}`),
      );
    }
  }, 60_000);

  // Status logging — every minute
  const statusTimer = setInterval(() => {
    const stats = getStats();
    log.info(
      `Status: posted=${stats.totalPosted}, errors=${stats.totalErrors}, ` +
        `lastSuccess=${stats.lastSuccessAt?.toISOString() ?? "never"}`,
    );
  }, 60_000);

  // Run first poll immediately
  log.info("Running initial delta poll...");
  await runDeltaPoll();

  // ── Graceful shutdown ─────────────────────────────────

  async function shutdown(signal: string): Promise<void> {
    log.info(`${signal} received, shutting down...`);
    clearInterval(pollTimer);
    clearInterval(countTimer);
    clearInterval(nightlyTimer);
    clearInterval(statusTimer);
    healthServer.close();

    await closePool();

    const stats = getStats();
    log.info(
      `Final stats: posted=${stats.totalPosted}, errors=${stats.totalErrors}`,
    );
    log.info("Goodbye.");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  if (process.platform === "win32") {
    process.on("SIGHUP", () => shutdown("SIGHUP"));
  }

  log.info("Core Sync Bridge is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  log.error(`Fatal error: ${err.message}`, err);
  process.exit(1);
});
