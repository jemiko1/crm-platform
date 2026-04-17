# Questions for Jemiko

Batched questions from the pre-production audit. Non-blocking where possible — I keep working on everything that doesn't depend on an answer.

---

## Blocking for Phase 4 fixes (answer before I merge any fix)

### Q1 — Role-group seeding strategy
`prisma/seed-rbac.ts` assigns permissions using legacy hyphenated keys (`work-orders.read`, `role-groups.read`, etc.) that `seed-permissions.ts` deleted. The net effect is that on Monday, CALL_CENTER and MANAGEMENT role groups have too few permissions — operators and managers get 403 on every in-scope endpoint.

The VM deploy workflow only runs `seed-permissions.ts` (not `seed-rbac.ts`), so even fixing seed-rbac.ts won't automatically take effect on the VM.

**Question:** preferred fix?
- (A) I update `seed-rbac.ts` to use underscored keys AND add `seed-role-group-permissions.ts` to the deploy pipeline. Idempotent upserts; runs on every deploy.
- (B) You run a one-time SQL migration on the VM assigning the correct permissions to each RoleGroup, and I add an automated check in CI that fails if the assignment drifts.
- (C) Both.

My default, if you don't answer before I have the fix ready: **A**.

### Q2 — Operator vs Manager exact permission lists for Monday
Proposed permission sets — please confirm or adjust:

**Operator** (Position=CALL_CENTER):
- `call_center.menu`, `call_center.reports`
- `call_logs.own`, `call_recordings.own`
- `missed_calls.access`, `missed_calls.manage` *(so operators can claim/attempt/resolve)*
- `client_chats.menu`, `client_chats.reply`, `client_chats.assign`, `client_chats.change_status`, `client_chats.link_client`, `client_chats.send_media`, `client_chats.send_template`, `client_chats.use_canned`
- `telephony.call`

**Manager** (Position=MANAGER or new Position=CALL_CENTER_MANAGER):
- all of Operator's, plus
- `call_center.live`, `call_center.quality`, `call_center.statistics`
- `call_logs.department_tree`, `call_recordings.department_tree`
- `client_chats.manage`, `client_chats.view_analytics`, `client_chats.manage_canned`, `client_chats.delete`
- `client_chats_config.access`
- `telephony.manage`

Questions:
- **Should operators have `call_logs.own` or `call_logs.department` (can they see their own calls only, or everyone in their department)?** My default: `.own`.
- **Should managers have `call_logs.all`** (everyone in the company) **or `call_logs.department_tree`** (their team + subordinates)? My default: `.department_tree`. Superadmin gets `.all` via bypass.
- **Same question for recordings.** Privacy angle: resident calls are on recordings.

### Q3 — SIP password handling
Backend currently returns plaintext SIP password in `/auth/me`, `/auth/app-login`, `/auth/exchange-token`. Softphone persists it to disk (XOR-equivalent "encryption") AND logs it. This is the single biggest P0.

