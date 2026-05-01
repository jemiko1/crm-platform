# CRM28 — Monday Launch Readiness

_Last updated: 2026-04-19_

## TL;DR

**Status: YELLOW — not launch-blockable without action.** 14 audit fix PRs (#249–#262) are open and un-merged. Every one of the P0/P1 items from `audit/PHASE1_SUMMARY.md` has a branch and a PR, but until Jemiko merges them the production VM still runs un-patched code — operators will hit 403s and/or lose telephony sockets. P0-A (RoleGroup permission gap) has NO code fix on open PR; it is designed to be fixed via the admin UI on Monday morning per `audit/RBAC_ADMIN_CHECK.md` §5. P0-G (telephony stats semantic correctness: M3/M5/M7) is explicitly **deferred** past Monday — see PR #253 description.

### Success-criteria table (from launch brief)

| # | Criterion | Status | Notes |
|---|---|---|---|
| 1 | Operators log in, see their own Call Center + Client Chats menus, reach the operator surfaces without 403s | **BLOCKED until P0-A + PR #249 land** | P0-A needs Jemiko to assign permissions via admin UI (5 min). PR #249 (JWT `sub` fix) restores operator sockets. |
| 2 | Managers see live monitor, stats, reports, quality — all with correct numbers | **YELLOW** | PR #253 fixes unbounded findMany; semantic correctness (P0-G: SLA denominator, transfer attribution, replay guard) deferred. Numbers are within ~2% but have documented drift. |
| 3 | Telephony ingest (AMI Bridge → backend → DB) is flowing, no lost calls | **YELLOW** | AMI bridge healthy; PR #250 fixes non-deterministic idempotency keys. 3 stacked `crm_ami` sessions on Asterisk need cleanup before launch. |
| 4 | Recordings attach to calls and operators can play their own, managers can play scoped set | **BLOCKED until PR #252 merges** | Today any operator can stream any recording by UUID. PR #252 enforces scope. |
| 5 | Client chats (Viber, FB, Telegram, WebChat) inbound/outbound flow; WhatsApp reply stays SENT in a 24h window | **BLOCKED until PR #256 merges** | Without #256 a reply outside the 24h window silently fails. |
| 6 | Chat operator UI: inbox, reply, transfer, canned, media all work; no cross-operator conversation leak | **BLOCKED until PR #252 merges** | Scope fix for conversations is bundled with recordings in #252. |
| 7 | No plaintext SIP passwords exposed to the web; login is brute-force-resistant | **BLOCKED until PRs #258 + #259 merge** | #258 = per-IP throttle + Postgres persistence. #259 = strip `sipPassword` from `/auth/me`, remove softphone disk cache. |
| 8 | Realtime sockets (telephony, messenger, chats) stay connected with current JWT | **BLOCKED until PR #249 merges** | `payload.id` vs `payload.sub` mismatch disconnects telephony + messenger sockets today. 2-line fix. |

**Recommended launch path**: merge all 14 PRs Sunday evening → run `bash scripts/monday-morning-preflight.sh` → do the 5-minute RoleGroup permission assignment in the admin UI → go live at 09:00.

---

## Surfaces status

| Surface | Status | Notes |
|---|---|---|
| Softphone — SIP registration + re-register | **YELLOW** | Registers on login today but never re-registers after network drop (P0-F). PR #260 closes this. PR #259 strips password from disk. |
| Telephony ingest — AMI bridge → backend | **YELLOW** | Healthy in snapshot; bridge has 3 stacked AMI sessions on Asterisk host (not 1). PR #250 fixes idempotency. |
| Call center backend — calls / missed / reports / quality | **YELLOW** | Missed calls + reports functional. PR #254 hardens Quality AI against prompt injection. PR #253 fixes OOM-risk stats queries. P0-G semantic drift deferred. |
| Call center manager dashboards — stats, live monitor | **YELLOW** | Stats computed in-JS without pagination today — PR #253 switches to SQL GROUP BY. Live monitor emits unthrottled — PR #261 adds diff-then-emit. |
| Client chats ingest — Viber / FB / Telegram / WebChat | **GREEN** | All four adapters verified HMAC-SHA256 + timing-safe + rawBody. |
| Client chats backend — pipeline, escalation, queue scheduling | **YELLOW** | Archival not transactional (PR #255). Escalation unbounded (PR #250). Queue schedule mid-day changes don't re-fan sockets (PR #251). |
| Chat operator UI — inbox, reply, transfer, canned | **YELLOW** | Reply works. No error feedback on send failure (P2-9, deferred). WhatsApp 24h-window surfacing in PR #256. |
| Chat manager UI — live, analytics | **GREEN** | Functional; dedup working. Analytics endpoints gated correctly. |
| Auth + RBAC — login, JWT, permissions | **BLOCKED** | P0-A RoleGroup gap (manual fix) + PRs #249 #258 #259 #257. |
| Realtime sockets — telephony / chats / messenger | **BLOCKED** | PR #249 is the 2-line fix for telephony + messenger. Client chats gateway already uses `payload.sub`, unaffected. |
| Recordings — storage, playback, ACL | **BLOCKED** | Filesystem OK (69% disk). ACL missing — PR #252 enforces scope. |
| Quality AI — transcription + scoring | **YELLOW** | Pipeline operational. PR #254 hardens prompt against operator/caller injection. |

---

## P0 / P1 status matrix

Reference: `audit/PHASE1_SUMMARY.md` and `gh pr list --state open --base master` (snapshot 2026-04-19).

| # | Finding | Branch | PR | PR status | Merged? | Monday blocker? |
|---|---|---|---|---|---|---|
| P0-A | RoleGroup → permission gap (CALL_CENTER, MANAGEMENT missing keys) | — | **NO PR** | — | N/A | **YES — manual fix via admin UI** (see RBAC_ADMIN_CHECK.md §5) |
| P0-B + P0-C | SIP password plaintext in `/auth/me` + softphone disk + logs | `fix/audit/sip-password-memory-only` | **#259** | OPEN | NO | **YES** |
| P0-D | Login brute-force protection (per-IP + Postgres persistence) | `fix/audit/login-throttle-persistence` | **#258** | OPEN | NO | **YES** |
| P0-E | JWT `payload.id` vs `sub` in telephony + messenger gateways | `fix/audit/jwt-gateway-sub` | **#249** | OPEN | NO | **YES — breaks operator sockets** |
| P0-F | SIP no re-register on drop + backend presence heartbeat | `fix/audit/sip-re-register-and-heartbeat` | **#260** | OPEN | NO | **YES — registrations expire every 300s** |
| P0-G | Stats correctness: SLA denominator, transfer attribution, call_end replay | `fix/audit/stats-correctness` (local only, empty) | **NO PR** | — | N/A | **DEFERRED** — numbers within ~2% drift; documented in PR #253 description. Managers see stats, but Phase 3 reconciliation deferred. |
| P1-1 | Operator can read any conversation by ID | `fix/audit/conversation-and-recording-scope` | **#252** | OPEN | NO | **YES (privacy)** |
| P1-2 | Recording access has no scope check | `fix/audit/conversation-and-recording-scope` | **#252** | OPEN | NO | **YES (privacy)** |
| P1-3 | Unbounded findMany in telephony stats | `fix/audit/telephony-stats-aggregated-sql` | **#253** | OPEN | NO | **YES (OOM risk at month queries)** |
| P1-4 | Escalation cron unbounded findMany | `fix/audit/escalation-limit-ami-idempotency` | **#250** | OPEN | NO | **YES (memory drift over hours)** |
| P1-5 | Closed-conversation archival not transactional | `fix/audit/archival-transaction` | **#255** | OPEN | NO | **YES (potential message loss under concurrency)** |
| P1-6 | `sendReply` missing WhatsApp 24h check + failure surfacing | `fix/audit/whatsapp-24h-window` | **#256** | OPEN | NO | **YES (silent outbound failures)** |
| P1-7 | Quality pipeline prompt injection | `fix/audit/quality-pipeline-prompt-injection` | **#254** | OPEN | NO | YES (low prob but trivial to land) |
| P1-8 | AMI idempotency keys use `Date.now()` | `fix/audit/escalation-limit-ami-idempotency` | **#250** | OPEN | NO | **YES (duplicate transfer counts on bridge restart)** |
| P1-9 | AMI broadcast flood / no diff + no throttle | `fix/audit/telephony-gateway-throttle` | **#261** | OPEN | NO | YES (not acute yet; lands before live-monitor fanout rolls out) |
| P1-10 | Switch-user banner hides when bridge unreachable | `fix/audit/switch-user-banner-and-queue-fanout` | **#251** | OPEN | NO | **YES (mis-attributed calls all day)** |
| P1-11 | Queue-schedule mid-day changes don't re-fan sockets | `fix/audit/switch-user-banner-and-queue-fanout` | **#251** | OPEN | NO | YES (operator removed from queue keeps receiving chats until refresh) |
| P1-12 | Softphone local bridge: lax CORS + no CSRF token | `fix/audit/softphone-bridge-lockdown` | **#262** | OPEN | NO | **YES (any local tab can dial operator's extension)** |
| P1-13 + P1-14 | `/auth/device-token` missing permission + race | `fix/audit/device-token-flow` | **#257** | OPEN | NO | **YES — pairs with #259 for softphone credential lockdown** |

### P2 items (deferred, accepted)

Not merged for Monday; tracked as technical debt (see Residual risks below):

- P2-1 Clientchats gateway CORS dev default wrong
- P2-2 Session fixation — old JWT valid post-refresh
- P2-3 Superadmin + queue duplicate socket delivery (frontend dedups)
- P2-4 Messenger typing flood
- P2-5 Orphan CallEvents with `callSessionId:null`
- P2-6 Softphone auto-updater doesn't check call state
- P2-7 Mixed date formatting (no locale)
- P2-8 Inactivity alert while drafting reply
- P2-9 Reply-box no error feedback on send failure

### Merge order (recommended)

Merge PRs in the order below so conflicts are minimal (most are independent; only #250 and #251 share a file and are sequenced):

1. **#249** (P0-E, JWT sub) — 2 files, 4 line diff. Unblocks all operator sockets. Land FIRST.
2. **#258** (P0-D, login throttle).
3. **#259** (P0-B + P0-C, SIP password lockdown).
4. **#257** (P1-13 + P1-14, device-token).
5. **#260** (P0-F, SIP re-register + heartbeat).
6. **#262** (P1-12, local bridge lockdown). Softphone build may be needed — confirm installer rebuild plan.
7. **#252** (P1-1 + P1-2, scope).
8. **#253** (P1-3, stats SQL).
9. **#250** (P1-4 + P1-8, escalation + AMI idempotency).
10. **#251** (P1-10 + P1-11, switch-user + queue fan-out).
11. **#255** (P1-5, archival tx).
12. **#256** (P1-6, WhatsApp 24h).
13. **#254** (P1-7, quality prompt).
14. **#261** (P1-9, gateway throttle) — lands LAST; not acute because live monitor doesn't subscribe yet.

Each merge triggers a VM auto-deploy (~2 min). To minimize downtime, merge all 14 in a single evening window and verify once after the final merge.

---

## Residual risks

### Accepted risks for Monday (ask Jemiko to sign off)

| Risk | Mitigation | Accept? |
|---|---|---|
| P0-G stats correctness drift (~2% absolute) for SLA% + transfer attribution + disposition replay. PR #253 preserves legacy semantics; semantic fix deferred. | Tell managers today: weekly review numbers are reliable to ±2%. Full correctness ships post-launch. | Needs Jemiko signoff. |
| 3 stacked `crm_ami` sessions on Asterisk (`manager show connected` shows 3 bridges at 127.0.0.1). If bridge restarts and all 3 keep posting, events duplicate. | SSH to VM Monday morning and verify only one `ami-bridge` PM2 process (preflight step 4). Restart Asterisk's AMI listener if needed: `asterisk -rx "manager reload"`. | Operational — checked pre-launch. |
| Frontend `usePermissions()` caches perms — operators who log in before Jemiko finishes RoleGroup assignment will see stale sidebar until logout. | Do all RoleGroup edits BEFORE 08:30. Brief: "If any button is missing, log out and back in." | Operational. |
| Softphone is plaintext XOR-encrypted on disk until PR #259 ships + operators reinstall. Existing installs keep the password file. | When #259 merges, push a softphone release note that says: reinstall to flush local credential cache. Or schedule a mass re-login Monday morning to trigger rewrite. | Accept with post-merge comms. |
| WhatsApp adapter not built (schema ready). WhatsApp messages can't be received or replied to today. | Phase-2 launch; don't promise WhatsApp Monday. | Accept. |
| Asterisk 16.11.1 is upstream-EOL. Sangoma distro patches only. | Long-term risk (post-2026 roadmap). | Accept. |
| `/var/spool/asterisk` at 69% disk. No rotation cron. | Sufficient for ~weeks at current volume; set calendar reminder for Q3 2026 to add rotation. | Accept. |
| Asterisk queue 802 has `ringinuse=no` (can double-ring busy agent). Queue 804 correct. 802 is idle today; consequence is low. | Fix in FreePBX GUI if ever re-enabled. | Accept. |
| No audit trail on RBAC changes (RoleGroup / Position / employee position assignments). Jemiko is the only admin pre-launch. | Accept; ship `AuditEntity` enum extension + audit hooks post-launch (~4–6 hours of work). | Accept. |
| No backend-pushed "permissions changed" socket event. Operators whose role changes mid-shift see stale UI. | Post-launch enhancement. Mid-shift changes require the operator to log out and back in. | Accept. |

### Pre-existing launch gaps (not caused by audit)

- Dashboard `/app/dashboard` is static placeholder (no API). Low-risk because operators/managers don't land there.
- Several pages still use raw `fetch()` (5 intentional — softphone bridge + login bootstrap).
- Legacy `RolesModule` still imported alongside Position RBAC. Position RBAC is authoritative.

---

## Rollback plan

Full procedure: see `audit/ROLLBACK.md`.

Short version (VM code rollback, ~3 min downtime):

```powershell
# SSH to VM as Administrator
pm2 stop crm-backend crm-frontend
cd C:\crm
git fetch origin
git checkout audit/baseline-2026-04-19
cd backend\crm-backend
pnpm install --prefer-offline ; pnpm prisma generate ; pnpm build
cd ..\..\frontend\crm-frontend
pnpm install --prefer-offline ; pnpm build
pm2 start crm-backend ; pm2 start crm-frontend
curl http://localhost:3000/health
```

Data rollback (only if schema corrupted): `audit/ROLLBACK.md` has the staging-DB restore procedure. Checksum for the pre-audit backup is `e7c698cd7e77738e5a5fe71879db59b7168b8c9593b80fdd14e63fff8ba01cb4`.

Bridge rollback (AMI / core-sync): same baseline tag; `pm2 restart ami-bridge` + `pm2 restart core-sync-bridge`.

Selective revert of one fix PR: see the new "Selective revert" section in `audit/ROLLBACK.md`.

---

## Monday morning checklist

Timing suggestion: Jemiko arrives 07:30; run the checklist 07:30–08:30; operators log in 09:00.

### Pre-8:00

- [ ] VPN is up (OpenVPN GUI green TAP adapter). If Asterisk SSH times out, check OpenVPN.
- [ ] Run `bash scripts/monday-morning-preflight.sh`. Expect `===== PREFLIGHT PASS =====`. If FAIL, read the hint and remediate before proceeding.
- [ ] SSH Asterisk: `ssh asterisk "asterisk -rx 'pjsip show endpoints'"` — confirm which operator extensions (200–214, 501) show "Not in use" (registered). Preflight step 7 prints this list.
- [ ] SSH VM: confirm `pm2 list` shows exactly one ami-bridge process. If more than one, `pm2 delete ami-bridge; pm2 start <ecosystem> --only ami-bridge`.

### 08:00–08:30

- [ ] Open `/app/admin/role-groups`. Verify CALL_CENTER RoleGroup has the 18 permissions from `audit/RBAC_ADMIN_CHECK.md` §5 Setup A. Save if any are missing.
- [ ] Verify MANAGEMENT RoleGroup has the ~45 permissions from `audit/RBAC_ADMIN_CHECK.md` §5 Setup B. Save if any are missing.
- [ ] Spot-check one test operator login and one test manager login: can see expected sidebar items; test pages render.
- [ ] Enable `timestampevents=yes` in FreePBX GUI → Asterisk SIP Settings → Advanced → Manager Timestamp Events. Apply Config. Closes P1-8 semantic gap (complements the deterministic keys in PR #250).
- [ ] Freeze deploys for the day: GitHub → `crm-platform` repo → Settings → Branches → master: require 1 reviewer approval + CI pass. Tell Jemiko she's the reviewer.
- [ ] Brief operators on two softphone behaviors:
  - After PR #260 merges, the softphone re-registers automatically on network drop (they may see a "Re-registering…" banner briefly).
  - After PR #262 merges, the softphone exchanges a rotating handshake token with the web UI on first dial; no user-visible change but `/status` endpoint now requires token.

### At 09:00 — go live

- [ ] Announce to operators: log in, confirm they see their expected menus.
- [ ] Watch `pm2 logs crm-backend` for the first 15 minutes.
- [ ] Make a test inbound call from any cellphone to the Alamex DID — confirm CallSession + Recording rows appear in DB.

---

## Business continuity contacts

Jemiko to fill in before Monday:

- Operator coordinator (someone on the floor who can report issues):
- FreePBX admin (for urgent dialplan/queue changes):
- ISP contact (if Alamex trunk fails):
- Sangoma support channel (if Asterisk core crashes):
- Escalation path to dev team (if CRM backend crashes):

---

## Post-launch actions (first 2 hours)

- [ ] Watch `pm2 logs crm-backend` for any AMI reconnect cycles or SIP re-register storms.
- [ ] Check live monitor (`/app/call-center/live`) shows at least 15/16 operators SIP-registered (manager-only page).
- [ ] Confirm the first real inbound call generates a CallSession row AND a Recording row.
- [ ] Confirm the first operator-sent WhatsApp message stays SENT (not FAILED_OUT_OF_WINDOW for any active thread).
- [ ] Verify a QualityReview AI scoring runs within 2 min of the first completed call > 30 seconds. Watch via `/app/call-center/quality`.
- [ ] Grep Postgres for `CallMetrics` rows created after launch: `SELECT COUNT(*), MIN("createdAt"), MAX("createdAt") FROM "CallMetrics" WHERE "createdAt" > '2026-04-20T06:00:00Z';`. Non-zero count confirms metrics compute is firing.

---

## Known limitations for Monday (not launch blockers)

- **P0-G semantic correctness**: manager SLA% may be within ~2% of the true value, transfer attribution still credits the last operator only, and `handleCallEnd` replay still overwrites disposition. Accept for Monday; fix tracked as future work. PR #253 description documents exact drift behavior.
- **AMI bridge `timestampevents=no`** on Asterisk. PR #250 makes the bridge idempotent without relying on Asterisk timestamps, but enabling `timestampevents=yes` in the FreePBX GUI closes the original risk fully. Do this during the 08:00 window.
- **Frontend `needsHumanReview` UI gap**: the field exists on `QualityReview` in the DB but there's no manager UI to view/act on it yet. Deferred.
- **AMI bridge hold-cycle collapse risk** if `timestampevents=no` remains AND the bridge restarts during active calls: possible over-count of hold seconds. Mitigated by not restarting the bridge during business hours.
- **Softphone on-disk XOR-cached credentials** on existing installs: until operators trigger a fresh login post-#259 merge, old cached passwords linger on disk. Plan a mass re-login Monday morning.
- **Core sync bridge count-check** may log "401" during the backend-deploy restart window. Harmless; bridge skips that cycle and resumes on next success.
- **`DeviceHandshakeToken` cleanup cron** only lands with PR #257. Without it, the table grows unbounded. Mitigated by the atomic consume in same PR (no functional impact; just disk).
- **No audit trail for RBAC changes** — accept, document that Jemiko is sole admin, ship post-launch.

---

## References

- `audit/PHASE1_SUMMARY.md` — full P0/P1/P2 list with file:line evidence
- `audit/KNOWN_FINDINGS_CARRIED_FORWARD.md` — 68 prior-audit findings, with status
- `audit/ROLLBACK.md` — code + data rollback procedure (+ new selective-revert section)
- `audit/ASTERISK_INVENTORY.md` — PBX snapshot: extensions, queues, AMI, ARI, recordings
- `audit/RBAC_ADMIN_CHECK.md` — Jemiko's admin-UI walkthrough for RoleGroup / Position / Employee
- `audit/THREAT_MODEL.md` — threat scenarios A/R/T/S/E/M/RT/C/O
- `audit/STATS_STANDARDS.md` — telephony-stats semantic decisions (P0-G deferred work)
- `scripts/monday-morning-preflight.sh` — 18-step pre-launch validation
