#!/bin/bash
#
# snapshot-queue-members.sh
#
# Capture a point-in-time snapshot of the current Asterisk queue membership
# state, for use as a rollback reference if the ExtensionLinkService (PR #296)
# misbehaves in production.
#
# Usage (run from repo root on a machine with SSH access to the PBX):
#   scripts/telephony/snapshot-queue-members.sh [label]
#
# `label` defaults to the current date. Output goes to:
#   .baselines/pre-link-<label>/
#     queue-show.txt          — asterisk -rx "queue show"
#     pjsip-endpoints.txt     — asterisk -rx "pjsip show endpoints"
#     mariadb-queues.txt      — SELECT * FROM queues_details WHERE keyword='member'
#     crm-extensions.json     — CRM's current TelephonyExtension rows (incl. crmUserId)
#
# Restore use-cases:
#   - If a bad PositionQueueRule caused operators to be added to wrong queues,
#     diff queue-show.txt (before) vs. live `queue show` (after) to see what
#     changed, and manually reverse via FreePBX GUI Queues page.
#   - If the backend was misconfigured and a mass QueueRemove fired, use
#     mariadb-queues.txt to re-add each operator to their previous queues
#     via FreePBX GUI → Queue → Static Agents.
#   - If CRM state was corrupted, crm-extensions.json can be reloaded via
#     `psql -f restore-extensions.sql` after hand-editing.
#
# This script is READ-ONLY. It never modifies PBX or CRM state.

set -euo pipefail

LABEL="${1:-$(date +%Y%m%d-%H%M%S)}"
OUT_DIR=".baselines/pre-link-${LABEL}"

mkdir -p "$OUT_DIR"

echo "==[ Snapshot label: $LABEL ]=="
echo "==[ Output directory: $OUT_DIR ]=="

# --- PBX: live queue membership ---------------------------------------------
# `queue show` is the authoritative view — what Asterisk actually dispatches
# to, regardless of what MariaDB says. This is the one we diff against after
# a failed deploy.
echo "==[ 1/4 ] PBX: queue show"
ssh asterisk 'asterisk -rx "queue show"' > "$OUT_DIR/queue-show.txt"

# --- PBX: endpoints (for cross-referencing extensions to agents) ------------
echo "==[ 2/4 ] PBX: pjsip show endpoints"
ssh asterisk 'asterisk -rx "pjsip show endpoints"' > "$OUT_DIR/pjsip-endpoints.txt"

# --- PBX MariaDB: static queue members from queues_details ------------------
# FreePBX stores the configured-in-GUI queue members here. Differs from the
# runtime `queue show` if anyone has used AMI QueueAdd/QueueRemove (which CRM
# is about to start doing). Useful for "what did the admin configure by hand".
echo "==[ 3/4 ] PBX MariaDB: queues_details members"
ssh asterisk "sudo mysql -u root asterisk -e \"SELECT id,keyword,data FROM queues_details WHERE keyword IN ('member','queue_weight','strategy') ORDER BY id, keyword\"" \
  > "$OUT_DIR/mariadb-queues.txt"

# --- CRM: current TelephonyExtension rows + link state ----------------------
# Captures which operators are currently linked to which extensions, plus
# the PositionQueueRule configuration that the service will consume.
echo "==[ 4/4 ] CRM Postgres: TelephonyExtension + PositionQueueRule"
# PowerShell on the VM chokes on `--pset=footer=off` (sees the = as
# argument-parse error). Use default table format via -c only — still
# human-readable for a restore reference, and avoids the quoting war.
# The --% stop-parsing token tells PowerShell to pass everything after
# it to the exe verbatim.
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  'C:/postgresql17/pgsql/bin/psql.exe --% -U postgres -d crm -c "SELECT e.extension, e.\"crmUserId\", e.\"displayName\", e.\"isActive\", u.email FROM \"TelephonyExtension\" e LEFT JOIN \"User\" u ON u.id = e.\"crmUserId\" ORDER BY e.extension"' \
  > "$OUT_DIR/crm-extensions.txt" || {
    echo "WARN: could not reach VM Postgres — CRM snapshot skipped. PBX snapshots are still valid."
}

ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  'C:/postgresql17/pgsql/bin/psql.exe --% -U postgres -d crm -c "SELECT p.code AS position, q.name AS queue FROM \"PositionQueueRule\" r JOIN \"Position\" p ON p.id = r.\"positionId\" JOIN \"TelephonyQueue\" q ON q.id = r.\"queueId\" ORDER BY p.code, q.name"' \
  > "$OUT_DIR/crm-position-queue-rules.txt" || true

# --- SHA256 manifest for tamper detection -----------------------------------
( cd "$OUT_DIR" && sha256sum ./*.txt 2>/dev/null > SHA256SUMS ) || true

echo
echo "===================================================================="
echo "Snapshot complete: $OUT_DIR"
echo "===================================================================="
echo "  - queue-show.txt                  (PBX live queue members)"
echo "  - pjsip-endpoints.txt             (PBX PJSIP endpoints + state)"
echo "  - mariadb-queues.txt              (PBX static queue config)"
echo "  - crm-extensions.txt              (CRM link state)"
echo "  - crm-position-queue-rules.txt    (CRM rules for the service to consume)"
echo "  - SHA256SUMS                      (integrity manifest)"
echo
echo "To roll back if this PR misbehaves:"
echo "  1. In backend .env set TELEPHONY_AUTO_QUEUE_SYNC=false and pm2 restart crm-backend."
echo "     This stops all further AMI QueueAdd/Remove while leaving CRM links intact."
echo "  2. Diff \`asterisk -rx \"queue show\"\` vs. $OUT_DIR/queue-show.txt to see which"
echo "     memberships need to be repaired."
echo "  3. Use FreePBX GUI → Queues → [queue] → Static Agents to restore, or re-run"
echo "     the PR once fixed."
echo
echo "git tag suggestion: git tag pre-link-feature-$LABEL origin/master && git push origin pre-link-feature-$LABEL"
