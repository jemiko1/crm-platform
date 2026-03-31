/**
 * Re-sync a single client by coreId.
 * Usage: npx tsx src/resync-client.ts 288
 */
import { RowDataPacket } from "mysql2/promise";
import { query, closePool } from "./mysql-client";
import { postWebhook } from "./crm-poster";
import { createLogger } from "./logger";

const log = createLogger("ResyncClient");

async function main() {
  const clientCoreId = parseInt(process.argv[2], 10);
  if (isNaN(clientCoreId)) {
    console.error("Usage: npx tsx src/resync-client.ts <clientCoreId>");
    process.exit(1);
  }

  log.info(`Re-syncing client coreId=${clientCoreId}...`);

  // Fetch client
  const clients = await query<RowDataPacket[]>(
    `SELECT id, firstName, lastName, documentID, mobileNumber,
            secondaryMobileNumber, email, creationDate, lastModifiedDate
     FROM client WHERE id = ?`,
    [clientCoreId],
  );

  if (clients.length === 0) {
    log.error(`Client ${clientCoreId} not found in core`);
    await closePool();
    process.exit(1);
  }

  const c = clients[0];

  // Fetch all apartments for this client
  const apts = await query<RowDataPacket[]>(
    `SELECT ID AS apartmentId, clientID, assignedToBuildingID,
            apartmentNumber, entranceNumber, floorNumber,
            paymentID, consolidatedBalance
     FROM savingaccount
     WHERE clientID = ? AND AccountType = 'CURRENT_ACCOUNT'`,
    [clientCoreId],
  );

  log.info(`Found ${apts.length} apartments for client ${clientCoreId}`);
  for (const a of apts) {
    log.info(
      `  Apartment ${a.apartmentId}: building=${a.assignedToBuildingID}, floor=${a.floorNumber}, entrance=${a.entranceNumber}, paymentId=${a.paymentID}`,
    );
  }

  // Post webhook
  await postWebhook("client.upsert", {
    coreId: clientCoreId,
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
      apartmentCoreId: a.apartmentId,
      apartmentNumber: a.apartmentNumber,
      entranceNumber: a.entranceNumber,
      floorNumber: a.floorNumber,
      paymentId: a.paymentID,
      balance: a.consolidatedBalance,
    })),
  });

  log.info(`Client ${clientCoreId} re-synced successfully with ${apts.length} apartments`);
  await closePool();
}

main().catch((err) => {
  log.error(`Fatal: ${err.message}`);
  process.exit(1);
});
