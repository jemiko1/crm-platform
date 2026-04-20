# Monday admin-UI setup checklist

All 16 audit PRs are merged and deployed. Before operators log in Monday morning, you need to make sure the two RoleGroups (Call Center Operator + Call Center Manager) have the permissions the new code expects.

> **Companion doc:** [`MONDAY_ADMIN_CHEATSHEET.md`](./MONDAY_ADMIN_CHEATSHEET.md) has the tactical reference for Monday morning — symptom→fix lookups, emergency SQL, and the minute-by-minute timeline. Open that on your phone Monday. This doc is the walkthrough for doing the setup in advance.

**What to do:** open `https://crm28.asg.ge/admin/role-groups`, pick each RoleGroup, click "Assign Permissions", and tick the boxes below. There is no database work — the admin UI writes to Postgres directly.

## 1. Operator RoleGroup

Applies to whoever holds Position = CALL_CENTER (or whatever your operators are on).

Required permissions — paste this list into the permissions checklist:

```
call_center.menu
call_center.reports
call_logs.own
call_recordings.own
missed_calls.access
missed_calls.manage
client_chats.menu
client_chats.reply
client_chats.assign
client_chats.change_status
client_chats.link_client
client_chats.send_media
client_chats.send_template
client_chats.use_canned
telephony.call
softphone.handshake
```

**Why each matters:**
- `call_center.menu` — Call Center sidebar item visible
- `call_center.reports` — create + edit own call reports
- `call_logs.own` — see your own call logs (per your policy)
- `call_recordings.own` — stream your own recordings (exact-match guard)
- `missed_calls.access` + `missed_calls.manage` — view + claim/resolve missed calls
- `client_chats.*` — inbox, reply, assign, close, link client, attach files, use canned responses
- `telephony.call` — dial/transfer/hangup/hold/queue toggle from the UI
- `softphone.handshake` — **new post-audit** — without this, the softphone cannot fetch SIP credentials and the bridge-token handshake fails. The softphone will appear offline on the manager board.

## 2. Manager RoleGroup

Applies to whoever holds Position = MANAGER (or your call-center manager).

All of the Operator permissions above, PLUS:

```
call_center.live
call_center.quality
call_center.statistics
call_logs.department_tree
call_recordings.department_tree
client_chats.manage
client_chats.view_analytics
client_chats.manage_canned
client_chats.delete
client_chats_config.access
telephony.manage
```

**Why each matters:**
- `call_center.live` — Live Monitor tab
- `call_center.quality` — Quality tab (AI review dashboard)
- `call_center.statistics` — Statistics + Overview tabs
- `call_logs.department_tree` — see calls for your own dept + subordinate depts (**MUST be granted in ADDITION to `call_logs.own`** — the guard matches `.own` exactly, the service layer uses `.department_tree` to widen the filter)
- `call_recordings.department_tree` — same pattern for recordings
- `client_chats.manage` — queue schedule, escalation config, reassign, pause/unpause operators, reopen
- `client_chats.view_analytics` — Manager Dashboard analytics tab
- `client_chats.manage_canned` — create/edit global canned responses (non-global canned still writable by any operator with `client_chats.menu`)
- `client_chats.delete` — hard-delete conversation + history chain
- `client_chats_config.access` — channel-account admin (Viber/FB/TG/WA token management)
- `telephony.manage` — extension CRUD, AMI sync trigger, manual updates

## 3. Verify

Log in as a test operator (no superadmin flag). You should see:
- Sidebar: Call Center, Client Chats. Nothing else.
- Call Center tabs: Overview hidden, Call Logs visible (your own only), Missed Calls visible, Reports visible. Live/Quality/Statistics hidden.
- Client Chats: inbox with your assigned + queue-unassigned conversations only.
- Softphone: registers SIP within a few seconds of login. Manager board shows you online.

Log in as a test manager. You should see everything the operator sees, plus:
- Call Center: all 7 tabs visible.
- Client Chats: Manager Dashboard toggle available.
- Statistics: KPIs + agent breakdown populated.

## 4. Self-lockout safety

Your account (Jemiko) has `isSuperAdmin: true` and bypasses all permission checks. Nothing you do in this UI can lock you out. Worst case: you accidentally strip an operator RoleGroup — you can re-tick the boxes and they work again immediately on their next login.

## 5. Superadmin note

The audit adds a guard on `GET /v1/clientchats/conversations/:id` (and siblings) that rejects operators trying to read another operator's conversation (per your scope decision). Your superadmin account bypasses this. Managers bypass via the `client_chats.manage` permission. Non-manager operators see only their own.

## Still blank? Troubleshooting

- **Operator sees no sidebar items**: they have zero permissions on their RoleGroup. Check Position → RoleGroup linkage in `/admin/positions`.
- **Operator sees "403 Forbidden" in call logs**: they have `call_center.menu` but not `call_logs.own`. Add it.
- **Softphone fails to register SIP**: operator's RoleGroup lacks `softphone.handshake`. Add it — log the operator out + back in, softphone will re-fetch.
- **Manager sees empty stats**: their date range spans too far. The new backend rejects ranges > 90 days with HTTP 422. Pick a shorter window.

## Permission cache note

The frontend caches permission checks in browser memory, cleared on logout. If you change a RoleGroup while an operator is logged in, they won't see the new permissions until they log out and back in. Do all the RoleGroup setup before operators log in Monday morning to avoid this.
