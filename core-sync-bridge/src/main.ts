/**
 * Core Sync Bridge — Main Entry Point
 *
 * Reads core MySQL database (READ-ONLY) and pushes changes
 * to CRM webhook endpoint.
 *
 * Schedule:
 * - Every 5 min:  Delta poll (changed records only)
 * - Every hour:   Count verification
 * - Every 30 min: Retry failed sync events
 * - 3 AM nightly: Gap repair (fix mismatches)
 * - 4 AM daily:   Reload gates & contacts (no-timestamp tables)
 *
 * ⛔ ABSOLUTE RULE: NEVER WRITE TO CORE DATABASE
 */

import { config } from "./config";
import { testConnection, closePool, query } from "./mysql-client";
import { runDeltaPoll } from "./delta-poller";
import { runCountCheck, EntityCounts } from "./count-verifier";
import { runGapRepair } from "./gap-repairer";
import { getStats, postWebhook } from "./crm-poster";
import { startHealthServer } from "./health-server";
import { load as loadCheckpoint } from "./checkpoint";
import { createLogger } from "./logger";
import { RowDataPacket } from "mysql2/promise";

const log = createLogger("Main");

const CRM_BRIDGE_HEALTH_URL = config.crm.webhookUrl.replace(
  "/webhook",
  "/bridge-health",
);

const CRM_ENTITY_IDS_URL = config.crm.webhookUrl.replace(
  "/webhook",
  "/entity-ids",
);

const CRM_RETRY_FAILED_URL = config.crm.webhookUrl.replace(
  "/webhook",
  "/retry-failed",
);

/**
 * Fetch CRM entity counts from the bridge-health endpoint.
 * Authenticated via shared secret (x-core-secret header).
 */
async function getCrmCounts(): Promise<EntityCounts | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const resp = await fetch(CRM_BRIDGE_HEALTH_URL, {
      headers: {
        "x-core-secret": config.crm.webhookSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      log.warn(`CRM bridge-health endpoint returned ${resp.status}`);
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
 * Fetch CRM entity coreIds for gap repair.
 * Authenticated via shared secret (x-core-secret header).
 */
async function getCrmEntityIds(
  entity: string,
): Promise<number[] | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const resp = await fetch(`${CRM_ENTITY_IDS_URL}?type=${entity}`, {
      headers: {
        "x-core-secret": config.crm.webhookSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      log.warn(`CRM entity-ids endpoint returned ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as any;
    return Array.isArray(data.ids) ? data.ids : null;
  } catch (err: any) {
    log.warn(`Failed to fetch CRM entity IDs for ${entity}: ${err.message}`);
    return null;
  }
}

/**
 * Trigger retry of failed sync events on CRM.
 * Authenticated via shared secret (x-core-secret header).
 */
async function triggerFailedRetry(): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const resp = await fetch(CRM_RETRY_FAILED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-core-secret": config.crm.webhookSecret,
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      log.warn(`CRM retry-failed endpoint returned ${resp.status}`);
      return;
    }

    const data = (await resp.json()) as any;
    if (data.retried > 0) {
      log.info(
        `Failed event retry: ${data.retried} attempted, ${data.succeeded} succeeded, ${data.failed} failed`,
      );
    }
  } catch (err: any) {
    log.warn(`Failed to trigger retry: ${err.message}`);
  }
}

/**
 * Bulk reload gate devices and contacts (tables without timestamps).
 * Runs daily — both tables are small so full reload is fine.
 * ⛔ ALL QUERIES ARE READ-ONLY.
 */
async function reloadGatesAndContacts(): Promise<void> {
  log.info("Reloading gates and contacts (no-timestamp tables)...");

  let gateCount = 0;
  let contactCount = 0;

  try {
    // Gates
    const gates = await query<RowDataPacket[]>(
      `SELECT ID, name, companyID,
              smartGSMGateNumber1, smartGSMGateNumber2, smartGSMGateNumber3,
              smartGSMGateNumber4, smartGSMGateLiftNumber
       FROM smartgsmgate`,
    );

    for (const g of gates) {
      try {
        await postWebhook("asset.upsert", {
          coreId: 10_000_000 + g.ID,
          name: g.name,
          type: "SMART_GSM_GATE",
          assignedBuildingCoreId: g.companyID,
          door1: g.smartGSMGateNumber1,
          door2: g.smartGSMGateNumber2,
          door3: g.smartGSMGateNumber3,
        });
        gateCount++;
      } catch (err: any) {
        log.error(`Failed to sync gate ${g.ID}: ${err.message}`);
      }
    }

    // Contacts
    const contacts = await query<RowDataPacket[]>(
      `SELECT id, name, type, description, contactClientID, companyID
       FROM contactperson`,
    );

    for (const ct of contacts) {
      try {
        await postWebhook("contact.upsert", {
          coreId: ct.id,
          buildingCoreId: ct.companyID,
          name: ct.name || "Contact",
          type: ct.type,
          description: ct.description,
          clientCoreId: ct.contactClientID,
        });
        contactCount++;
      } catch (err: any) {
        log.error(`Failed to sync contact ${ct.id}: ${err.message}`);
      }
    }

    log.info(
      `Reload complete: ${gateCount} gates, ${contactCount} contacts`,
    );
  } catch (err: any) {
    log.error(`Gates/contacts reload failed: ${err.message}`);
  }
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

  // Nightly gap repair at 3 AM + daily gates/contacts reload at 4 AM
  let lastRepairDate = "";
  let lastReloadDate = "";
  const nightlyTimer = setInterval(() => {
    const now = new Date();
    const hour = now.getHours();
    const dateStr = now.toISOString().slice(0, 10);

    // Gap repair at 3 AM
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

    // Gates & contacts reload at 4 AM (tables without timestamps)
    if (hour === 4 && dateStr !== lastReloadDate) {
      lastReloadDate = dateStr;
      log.info("Daily gates/contacts reload triggered");
      reloadGatesAndContacts().catch((err) =>
        log.error(`Gates/contacts reload error: ${err.message}`),
      );
    }
  }, 60_000);

  // Failed event retry — every 30 minutes
  log.info("Failed event retry scheduled: every 30 minutes");
  const retryTimer = setInterval(() => {
    triggerFailedRetry().catch((err) =>
      log.error(`Failed retry error: ${err.message}`),
    );
  }, 30 * 60 * 1000);

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
    clearInterval(retryTimer);
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
