#!/usr/bin/env bash
# ======================================================================
# monday-morning-preflight.sh
#
# Run 30 minutes before Monday launch. Validates CRM28 production
# readiness across backend, DB, telephony, and realtime surfaces.
#
# Exit 0 => all green. Exit non-zero (= failed step number) => stop.
#
# Usage:
#   bash scripts/monday-morning-preflight.sh
#
# Requirements (on the workstation running this script):
#   - bash 4+
#   - curl, jq
#   - ssh with aliases:
#       * asg-vm   -> Administrator@192.168.65.110 (production VM)
#       * asterisk -> root@5.10.34.153
#     Ensure OpenVPN is up before running.
#
# Output:
#   - stdout (also tee'd to logs/preflight-YYYY-MM-DD_HHMMSS.log)
#   - final line: "===== PREFLIGHT PASS =====" or
#                 "===== PREFLIGHT FAIL (step N) ====="
# ======================================================================

set -eE -o pipefail

# ---------- Setup ----------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_DIR="${REPO_ROOT}/logs"
mkdir -p "${LOG_DIR}"

# Portable ISO-8601 timestamp. Prefer GNU date (gdate on macOS) but
# BSD/Git-Bash `date -Iseconds` also works.
if command -v gdate >/dev/null 2>&1; then
  TS="$(gdate +%F_%H%M%S)"
  ISO_NOW="$(gdate -Iseconds)"
else
  TS="$(date +%F_%H%M%S)"
  ISO_NOW="$(date -Iseconds 2>/dev/null || date +%FT%T%z)"
fi

LOG_FILE="${LOG_DIR}/preflight-${TS}.log"

# Redirect all output through tee to capture to log AND stdout.
exec > >(tee -a "${LOG_FILE}") 2>&1

# ---------- Colors (green/red only if TTY) ----------

if [ -t 1 ]; then
  G="$(printf '\033[1;32m')"
  R="$(printf '\033[1;31m')"
  Y="$(printf '\033[1;33m')"
  B="$(printf '\033[1;34m')"
  D="$(printf '\033[0m')"
else
  G=""; R=""; Y=""; B=""; D=""
fi

# ---------- Helpers ----------

STEP=0
section() {
  STEP=$((STEP + 1))
  echo
  echo "${B}===== Step ${STEP}: $1 =====${D}"
}

ok() {
  echo "${G}  OK${D} | $1"
}

fail() {
  echo "${R}  FAIL${D} | $1"
  echo "${Y}  Hint: $2${D}"
  echo
  echo "${R}===== PREFLIGHT FAIL (step ${STEP}) =====${D}"
  exit "${STEP}"
}

warn() {
  echo "${Y}  WARN${D} | $1"
}

trap 'echo "${R}  ERROR${D} | unexpected shell error at step ${STEP} (line ${LINENO})"; echo "${R}===== PREFLIGHT FAIL (step ${STEP}) =====${D}"; exit "${STEP:-99}"' ERR

echo "CRM28 Monday morning preflight"
echo "Timestamp: ${ISO_NOW}"
echo "Log file: ${LOG_FILE}"
echo

# ---------- 1. Backend health ----------

section "Backend health (https://crm28.asg.ge/health)"

HEALTH_BODY="$(curl -sf --max-time 10 https://crm28.asg.ge/health 2>/dev/null || true)"
if [ -z "${HEALTH_BODY}" ]; then
  fail "curl did not return a body; nginx or backend may be down" \
       "SSH to the VM and run 'pm2 logs crm-backend --lines 50'. Check nginx is running (Get-Service nginx)."
fi

STATUS_OK="$(echo "${HEALTH_BODY}" | jq -r '.status == "ok"' 2>/dev/null || echo "false")"
if [ "${STATUS_OK}" != "true" ]; then
  fail "/health .status is not \"ok\": ${HEALTH_BODY}" \
       "Tail pm2 logs crm-backend; check DATABASE_URL and JWT_SECRET on VM."
fi

