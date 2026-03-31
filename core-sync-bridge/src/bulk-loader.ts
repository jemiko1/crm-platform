/**
 * Bulk Loader — one-time initial data load from core MySQL to CRM.
 *
 * Run this once off-hours to populate CRM with all existing data.
 * After this, delta polling keeps everything in sync.
 *
 * Usage: npx tsx src/bulk-loader.ts
 *
 * ⛔ ALL QUERIES ARE READ-ONLY.
 */

import { RowDataPacket } from "mysql2/promise";
import { config } from "./config";
import { query, closePool } from "./mysql-client";
import { postWebhook } from "./crm-poster";
import { getStats } from "./crm-poster";
import { createLogger } from "./logger";

const log = createLogger("BulkLoad");

interface BuildingId extends RowDataPacket {
  id: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadAllBuildings(): Promise<number[]> {
  const rows = await query<BuildingId[]>(
    "SELECT id FROM company ORDER BY id",
  );
  return rows.map((r) => r.id);
}

async function syncBuilding(buildingId: number): Promise<void> {
  // 1. Building info
  const bRows = await query<RowDataPacket[]>(
    `SELECT id, companyName, address, mobileNumber, email,
            identificationCode, numberOfAppartments, disableCrons,
            assignedBranchId, creationDate, lastModifiedDate
     FROM company WHERE id = ?`,
    [buildingId],
  );
  if (bRows.length === 0) return;
  const b = bRows[0];

  await postWebhook("building.upsert", {
    coreId: b.id,
    name: b.companyName,
    address: b.address,
    phone: b.mobileNumber,
    email: b.email,
    identificationCode: b.identificationCode,
    numberOfApartments: b.numberOfAppartments,
    disableCrons: Boolean(b.disableCrons),
    branchId: b.assignedBranchId,
    coreCreatedAt: b.creationDate?.toISOString() ?? null,
    coreUpdatedAt: b.lastModifiedDate?.toISOString() ?? null,
  });

  // 2. Clients (neighbors) via saving_account CURRENT_ACCOUNT
  const apartments = await query<RowDataPacket[]>(
    `SELECT sa.id AS apartmentId, sa.clientID, sa.companyID,
            sa.apartmentNumber, sa.entranceNumber, sa.floorNumber,
            sa.paymentID, sa.consolidatedBalance,
            c.firstName, c.lastName, c.documentID, c.mobileNumber,
            c.secondaryMobileNumber, c.email, c.state,
            c.creationDate, c.lastModifiedDate
     FROM saving_account sa
     JOIN client c ON c.id = sa.clientID
     WHERE sa.companyID = ? AND sa.accountType = 'CURRENT_ACCOUNT'`,
    [buildingId],
  );

  // Group by client
  const clientMap = new Map<
    number,
    { client: RowDataPacket; apts: RowDataPacket[] }
  >();
  for (const row of apartments) {
    const existing = clientMap.get(row.clientID);
    if (existing) {
      existing.apts.push(row);
    } else {
      clientMap.set(row.clientID, { client: row, apts: [row] });
    }
  }

  for (const [clientId, data] of clientMap) {
    const c = data.client;
    await postWebhook("client.upsert", {
      coreId: clientId,
      firstName: c.firstName,
      lastName: c.lastName,
      idNumber: c.documentID,
      primaryPhone: c.mobileNumber,
      secondaryPhone: c.secondaryMobileNumber,
      email: c.email,
      state: c.state,
      coreCreatedAt: c.creationDate?.toISOString() ?? null,
      coreUpdatedAt: c.lastModifiedDate?.toISOString() ?? null,
      apartments: data.apts.map((a) => ({
        buildingCoreId: a.companyID,
        apartmentCoreId: a.apartmentId,
        apartmentNumber: a.apartmentNumber,
        entranceNumber: a.entranceNumber,
        floorNumber: a.floorNumber,
        paymentId: a.paymentID,
        balance: a.consolidatedBalance,
      })),
    });
  }

  // 3. Devices (Lift/Door/Intercom)
  const devices = await query<RowDataPacket[]>(
    `SELECT id, name, accountType, productID, ip, port,
            companyID, assignedToBuildingID, creationDate, lastModifiedDate
     FROM saving_account
     WHERE (companyID = ? OR assignedToBuildingID = ?)
       AND accountType IN ('LIFT', 'DOOR', 'INTERCOM')`,
    [buildingId, buildingId],
  );

  for (const d of devices) {
    await postWebhook("asset.upsert", {
      coreId: d.id,
      name: d.name,
      type: d.accountType,
      productId: d.productID,
      ip: d.ip,
      port: d.port,
      assignedBuildingCoreId: d.assignedToBuildingID ?? d.companyID,
      coreCreatedAt: d.creationDate?.toISOString() ?? null,
      coreUpdatedAt: d.lastModifiedDate?.toISOString() ?? null,
    });
  }

  // 4. Smart GSM Gates
  try {
    const gates = await query<RowDataPacket[]>(
      `SELECT id, name, buildingID, productID,
              smartGSMGateNumber1, smartGSMGateNumber2, smartGSMGateNumber3,
              creationDate, lastModifiedDate
       FROM smart_gsm_gate WHERE buildingID = ?`,
      [buildingId],
    );

    for (const g of gates) {
      // Offset gate IDs by 10_000_000 to avoid collision with saving_account IDs
      await postWebhook("asset.upsert", {
        coreId: 10_000_000 + g.id,
        name: g.name,
        type: "SMART_GSM_GATE",
        productId: g.productID,
        assignedBuildingCoreId: g.buildingID,
        door1: g.smartGSMGateNumber1,
        door2: g.smartGSMGateNumber2,
        door3: g.smartGSMGateNumber3,
        coreCreatedAt: g.creationDate?.toISOString() ?? null,
        coreUpdatedAt: g.lastModifiedDate?.toISOString() ?? null,
      });
    }
  } catch (err: any) {
    if (err.code !== "ER_NO_SUCH_TABLE") throw err;
  }

  // 5. Building contacts
  try {
    const contacts = await query<RowDataPacket[]>(
      `SELECT id, name, type, description, mobileNumber, email,
              documentID, contactClientID, companyID
       FROM contact_person WHERE companyID = ?`,
      [buildingId],
    );

    for (const ct of contacts) {
      await postWebhook("contact.upsert", {
        coreId: ct.id,
        buildingCoreId: ct.companyID,
        name: ct.name,
        type: ct.type,
        description: ct.description,
        phone: ct.mobileNumber,
        email: ct.email,
        documentId: ct.documentID,
        clientCoreId: ct.contactClientID,
      });
    }
  } catch (err: any) {
    if (err.code !== "ER_NO_SUCH_TABLE") throw err;
  }
}

async function main(): Promise<void> {
  log.info("═══════════════════════════════════════════════");
  log.info("  Core Sync Bridge — Bulk Loader");
  log.info("  ⛔ Core MySQL is READ-ONLY");
  log.info("═══════════════════════════════════════════════");

  const startTime = Date.now();

  // Get all building IDs
  const buildingIds = await loadAllBuildings();
  log.info(`Total buildings to sync: ${buildingIds.length}`);

  const batchSize = config.bulk.batchSize;
  const totalBatches = Math.ceil(buildingIds.length / batchSize);
  let totalSynced = 0;

  for (let i = 0; i < buildingIds.length; i += batchSize) {
    const batch = buildingIds.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    log.info(
      `Batch ${batchNum}/${totalBatches}: syncing buildings ${i + 1}-${i + batch.length} of ${buildingIds.length}`,
    );

    for (const id of batch) {
      try {
        await syncBuilding(id);
        totalSynced++;
      } catch (err: any) {
        log.error(`Failed to sync building ${id}: ${err.message}`);
      }
    }

    // Pause between batches to avoid stressing the database
    if (i + batchSize < buildingIds.length) {
      log.debug(
        `Pausing ${config.bulk.batchPauseMs}ms before next batch...`,
      );
      await sleep(config.bulk.batchPauseMs);
    }
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const stats = getStats();

  log.info("═══════════════════════════════════════════════");
  log.info(`  Bulk load complete!`);
  log.info(`  Buildings synced: ${totalSynced}/${buildingIds.length}`);
  log.info(`  Webhooks posted: ${stats.totalPosted}`);
  log.info(`  Errors: ${stats.totalErrors}`);
  log.info(`  Duration: ${elapsed}s`);
  log.info("═══════════════════════════════════════════════");

  await closePool();
}

// Run if executed directly
main().catch((err) => {
  log.error(`Fatal error: ${err.message}`, err);
  process.exit(1);
});
