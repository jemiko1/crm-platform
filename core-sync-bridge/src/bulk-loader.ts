/**
 * Bulk Loader — one-time initial data load from core MySQL to CRM.
 *
 * Run this once off-hours to populate CRM with all existing data.
 * After this, delta polling keeps everything in sync.
 *
 * Usage: npx tsx src/bulk-loader.ts
 * Single building: npx tsx src/bulk-loader.ts --building 20
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
            numberOfAppartments, disableCrons,
            assignedBranchId, creationDate, lastModifiedDate
     FROM company WHERE id = ?`,
    [buildingId],
  );
  if (bRows.length === 0) return;
  const b = bRows[0];

  const disableCrons = Boolean(b.disableCrons);

  await postWebhook("building.upsert", {
    coreId: b.id,
    name: b.companyName,
    address: b.address,
    phone: b.mobileNumber,
    email: b.email,
    numberOfApartments: b.numberOfAppartments,
    disableCrons,
    isActive: !disableCrons,
    branchId: b.assignedBranchId,
    coreCreatedAt: b.creationDate?.toISOString() ?? null,
    coreUpdatedAt: b.lastModifiedDate?.toISOString() ?? null,
  });

  // 2. Clients (residents) via savingaccount CURRENT_ACCOUNT
  //    Use assignedToBuildingID to link apartments to buildings
  const apartments = await query<RowDataPacket[]>(
    `SELECT sa.ID AS apartmentId, sa.clientID, sa.assignedToBuildingID,
            sa.apartmentNumber, sa.entranceNumber, sa.floorNumber,
            sa.paymentID, sa.consolidatedBalance,
            c.firstName, c.lastName, c.documentID, c.mobileNumber,
            c.secondaryMobileNumber, c.email,
            c.creationDate, c.lastModifiedDate
     FROM savingaccount sa
     JOIN client c ON c.id = sa.clientID
     WHERE sa.assignedToBuildingID = ? AND sa.AccountType = 'CURRENT_ACCOUNT'`,
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
      coreCreatedAt: c.creationDate?.toISOString() ?? null,
      coreUpdatedAt: c.lastModifiedDate?.toISOString() ?? null,
      apartments: data.apts.map((a) => ({
        buildingCoreId: a.assignedToBuildingID,
        apartmentCoreId: a.apartmentId,
        apartmentNumber: a.apartmentNumber,
        entranceNumber: a.entranceNumber,
        floorNumber: a.floorNumber,
        paymentId: a.paymentID,
        balance: a.consolidatedBalance,
      })),
    });
  }

  // 3. Devices (Lift/Door/Intercom) from savingaccount
  //    Use assignedToBuildingID to link devices to buildings
  const devices = await query<RowDataPacket[]>(
    `SELECT ID, NAME, AccountType, productID, ip, port,
            assignedToBuildingID, CREATIONDATE, lastModifiedDate
     FROM savingaccount
     WHERE assignedToBuildingID = ?
       AND AccountType IN ('LIFT', 'DOOR', 'INTERCOM')`,
    [buildingId],
  );

  for (const d of devices) {
    await postWebhook("asset.upsert", {
      coreId: d.ID,
      name: d.NAME,
      type: d.AccountType,
      productId: d.productID != null ? String(d.productID) : null,
      ip: d.ip,
      port: d.port,  // varchar in core — synced as string
      assignedBuildingCoreId: d.assignedToBuildingID,
      coreCreatedAt: d.CREATIONDATE?.toISOString() ?? null,
      coreUpdatedAt: d.lastModifiedDate?.toISOString() ?? null,
    });
  }

  // 4. Smart GSM Gates — use companyID to link to buildings
  const gates = await query<RowDataPacket[]>(
    `SELECT ID, name, companyID,
            smartGSMGateNumber1, smartGSMGateNumber2, smartGSMGateNumber3,
            smartGSMGateNumber4, smartGSMGateLiftNumber
     FROM smartgsmgate
     WHERE companyID = ?`,
    [buildingId],
  );

  for (const g of gates) {
    // Offset gate IDs by 10_000_000 to avoid collision with savingaccount IDs
    await postWebhook("asset.upsert", {
      coreId: 10_000_000 + g.ID,
      name: g.name,
      type: "SMART_GSM_GATE",
      assignedBuildingCoreId: g.companyID,
      door1: g.smartGSMGateNumber1,
      door2: g.smartGSMGateNumber2,
      door3: g.smartGSMGateNumber3,
    });
  }

  // 5. Building contacts
  //    contactperson only has: id, companyID, contactClientID, contactCompanyID, description, name, type, company_ID
  const contacts = await query<RowDataPacket[]>(
    `SELECT id, name, type, description, contactClientID, companyID
     FROM contactperson WHERE companyID = ?`,
    [buildingId],
  );

  for (const ct of contacts) {
    await postWebhook("contact.upsert", {
      coreId: ct.id,
      buildingCoreId: ct.companyID,
      name: ct.name || "Contact",
      type: ct.type,
      description: ct.description,
      clientCoreId: ct.contactClientID,
    });
  }
}

async function main(): Promise<void> {
  log.info("═══════════════════════════════════════════════");
  log.info("  Core Sync Bridge — Bulk Loader");
  log.info("  ⛔ Core MySQL is READ-ONLY");
  log.info("═══════════════════════════════════════════════");

  const startTime = Date.now();

  // Check for --building flag for single-building test
  const buildingArg = process.argv.indexOf("--building");
  let buildingIds: number[];

  if (buildingArg !== -1 && process.argv[buildingArg + 1]) {
    const singleId = parseInt(process.argv[buildingArg + 1], 10);
    if (isNaN(singleId)) {
      log.error("Invalid building ID");
      process.exit(1);
    }
    buildingIds = [singleId];
    log.info(`Single building mode: syncing building ${singleId}`);
  } else {
    buildingIds = await loadAllBuildings();
    log.info(`Total buildings to sync: ${buildingIds.length}`);
  }

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