Proposed fix pattern:
1. Stop returning `sipPassword` from `/auth/me` entirely (browser doesn't need it).
2. New endpoint `POST /v1/telephony/sip-credentials` (narrow permission `telephony.sip_creds`) — softphone calls this after login to fetch credentials; backend logs the access; response not cached.
3. Softphone holds password in Electron main-process memory only; never writes to disk; never logs it.
4. Separate PR: AES-GCM encrypt `sipPassword` at rest (key from env).

**Question:** is it acceptable if operators need to re-type their CRM password into the softphone once after the upgrade? Or do you want the existing session-restore flow (with the XOR file) preserved so operators don't notice the change?

My default: preserve session restore but WITHOUT the password in it — softphone auto-fetches fresh credentials from the new endpoint using the stored JWT on resume.

### Q4 — Statistics correctness
I found three bugs that will silently mis-report metrics on the manager dashboard:
- **M3:** calls with missing `CallMetrics` row are silently excluded from SLA/averages.
- **M5:** transferred calls credit only the *last* operator; earlier operator's handling invisible.
- **M7:** disposition replay (if AMI or CDR re-emits `call_end`) overwrites — can flip ANSWERED → NOANSWER.

The right fix changes what managers see:
- M3 fix: include calls with `isSlaMet` unknown either in separate "uncategorized" bucket, or default to "not met" (conservative). Which do you prefer?
- M5 fix: per-agent "handled" includes any operator who was on the call (join via `CallLeg.userId`), not just the final `assignedUserId`. This means one call can contribute to multiple agents' "handled" counts. Is that what you want, or do you want "primary handler" only?
- M7 fix: record only the first `call_end`; ignore subsequent replays. No manager-visible change.

My defaults: M3→"not met", M5→credit every operator on the call via CallLeg, M7→first-end wins.

---

## Non-blocking, but would help prioritize

### Q5 — Do you expect Monday operators to work from home or only on-premise?
If all ops are on the private VM network, SIP UDP unencrypted is acceptable. If even one operator works over the public Internet, we have a media-interception risk flagged in `audit/ASTERISK_INVENTORY.md §9`.

### Q6 — Are 16 extensions + 1 trunk enough for Monday?
Only 1 of 16 extensions (ext 200) was registered at snapshot time. We need:
- Confirmation that all 16 operator extensions will be registered before Monday.
- Their SIP softphone install + first-login walk-through is the launch coordination dependency.

### Q7 — Do you want me to freeze deploys to master Sunday evening → Monday noon?
Any PR merged to master auto-deploys to the VM via GitHub Actions. A botched deploy at 09:00 Monday takes the call center offline. Proposal: lock `master` during launch window via branch protection (require 1 approval from you).

### Q8 — Deploy freeze for Asterisk / FreePBX GUI changes?
No changes should be made through the FreePBX GUI Sunday–Monday. "Apply Config" in the GUI overwrites our `manager_custom.conf` → breaks AMI bridge auth → call center goes dark.

### Q9 — Do we have test SIP credentials for Phase 3 live testing?
I'll need at least 2 operator extensions I can log into simultaneously from different workstations to exercise transfer flows. Ext 200 (Keti) is currently active — can I use 201 and 202 under Nini/Eto for the rehearsal, or should we create dedicated test extensions?

### Q10 — Who will pair on Phase 3 live testing?
The brief says you'll coordinate external participants (resident calling from an outside number, real WhatsApp messages). I'll need ~2–3 hours with you for three loops. Let me know a window.

### Q11 — WhatsApp 24h window UX
`sendReply` currently saves a message + marks "delivered" even if the WhatsApp Cloud API rejects it (window closed). I can change it to:
- (A) Show a persistent error badge on the message, operator sees "failed".
- (B) Prompt the operator to send a WhatsApp template instead (since templates work outside the window).

Default: (A) now, (B) in a follow-up PR.

### Q12 — Recording ACL
Currently any operator with `call_center.menu` can play any recording by UUID. I'll add scope check via `call_recordings.{own,department,department_tree,all}`. Default behavior: operator sees only recordings where they were the assignedUser or a CallLeg participant. Managers see their department tree. Is this what you want, or do you want managers to see ALL recordings across the company?

### Q13 — Docker / local stack
Docker Desktop on this laptop is slow to start; local stack is not up at time of Phase 1 completion. I can continue Phase 4 static fixes without it, but Phase 2 (dynamic testing with Playwright + scripted AMI) and Phase 3 (live rehearsal) need the stack running. Can you confirm Docker Desktop is actually installed and authorized to run on this machine? If it's corporate-locked, let me know and I'll work around it (e.g., local Postgres + dev script without Docker).

---

## Informational — I'll decide unless you object

- **Login throttle rewrite**: I'll persist state to Postgres (new `LoginAttempt` model) + add per-IP throttle. Default: 5 failures / email / 5-min + 10 failures / IP / 60s.
- **JWT `sub` vs `id` gateway fix**: two-line change in each gateway. No functional/API change.
- **Telephony stats query rewrite**: replace `findMany`-plus-in-JS with Prisma `groupBy` and raw SQL where needed. Response shape unchanged.
- **Escalation cron**: add `take: 100`; pass through sorted by `lastMessageAt` ascending. Never misses a conversation, just batches.
- **AMI bridge idempotency keys**: replace `Date.now()` with composite `(linkedid, uniqueid, eventType, seq)`. No API change.
- **Softphone local bridge lockdown**: exact-origin allow-list (`http://localhost:4002` in dev, real origin in prod); add per-session handshake token to `/dial` + `/status`. Softphone update required.

---

## Status snapshot (for context)

- Phase 0: complete. Deliverables in `audit/`. Asterisk inventory committed.
- Phase 1 (static audit): complete. 7 domain reports + consolidated `PHASE1_SUMMARY.md` committed.
- Phase 2 (automated dynamic testing): not started. Blocked on local stack.
- Phase 3 (live rehearsal): not started. Needs external coordination + Q9/Q10.
- Phase 4 (fixes): sequence drafted in `PHASE1_SUMMARY.md`. Ready to start as soon as Q1–Q4 are answered (I have sensible defaults; will proceed with defaults if you're offline).
- Phase 5 (launch readiness + preflight script): not started.

I'll keep working on things that don't depend on your answers — specifically the Phase 4 fixes for items where I have a sensible default and you're unlikely to reject it (gateway JWT fix, idempotency key fix, escalation `take`, telephony stats query rewrite, clientchats gateway CORS). I'll NOT touch role-group seeding, SIP password handling, or recording ACL until you confirm Q1/Q2/Q3/Q12.
