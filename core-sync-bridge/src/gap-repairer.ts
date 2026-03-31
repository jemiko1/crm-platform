/**
 * Gap Repairer — fixes count mismatches detected during the day.
 *
 * Runs at 3 AM nightly. If no mismatches were detected, does nothing.
 * When mismatches exist, fetches ID lists from core and CRM,
 * finds the specific missing records, and syncs only those.
 *
 * ⛔ ALL QUERIES ARE READ-ONLY.
 *
 * Core table names are lowercase (Java/Hibernate convention):
 *   company, client, savingaccount, smartgsmgate, contactperson
 */

import { RowDataPacket } from "mysql2/promise";
import { query } from "./mysql-client";
import { postWebhook } from "./crm-poster";
import { load, save } from "./checkpoint";
import { createLogger } from "./logger";

const log = createLogger("GapRepair");

interface IdRow extends RowDataPacket {
  id: number;
}

/**
 * Run nightly gap repair. Only processes entities that had count mismatches.
 */
export async function runGapRepair(
  getCrmEntityIds: (
    entity: string,
  ) => Promise<number[] | null>,
): Promise<void> {
  const cp = load();

  if (cp.countMismatches.length === 0) {
    log.info("No count mismatches to repair — skipping");
    return;
  }

  log.info(
    `Starting gap repair for ${cp.countMismatches.length} mismatched entities`,
  );

  for (const mismatch of cp.countMismatches) {
    try {
      await repairEntity(mismatch.entity, getCrmEntityIds);
    } catch (err: any) {
      log.error(
        `Failed to repair ${mismatch.entity}: ${err.message}`,
      );
    }
  }

  // Clear mismatches after repair attempt
  save({ countMismatches: [] });
  log.info("Gap repair complete");
}

async function repairEntity(
  entity: string,
  getCrmEntityIds: (entity: string) => Promise<number[] | null>,
): Promise<void> {
  log.info(`Repairing ${entity}...`);

  // Get all IDs from core
  let coreIds: number[];
  switch (entity) {
    case "building":
      coreIds = (await query<IdRow[]>("SELECT id FROM company")).map(
        (r) => r.id,
      );
      break;
    case "client":
      coreIds = (await query<IdRow[]>("SELECT id FROM client")).map(
        (r) => r.id,
      );
      break;
    case "asset":
      coreIds = (
        await query<IdRow[]>(
          "SELECT ID FROM savingaccount WHERE AccountType IN ('LIFT', 'DOOR', 'INTERCOM')",
        )
      ).map((r) => r.ID);
      break;
    default:
      log.warn(`Unknown entity type: ${entity}`);
      return;
  }

  // Get all coreIds from CRM
  const crmIds = await getCrmEntityIds(entity);
  if (!crmIds) {
    log.warn(`Could not fetch CRM IDs for ${entity} — skipping`);
    return;
  }

  const crmIdSet = new Set(crmIds);
  const coreIdSet = new Set(coreIds);

  // Find IDs in core but missing in CRM
  const missingInCrm = coreIds.filter((id) => !crmIdSet.has(id));
  // Find IDs in CRM but not in core (potential orphans)
  const extraInCrm = crmIds.filter((id) => !coreIdSet.has(id));

  log.info(
    `${entity}: core=${coreIds.length}, crm=${crmIds.length}, missingInCrm=${missingInCrm.length}, extraInCrm=${extraInCrm.length}`,
  );

  // Sync missing records
  if (missingInCrm.length > 0) {
    log.info(
      `Syncing ${missingInCrm.length} missing ${entity} records...`,
    );

    for (const id of missingInCrm) {
      try {
        await syncSingleEntity(entity, id);
      } catch (err: any) {
        log.error(
          `Failed to sync ${entity} coreId=${id}: ${err.message}`,
        );
      }
    }
  }

  // Deactivate orphaned CRM records
  if (extraInCrm.length > 0) {
    log.info(
      `Deactivating ${extraInCrm.length} orphaned ${entity} records in CRM...`,
    );

    for (const id of extraInCrm) {
      try {
        await postWebhook(`${entity}.deactivate`, { coreId: id });
      } catch (err: any) {
        log.error(
          `Failed to deactivate ${entity} coreId=${id}: ${err.message}`,
        );
      }
    }
  }
}

