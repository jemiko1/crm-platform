/**
 * Count Verifier — compares entity counts between core MySQL and CRM.
 *
 * Runs every hour. If counts mismatch, logs it for nightly repair.
 * Does NOT fix anything during the day — just detects gaps.
 *
 * ⛔ ALL QUERIES ARE READ-ONLY.
 */

import { RowDataPacket } from "mysql2/promise";
import { query } from "./mysql-client";
import { load, save } from "./checkpoint";
import { createLogger } from "./logger";

const log = createLogger("CountCheck");

interface CountRow extends RowDataPacket {
  cnt: number;
}

export interface EntityCounts {
  buildings: number;
  clients: number;
  assets: number;
}

/**
 * Get entity counts from core MySQL.
 */
export async function getCoreCounts(): Promise<EntityCounts> {
  const [bRows] = await Promise.all([
    query<CountRow[]>("SELECT COUNT(*) AS cnt FROM company"),
  ]);
  const [cRows] = await Promise.all([
    query<CountRow[]>("SELECT COUNT(*) AS cnt FROM client"),
  ]);
  const [aRows] = await Promise.all([
    query<CountRow[]>(
      "SELECT COUNT(*) AS cnt FROM savingaccount WHERE accountType IN ('LIFT', 'DOOR', 'INTERCOM')",
    ),
  ]);

  return {
    buildings: bRows[0]?.cnt ?? 0,
    clients: cRows[0]?.cnt ?? 0,
    assets: aRows[0]?.cnt ?? 0,
  };
}

/**
 * Run the count verification check.
 * Compares core MySQL counts with what CRM reports.
 * Mismatches are logged for nightly repair.
 *
 * Note: CRM counts come from the CRM health endpoint.
 * If CRM is unreachable, we just log core counts.
 */
export async function runCountCheck(
  getCrmCounts: () => Promise<EntityCounts | null>,
): Promise<void> {
  try {
    const coreCounts = await getCoreCounts();
    log.info(
      `Core counts: buildings=${coreCounts.buildings}, clients=${coreCounts.clients}, assets=${coreCounts.assets}`,
    );

    const crmCounts = await getCrmCounts();
    if (!crmCounts) {
      log.warn("Could not fetch CRM counts — skipping comparison");
      save({ lastCountCheck: new Date().toISOString() });
      return;
    }

    log.info(
      `CRM counts:  buildings=${crmCounts.buildings}, clients=${crmCounts.clients}, assets=${crmCounts.assets}`,
    );

    const mismatches: Array<{
      entity: string;
      coreCount: number;
      crmCount: number;
      detectedAt: string;
    }> = [];

    if (coreCounts.buildings !== crmCounts.buildings) {
      mismatches.push({
        entity: "building",
        coreCount: coreCounts.buildings,
        crmCount: crmCounts.buildings,
        detectedAt: new Date().toISOString(),
      });
      log.warn(
        `MISMATCH: buildings — core=${coreCounts.buildings}, crm=${crmCounts.buildings}, diff=${coreCounts.buildings - crmCounts.buildings}`,
      );
    }

    if (coreCounts.clients !== crmCounts.clients) {
      mismatches.push({
        entity: "client",
        coreCount: coreCounts.clients,
        crmCount: crmCounts.clients,
        detectedAt: new Date().toISOString(),
      });
      log.warn(
        `MISMATCH: clients — core=${coreCounts.clients}, crm=${crmCounts.clients}, diff=${coreCounts.clients - crmCounts.clients}`,
      );
    }

    if (coreCounts.assets !== crmCounts.assets) {
      mismatches.push({
        entity: "asset",
        coreCount: coreCounts.assets,
        crmCount: crmCounts.assets,
        detectedAt: new Date().toISOString(),
      });
      log.warn(
        `MISMATCH: assets — core=${coreCounts.assets}, crm=${crmCounts.assets}, diff=${coreCounts.assets - crmCounts.assets}`,
      );
    }

    if (mismatches.length === 0) {
      log.info("All counts match — sync is healthy");
    }

    const cp = load();
    save({
      lastCountCheck: new Date().toISOString(),
      countMismatches:
        mismatches.length > 0 ? mismatches : cp.countMismatches,
    });
  } catch (err: any) {
    log.error(`Count check failed: ${err.message}`);
  }
}
