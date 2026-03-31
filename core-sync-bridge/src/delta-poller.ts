/**
 * Delta Poller — queries core MySQL for records changed since last checkpoint.
 *
 * ⛔ ALL QUERIES ARE READ-ONLY. No writes, no locks, READ UNCOMMITTED isolation.
 *
 * Runs every 5 minutes. Typical load: 5 tiny SELECT queries returning 0-20 rows.
 * Pushes changed records to CRM webhook endpoint.
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
  identificationCode: string | null;
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
            identificationCode, numberOfAppartments, disableCrons,
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
    await postWebhook("building.upsert", {
      coreId: r.id,
      name: r.companyName,
      address: r.address,
      phone: r.mobileNumber,
      email: r.email,
      identificationCode: r.identificationCode,
      numberOfApartments: r.numberOfAppartments,
      disableCrons: Boolean(r.disableCrons),
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
  state: string | null;
  creationDate: Date | null;
  lastModifiedDate: Date | null;
}

interface ApartmentRow extends RowDataPacket {
  id: number;
  clientID: number;
  companyID: number;
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
            secondaryMobileNumber, email, state, creationDate, lastModifiedDate
     FROM client
     WHERE lastModifiedDate > ?
     ORDER BY lastModifiedDate ASC`,
    [since],
  );

  if (rows.length === 0) return 0;
  log.info(`Clients changed since ${since.toISOString()}: ${rows.length}`);

  // Fetch apartments for all changed clients in one query
  const clientIds = rows.map((r) => r.id);
  const apartments =
    clientIds.length > 0
      ? await query<ApartmentRow[]>(
          `SELECT id, clientID, companyID, apartmentNumber, entranceNumber,
                  floorNumber, paymentID, consolidatedBalance
           FROM saving_account
           WHERE clientID IN (?) AND accountType = 'CURRENT_ACCOUNT'`,
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
      state: r.state,
      coreCreatedAt: r.creationDate?.toISOString() ?? null,
      coreUpdatedAt: r.lastModifiedDate?.toISOString() ?? null,
      apartments: clientApts.map((a) => ({
        buildingCoreId: a.companyID,
        apartmentCoreId: a.id,
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

// ── Asset queries (Lift/Door from saving_account) ───────

interface AssetRow extends RowDataPacket {
  id: number;
  name: string;
  accountType: string;
  productID: string | null;
  ip: string | null;
  port: number | null;
  companyID: number;
  assignedToBuildingID: number | null;
  creationDate: Date | null;
  lastModifiedDate: Date | null;
}

async function pollAssets(): Promise<number> {
  const since = getLastPollTime("asset");
  const rows = await query<AssetRow[]>(
    `SELECT id, name, accountType, productID, ip, port,
            companyID, assignedToBuildingID, creationDate, lastModifiedDate
     FROM saving_account
     WHERE lastModifiedDate > ?
       AND accountType IN ('LIFT', 'DOOR', 'INTERCOM')
     ORDER BY lastModifiedDate ASC`,
    [since],
  );

  if (rows.length === 0) return 0;
  log.info(`Assets (Lift/Door/Intercom) changed since ${since.toISOString()}: ${rows.length}`);

  let maxDate = since;
  for (const r of rows) {
    await postWebhook("asset.upsert", {
      coreId: r.id,
      name: r.name,
      type: r.accountType,
      productId: r.productID,
      ip: r.ip,
      port: r.port,
      assignedBuildingCoreId: r.assignedToBuildingID ?? r.companyID,
      coreCreatedAt: r.creationDate?.toISOString() ?? null,
      coreUpdatedAt: r.lastModifiedDate?.toISOString() ?? null,
    });
    if (r.lastModifiedDate && r.lastModifiedDate > maxDate) {
      maxDate = r.lastModifiedDate;
    }
  }

  updatePollTime("asset", maxDate);
  return rows.length;
}

// ── Gate devices (Smart GSM Gate from separate table) ───

interface GateRow extends RowDataPacket {
  id: number;
  name: string;
  buildingID: number;
  productID: string | null;
  smartGSMGateNumber1: string | null;
  smartGSMGateNumber2: string | null;
  smartGSMGateNumber3: string | null;
  lastModifiedDate: Date | null;
  creationDate: Date | null;
}

async function pollGateDevices(): Promise<number> {
  const since = getLastPollTime("gateDevice");

  // Try smart_gsm_gate table — table name may vary, will be confirmed on first run
  let rows: GateRow[] = [];
  try {
    rows = await query<GateRow[]>(
      `SELECT id, name, buildingID, productID,
              smartGSMGateNumber1, smartGSMGateNumber2, smartGSMGateNumber3,
              creationDate, lastModifiedDate
       FROM smart_gsm_gate
       WHERE lastModifiedDate > ?
       ORDER BY lastModifiedDate ASC`,
      [since],
    );
  } catch (err: any) {
    // Table might not exist or have different name — log and skip
    if (err.code === "ER_NO_SUCH_TABLE") {
      log.debug("smart_gsm_gate table not found, skipping gate poll");
      return 0;
    }
    throw err;
  }

  if (rows.length === 0) return 0;
  log.info(`Gate devices changed since ${since.toISOString()}: ${rows.length}`);

  let maxDate = since;
  for (const r of rows) {
    // Offset gate IDs by 10_000_000 to avoid collision with saving_account IDs
    // (both tables have independent auto-increment sequences)
    await postWebhook("asset.upsert", {
      coreId: 10_000_000 + r.id,
      name: r.name,
      type: "SMART_GSM_GATE",
      productId: r.productID,
      assignedBuildingCoreId: r.buildingID,
      door1: r.smartGSMGateNumber1,
      door2: r.smartGSMGateNumber2,
      door3: r.smartGSMGateNumber3,
      coreCreatedAt: r.creationDate?.toISOString() ?? null,
      coreUpdatedAt: r.lastModifiedDate?.toISOString() ?? null,
    });
    if (r.lastModifiedDate && r.lastModifiedDate > maxDate) {
      maxDate = r.lastModifiedDate;
    }
  }

  updatePollTime("gateDevice", maxDate);
  return rows.length;
}

// ── Contact queries ─────────────────────────────────────

interface ContactRow extends RowDataPacket {
  id: number;
  name: string;
  type: string;
  description: string | null;
  mobileNumber: string | null;
  email: string | null;
  documentID: string | null;
  contactClientID: number | null;
  companyID: number;
  lastModifiedDate: Date | null;
}

async function pollContacts(): Promise<number> {
  const since = getLastPollTime("contact");

  let rows: ContactRow[] = [];
  try {
    rows = await query<ContactRow[]>(
      `SELECT id, name, type, description, mobileNumber, email,
              documentID, contactClientID, companyID, lastModifiedDate
       FROM contact_person
       WHERE lastModifiedDate > ?
       ORDER BY lastModifiedDate ASC`,
      [since],
    );
  } catch (err: any) {
    if (err.code === "ER_NO_SUCH_TABLE") {
      log.debug("contact_person table not found, skipping contact poll");
      return 0;
    }
    throw err;
  }

  if (rows.length === 0) return 0;
  log.info(`Contacts changed since ${since.toISOString()}: ${rows.length}`);

  let maxDate = since;
  for (const r of rows) {
    await postWebhook("contact.upsert", {
      coreId: r.id,
      buildingCoreId: r.companyID,
      name: r.name,
      type: r.type,
      description: r.description,
      phone: r.mobileNumber,
      email: r.email,
      documentId: r.documentID,
      clientCoreId: r.contactClientID,
    });
    if (r.lastModifiedDate && r.lastModifiedDate > maxDate) {
      maxDate = r.lastModifiedDate;
    }
  }

  updatePollTime("contact", maxDate);
  return rows.length;
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
