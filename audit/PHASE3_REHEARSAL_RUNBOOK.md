# Phase 3 — Live end-to-end rehearsal runbook

**When to execute:** Sunday evening (20:00-22:00 Tbilisi) and/or Monday morning 07:30-08:15 before operators arrive.

**Who runs it:** You (Jemiko) + 1-2 helpers (Keti, Mariam, or anyone with an operator account and a cell phone). Claude remains on standby in chat in case something breaks.

**What this covers:** Three full round-trip loops of real call traffic on production, exercising the surfaces static audits and unit tests can't touch — SIP media, ARI actions, recording file sync, socket.io event fanout, and the softphone under real network conditions.

**Why it's non-negotiable:** 17 PRs in 48 hours shipped to production. Static analysis + regression tests prove *what we changed doesn't break*. Only a live rehearsal proves the *whole stack actually works end-to-end under realistic conditions*.

---

## Pre-rehearsal checklist (do once, before any loop)

### 1. Preflight — must be all green

```bash
cd C:\CRM-Platform
bash scripts/monday-morning-preflight.sh
```

Required: exit code 0 and "===== PREFLIGHT PASS =====". If any step fails, fix it before continuing. (Exception: step 7 "operator extensions registered" can WARN if it's Sunday and no operators are logged in — that's fine. It'll become ERR Monday morning which is when it matters.)

### 2. Backup — freshness verified

```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 \
  'Get-ChildItem C:\crm\backups\*.dump | Sort-Object LastWriteTime -Descending | Select-Object -First 1'
```

Expect: dump file from today (< 24 hours old). If older, run `.\vm-configs\scripts\backup-db.ps1` on the VM manually before starting.

### 3. Tail live logs in a second terminal

Open a second terminal and tail backend logs during the rehearsal:

```bash
ssh -i ~/.ssh/id_ed25519_vm Administrator@192.168.65.110 'pm2 logs crm-backend --lines 50'
```

Keep this visible. Any unexpected error → stop the loop, investigate, resume only after understanding.

### 4. Open the Live Monitor dashboard

In your browser, open `https://crm28.asg.ge/app/call-center` and leave it on the **Live Monitor** tab. This is your realtime view of what's happening during each loop.

### 5. Two people + two phones

You need:
- **Agent** role: one operator logged into the softphone (Keti on ext 200, or Mariam on 214, or yourself if you have an extension)
- **Customer** role: one external cell phone that dials the company PSTN number (032 2 XX YY ZZ or whatever your inbound)

If you're doing the rehearsal alone at 20:00 Sunday, use your own mobile for the customer side and be both roles (slower, but fine).

---

## Loop 1 — Inbound answered call with report (happy path)

**Time: ~5 minutes**

### Steps

1. **Customer**: dials the company PSTN number.
2. **Observe**: Live Monitor dashboard should show the call entering queue 804 (the queue should light up with "1 caller waiting").
3. **Agent**: softphone rings within 1-2 seconds of the call hitting the queue. Phone icon in tray pulses.
4. **Agent**: click Answer. Talk for 30-60 seconds (say anything).
5. **Agent**: click Hold. Wait 10 seconds. Click Unhold. Talk another 10 seconds.
6. **Customer or Agent**: hang up.
7. **Agent**: the call-report modal auto-opens within 1 second of hangup.
8. **Agent**: fill out the report: pick a Category (any from the dropdown — if dropdown is empty, this is a bug), pick a Building if relevant, add a short Description. Click Save.
9. **Navigate**: go to `/app/call-center/reports` — the report should appear at the top of the list.
10. **Navigate**: go to `/app/call-center` → Call Logs tab. The call should appear within 30 seconds.
11. **Navigate**: click the call log row → the detail modal should open and show an inline audio player with the recording.
12. **Click Play** on the audio player — the recording must actually play.

### Pass/fail criteria

| # | Check | PASS if |
|---|---|---|
| 1 | Call routing | Customer reaches queue without "all circuits busy" message |
| 2 | SIP ring | Agent's softphone rings within 2s of call hitting queue |
| 3 | Answer flow | Call connects; both parties hear each other (two-way audio) |
| 4 | Hold/unhold | Hold pauses audio both ways; unhold resumes cleanly |
| 5 | Hangup | Call terminates on either party's hangup within 1s |
| 6 | Report trigger | Call-report modal opens automatically after hangup |
| 7 | Category dropdown | Has items (not empty) — PR #265 regression |
| 8 | Report save | POST /v1/call-reports returns 2xx; report appears in list |
| 9 | CDR ingest | Call appears in /app/call-center Call Logs within 30s |
| 10 | Recording sync | WAV file exists at `C:\recordings\YYYY\MM\DD\` on VM; audio player plays it |

### If something fails

- **No ring on softphone**: check `asterisk -rx "pjsip show endpoint <ext>"` — must show `Not in use` or `In use`, not `Unavailable`. If `Unavailable`, operator's softphone isn't registered.
- **Two-way audio but no hold**: `telephony.call` permission missing on operator's RoleGroup. (Softphone's own mute still works; only web-UI hold fails.)
- **Report modal doesn't open**: Socket.IO `/telephony` disconnected. Browser DevTools → Network → filter for `socket.io`. Should see a 101 upgrade.
- **Category dropdown empty**: `CALL_REPORT_CATEGORY` SystemList not seeded. SSH to VM, run `cd C:\crm\backend\crm-backend; npx tsx prisma/seed-system-lists.ts`.
- **Call missing from Call Logs**: AMI bridge not ingesting. Check step 18 of preflight. Wait 60s and refresh — the ingest pipeline is eventually consistent.
- **Recording 404**: file-sync from Asterisk to VM not configured or broken. Check `/var/spool/asterisk/monitor/YYYY/MM/DD/` on Asterisk, and `C:\recordings\` on VM.

---

## Loop 2 — Outbound click-to-call with transfer

**Time: ~5 minutes**

### Steps

1. **Agent**: from CRM, navigate to `/app/clients` → pick any client with a phone number.
2. **Agent**: click the phone icon next to the client's phone number (click-to-call).
3. **Observe**: agent's softphone initiates an outbound call within 1-2s.
4. **Customer**: external phone rings (use your cell). Answer.
5. **Agent**: while in call, click **Transfer** in the web UI → enter another extension (e.g., 501 for internal test extension, or another operator's extension).
6. **Observe**: original call transfers; agent drops out.
7. **Transfer target extension**: picks up and talks to customer briefly.
8. **Customer or transfer target**: hang up.
9. **Navigate** to Call Logs: verify the call appears with the correct "assigned to" agent (the original agent, NOT the transfer target — since it was a blind transfer).

### Pass/fail criteria

| # | Check | PASS if |
|---|---|---|
| 1 | Click-to-call | Phone icon initiates outbound call via softphone |
| 2 | Outbound routing | PSTN gateway accepts the call; customer's phone rings |
| 3 | Transfer | Web UI Transfer button works; `/v1/telephony/actions/transfer` returns 2xx |
| 4 | Transfer target rings | The extension called picks up and joins the call |
| 5 | Agent drops | Original agent is removed from the call bridge |
| 6 | Attribution | Call Log row shows original agent in `assignedTo`, not transfer target |

### If something fails

- **Click-to-call does nothing**: `telephony.call` OR `softphone.handshake` missing. Grant both.
- **Click-to-call returns 403**: `telephony.call` missing. Grant it.
- **Transfer button fails with 400 "channel not found"**: the channel name isn't being passed through. This is a known softphone ↔ web-UI integration gap; use the softphone's own Transfer button for now.

---

## Loop 3 — Missed call + later resolution

**Time: ~5 minutes**

### Steps

1. Make sure NO operators are logged into softphones. (Close any open softphones, or `pm2 stop crm-backend` briefly — no, don't do that, just have the operator log out of softphone.)
2. **Customer**: dial the company PSTN number.
3. **Observe**: queue 804 gets the call but has 0 agents available. After 30s (or whatever your queue timeout is), call drops to missed.
4. **Customer**: hang up.
5. **Navigate** to `/app/call-center` → **Missed Calls** tab. Should see the missed call within 60 seconds.
6. **Agent**: log back into softphone. SIP registers.
7. **Agent**: click **Claim** on the missed call.
8. **Observe**: missed call row updates to show agent's name + status "claimed".
9. **Agent**: click **Call Back** — this should initiate an outbound call to the original caller number.
10. **Customer**: pick up. Talk briefly.
11. **Both**: hang up.
12. **Navigate** to missed call row → click **Resolve** → pick "Resolved via callback".
13. **Verify**: missed call disappears from the Unresolved filter, appears in Resolved filter.

### Pass/fail criteria

| # | Check | PASS if |
|---|---|---|
| 1 | Missed detection | Unanswered call appears in Missed Calls list within 60s |
| 2 | Claim action | Claim button works; updates row to show agent |
| 3 | Call Back | Initiates outbound call to original caller number |
| 4 | Auto-resolve hint | Once the callback connects, system MAY auto-resolve (see `MissedCallsService.autoResolveByPhone`). Manual Resolve is also fine. |
| 5 | Resolution persistence | After Resolve, row shows in Resolved filter only |

### If something fails

- **Missed call list empty**: `missed_calls.access` missing, OR missed-call cron hasn't run yet (runs every minute). Check permission first.
- **Claim button returns 403**: `missed_calls.manage` missing.
- **Call Back doesn't initiate**: same as Loop 2 — `telephony.call` + `softphone.handshake`.

---

## Post-rehearsal — clean up + report

### 1. Clean up test data (optional)

The test calls above will create real CallSession rows. If you want them out of the stats, mark them as test:

```sql
-- Mark all of today's calls from your personal number as test:
UPDATE "CallSession"
SET "callerNumber" = 'TEST-' || "callerNumber"
WHERE "callerNumber" = '<your-mobile-number>'
  AND "startAt" >= CURRENT_DATE;
```

Skip this if you want them to count as real activity.

### 2. Review logs for surprises

```bash
ssh asg-vm 'Get-Content C:\crm\logs\backend-error.log -Tail 200 | Select-String -Pattern "ERROR|WARN"'
```

Any NEW errors from the rehearsal window should be investigated. Expected noise:
- `[SIP-R] re-register failed: REGISTER request already in progress` — known cosmetic issue; not a blocker.
- `TelegramWebhookService getWebhookInfo failed: fetch failed` — intermittent network glitch to Telegram; not a blocker.

### 3. Write a one-paragraph debrief

In this file, under the "Post-rehearsal debrief" section below, add:
- Date + time of run
- Which loops passed
- Any surprises
- Any fixes applied

This becomes your Monday post-mortem reference.

---

## Post-rehearsal debrief (fill in after each run)

### Run 1 — [date] [time]
_(fill in)_

### Run 2 — [date] [time]
_(fill in)_

### Run 3 — [date] [time]
_(fill in)_

---

## Escalation ladder

If a loop fails in a way you can't diagnose in 10 minutes:

1. **First** — check `audit/MONDAY_ADMIN_CHEATSHEET.md` Symptom → fix table. 90% of issues are there.
2. **Second** — check the PR you most recently merged (view `git log --oneline origin/master -20`). Regressions from PRs #249-#268 are the most likely culprit.
3. **Third** — if still stuck, message Claude in chat with the exact symptom + the relevant log excerpt. Don't rebuild or rollback without confirming the cause first.
4. **Nuclear option** — rollback using `audit/ROLLBACK.md`. This undoes audit PRs. Only do this if a fix isn't converging in < 15 minutes AND it's blocking Monday launch.

---

## Monday-morning-specific wrinkle: load vs one-off

The rehearsals above are serial (one call at a time). Monday will be ~10-30 concurrent calls at peak. If you want to stress-test ingest/dedup under realistic concurrency BEFORE Monday:

```bash
BASE_URL=https://crm28.asg.ge \
  TELEPHONY_INGEST_SECRET=<prod-secret-from-VM-.env> \
  PREFIX=rehearsal-$(date +%Y-%m-%d)- \
  npx tsx scripts/stress-ami-ingest.ts --calls=50 --concurrency=15
```

This posts 50 synthetic call lifecycles in parallel to the production ingest endpoint. The idempotencyKey prefix ensures you can find and delete the rows after. Run the cleanup SQL printed at the end.

**WARNING**: don't run this during business hours. It does NOT take up Asterisk resources (it's backend-only), but it does push synthetic rows into production CallSession/CallEvent/CallMetrics tables. Delete them with the cleanup SQL before Monday 8:00 AM.