DB_CONNECTED="$(echo "${HEALTH_BODY}" | jq -r '.db.connected // .info.db.status // "unknown"' 2>/dev/null)"
if [ "${DB_CONNECTED}" != "true" ] && [ "${DB_CONNECTED}" != "up" ]; then
  fail "/health reports DB not connected (value=${DB_CONNECTED})" \
       "SSH asg-vm, verify PostgreSQL service is Running; check DATABASE_URL env."
fi

ok "backend health .status=ok, DB connected"

# ---------- 2. Frontend responding ----------

section "Frontend responding (https://crm28.asg.ge/login)"

HTTP_CODE="$(curl -sf -L -o /dev/null -w '%{http_code}' --max-time 10 https://crm28.asg.ge/login 2>/dev/null || echo '000')"
if [ "${HTTP_CODE}" != "200" ]; then
  fail "/login returned HTTP ${HTTP_CODE} (expected 200)" \
       "SSH asg-vm; pm2 restart crm-frontend; check 'pnpm build' succeeded. Check nginx upstream pointing to :4002."
fi
ok "/login returned 200"

# ---------- 3. DB connectivity (direct psql on VM) ----------

section "DB connectivity (SELECT active User count)"

USER_COUNT="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm \
  'C:\\postgresql17\\pgsql\\bin\\psql.exe -U postgres -d crm -At -c "SELECT COUNT(*) FROM \"User\" WHERE \"isActive\"=true"' \
  2>/dev/null | tr -d '\r\n[:space:]')"

if ! [[ "${USER_COUNT}" =~ ^[0-9]+$ ]]; then
  fail "psql did not return a numeric user count (raw='${USER_COUNT}')" \
       "SSH asg-vm manually; verify pg_ctl status; re-run query."
fi
if [ "${USER_COUNT}" -lt 1 ]; then
  fail "User table has 0 active users" \
       "Run 'pnpm seed:all' in backend/crm-backend on VM. Check User.isActive values."
fi
ok "${USER_COUNT} active users in DB"

# ---------- 4. PM2 processes up ----------

section "PM2 processes up (crm-backend, crm-frontend, ami-bridge, core-sync-bridge)"

PM2_OUT="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm 'pm2 jlist' 2>/dev/null || true)"
if [ -z "${PM2_OUT}" ]; then
  fail "pm2 jlist returned no output" \
       "SSH asg-vm; run 'pm2 resurrect'; check pm2 daemon is alive."
fi

declare -a REQUIRED=(crm-backend crm-frontend ami-bridge core-sync-bridge)
MISSING=()
for proc in "${REQUIRED[@]}"; do
  ST="$(echo "${PM2_OUT}" | jq -r --arg n "${proc}" '[.[] | select(.name == $n)] | .[0].pm2_env.status // "absent"' 2>/dev/null)"
  if [ "${ST}" != "online" ]; then
    MISSING+=("${proc}=${ST}")
  else
    ok "${proc} online"
  fi
done
if [ "${#MISSING[@]}" -gt 0 ]; then
  fail "PM2 processes not online: ${MISSING[*]}" \
       "SSH asg-vm; 'pm2 restart <name>'; tail 'pm2 logs <name>'."
fi

# ---------- 5. Asterisk reachable ----------

section "Asterisk reachable (core show version)"

AST_VER="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asterisk \
  "asterisk -rx 'core show version'" 2>/dev/null || true)"
if [ -z "${AST_VER}" ] || ! echo "${AST_VER}" | grep -qi 'asterisk'; then
  fail "asterisk -rx 'core show version' did not return a version string (got: '${AST_VER}')" \
       "Check OpenVPN is up; SSH asterisk manually; check Asterisk service is running."
fi
ok "Asterisk: $(echo "${AST_VER}" | head -1 | sed 's/^ *//')"

# ---------- 6. AMI bridge health ----------

section "AMI Bridge health (http://127.0.0.1:3100/health on VM)"

AMI_HEALTH="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm \
  'curl -sf --max-time 5 http://127.0.0.1:3100/health' 2>/dev/null || true)"

if [ -z "${AMI_HEALTH}" ]; then
  fail "AMI bridge health endpoint returned no body" \
       "SSH asg-vm; 'pm2 restart ami-bridge'; check AMI_HOST/PORT/USER/SECRET env match manager_custom.conf."
fi

