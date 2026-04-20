# Monday morning admin cheat-sheet

**Open this on your phone Monday morning.** Companion to `MONDAY_ADMIN_UI_SETUP.md` (which is the full walkthrough). This file is the *tactical* reference — symptom → fix lookups, emergency SQL, and the minute-by-minute timeline.

---

## Emergency contact order

1. Try the **symptom → fix table** below first (90% of day-one issues)
2. If admin UI is broken or a bulk-fix is needed, run the **emergency SQL**
3. If 5 minutes of troubleshooting didn't help, tell me (`@Claude`) with the exact error/symptom

---

## Symptom → fix (most common day-one issues)

| Symptom | Root cause | Fix |
|---|---|---|
| "Operator logged in but sidebar is empty" | RoleGroup has zero permissions, or Position not linked to RoleGroup | `/app/admin/positions` → click operator's position → verify RoleGroup is set to `Call Center Operator`. If blank, assign it. |
| "Operator can see Call Center menu but clicking any tab shows 403" | Sub-permission missing (`call_logs.own`, `call_center.reports`, etc.) | `/app/admin/role-groups` → `Call Center Operator` → Assign Permissions → tick the missing box. Operator must log out + back in. |
| "Operator can't place outbound call from click-to-call" | `telephony.call` OR `softphone.handshake` missing | Both are required. Check Call Center Operator has both ticked. Grant whichever is missing. |
| "Operator can't hangup/transfer from web UI during an active call" | `telephony.call` missing | Grant `telephony.call` to their RoleGroup. (The softphone's own hangup button still works — this only affects web-UI controls.) |
| "Softphone installed but shows 'Fetching credentials…' forever" | `softphone.handshake` missing | Grant `softphone.handshake`. Operator does NOT need to reinstall — just log out + back in from the softphone app. |
| "Softphone login succeeds but SIP shows Unregistered" | Either: (a) `sipPassword` not set on TelephonyExtension, or (b) Asterisk extension password doesn't match CRM | `/app/admin/telephony` → find operator → verify extension number + password. If uncertain, regenerate password in both places. |
| "Operator sees call logs list empty, but they made calls today" | `call_logs.own` missing | Grant `call_logs.own` to Call Center Operator. |
| "Operator can't play their own call recording (Playback failed)" | Either: (a) `call_recordings.own` missing, or (b) Recording file not synced from Asterisk to VM | (a) Grant the permission. (b) SSH to Asterisk, verify `.wav` exists in `/var/spool/asterisk/monitor/YYYY/MM/DD/`. See `docs/TELEPHONY_INTEGRATION.md` "Recording File Sync". |
| "Manager sees own dept calls but not subordinate dept calls" | `call_logs.department_tree` missing (must be granted IN ADDITION to `call_logs.own` and `.department`) | Grant all three to Call Center Manager: `call_logs.own`, `call_logs.department`, `call_logs.department_tree`. Same three for `call_recordings.*`. |
| "Manager opens Live Monitor tab, sees blank screen" | `call_center.live` missing, or Socket.IO `/telephony` disconnected | Check permission first. If present, check browser DevTools Network tab for 101-Switching-Protocols on `/socket.io/…`. If WebSocket is not upgrading, check nginx config. |
| "Manager Statistics tab shows 'Date range too long'" | Backend rejects > 90-day windows with HTTP 422 | Not a bug — ask manager to pick a narrower date range (≤ 90 days). |
| "Missed calls list shows 0 but we missed calls" | `missed_calls.access` missing | Grant to both operator + manager RoleGroups. |
| "Missed call 'Claim' / 'Resolve' button does nothing" | `missed_calls.manage` missing | Grant it. Separate from `.access`. |
| "Switching softphone user from CRM button fails with 403" | `softphone.handshake` missing on the NEW user's RoleGroup | This is the P0-C fix from PR #257. Grant `softphone.handshake` to the new user's RoleGroup. The outgoing user doesn't need it for switch-out. |
| "Phone app mismatch banner stuck on screen" | Either: (a) another user is paired with this softphone, or (b) bridge unreachable | Banner now says "Softphone is paired to a different user" (no name shown for privacy — PR #253). Have the current user click "Switch Phone" to repair. If that fails, restart softphone app. |
| "Call report modal auto-opens on call connect but category dropdown is empty" | `CALL_REPORT_CATEGORY` SystemList is missing | Run `npx tsx prisma/seed-system-lists.ts` on VM. This now runs on every deploy (PR #267), so it shouldn't recur. |

---

## Emergency SQL — if admin UI is broken

All commands assume you SSH to the VM and run from `psql`:

```powershell
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110
C:\postgresql17\pgsql\bin\psql.exe -U postgres -d crm
```

### Grant a single permission to a RoleGroup (idempotent)

```sql
INSERT INTO "RoleGroupPermission" ("roleGroupId", "permissionId")
SELECT rg.id, p.id
FROM "RoleGroup" rg
CROSS JOIN "Permission" p
WHERE rg.code = 'CALL_CENTER'            -- change to RoleGroup code
  AND p.resource = 'telephony'            -- change to resource
  AND p.action = 'call'                   -- change to action
  AND NOT EXISTS (
    SELECT 1 FROM "RoleGroupPermission" rgp
    WHERE rgp."roleGroupId" = rg.id AND rgp."permissionId" = p.id
  );
```

### List all permissions on a RoleGroup

```sql
SELECT p.resource || '.' || p.action AS permission
FROM "RoleGroup" rg
JOIN "RoleGroupPermission" rgp ON rgp."roleGroupId" = rg.id
JOIN "Permission" p ON p.id = rgp."permissionId"
WHERE rg.code = 'CALL_CENTER'
ORDER BY 1;
```

### Find out which RoleGroup a specific user belongs to

```sql
SELECT u.email, e."firstName" || ' ' || e."lastName" AS name,
       p.name AS position, rg.code AS role_group
FROM "User" u
JOIN "Employee" e ON e."userId" = u.id
LEFT JOIN "Position" p ON p.id = e."positionId"
LEFT JOIN "RoleGroup" rg ON rg.id = p."roleGroupId"
WHERE u.email = 'operator.email@asg.ge';
```

### Bulk-assign all Monday-critical permissions to Call Center Operator (safety net)

Use this if the UI is down and you need to unblock all operators at 8:25 AM:

```sql
INSERT INTO "RoleGroupPermission" ("roleGroupId", "permissionId")
SELECT rg.id, p.id
FROM "RoleGroup" rg
CROSS JOIN "Permission" p
WHERE rg.code = 'CALL_CENTER'
  AND (p.resource || '.' || p.action) IN (
    'call_center.menu',
    'call_logs.own',
    'call_recordings.own',
    'missed_calls.access',
    'missed_calls.manage',
    'client_chats.menu',
    'client_chats.reply',
    'client_chats.change_status',
    'client_chats.send_media',
    'client_chats.send_template',
    'client_chats.use_canned',
    'telephony.call',
    'telephony.menu',
    'softphone.handshake',
    'buildings.menu',
    'buildings.details_read',
    'clients.menu',
    'clients.details_read',
    'employees.menu',
    'employees.read',
    'bug_reports.create'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "RoleGroupPermission" rgp
    WHERE rgp."roleGroupId" = rg.id AND rgp."permissionId" = p.id
  );
```

### Bulk-assign Manager permissions (manager gets everything operator has, plus these)

```sql
INSERT INTO "RoleGroupPermission" ("roleGroupId", "permissionId")
SELECT rg.id, p.id
FROM "RoleGroup" rg
CROSS JOIN "Permission" p
WHERE rg.code = 'CALL_CENTER_MANAGER'
  AND (p.resource || '.' || p.action) IN (
    -- Everything Call Center Operator has (copy-paste those 21 above here),
    -- PLUS these manager-only permissions:
    'call_center.live',
    'call_center.quality',
    'call_center.reports',
    'call_center.statistics',
    'call_logs.department',
    'call_logs.department_tree',
    'call_recordings.department',
    'call_recordings.department_tree',
    'client_chats.assign',
    'client_chats.manage',
    'client_chats.view_analytics',
    'departments.read',
    'messenger.create_group',
    'reports.read',
    'reports.view'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "RoleGroupPermission" rgp
    WHERE rgp."roleGroupId" = rg.id AND rgp."permissionId" = p.id
  );
```

### Revoke a permission (if you granted by mistake)

```sql
DELETE FROM "RoleGroupPermission" rgp
USING "RoleGroup" rg, "Permission" p
WHERE rgp."roleGroupId" = rg.id
  AND rgp."permissionId" = p.id
  AND rg.code = 'CALL_CENTER'
  AND p.resource = 'telephony'
  AND p.action = 'call';
```

---

## Monday morning timeline

### T-30min (8:00 AM) — Run preflight

```bash
cd C:\CRM-Platform
bash scripts/monday-morning-preflight.sh
```

Expect: "===== PREFLIGHT PASS =====". If any step fails, the script prints a fix hint. Common off-hours gotcha: step 7 may show `0 of 16 operator extensions registered` if operators haven't arrived yet — that's fine, the script will pass once at least one is online. If step 7 still fails at 8:25 AM, see symptoms above.

### T-20min (8:10 AM) — Spot-check one operator

Pick Keti or Mariam (known-working). Have them:
1. Launch softphone — should auto-login, SIP shows **Registered** within 10s
2. In CRM, go to `/app/call-center/reports` → tab loads without 403
3. Place a test outbound call to your phone (you answer) — call connects

If all 3 pass: the stack is good. Continue.

### T-10min (8:20 AM) — Sanity-check manager

If you have a manager on-shift, verify they can see:
- `/app/call-center` → Live Monitor tab loads with agent list
- `/app/call-center/statistics` → some numbers appear
- `/app/client-chats` → Manager Dashboard toggle visible

### T=0 (8:30 AM) — First real calls arrive

Watch `/app/call-center` Live Monitor for the first few calls. If you see:
- Calls entering the queue but not routing to agents → Queue 804 membership issue (see preflight step 8)
- Calls connecting but CDR not appearing in Call Logs → AMI bridge event-ingest issue (see preflight step 18)
- Agents showing "Unavailable" despite logged-in softphone → AgentPresenceService lag or Socket.IO disconnect (reload browser)

### T+30min (9:00 AM) — First sanity-check

By 9:00 you should have 10-30 call sessions logged. Open `/app/call-center/statistics` and pick "Today": answer rate > 80%, no weird outliers on wait time. If waits are consistently > 60s, too few operators vs queue volume.

---

## Production RoleGroup quick reference

| Code | Display name | Typical user | Key permissions |
|---|---|---|---|
| `ADMINISTRATOR` | Administrator | Full admin (you) | Everything; superadmin flag bypasses all checks |
| `CALL_CENTER` | Call Center Operator | Line operators | `call_center.menu`, `call_logs.own`, `call_recordings.own`, `telephony.call`, `softphone.handshake`, `missed_calls.*`, `client_chats.*` (operator scope) |
| `CALL_CENTER_MANAGER` | Call Center Manager | Shift supervisors | Everything operators have, PLUS `call_center.live/quality/statistics/reports`, `call_logs.department[_tree]`, `call_recordings.department[_tree]`, `client_chats.manage/view_analytics` |
| `IT_TESTING` | IT Testing | Internal QA | Similar to ADMINISTRATOR but without sensitive production data access |
| `READ_ONLY` | Read Only | External viewers | View-only on dashboards; no action permissions |

---

## Assigning a new employee to an operator role (from scratch)

If a new hire shows up Monday and isn't in the system:

1. `/app/employees` → **New Employee** → fill name, email, pick Position (e.g. "Operator — Call Center"). Save.
2. In the Employee detail page → **Create Login** → sets email + temp password. Give the password to the new hire.
3. `/app/admin/telephony` → find the new employee → **Assign Extension** → pick an unused ext (200-214 range). Set `sipServer` = `5.10.34.153`. Set `sipPassword` to match what's configured on Asterisk for that extension.
4. New hire downloads softphone from `/admin/phone-download` → installs → logs in with CRM credentials → SIP registers.
5. Verify on `/app/call-center` Live Monitor that the new agent appears in the agent list.

**Time budget**: 5 min for admin steps, 5 min for softphone install + first login. Don't attempt this at 8:45 AM — do it the day before or after first coffee.

---

## If the whole thing breaks

**Backend down (nginx 502):** SSH to VM, `pm2 status`. If `crm-backend` is stopped: `pm2 restart crm-backend`. If it enters a crash loop, check `pm2 logs crm-backend --err --lines 100` for the actual exception.

**Frontend down:** `pm2 restart crm-frontend`. If it won't start, check disk space (`C:\crm\.next` builds are ~1GB each).

**Asterisk not reachable:** OpenVPN on the VM may have dropped. SSH to VM, `Get-Service OpenVPNService`. Restart if stopped. Then AMI Bridge auto-reconnects within 30s.

**AMI Bridge not posting events:** `pm2 restart ami-bridge`. Check `pm2 logs ami-bridge` for `"AMI Connected"`. If connection fails repeatedly, Asterisk's fail2ban may have banned the VM IP — `ssh asterisk "fail2ban-client status"`.

**Core Sync Bridge stopped:** `pm2 restart core-sync-bridge`. Non-urgent — affects building/client upserts from the legacy system, not live call flow. Can wait until after lunch.

---

## Post-Monday debrief

After Monday launch, come back to this file and add:
- Any symptom you hit that isn't already in the table above → add it
- Any permission that ended up needing to be granted on the fly → add to the "Bulk-assign" SQL section
- Any emergency fix that worked → promote it to the symptom table

This cheat-sheet is version-controlled. Adding to it is part of the muscle-memory build.