async function syncSingleEntity(
  entity: string,
  coreId: number,
): Promise<void> {
  switch (entity) {
    case "building": {
      const rows = await query<RowDataPacket[]>(
        `SELECT id, companyName, address, mobileNumber, email,
                numberOfAppartments, disableCrons,
                assignedBranchId, creationDate, lastModifiedDate
         FROM company WHERE id = ?`,
        [coreId],
      );
      if (rows.length === 0) return;
      const r = rows[0];
      // MySQL bit(1) returns as Buffer in mysql2
      const disableCrons = Buffer.isBuffer(r.disableCrons)
        ? r.disableCrons[0] === 1
        : Boolean(r.disableCrons);
      await postWebhook("building.upsert", {
        coreId: r.id,
        name: r.companyName,
        address: r.address,
        phone: r.mobileNumber,
        email: r.email,
        numberOfApartments: r.numberOfAppartments,
        disableCrons,
        isActive: !disableCrons,
        branchId: r.assignedBranchId,
        coreCreatedAt: r.creationDate?.toISOString() ?? null,
        coreUpdatedAt: r.lastModifiedDate?.toISOString() ?? null,
      });
      break;
    }
    case "client": {
      const rows = await query<RowDataPacket[]>(
        `SELECT id, firstName, lastName, documentID, mobileNumber,
                secondaryMobileNumber, email, creationDate, lastModifiedDate
         FROM client WHERE id = ?`,
        [coreId],
      );
      if (rows.length === 0) return;
      const r = rows[0];

      // Fetch apartments — use assignedToBuildingID to link to buildings
      const apts = await query<RowDataPacket[]>(
        `SELECT ID, assignedToBuildingID, apartmentNumber, entranceNumber, floorNumber,
                paymentID, consolidatedBalance
         FROM savingaccount
         WHERE clientID = ? AND AccountType = 'CURRENT_ACCOUNT'`,
        [coreId],
      );

      await postWebhook("client.upsert", {
        coreId: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        idNumber: r.documentID,
        primaryPhone: r.mobileNumber,
        secondaryPhone: r.secondaryMobileNumber,
        email: r.email,
        coreCreatedAt: r.creationDate?.toISOString() ?? null,
        coreUpdatedAt: r.lastModifiedDate?.toISOString() ?? null,
        apartments: apts.map((a) => ({
          buildingCoreId: a.assignedToBuildingID,
          apartmentCoreId: a.ID,
          apartmentNumber: a.apartmentNumber,
          entranceNumber: a.entranceNumber,
          floorNumber: a.floorNumber,
          paymentId: a.paymentID,
          balance: a.consolidatedBalance,
        })),
      });
      break;
    }
    case "asset": {
      const rows = await query<RowDataPacket[]>(
        `SELECT ID, NAME, AccountType, productID, ip, port,
                assignedToBuildingID, CREATIONDATE, lastModifiedDate
         FROM savingaccount WHERE ID = ?`,
        [coreId],
      );
      if (rows.length === 0) return;
      const r = rows[0];
      await postWebhook("asset.upsert", {
        coreId: r.ID,
        name: r.NAME,
        type: r.AccountType,
        productId: r.productID != null ? String(r.productID) : null,
        ip: r.ip,
        port: r.port,
        assignedBuildingCoreId: r.assignedToBuildingID,
        coreCreatedAt: r.CREATIONDATE?.toISOString() ?? null,
        coreUpdatedAt: r.lastModifiedDate?.toISOString() ?? null,
      });
      break;
    }
  }
}