AMI_STATUS="$(echo "${AMI_HEALTH}" | jq -r '.status // "unknown"' 2>/dev/null)"
if [ "${AMI_STATUS}" = "healthy" ]; then
  ok "AMI bridge status=healthy"
elif [ "${AMI_STATUS}" = "degraded" ]; then
  MIN_SINCE="$(echo "${AMI_HEALTH}" | jq -r '.minutesSinceSuccess // .minutesSinceLastPost // "?"' 2>/dev/null)"
  fail "AMI bridge status=degraded (minutesSinceSuccess=${MIN_SINCE})" \
       "Check AMI connection to 5.10.34.153:5038 via SSH tunnel; ensure ingest secret matches backend TELEPHONY_INGEST_SECRET."
else
  fail "AMI bridge status=${AMI_STATUS}; body=${AMI_HEALTH}" \
       "SSH asg-vm; 'pm2 logs ami-bridge --lines 100'; inspect AMI auth errors."
fi

# ---------- 7. Operator extensions registered ----------

section "Operator extensions registered on Asterisk (ext 200-214 + 501)"

PJSIP_OUT="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asterisk \
  "asterisk -rx 'pjsip show endpoints'" 2>/dev/null || true)"

if [ -z "${PJSIP_OUT}" ]; then
  fail "asterisk -rx 'pjsip show endpoints' returned no output" \
       "Verify Asterisk responsive; re-run manually."
fi

# Each extension line looks like: "  Endpoint:  200/200                         Not in use    0 of inf"
REG_COUNT=0
REGISTERED_LIST=()
for ext in 200 201 202 203 204 205 206 207 208 209 210 211 212 213 214 501; do
  if echo "${PJSIP_OUT}" | grep -E "Endpoint:\s+${ext}[/ ]" | grep -q 'Not in use'; then
    REGISTERED_LIST+=("${ext}")
    REG_COUNT=$((REG_COUNT + 1))
  fi
done

if [ "${REG_COUNT}" -lt 1 ]; then
  fail "0 of 16 operator extensions are registered" \
       "Operators' softphones are not signed in. Have them relaunch the softphone app and log in."
fi

ok "${REG_COUNT}/16 operator extensions registered: ${REGISTERED_LIST[*]:-none}"
if [ "${REG_COUNT}" -lt 8 ]; then
  warn "Fewer than half of the extensions are registered. Confirm operator roster for this shift."
fi

# ---------- 8. Queue 804 membership ----------

section "Queue 804 has >= 1 member"

Q804_OUT="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asterisk \
  "asterisk -rx 'queue show 804'" 2>/dev/null || true)"
if [ -z "${Q804_OUT}" ]; then
  fail "queue 804 not found or asterisk did not respond" \
       "SSH asterisk; 'asterisk -rx \"queue show 804\"'; verify FreePBX GUI Queue 804 still exists."
fi

# Parse "Members:" section count. Members are lines after "Members:" until "Callers:" or blank.
MEMBER_COUNT="$(echo "${Q804_OUT}" | awk '/^[[:space:]]*Members:/,/^[[:space:]]*Callers:/' | grep -cE '^[[:space:]]+Local/' || true)"
if ! [[ "${MEMBER_COUNT}" =~ ^[0-9]+$ ]] || [ "${MEMBER_COUNT}" -lt 1 ]; then
  fail "queue 804 has ${MEMBER_COUNT} members" \
       "FreePBX GUI -> Queues -> 804 -> Static Agents; ensure Local/200 through Local/214 (+501) are listed. Apply Config."
fi
ok "queue 804 has ${MEMBER_COUNT} members"

# ---------- 9. SIP trunk registered ----------

section "SIP trunk registered (1055267e1-Active-NoWorkAlamex)"

REG_OUT="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asterisk \
  "asterisk -rx 'pjsip show registrations'" 2>/dev/null || true)"
if [ -z "${REG_OUT}" ]; then
  fail "pjsip show registrations returned no output" \
       "SSH asterisk; re-run manually; check pjsip.registration.conf."
