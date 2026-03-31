/**
 * Delta Poller — queries core MySQL for records changed since last checkpoint.
 *
 * ⛔ ALL QUERIES ARE READ-ONLY. No writes, no locks, READ UNCOMMITTED isolation.
 *
 * Runs every 5 minutes. Typical load: 5 tiny SELECT queries returning 0-20 rows.
 * Pushes changed records to CRM webhook endpoint.
 *
 * Core table names are lowercase (Java/Hibernate convention):
 *   company, client, savingaccount, smartgsmgate, contactperson
 */

import { RowDataPacket } from "mysql2/promise";
import { query } from "./mysql-client";
import { postWebhook } from "./crm-poster";
import { getLastPollTime, updatePollTime } from "./checkpoint";
import { createLogger } from "./logger";

const log = createLogger("DeltaPoll");

// ── Building queries ────────────────────────────────────

interface BuildingRow extends RowDataPacket {
  id: number;
  companyName: string;
  address: string | null;
  mobileNumber: string | null;
  email: string | null;
  numberOfAppartments: number | null;
  disableCrons: boolean | number;
  assignedBranchId: number | null;
  creationDate: Date | null;
  lastModifiedDate: Date | null;
}

async function pollBuildings(): Promise<number> {
  const since = getLastPollTime("building");
  const rows = await query<BuildingRow[]>(
    `SELECT id, companyName, address, mobileNumber, email,
            numberOfAppartments, disableCrons,
            assignedBranchId, creationDate, lastModifiedDate
     FROM company
     WHERE lastModifiedDate > ?
     ORDER BY lastModifiedDate ASC`,
    [since],
  );

  if (rows.length === 0) return 0;
  log.info(`Buildings changed since ${since.toISOString()}: ${rows.length}`);

  let maxDate = since;
  for (const r of rows) {
    // MySQL bit(1) returns as Buffer in mysql2 — read the actual byte value
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
    if (r.lastModifiedDate && r.lastModifiedDate > maxDate) {
      maxDate = r.lastModifiedDate;
    }
  }

  updatePollTime("building", maxDate);
  return rows.length;
}

// ── Client queries ──────────────────────────────────────

interface ClientRow extends RowDataPacket {
  id: number;
  firstName: string | null;
  lastName: string | null;
  documentID: string | null;
  mobileNumber: string | null;
  secondaryMobileNumber: string | null;
  email: string | null;
  creationDate: Date | null;
  lastModifiedDate: Date | null;
}

interface ApartmentRow extends RowDataPacket {
  ID: number;
  clientID: number;
  assignedToBuildingID: number;
  apartmentNumber: string | null;
  entranceNumber: string | null;
  floorNumber: string | null;
  paymentID: string | null;
  consolidatedBalance: number | null;
}

async function pollClients(): Promise<number> {
  const since = getLastPollTime("client");
  const rows = await query<ClientRow[]>(
    `SELECT id, firstName, lastName, documentID, mobileNumber,
            secondaryMobileNumber, email, creationDate, lastModifiedDate
     FROM client
     WHERE lastModifiedDate > ?
     ORDER BY lastModifiedDate ASC`,
    [since],
  );

  if (rows.length === 0) return 0;
  log.info(`Clients changed since ${since.toISOString()}: ${rows.length}`);

  // Fetch apartments for all changed clients in one query
  // Use assignedToBuildingID to link apartments to buildings
  const clientIds = rows.map((r) => r.id);
  const apartments =
    clientIds.length > 0
      ? await query<ApartmentRow[]>(
          `SELECT ID, clientID, assignedToBuildingID, apartmentNumber, entranceNumber,
                  floorNumber, paymentID, consolidatedBalance
           FROM savingaccount
           WHERE clientID IN (?) AND AccountType = 'CURRENT_ACCOUNT'`,
          [clientIds],
        )
      : [];

  // Group apartments by client
  const aptByClient = new Map<number, ApartmentRow[]>();
  for (const apt of apartments) {
    const list = aptByClient.get(apt.clientID) ?? [];
    list.push(apt);
    aptByClient.set(apt.clientID, list);
  }

  let maxDate = since;
  for (const r of rows) {
    const clientApts = aptByClient.get(r.id) ?? [];

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
      apartments: clientApts.map((a) => ({
        buildingCoreId: a.assignedToBuildingID,
        apartmentCoreId: a.ID,
        apartmentNumber: a.apartmentNumber,
        entranceNumber: a.entranceNumber,
        floorNumber: a.floorNumber,
        paymentId: a.paymentID,
        balance: a.consolidatedBalance,
      })),
    });

    if (r.lastModifiedDate && r.lastModifiedDate > maxDate) {
      maxDate = r.lastModifiedDate;
    }
  }

  updatePollTime("client", maxDate);
  return rows.length;
}

