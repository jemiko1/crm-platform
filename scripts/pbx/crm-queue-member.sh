#!/bin/bash
#
# crm-queue-member.sh
#
# Deployed to: /usr/local/sbin/crm-queue-member  (mode 0755, owner root)
# Invoked by:  CRM backend over SSH from the VM, runs as root.
#
# WHY THIS EXISTS
#
# FreePBX's REST and GraphQL APIs are READ-ONLY for queue members as of
# v15.0.3.7 (module `api`, v15.0.21 queues module). Verified by reading
# /var/www/html/admin/modules/queues/Api/Rest/Queues.php — only GET
# handlers, no POST/PUT/DELETE. No GraphQL mutations defined. No
# `fwconsole queue` CLI. The only programmatic path to add or remove a
# queue member is to write to the MariaDB `queues_details` table AND
# run `fwconsole reload` — which is exactly what the FreePBX GUI does
# when an admin uses Queues → Static Agents.
#
# WHAT IT DOES
#
#   add    <queue> <extension>          Insert one row into queues_details
#                                         (id=queue, keyword='member',
#                                          data='Local/EXT@from-queue/n,0')
#                                         then fwconsole reload.
#   remove <queue> <extension>          Delete that row, fwconsole reload.
#   list   <queue>                      SELECT members of a queue (for CRM
#                                         to verify / resync).
#
# SAFETY
#
# - Inputs are regex-validated to digits only (queue = 1-6 digits,
#   extension = 3-6 digits). Anything else exits 2. This means the values
#   interpolated into SQL cannot carry quotes, semicolons, or MySQL
#   metacharacters.
# - CRM never supplies SQL text. Only the verb + queue + extension.
# - Idempotent: add when row exists = 0 rows inserted, exit 0. Remove
#   when row does not exist = 0 rows deleted, exit 0. `fwconsole reload`
#   still runs in both cases so Asterisk picks up any other changes.
# - `fwconsole reload` is bounded to 60s. If it takes longer, something
#   is already wrong with the PBX and we abort rather than hang a CRM
#   request.
#
# IDIOM
#
# FreePBX stores queue members as: `Local/EXT@from-queue/n,PENALTY`
# We always use penalty=0. Admin can edit penalty in GUI directly; CRM
# will not overwrite a non-zero-penalty row because the DELETE predicate
# matches the full `Local/EXT@from-queue/n,0` string, not a prefix LIKE.
# If admin manually sets `Local/214@from-queue/n,5` (penalty 5), CRM's
# `remove 30 214` is a no-op — admin's customization survives.
#
# UPGRADE RISK
#
# The `queues_details` table schema has been stable since FreePBX 13.
# This script version-pins to the 4-column layout: (id, keyword, data,
# flags). If a future FreePBX major changes the layout (unlikely), this
# script fails loudly with a SQL error rather than silently corrupting
# data. Keep an eye on `DESCRIBE queues_details` after any major upgrade.

set -euo pipefail

VERB="${1:-}"
QUEUE="${2:-}"
EXT="${3:-}"

usage() {
  echo "usage: $0 add|remove|list <queue> [<extension>]" >&2
  echo "       $0 list <queue>" >&2
  exit 2
}

# ── Input validation ────────────────────────────────────────────────────────
if [[ -z "$VERB" || -z "$QUEUE" ]]; then
  usage
fi
if ! [[ "$QUEUE" =~ ^[0-9]{1,6}$ ]]; then
  echo "error: queue must be 1-6 digits, got: $QUEUE" >&2
  exit 3
fi
if [[ "$VERB" == "add" || "$VERB" == "remove" ]]; then
  if [[ -z "$EXT" ]]; then usage; fi
  if ! [[ "$EXT" =~ ^[0-9]{3,6}$ ]]; then
    echo "error: extension must be 3-6 digits, got: $EXT" >&2
    exit 4
  fi
fi

# ── Helpers ─────────────────────────────────────────────────────────────────
# Using `mysql -u root asterisk` with no password — this is how FreePBX's
# own maintenance scripts connect. The socket auth is trusted on the PBX
# host itself (we're running as root here, and only reachable via
# authenticated SSH from the CRM VM).
MYSQL_CMD="mysql -u root asterisk"

member_data() {
  echo "Local/${EXT}@from-queue/n,0"
}

do_add() {
  local data
  data="$(member_data)"
  # INSERT IGNORE handles the "already present" case silently. The PK is
  # (id, keyword, data) so a duplicate insert is a no-op at the row level.
  $MYSQL_CMD --execute="INSERT IGNORE INTO queues_details (id, keyword, data, flags) VALUES ('${QUEUE}', 'member', '${data}', 0);"
  timeout 60 fwconsole reload --quiet
  echo "ok: added ext=${EXT} to queue=${QUEUE}"
}

do_remove() {
  local data
  data="$(member_data)"
  $MYSQL_CMD --execute="DELETE FROM queues_details WHERE id='${QUEUE}' AND keyword='member' AND data='${data}';"
  timeout 60 fwconsole reload --quiet
  echo "ok: removed ext=${EXT} from queue=${QUEUE}"
}

do_list() {
  # Machine-readable: one extension per line. CRM uses this for its
  # "resync-queues" admin action (verify what's actually persisted vs
  # what CRM's PositionQueueRule table expects).
  $MYSQL_CMD --batch --skip-column-names --execute="SELECT data FROM queues_details WHERE id='${QUEUE}' AND keyword='member' ORDER BY data;" \
    | grep -oE '^Local/[0-9]+@from-queue' \
    | sed 's|Local/||; s|@from-queue||' \
    || true
}

case "$VERB" in
  add)    do_add ;;
  remove) do_remove ;;
  list)   do_list ;;
  *)      usage ;;
esac