fi
if ! echo "${REG_OUT}" | grep -E '1055267e1-Active-NoWorkAlamex' | grep -qi 'Registered'; then
  fail "trunk 1055267e1-Active-NoWorkAlamex is NOT registered with Alamex" \
       "FreePBX GUI -> Trunks -> Alamex -> check credentials; 'asterisk -rx \"pjsip send register 1055267e1-Active-NoWorkAlamex\"'."
fi
ok "trunk 1055267e1-Active-NoWorkAlamex registered with 89.150.1.11"

# ---------- 10. Core Sync Bridge health ----------

section "Core Sync Bridge health (http://127.0.0.1:3101/health on VM)"

CORE_HEALTH="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm \
  'curl -sf --max-time 5 http://127.0.0.1:3101/health' 2>/dev/null || true)"
if [ -z "${CORE_HEALTH}" ]; then
  fail "core-sync bridge health endpoint returned no body" \
       "SSH asg-vm; 'pm2 restart core-sync-bridge'; check CORE_MYSQL_* env."
fi
CORE_STATUS="$(echo "${CORE_HEALTH}" | jq -r '.status // "unknown"' 2>/dev/null)"
if [ "${CORE_STATUS}" != "healthy" ] && [ "${CORE_STATUS}" != "ok" ]; then
  fail "core-sync bridge status=${CORE_STATUS}; body=${CORE_HEALTH}" \
       "pm2 logs core-sync-bridge; verify VPN to core MySQL; check CRM_WEBHOOK_SECRET matches backend CORE_WEBHOOK_SECRET."
fi
ok "core-sync bridge status=${CORE_STATUS}"

# ---------- 11. Recording path disk usage ----------

section "Recording path reachable + disk usage < 85%"

DF_LINE="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asterisk \
  'df -h /var/spool/asterisk | tail -1' 2>/dev/null || true)"
if [ -z "${DF_LINE}" ]; then
  fail "df -h /var/spool/asterisk returned no output" \
       "SSH asterisk; re-run manually; ensure recording dir still exists."
fi
USE_PCT="$(echo "${DF_LINE}" | awk '{for(i=1;i<=NF;i++) if($i ~ /%$/) { gsub(/%/,"",$i); print $i; exit }}')"
if ! [[ "${USE_PCT}" =~ ^[0-9]+$ ]]; then
  fail "could not parse disk usage percentage from: ${DF_LINE}" \
       "SSH asterisk; df -h; inspect manually."
fi
if [ "${USE_PCT}" -ge 85 ]; then
  fail "/var/spool/asterisk disk at ${USE_PCT}% (threshold 85%)" \
       "Archive or delete old /var/spool/asterisk/monitor/<year>/<month> directories; consider moving to a larger volume."
fi
ok "/var/spool/asterisk disk at ${USE_PCT}%"

# ---------- 12. No unapplied migrations ----------

section "Prisma migrations up to date"

MIG_OUT="$(ssh -o BatchMode=yes -o ConnectTimeout=30 asg-vm \
  'cd C:\\crm\\backend\\crm-backend && pnpm prisma migrate status' 2>/dev/null || true)"
if [ -z "${MIG_OUT}" ]; then
  fail "prisma migrate status returned no output" \
       "SSH asg-vm; cd C:\\crm\\backend\\crm-backend; pnpm prisma migrate status; check DATABASE_URL."
fi
if ! echo "${MIG_OUT}" | grep -qE 'Database schema is up to date|No pending migrations'; then
  fail "Prisma migrations are NOT up to date; output: ${MIG_OUT}" \
       "SSH asg-vm; cd C:\\crm\\backend\\crm-backend; pnpm prisma migrate deploy; verify no P3009 drift."
fi
ok "Prisma migrations up to date"

# ---------- 13. Recent CallSession rows ----------

section "Recent CallSession rows (last 24h)"

CALL_COUNT="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm \
  'C:\\postgresql17\\pgsql\\bin\\psql.exe -U postgres -d crm -At -c "SELECT COUNT(*) FROM \"CallSession\" WHERE \"startAt\" > now() - interval '"'"'24 hours'"'"'"' \
  2>/dev/null | tr -d '\r\n[:space:]')"

if ! [[ "${CALL_COUNT}" =~ ^[0-9]+$ ]]; then
  fail "psql returned non-numeric CallSession count (raw='${CALL_COUNT}')" \
       "SSH asg-vm; run query manually; check Prisma schema migrated."