// ── Asset queries (Lift/Door/Intercom from savingaccount) ───

interface AssetRow extends RowDataPacket {
  ID: number;
  NAME: string;
  AccountType: string;
  productID: number | null;
  ip: string | null;
  port: string | null;  // varchar in core DB
  assignedToBuildingID: number | null;
  CREATIONDATE: Date | null;
  lastModifiedDate: Date | null;
}

async function pollAssets(): Promise<number> {
  const since = getLastPollTime("asset");
  const rows = await query<AssetRow[]>(
    `SELECT ID, NAME, AccountType, productID, ip, port,
            assignedToBuildingID, CREATIONDATE, lastModifiedDate
     FROM savingaccount
     WHERE lastModifiedDate > ?
       AND AccountType IN ('LIFT', 'DOOR', 'INTERCOM')
     ORDER BY lastModifiedDate ASC`,
    [since],
  );

  if (rows.length === 0) return 0;
  log.info(`Assets (Lift/Door/Intercom) changed since ${since.toISOString()}: ${rows.length}`);

  let maxDate = since;
  for (const r of rows) {
    await postWebhook("asset.upsert", {
      coreId: r.ID,
      name: r.NAME,
      type: r.AccountType,
      productId: r.productID != null ? String(r.productID) : null,
      ip: r.ip,
      port: r.port,  // varchar — synced as string
      assignedBuildingCoreId: r.assignedToBuildingID,
      coreCreatedAt: r.CREATIONDATE?.toISOString() ?? null,
      coreUpdatedAt: r.lastModifiedDate?.toISOString() ?? null,
    });
    if (r.lastModifiedDate && r.lastModifiedDate > maxDate) {
      maxDate = r.lastModifiedDate;
    }
  }

  updatePollTime("asset", maxDate);
  return rows.length;
}

// ── Gate devices (Smart GSM Gate from smartgsmgate table) ───
// Note: smartgsmgate has NO lastModifiedDate or creationDate columns.
// Delta polling not possible — gates are only synced via bulk loader.
// This function is kept for count verification only.

async function pollGateDevices(): Promise<number> {
  // smartgsmgate has no timestamp columns, so we can't delta poll.
  // Gates are synced during bulk load only.
  // For count verification, we could check total count periodically.
  log.debug("Gate devices: no timestamp columns in smartgsmgate, skipping delta poll (use bulk loader)");
  return 0;
}

// ── Contact queries ─────────────────────────────────────
// contactperson columns: id, companyID, contactClientID, contactCompanyID,
//   description, name, type, company_ID
// Note: NO lastModifiedDate — delta polling not possible

async function pollContacts(): Promise<number> {
  // contactperson has no timestamp columns, so we can't delta poll.
  // Contacts are synced during bulk load only.
  log.debug("Contacts: no timestamp columns in contactperson, skipping delta poll (use bulk loader)");
  return 0;
}

// ── Main poll cycle ─────────────────────────────────────

let isRunning = false;

export async function runDeltaPoll(): Promise<void> {
  if (isRunning) {
    log.warn("Previous poll cycle still running, skipping");
    return;
  }

  isRunning = true;
  const start = Date.now();

  try {
    const buildings = await pollBuildings();
    const clients = await pollClients();
    const assets = await pollAssets();
    const gates = await pollGateDevices();
    const contacts = await pollContacts();

    const total = buildings + clients + assets + gates + contacts;
    const elapsed = Date.now() - start;

    if (total > 0) {
      log.info(
        `Poll complete: ${total} changes (B:${buildings} C:${clients} A:${assets} G:${gates} CT:${contacts}) in ${elapsed}ms`,
      );
    } else {
      log.debug(`Poll complete: no changes (${elapsed}ms)`);
    }
  } catch (err: any) {
    log.error(`Poll cycle failed: ${err.message}`);
  } finally {
    isRunning = false;
  }
}
