# Telephony Extension Management

How extensions, operators, and queues are managed between CRM28 and FreePBX
after the April 2026 pool-model switch.

> **What changed on 2026-04-24 (this doc's most recent rewrite):**
> The previous implementation used AMI `QueueAdd`/`QueueRemove` to manage
> queue membership at runtime. This broke whenever an admin clicked
> "Apply Config" in the FreePBX GUI (FreePBX regenerated `queues.conf`
> from MariaDB and wiped the runtime members). The new implementation
> writes directly to FreePBX's `queues_details` MariaDB table via a
> narrow SSH helper — the same storage the GUI itself writes to — so
> CRM-added members show up in the FreePBX GUI and survive Apply
> Config. Read the "Architecture" section below for the full picture.

## TL;DR

- **FreePBX is the source of truth** for extension config (SIP password,
  display name in the PBX GUI, accountcode, queue settings like strategy
  / announcements / ringinuse).
- **CRM owns the mapping** "which employee uses which extension" via
  `TelephonyExtension.crmUserId`.
- **CRM owns the queue-membership rows it creates.** On link, CRM INSERTs
  one row per mapped queue into `queues_details`. On unlink, CRM DELETEs
  them. Admin-added rows (different penalty, different interface) are
  invisible to CRM and never touched — admin customizations always win.
- **CRM reads** SIP passwords from FreePBX via the existing SSH-based
  `asterisk-sync` job so the softphone handshake can hand them to Electron.
- **The FreePBX GUI reflects CRM's changes** in real time. Apply Config
  preserves them.

## Architecture

### The storage model

FreePBX stores queue configuration in the MariaDB `queues_details` table,
keyed by `(id, keyword, data)`:

```
queues_details
  id        VARCHAR(45)    -- queue number, e.g. '30'
  keyword   VARCHAR(30)    -- 'member', 'strategy', 'musicclass', ...
  data      VARCHAR(150)   -- value — for member rows: 'Local/EXT@from-queue/n,PENALTY'
  flags     INT            -- bitfield, usually 0
```

One row per member. When you add a static agent via the FreePBX GUI, it
INSERTs a row. Apply Config reads this table and regenerates
`/etc/asterisk/queues.conf`, then Asterisk reloads. So whatever is in the
table wins.

**CRM writes to the same table** through a narrow SSH helper script
(`/usr/local/sbin/crm-queue-member` on the PBX). The helper accepts only
three verbs — `add`, `remove`, `list` — and two strictly-digit-validated
arguments (queue number, extension number). CRM never constructs SQL;
it passes parameters to the helper, which builds the INSERT/DELETE.

### Why not AMI, REST, GraphQL, or fwconsole

Checked each before picking the SSH+MariaDB path:

| Surface | Result |
|---|---|
| AMI `QueueAdd`/`QueueRemove` | Runtime-only. Apply Config wipes it. |
| FreePBX REST `/admin/api/queues/*` | **Read-only.** Three GET endpoints, no mutations. Verified by reading `/var/www/html/admin/modules/queues/Api/Rest/Queues.php` on the live PBX. |
| FreePBX GraphQL | **No queue mutations exist.** The queues module has no `Gql/` directory, only `Rest/`. |
| `fwconsole queue*` | **Not implemented.** The only related command is `fwconsole queuestats` (queuestats module sync, unrelated to membership). |
| FreePBX GUI only | Admin manages all membership manually — loses the automation wins. |
| MariaDB write + `fwconsole reload` | ✅ — what the GUI itself uses. Chosen. |

### End-to-end link flow

```
1. Admin clicks "Link employee" in /app/admin/telephony-extensions
2. CRM backend: POST /v1/telephony/extensions/:id/link  { userId }
3. ExtensionLinkService.link():
   a. findUnique + guards (not linked elsewhere, not disabled, etc.)
   b. updateMany({ where: { id, crmUserId: null }, data: { crmUserId, displayName } })
      — race-guarded; Conflict if count !== 1
   c. For each active rule in PositionQueueRule for the employee's Position:
      - PbxQueueMemberClient.addMember(queueName, extensionNumber)
        - spawns `ssh -i KEY root@PBX /usr/local/sbin/crm-queue-member add QUEUE EXT`
        - helper runs: INSERT IGNORE INTO queues_details VALUES (QUEUE, 'member',
          'Local/EXT@from-queue/n,0', 0); then fwconsole reload
   d. If any queue fails: log, add to `skipped[]`, continue. Admin can retry
      via the Resync button.
4. FreePBX GUI Queues page now shows the new member. Apply Config preserves it.
5. Softphone logs in → handshake returns sipPassword from CRM → SIP.js registers.
```

### End-to-end unlink flow

```
1. Admin clicks "Unlink" (or employee is dismissed/hard-deleted in HR)
2. CRM: POST /v1/telephony/extensions/:id/unlink
3. ExtensionLinkService.unlink():
   a. findUnique + early-return if already unlinked (idempotent)
   b. Look up the linked user's positionId via employee.positionId
      (ORDER LOAD-BEARING — must derive before nulling crmUserId)
   c. updateMany({ where: { id, crmUserId: ext.crmUserId }, data: { crmUserId: null } })
      — race-guarded
   d. For each rule for that Position:
      - PbxQueueMemberClient.removeMember(queueName, extensionNumber)
        - DELETE FROM queues_details WHERE id=QUEUE AND keyword='member'
          AND data='Local/EXT@from-queue/n,0'
        - fwconsole reload
4. Extension row now has crmUserId=null (back in the pool).
5. Member is gone from FreePBX GUI Queues page and runtime.
```

## One-time FreePBX setup

Do these once; then daily admin work moves into CRM.

### 1. Create a pool of extensions in FreePBX

**FreePBX GUI → Applications → Extensions → Bulk Handler** (or individually).
Recommended: create 30-40 numbered extensions (e.g. 200-239) so you have
room for rotation.

- Technology: `PJSIP`
- Display name: anything — FreePBX shows this name, CRM uses its own
- Secret (SIP password): let FreePBX auto-generate
- **Do NOT pre-add them to queues** — CRM will add them on link

Click **Apply Config**. Wait for the next `asterisk-sync` cron cycle (5 min)
or `pm2 restart crm-backend` on the VM for an immediate sync.

You'll see the new extensions in `TelephonyExtension` with `crmUserId = NULL`
(pool rows) and `sipPassword` populated from FreePBX MariaDB.

### 2. Configure Position → Queue rules in CRM

**Admin → Position → Queue Rules** (new page shipped in April 2026):

- Tick the cells that map each Position to the queues it should answer.
  Example: `Call Center Operator` ↔ `[30, 800, 802]`.
- Rules take effect on the **next** link or unlink action. They do not
  retroactively move currently-linked operators. This is deliberate so
  admins can stage rule changes safely.

### 3. Install the PBX-side helper

If this is a fresh install, deploy the helper script to the PBX once:

```bash
# From a workstation with SSH to both the repo and the PBX:
scp scripts/pbx/crm-queue-member.sh asterisk:/tmp/
ssh asterisk 'sudo install -m 0755 -o root -g root /tmp/crm-queue-member.sh \
  /usr/local/sbin/crm-queue-member'
```

Then verify:
```bash
ssh asterisk 'sudo /usr/local/sbin/crm-queue-member list 30'
```

Should print the extensions currently in queue 30, one per line.

SSH trust from the CRM VM to the PBX is already configured for the
AMI-bridge tunnel; the same credentials are used for this helper. CRM
connects as `root@<PBX-IP>` via the VM's `~/.ssh/id_ed25519` key. No
sudoers config needed (we're already root over SSH).

> **Security follow-up (future PR):** tighten to a dedicated `crm-sync`
> user on the PBX with `NOPASSWD: /usr/local/sbin/crm-queue-member *`
> in sudoers, then switch `PBX_SSH_USER` env var in CRM. Out of scope
> for this PR; documented so the principle-of-least-privilege story
> isn't lost.

### 4. No further FreePBX work needed (except)

Once the pool exists, rules are configured, and the helper is installed,
daily work moves to CRM. You'll still touch FreePBX GUI for:

- **Queue settings** — strategy, musicclass, timeout, ringinuse, announcements,
  periodic announce, weight, etc. These are queue-level, not member-level.
  Apply Config is safe; it preserves CRM-added member rows.
- **IVR, time conditions, dialplan, SIP trunk** — all untouched by CRM.
- **Rotating a SIP password** — edit in GUI → Apply Config → wait for
  `asterisk-sync` to pick it up (or `pm2 restart crm-backend`).
- **Manual member customization** — you can add an extension to a queue
  manually in GUI with a different penalty (e.g. `penalty=5`). CRM
  ignores that row and never deletes it, because CRM only touches rows
  matching exactly `Local/EXT@from-queue/n,0` (penalty 0).

## Day-to-day: linking

1. **Telephony → Extensions** shows the pool. Each row: extension number,
   linked employee (or "— available —"), SIP registration status.
2. Click **Link employee** → pick from dropdown of active employees
   without an extension → confirm.
3. CRM updates `TelephonyExtension.crmUserId` and INSERTs queue-member
   rows per the employee's Position → Queue rules.
4. FreePBX GUI Queues page immediately shows the new member.
5. Operator logs into softphone, SIP.js registers, queue calls ring.

## Day-to-day: unlinking

Two triggers:

1. **Admin clicks "Unlink"** in Telephony → Extensions.
2. **Employee is dismissed or hard-deleted** in HR (`employees.service.ts`
   `dismiss()` / `hardDelete()`). Auto-unlink hook runs BEFORE the
   dismissal transaction: looks up the extension, calls
   `ExtensionLinkService.unlink()`, then proceeds with dismissal. If the
   SSH path fails (PBX down, network issue), the hook logs + swallows the
   error so HR dismissal is never blocked by a PBX outage.

Both paths execute:
- `TelephonyExtension.crmUserId = NULL` (back to pool)
- `DELETE FROM queues_details` rows for this extension in every rule-mapped queue
- `fwconsole reload` on the PBX

## Day-to-day: resyncing a drifted extension

If the PBX was unreachable during a link, or an admin manually deleted a
member in FreePBX GUI and wants to restore it from CRM's perspective:

- Click **Resync queues** on the linked row
- CRM re-runs the INSERT for every rule-mapped queue (idempotent — already-
  present rows are no-ops due to `INSERT IGNORE`)

## Feature flag: `TELEPHONY_AUTO_QUEUE_SYNC`

Kill-switch. Set in backend `.env` on the VM (`C:\crm\backend\crm-backend\.env`):

```
TELEPHONY_AUTO_QUEUE_SYNC=true   # default — link/unlink write to FreePBX MariaDB
TELEPHONY_AUTO_QUEUE_SYNC=false  # kill-switch — CRM DB only, PBX untouched
```

**When to flip to `false`:**
- Any PBX-side misbehaviour you want to isolate CRM from.
- You're doing heavy manual work in FreePBX GUI (bulk imports, migrations)
  and want to be sure CRM doesn't race with you.
- You want to bulk-link/unlink in CRM without immediate PBX side-effects,
  then re-enable and click **Resync queues** on each one.

After flipping, `pm2 restart crm-backend` on the VM. No rebuild needed.

## Rollback procedure

If the ExtensionLinkService causes problems in production:

1. **Immediate**: `TELEPHONY_AUTO_QUEUE_SYNC=false` + `pm2 restart
   crm-backend`. Stops all further PBX writes. CRM link/unlink still
   works locally.
2. **Recover**: if CRM inserted bad rows into `queues_details`, two paths:
   - Click **Unlink** then **Link** in CRM (admin UI drives the DELETE +
     INSERT cycle).
   - Or via FreePBX GUI → Queues → [queue] → Static Agents → remove/add
     manually.
3. **Snapshot diff**: before merging this kind of change, run
   `scripts/telephony/snapshot-queue-members.sh`. After any incident,
   diff `queues_details` live state vs the snapshot to see what drifted.
4. **Full code revert**: `git revert <merge commit>` and redeploy. Tag
   `pre-link-feature-*` references the safe commit for this feature.

## Known gaps after dismissal (unchanged by this rewrite)

A dismissed employee's running softphone can still, until their JWT
expires (up to 24h) or SIP registration naturally times out:

- **Make outbound calls** until SIP expires (~1 hour default).
- **Receive direct extension dials** until SIP expires.
- **Keep an open CRM session** — the JWT strategy does not consult
  `User.isActive`, so existing tokens work until 24h TTL. Fresh logins
  are blocked because `auth.validateCredentials` does check `isActive`.

It **cannot**:
- **Receive queue calls** — the dismissal hook calls `unlink`, which
  DELETEs their queue-member rows and runs `fwconsole reload`. Asterisk
  reloads and they're out of the queue within ~10s.

For the office-based, equipment-returned-on-exit threat model these
gaps are acceptable. Mitigations if higher assurance is needed:
1. Rotate the SIP password in FreePBX GUI at dismissal time — stops SIP.
2. Add a `User.tokenVersion` column + bump on dismissal (Option Y from
   the termination-flow review — explicitly descoped).

## Upgrade and migration risk

### FreePBX minor-version bump (e.g. 15.0.21 → 15.0.23)
Zero risk. Module-level bumps don't touch core tables.

### FreePBX major-version upgrade (15 → 16 → ...)

Risks in order of likelihood:

1. **`queues_details` schema change** (low likelihood; stable since FreePBX 13).
   Impact: link/unlink would start returning SQL errors with schema drift
   messages. Mitigation: the helper's `DESCRIBE queues_details` matches the
   4-column layout — if the layout drifts, INSERT/DELETE fail loudly rather
   than silently corrupting data. After an upgrade, run
   `scripts/telephony/snapshot-queue-members.sh`, verify table structure,
   and diff current members against the snapshot.
2. **Queue member `data` format change** (very low likelihood). The
   `Local/EXT@from-queue/n,PENALTY` convention has been stable since
   Asterisk 1.8. Helper builds the string in one place; update there if
   it ever drifts.
3. **`fwconsole reload` replaced or renamed.** Low likelihood; single line
   in the helper. Update in place.

### Server migration (same FreePBX version, different hardware)
FreePBX's own backup/restore tool handles `queues_details` as part of
the MariaDB backup. CRM's link state is in Postgres on the CRM VM — it's
independent. On the first link/unlink after the move, CRM re-asserts its
rows into the new MariaDB. Expect a brief drift window which the admin
can reconcile by clicking **Resync queues** for each linked extension.

### Migration off FreePBX entirely (3CX, FreeSWITCH, etc.)
Replace `PbxQueueMemberClient` with the new system's equivalent API. The
pool model (`TelephonyExtension`) and `PositionQueueRule` schema are
PBX-agnostic — they map cleanly to any ACD with queue + agent concepts.

## What CRM does NOT do

Explicitly called out so nobody adds it back by mistake:

- **CRM does not rotate SIP passwords.** Admin rotates manually in
  FreePBX GUI. CRM picks up the new password on the next `asterisk-sync`
  cycle and hands it to softphones on the next login/handshake.
- **CRM does not create or delete extensions.** Admin provisions them in
  FreePBX Bulk Handler. `asterisk-sync` discovers them into the CRM pool.
- **CRM does not rename extensions in FreePBX's MariaDB.** `displayName`
  in CRM is its own field, shown only in CRM UI.
- **CRM does not edit queue-level settings** (strategy, music, timeout,
  announcements). Admin edits these in FreePBX GUI.
- **CRM does not delete admin-customized queue-member rows.** If admin
  adds `Local/214@from-queue/n,5` (penalty 5) manually, CRM only ever
  touches `Local/214@from-queue/n,0` (penalty 0) — admin's row survives.
- **CRM does not call the FreePBX REST or GraphQL API.** The `api` module
  can stay disabled if you don't use it elsewhere.

The only write path from CRM to the PBX is the narrow `crm-queue-member`
helper. If you find yourself wanting to broaden this, write a new
dedicated helper rather than expanding the existing one's verbs.