fi

if [ "${CALL_COUNT}" -lt 1 ]; then
  # This is a warning, not a failure — if no calls happened in the last 24h that's OK for a weekend.
  warn "0 CallSession rows in the last 24h. If this is normal for your quiet period, carry on — but ingest may be broken. Place a test call at 8:30 and re-run."
else
  ok "${CALL_COUNT} CallSession rows in last 24h (ingest is flowing)"
fi

# ---------- 14. Operator + Manager RoleGroup permissions ----------

section "RoleGroup permission coverage (operators + managers)"

OP_PERMS_EXPECTED=(
  'call_center.menu'
  'call_logs.own'
  'client_chats.menu'
  'softphone.handshake'
  'telephony.call'
)
MGR_PERMS_EXPECTED=(
  'call_center.live'
  'call_center.statistics'
  'call_center.menu'
  'client_chats.manage'
)

# Get the effective permission set for each of the 2 known role groups.
# Role group code 'CALL_CENTER' for operators, 'MANAGEMENT' for managers.
for rg in 'CALL_CENTER:Call Center Operator' 'MANAGEMENT:Manager'; do
  CODE="${rg%%:*}"
  LABEL="${rg##*:}"
  PERMS_RAW="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm \
    "C:\\postgresql17\\pgsql\\bin\\psql.exe -U postgres -d crm -At -c \"SELECT p.resource || '.' || p.action FROM \\\"RoleGroup\\\" rg JOIN \\\"RoleGroupPermission\\\" rgp ON rgp.\\\"roleGroupId\\\" = rg.id JOIN \\\"Permission\\\" p ON p.id = rgp.\\\"permissionId\\\" WHERE rg.code = '${CODE}' ORDER BY 1\"" \
    2>/dev/null | tr -d '\r' | sort -u || true)"

  if [ -z "${PERMS_RAW}" ]; then
    warn "RoleGroup '${CODE}' has 0 permissions or does not exist (${LABEL})"
    continue
  fi

  echo "  ${B}${LABEL} (${CODE})${D} effective permissions:"
  echo "${PERMS_RAW}" | sed 's/^/    - /'

  # Check expected
  if [ "${CODE}" = "CALL_CENTER" ]; then
    EXPECTED=("${OP_PERMS_EXPECTED[@]}")
  else
    EXPECTED=("${MGR_PERMS_EXPECTED[@]}")
  fi

  MISSING_PERMS=()
  for p in "${EXPECTED[@]}"; do
    if ! echo "${PERMS_RAW}" | grep -qx "${p}"; then
      MISSING_PERMS+=("${p}")
    fi
  done
  if [ "${#MISSING_PERMS[@]}" -gt 0 ]; then
    fail "${LABEL} RoleGroup is MISSING: ${MISSING_PERMS[*]}" \
         "Open /app/admin/role-groups in the CRM, click Permissions on ${LABEL}, check the missing boxes, Save. See audit/RBAC_ADMIN_CHECK.md §5."
  fi
  ok "${LABEL} RoleGroup has all Monday-critical permissions"
done

# ---------- 15. Repo on master ----------

section "VM repo is on master branch"

VM_BRANCH="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm \
  'cd C:\\crm && git rev-parse --abbrev-ref HEAD' 2>/dev/null | tr -d '\r\n[:space:]' || true)"
if [ "${VM_BRANCH}" != "master" ]; then
  fail "VM repo is on '${VM_BRANCH}' (expected 'master')" \
       "SSH asg-vm; cd C:\\crm; git checkout master; git pull origin master; restart PM2 services."
fi
ok "VM repo on master"

# ---------- 16. Backup freshness ----------

section "Backup from last 24h present on VM"

