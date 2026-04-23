#!/bin/bash
#
# restore-telephony-baseline.sh
#
# One-prompt restore of the CRM28 + FreePBX telephony state to a baseline
# captured by an earlier run. Invoked by Claude Code in response to:
#
#   "Restore telephony baseline YYYY-MM-DD"
#
# Usage:
#   scripts/restore-telephony-baseline.sh <stamp>          # e.g. 2026-04-24
#
# Pre-reqs:
#   - SSH access to `asterisk` host (FreePBX) and `Administrator@192.168.65.110` (VM)
#   - Baselines present on both hosts AND locally at .baselines/<stamp>/
#   - All SHA256 hashes match
#
# This script is intentionally loud and halts on the first failure. A
# partially-restored system is worse than a clearly-broken restore attempt.

set -euo pipefail

STAMP="${1:-}"
if [[ -z "$STAMP" ]]; then
  echo "usage: $0 <YYYY-MM-DD>"
  echo "example: $0 2026-04-24"
  exit 2
fi

LOCAL_DIR=".baselines/$STAMP"
PBX_DIR="/root/crm28-baselines/$STAMP"
VM_DIR="C:/crm/baselines/$STAMP"
TAG="baseline-pre-pbx-integration-$STAMP"
MANIFEST="docs/baselines/$STAMP.md"

step() { echo; echo "==[ $* ]=="; }
fail() { echo "FAILED: $*" >&2; exit 1; }

# ── Phase 1: verify baseline artifacts exist and hash-match ──────────────

step "1/13  Verifying local baseline directory"
[[ -d "$LOCAL_DIR" ]]                         || fail "no local baseline at $LOCAL_DIR"
[[ -d "$LOCAL_DIR/pbx" && -d "$LOCAL_DIR/vm" ]] || fail "incomplete local baseline — missing pbx/ or vm/"
[[ -f "$MANIFEST" ]]                           || fail "manifest missing: $MANIFEST"

step "2/13  Verifying PBX local-copy hashes"
( cd "$LOCAL_DIR/pbx" && sha256sum -c SHA256SUMS ) || fail "local PBX baseline is corrupted"

step "3/13  Verifying VM local-copy hashes"
( cd "$LOCAL_DIR/vm" && sha256sum -c SHA256SUMS.local ) || fail "local VM baseline is corrupted"

step "4/13  Verifying git tag is reachable"
git rev-parse --verify "$TAG" >/dev/null     || fail "git tag $TAG not found locally; try 'git fetch --tags'"
git rev-parse --verify "origin/$TAG" >/dev/null 2>&1 || \
  git ls-remote origin "refs/tags/$TAG" | grep -q .  || \
  fail "git tag $TAG not on origin — won't be durable across machines"

# ── Phase 2: halt the CRM ────────────────────────────────────────────────

step "5/13  Stopping CRM backend + frontend on VM"
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  'pm2 stop crm-backend crm-frontend' \
  || fail "could not stop PM2 processes"

# ── Phase 3: restore Postgres ────────────────────────────────────────────

step "6/13  Restoring Postgres crm database on VM"
# Upload the .dump if not already present on VM
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  "Test-Path $VM_DIR/crm-db.dump" | grep -q True \
  || scp -i ~/.ssh/id_ed25519_vm "$LOCAL_DIR/vm/crm-db.dump" \
        "Administrator@192.168.65.110:$VM_DIR/crm-db.dump"

ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  "& 'C:/postgresql17/pgsql/bin/pg_restore.exe' --clean --if-exists --no-owner -U postgres -d crm '$VM_DIR/crm-db.dump'" \
  || fail "pg_restore failed"

# ── Phase 4: restore FreePBX ─────────────────────────────────────────────

step "7/13  Restoring FreePBX MariaDB on asterisk host"
ssh asterisk "sudo mysql -u root asterisk < $PBX_DIR/freepbx-asterisk-db.sql" \
  || fail "MariaDB restore failed"

step "8/13  Restoring /etc/asterisk config files"
ssh asterisk "sudo tar xzf $PBX_DIR/etc-asterisk.tar.gz -C /" \
  || fail "/etc/asterisk tar restore failed"

step "9/13  Restoring ASTDB"
ssh asterisk "sudo systemctl stop asterisk 2>/dev/null || true; sudo cp $PBX_DIR/astdb.sqlite3 /var/lib/asterisk/astdb.sqlite3; sudo chown asterisk:asterisk /var/lib/asterisk/astdb.sqlite3; sudo systemctl start asterisk 2>/dev/null || sudo /etc/init.d/asterisk start || sudo safe_asterisk &" \
  || fail "ASTDB restore failed"

step "10/13 Applying FreePBX config"
ssh asterisk "sudo fwconsole reload" \
  || fail "fwconsole reload failed"

# ── Phase 5: restore CRM code + env ──────────────────────────────────────

step "11/13 Restoring backend .env on VM"
scp -i ~/.ssh/id_ed25519_vm "$LOCAL_DIR/vm/backend.env.bak" \
  "Administrator@192.168.65.110:C:/crm/backend/crm-backend/.env" \
  || fail ".env restore failed"

step "12/13 Resetting VM git tree to baseline tag"
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  "cd C:/crm && git fetch origin --tags && git reset --hard $TAG" \
  || fail "git reset on VM failed"

# ── Phase 6: restart + health-check ──────────────────────────────────────

step "13/13 Restarting CRM services + health checks"
ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  'pm2 restart crm-backend crm-frontend' \
  || fail "could not restart PM2 processes"

sleep 15

ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  'curl.exe -s http://localhost:3000/health' | grep -q '"status":"ok"' \
  || fail "backend /health not responding ok"

ssh -o BatchMode=yes -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  'curl.exe -s http://localhost:3100/health' | grep -q '"ami":{"connected":true' \
  || echo "WARNING: AMI bridge reports ami.connected=false — may recover, investigate if persistent"

ssh asterisk 'asterisk -rx "pjsip show endpoints"' | grep -q "Endpoint:  200/" \
  || fail "Asterisk not showing expected extensions after restore"

echo
echo "===================================================================="
echo "RESTORE COMPLETE — baseline $STAMP fully applied."
echo "===================================================================="
echo "  Git:      tag $TAG"
echo "  CRM DB:   restored from $LOCAL_DIR/vm/crm-db.dump"
echo "  FreePBX:  restored from $PBX_DIR/freepbx-asterisk-db.sql"
echo "  Asterisk: config + ASTDB restored, fwconsole reload OK"
echo
echo "Next: smoke-test a call, check CRM Call Logs populates correctly."
