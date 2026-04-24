# Telephony Extension Management

How extensions, operators, and queues are managed between CRM28 and FreePBX
after the April 2026 pool-model switch.

## TL;DR

- **FreePBX is the source of truth** for extension config (SIP password,
  accountcode, display name in the PBX GUI, queue membership at the
  Asterisk config level).
- **CRM owns the mapping** "which employee uses which extension" via
  `TelephonyExtension.crmUserId`.
- CRM **never writes** to FreePBX. No REST/GraphQL API calls, no SSH writes.
- CRM **reads** SIP passwords from FreePBX via the existing SSH-based
  `asterisk-sync` job so the softphone handshake can hand them to Electron.
- Queue membership is driven at runtime by AMI `QueueAdd` / `QueueRemove`
  based on the new `PositionQueueRule` table — the static queue member
  list in FreePBX is not touched.

## The five FreePBX layers (for reference)

```
MariaDB tables (users, devices, sip)            ← admin edits here via GUI
    ↓ fwconsole reload (generates)
/etc/asterisk/pjsip.endpoint.conf etc.          ← do not edit by hand
    ↓ loaded on Asterisk start/reload
Running Asterisk                                ← AMI talks to this
    ↓
ASTDB (AMPUSER, DEVICE keys)                    ← runtime state
```

CRM only interacts at the **running Asterisk** layer (via AMI) and reads
from the **MariaDB** layer (via SSH for password backfill only).

## One-time FreePBX setup

Do these once, then never again unless adding more pool capacity.

### 1. Create a pool of extensions (30-40 recommended)

Use **FreePBX GUI → Applications → Extensions → Bulk Handler** or create
them individually:

- Extension range: `200-239` (or whatever fits your numbering plan)
- Technology: `PJSIP`
- Display name: anything — CRM overrides with the linked employee's name
  in its own UI. The name shown inside FreePBX stays whatever you put here.
- Secret (SIP password): let FreePBX auto-generate, or set manually. CRM
  will read it via SSH and hand it to the softphone on login.
- Disable the extension in FreePBX if you want it kept for future use but
  inactive today. CRM will see `isActive: false` and exclude it from the
  link picker.

Click **Apply Config**. Wait for the next `asterisk-sync` cron cycle — it
runs every 5 minutes. To force an immediate sync, restart the backend
(`pm2 restart crm-backend` on the VM); on startup the service subscribes
to `ami:connected` and runs the sync once the AMI socket attaches.

You should then see the new extensions appear in `TelephonyExtension` with
`crmUserId = NULL` (pool rows) and `sipPassword` populated from MariaDB.

### 2. Configure Position → Queue rules

In CRM admin UI (new Telephony admin menu, shipped in the next PR):
- Map each Position that should answer queue calls to the queues it belongs
  to. Example: `Position: Call Center Operator` → Queues `[30, 800, 802]`.
- Rules are applied at link time via AMI `QueueAdd`, and at unlink time
  via `QueueRemove`. The FreePBX static queue member list is not affected
  — queue membership is a runtime concept only.

### 3. No further FreePBX work needed

Once the pool exists and queue rules are configured, admin work moves
entirely into CRM. You should not need to touch FreePBX unless:

- Adding more extensions to the pool (repeat step 1).
- Changing the SIP trunk, dialplan, or IVR (unchanged by this work).
- Rotating a compromised SIP password (edit in FreePBX GUI → Apply Config
  → wait for `asterisk-sync` to pick it up, OR trigger sync manually).

## Day-to-day: linking an employee to an extension

Admin flow (UI in the next PR):

1. **Telephony → Extensions** shows the pool. Each row: extension number,
   currently-linked employee (or "— available —"), SIP registered yes/no.
2. Click **Link employee** on an available extension → pick an employee
   from the dropdown → confirm.
3. CRM writes `TelephonyExtension.crmUserId = employee.userId`.
4. CRM emits AMI `QueueAdd` for every queue mapped to that employee's
   Position via `PositionQueueRule`.
5. Employee logs into softphone → handshake returns the SIP password from
   CRM's `TelephonyExtension.sipPassword` → SIP.js registers to Asterisk.

No FreePBX change happens. The extension's display name in FreePBX GUI
stays whatever it was (e.g. "Extension 215"). The operator's real name
only shows up in CRM, not in FreePBX's own admin screens. That's
intentional — FreePBX admin UI is rarely opened, and keeping it
generic avoids drift when employees rotate through extensions.

## Day-to-day: unlinking (manual or on dismissal)

Two triggers:

1. **Admin clicks "Unlink"** in Telephony → Extensions.
2. **Employee is dismissed / hard-deleted** in HR. The FK cascade
   (`onDelete: SetNull`) nullifies `crmUserId` automatically; a post-delete
   hook emits the AMI actions.

Both paths execute:

- `TelephonyExtension.crmUserId = NULL` (back to pool).
- AMI `QueueRemove` for every queue mapped to the (ex-)employee's Position.
- CRM force-logout of the user's active session (separate cross-cutting
  work, see Known gap below).

**No FreePBX change**. The extension's SIP password is unchanged; if the
dismissed operator's softphone keeps running, their SIP registration
survives until its natural expiry (~1 hour default) — but they are already
kicked from all queues so inbound queue calls don't reach them.

## Known gap: residual SIP registration after dismissal

Today, a dismissed employee's running softphone can still:

- Make outbound calls until SIP expires (~1 hour).
- Receive direct extension dials until SIP expires.

It **cannot**:

- Receive queue calls (we AMI `QueueRemove` them immediately).
- Log into CRM on a new device (once force-logout ships).

For the office-based, equipment-returned-on-exit threat model this is
acceptable. If higher assurance is ever needed, the mitigation is to
rotate the SIP password in FreePBX GUI at dismissal time — no CRM code
change needed, that path still works.

## What existing extensions need

If you already have extensions in FreePBX before this PR deploys:

- **No config change required.** Existing rows keep their current
  `crmUserId` link; the migration only makes the column nullable.
- After deploy, if you want to return an extension to the pool, use the
  new **Unlink** action in Telephony → Extensions. Do not delete and
  recreate in FreePBX.
- Do not run any `asterisk-sync` reset, truncate, or data migration. The
  migration is schema-only.

## What CRM does NOT do

Explicitly called out so nobody adds it back by mistake:

- CRM does not call the FreePBX REST or GraphQL API. The `api` module
  in FreePBX can stay disabled.
- CRM does not SSH into the PBX to run `mysql` writes, `fwconsole`
  commands, or edit any config file.
- CRM does not rotate SIP passwords. Ever.
- CRM does not rename extensions in FreePBX's own DB.
- CRM does not create extensions. All extension creation happens via the
  FreePBX Bulk Handler or Extensions UI.

If you find yourself reaching for one of the above, stop and document
why — the current design is deliberately one-way (CRM reads, FreePBX
ignores CRM).