BACKUP_LINE="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm \
  'powershell -NoProfile -Command "Get-ChildItem C:\\crm\\backups\\*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | ForEach-Object { \"$($_.LastWriteTime.ToString(''yyyy-MM-ddTHH:mm:ss'')) $($_.Name)\" }"' \
  2>/dev/null | tr -d '\r' || true)"

if [ -z "${BACKUP_LINE}" ]; then
  fail "no backup files found in C:\\crm\\backups" \
       "SSH asg-vm; run .\\vm-configs\\scripts\\backup-db.ps1 immediately; ensure nightly scheduled task exists."
fi

BACKUP_DATE="${BACKUP_LINE%% *}"
if command -v gdate >/dev/null 2>&1; then
  BACKUP_EPOCH="$(gdate -d "${BACKUP_DATE}" +%s 2>/dev/null || echo 0)"
  NOW_EPOCH="$(gdate +%s)"
else
  BACKUP_EPOCH="$(date -d "${BACKUP_DATE}" +%s 2>/dev/null || echo 0)"
  NOW_EPOCH="$(date +%s)"
fi
AGE_HOURS=$(( (NOW_EPOCH - BACKUP_EPOCH) / 3600 ))
if [ "${BACKUP_EPOCH}" -eq 0 ] || [ "${AGE_HOURS}" -gt 24 ]; then
  fail "most recent backup is ${AGE_HOURS}h old: ${BACKUP_LINE}" \
       "SSH asg-vm; run .\\vm-configs\\scripts\\backup-db.ps1 now; fix scheduled task if nightly is failing."
fi
ok "most recent backup is ${AGE_HOURS}h old: ${BACKUP_LINE}"

# ---------- 17. WebSocket endpoint reachable ----------

section "WebSocket endpoint reachable (https://crm28.asg.ge/socket.io/)"

WS_CODE="$(curl -sf -L -o /dev/null -w '%{http_code}' \
  --max-time 10 \
  -H "Origin: https://crm28.asg.ge" \
  "https://crm28.asg.ge/socket.io/?EIO=4" 2>/dev/null || echo '000')"

# Socket.IO handshake without transport returns 200 with an "0{... }" JSON-ish body
# depending on nginx/socket.io version; 200 is success; 400 indicates handshake issue.
if [ "${WS_CODE}" != "200" ]; then
  fail "/socket.io handshake returned HTTP ${WS_CODE} (expected 200)" \
       "Check nginx has Upgrade/Connection upgrade headers for /socket.io; tail pm2 logs crm-backend for gateway errors."
fi
ok "socket.io handshake HTTP ${WS_CODE}"

# ---------- 18. AMI bridge last-post recency (proxy for ingest secret match) ----------

section "AMI bridge last-post within last 5 min (proxy for TELEPHONY_INGEST_SECRET match)"

# Re-fetch in case earlier response has aged slightly.
AMI_HEALTH2="$(ssh -o BatchMode=yes -o ConnectTimeout=15 asg-vm \
  'curl -sf --max-time 5 http://127.0.0.1:3100/health' 2>/dev/null || true)"

LAST_POST_MIN="$(echo "${AMI_HEALTH2}" | jq -r '.minutesSinceSuccess // .minutesSinceLastPost // empty' 2>/dev/null)"

if [ -z "${LAST_POST_MIN}" ] || [ "${LAST_POST_MIN}" = "null" ]; then
  # If bridge hasn't posted yet (no events since boot), warn rather than fail.
  warn "AMI bridge /health has no 'minutesSinceSuccess' field yet. If Asterisk has seen no events since bridge started, place a test call and re-run step 18."
else
  # Accept floats; truncate to int for comparison.
  LAST_POST_INT="${LAST_POST_MIN%.*}"
  if ! [[ "${LAST_POST_INT}" =~ ^[0-9]+$ ]]; then
    warn "could not parse minutesSinceSuccess='${LAST_POST_MIN}'"
  elif [ "${LAST_POST_INT}" -gt 5 ]; then
    fail "AMI bridge last successful ingest was ${LAST_POST_MIN} min ago (>5 min)" \
         "Check TELEPHONY_INGEST_SECRET matches between ami-bridge .env and backend .env; check backend /v1/telephony/ingest endpoint responds 204; tail ami-bridge logs."
  else
    ok "AMI bridge last-post ${LAST_POST_MIN} min ago (secret alignment likely OK)"
  fi
fi

# ---------- Summary ----------

echo
echo "${G}===== PREFLIGHT PASS =====${D}"
echo "Completed ${STEP} checks. Log: ${LOG_FILE}"
exit 0
