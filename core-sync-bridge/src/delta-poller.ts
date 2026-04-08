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

// ── Apartment change detection (savingaccount CURRENT_ACCOUNT) ───
// When an apartment record changes (balance, assignment, etc.),
// the client's lastModifiedDate may NOT update. So we poll
// savingaccount.lastModifiedDate directly and re-sync affected clients.

interface ApartmentChangeRow extends RowDataPacket {
  clientID: number;
  lastModifiedDate: Date | null;
}

async function pollApartmentChanges(): Promise<number> {
  const since = getLastPollTime("apartment");
  const rows = await query<ApartmentChangeRow[]>(
    `SELECT clientID, MAX(lastModifiedDate) AS lastModifiedDate
     FROM savingaccount
     WHERE lastModifiedDate > ?
       AND AccountType = 'CURRENT_ACCOUNT'
     GROUP BY clientID
     ORDER BY MAX(lastModifiedDate) ASC`,
    [since],
  );

  if (rows.length === 0) return 0;
  log.info(`Apartment changes since ${since.toISOString()}: ${rows.length} affected clients`);

  // Batch-fetch clients and apartments (avoid N+1 on core MySQL)
  const clientIds = rows.map((r) => r.clientID);

  const clients = await query<RowDataPacket[]>(
    `SELECT id, firstName, lastName, documentID, mobileNumber,
            secondaryMobileNumber, email, creationDate, lastModifiedDate
     FROM client WHERE id IN (?)`,
    [clientIds],
  );
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  const allApts = await query<ApartmentRow[]>(
    `SELECT ID, clientID, assignedToBuildingID, apartmentNumber, entranceNumber,
            floorNumber, paymentID, consolidatedBalance
     FROM savingaccount
     WHERE clientID IN (?) AND AccountType = 'CURRENT_ACCOUNT'`,
    [clientIds],
  );
  const aptByClient = new Map<number, ApartmentRow[]>();
  for (const apt of allApts) {
    const list = aptByClient.get(apt.clientID) ?? [];
    list.push(apt);
    aptByClient.set(apt.clientID, list);
  }

  let maxDate = since;
  for (const r of rows) {
    const c = clientMap.get(r.clientID);
    if (!c) continue;

    const apts = aptByClient.get(r.clientID) ?? [];

    await postWebhook("client.upsert", {
      coreId: r.clientID,
      firstName: c.firstName,
      lastName: c.lastName,
      idNumber: c.documentID,
      primaryPhone: c.mobileNumber,
      secondaryPhone: c.secondaryMobileNumber,
      email: c.email,
      coreCreatedAt: c.creationDate?.toISOString() ?? null,
      coreUpdatedAt: c.lastModifiedDate?.toISOString() ?? null,
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

    if (r.lastModifiedDate && r.lastModifiedDate > maxDate) {
      maxDate = r.lastModifiedDate;
    }
  }

  updatePollTime("apartment", maxDate);
  return rows.length;
}

// ── Gate devices (Smart GSM Gate from smartgsmgate table) ───
// Note: smartgsmgate has NO lastModifiedDate or creationDate columns.
// Delta polling not possible — gates are synced daily at 4 AM.

async function pollGateDevices(): Promise<number> {
  log.debug("Gate devices: no timestamp columns in smartgsmgate, skipping delta poll (daily reload at 4 AM)");
  return 0;
}

// ── Contact queries ─────────────────────────────────────
// contactperson columns: id, companyID, contactClientID, contactCompanyID,
//   description, name, type, company_ID
// Note: NO lastModifiedDate — delta polling not possible

async function pollContacts(): Promise<number> {
  // contactperson has no timestamp columns, so we can't delta poll.
  // Contacts are synced daily at 4 AM via reloadGatesAndContacts().
  log.debug("Contacts: no timestamp columns in contactperson, skipping delta poll (daily reload at 4 AM)");
  return 0;
}

// ── Main poll cycle ─────────────────────────────────────

let isRunning = false;
let runStartedAt = 0;

// Timeout: if a poll takes longer than 10 minutes, force-release the lock
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

export async function runDeltaPoll(): Promise<void> {
  if (isRunning) {
    const elapsed = Date.now() - runStartedAt;
    if (elapsed > POLL_TIMEOUT_MS) {
      log.warn(
        `Previous poll has been running for ${Math.round(elapsed / 1000)}s — force-releasing lock`,
      );
      isRunning = false;
    } else {
      log.warn("Previous poll cycle still running, skipping");
      return;
    }
  }

  isRunning = true;
  runStartedAt = Date.now();

  try {
    const buildings = await pollBuildings();
    const clients = await pollClients();
    const apartments = await pollApartmentChanges();
    const assets = await pollAssets();
    const gates = await pollGateDevices();
    const contacts = await pollContacts();

    const total = buildings + clients + apartments + assets + gates + contacts;
    const elapsed = Date.now() - runStartedAt;

    if (total > 0) {
      log.info(
        `Poll complete: ${total} changes (B:${buildings} C:${clients} APT:${apartments} A:${assets} G:${gates} CT:${contacts}) in ${elapsed}ms`,
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
