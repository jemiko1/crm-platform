# Phase 1 — Softphone + AMI Bridge Verification

Generated 2026-04-17. Read-only audit against master as of branch `fix/telephony-deep-fix` (commit 33de993). All file paths absolute; line numbers verified. 14 checks; P0/P1 summary at end.

Scope lifted from audit assignment: `crm-phone/` (Electron softphone), `ami-bridge/` (Node AMI relay), plus backend ingest guard + gateway JWT re-verification; crosses-references `phase1-security.md` (Check 5) and `phase1-telephony-stats.md` (dup-event, idempotency, JWT).

---

## Summary table

| # | Check | Verdict | Severity | File(s) |
|---|-------|---------|----------|---------|
| 1 | S1 — SIP password plaintext on softphone side | **STILL PRESENT** (disk + memory + logs) | **P0** | `crm-phone/src/main/session-store.ts:11–18`; `crm-phone/src/main/sip-manager.ts:34–39`; `crm-phone/src/main/index.ts:188` |
| 2 | S2/S9 — SIP registration dropout + recovery | **STILL PRESENT** (no auto re-register; 300s expiry) | **P0** | `crm-phone/src/renderer/sip-service.ts:75–110`; `crm-phone/src/main/sip-manager.ts:93–111` |
| 3 | S3 — Mid-call network drop | **PARTIAL** (renderer emits state on SessionState.Terminated only when SIP.js decides; no dead-peer timer) | **P1** | `crm-phone/src/renderer/sip-service.ts:393–427` |
| 4 | S4 — Ringback tone | **OK** | info | `crm-phone/src/renderer/ringback.ts`; `crm-phone/src/renderer/sip-service.ts:402–417` |
| 5 | S5 — Auto-updater during call | **STILL PRESENT** (startup check + auto-download; no call-state check) | **P2** | `crm-phone/src/main/auto-updater.ts:24–56,117–122` |
| 6 | S6 — Switch-user mismatch when bridge down | **STILL PRESENT** (banner hides when bridge unreachable) | **P1** | `frontend/crm-frontend/src/hooks/useDesktopPhone.ts:32–63`; `frontend/crm-frontend/src/app/app/phone-mismatch-banner.tsx:21` |
| 7 | T1 — AMI ingest secret sync | **OK** (header set, fails closed on either side) | info | `ami-bridge/src/crm-poster.ts:46`; `ami-bridge/src/config.ts:6–13,38`; `backend/crm-backend/src/telephony/guards/telephony-ingest.guard.ts` |
| 8 | T2 — Three stacked `crm_ami` sessions | **STILL PRESENT** (bridge cleanup OK; Asterisk side accepts multiple logins + our `socket.destroy()` may not elicit clean FIN under load; possibly duplicate PM2 processes) | **P1** | `ami-bridge/src/ami-client.ts:267–280`; `ASTERISK_INVENTORY.md §4` |
| 9 | S7 / #15 — Bridge buffer limits | **OK** (5000 cap + oldest eviction + 5-min alert) | info | `ami-bridge/src/event-buffer.ts:6,38–42`; `ami-bridge/src/main.ts:77–92` |
| 10 | S8 — Orphan events | **BENIGN** (saved with `callSessionId: null`, not dropped) | **P2** (bloat risk) | `backend/crm-backend/src/telephony/services/telephony-ingestion.service.ts:47–73` |
| 11 | AMI event mapping coverage + idempotency | **PARTIAL** (no dialend/bridgeenter/newexten/queuememberstatus; transfer & hold use `Date.now()` → replay dupes) | **P1** | `ami-bridge/src/event-mapper.ts:29–42,257–288` |
| 12 | Bridge health endpoint | **OK** (binds 0.0.0.0 — flag for firewall) | **P2** | `ami-bridge/src/health-server.ts:48` |
| 13 | Softphone version + auto-update feed | Current `1.8.2`; feed is `https://crm28.asg.ge/downloads/phone` | info | `crm-phone/package.json:3`; `crm-phone/src/main/auto-updater.ts:30–33` |
| 14 | Local bridge security (port 19876) | **PARTIAL** — 127.0.0.1 bind OK; `/dial` only *prefills* (safe); `/switch-user` requires valid `handshakeToken` minted by logged-in CRM user; no per-request auth beyond that; no user confirmation on the device | **P2** | `crm-phone/src/main/local-server.ts`; `crm-phone/src/renderer/App.tsx:14–16` |

---

## Check 1 — S1 — SIP password plaintext (softphone side)

**Evidence.** Cross-reference `phase1-security.md:100–122` (Check 5): backend exposes plaintext `sipPassword` from 3 endpoints (`/auth/app-login`, `/auth/exchange-token`, `/auth/me`). Softphone side receives it and then:

1. **Persisted to disk.** `crm-phone/src/main/session-store.ts:11–18` wraps the entire `AppSession` (which contains `telephonyExtension.sipPassword`) in `electron-store` using `encryptionKey: "crm-phone-v1"` — a hardcoded literal. `electron-store`'s encryption is AES-256-CBC with this string as the key-derivation input; **anyone with access to the machine plus the open-source code can decrypt**. The file lives at `%APPDATA%\crm28-phone\crm-phone-session.json` on Windows.

2. **Logged to disk.** `crm-phone/src/main/sip-manager.ts:34–39` — the SIP password is logged as `SET(${ext.sipPassword.length}chars)`. Length leak only, but on the same line, `crm-phone/src/main/index.ts:188` logs `[AUTH] Login OK, telephonyExtension: ${JSON.stringify(data.telephonyExtension)}`. `data.telephonyExtension.sipPassword` is a field of that object → **full plaintext password is written to `%APPDATA%\crm28-phone\crm-phone-debug.log`**.

3. **In-memory.** `SipManager` and renderer `SipService` hold `ext.sipPassword` and pass it straight to `sip.js`'s `UserAgent({authorizationPassword: ext.sipPassword})`. Memory dump of the Electron process dumps the credential.

**Verdict.** STILL PRESENT. **P0 blocker.**

**Fix scope.**
1. Remove `[AUTH] Login OK, telephonyExtension: ${JSON.stringify(...)}` line in `crm-phone/src/main/index.ts:188`, or redact `sipPassword` before logging.
2. Stop persisting `sipPassword` in `electron-store`. Keep `accessToken` + extension metadata persisted; fetch sipPassword fresh at startup from a new narrow endpoint (`POST /v1/telephony/sip-credentials` per Security Check 5 fix scope).
3. When backend adds encryption-at-rest for `sipPassword` (AES-GCM keyed to env-var KEK), softphone just stores it in memory and requests it on login + on SIP re-register.

**Regression test.** Integration test that decompiles `%APPDATA%\crm28-phone\crm-phone-session.json` (or reads it via `electron-store`) and asserts it does NOT contain the SIP password. Also `grep -c "sipPassword" crm-phone-debug.log` after a login → must be 0 or only redacted-length form.

---

## Check 2 — S2 / S9 — SIP registration dropout and recovery

**Evidence.**
- `crm-phone/src/renderer/sip-service.ts:97`: `new Registerer(this.ua, { expires: 300 })` — 300s register expiry.
- `crm-phone/src/renderer/sip-service.ts:98–103`: Registerer state listener updates `_registered` and emits, but there is no retry. If the state goes from `Registered` → `Unregistered` mid-session (WSS close, network blip, Asterisk restart, expiry lapse), **no code calls `this.registerer.register()` again**.
- `crm-phone/src/main/sip-manager.ts:97–101` — same pattern, no auto re-register.
- `crm-phone/src/renderer/hooks/useAuth.ts:42` and `:62`, `:83` — `sipService.register()` is called exactly three times: initial session restore, session-change IPC, and post-login. Never on registration drop.
- No `reconnectionAttempts` / `reconnectionDelay` configured on `transportOptions` (grepped for `reconnect` — only a comment about the WSS transport close gap; no options set). SIP.js by default retries the WebSocket transport, but **not the REGISTER** — so even when WSS reconnects, the Registerer stays `Unregistered` unless our code calls `register()` again.
- UI indicator: `crm-phone/src/renderer/pages/PhonePage.tsx:149,152` shows a green/red dot + "Online"/"Offline" string. If the softphone window is backgrounded, the operator won't notice.
- Backend side: the `AgentState` / queue view relies on Asterisk's own device state, not on the operator's softphone. CRM's live-agents dashboard will show "AVAILABLE" even when SIP is not registered — because CRM reads from AMI's QueueMemberStatus/DeviceState and Asterisk still thinks the member is available until the AOR expires.

Result: after 300s of network trouble, Asterisk expires the AOR; calls queued to that agent ring silently. CRM manager dashboard still shows them as available — divergent state.

**Verdict.** STILL PRESENT. **P0** for Monday launch (all 15 new operators will hit this the first time Wi-Fi blips).

**Fix scope.**
1. Add a Registerer state listener that, on transitions to `Unregistered` or `Terminated` while the session is still logged in, schedules exponential-backoff `register()` retries (2s → 4s → 8s → 30s cap).
2. Listen on `this.ua.transport.stateChange` for transport disconnects and explicitly re-register upon reconnect.
3. Surface sustained non-registered state (>60s) as a Windows notification via Electron's `Notification` API so the operator sees it even when the window is hidden.
4. Backend: have the softphone report its SIP state to CRM (new endpoint `POST /v1/telephony/agent/sip-state` — auth'd) and have the live-agents view reconcile with it.

**Regression test.** Unit test on `SipService`: mock `Registerer.stateChange` → simulate `Registered → Unregistered` transition → assert `register()` called again after backoff. Manual: disable Wi-Fi for 60s while logged in, re-enable, confirm SIP status returns to Online within 10s.

---

## Check 3 — S3 — Mid-call network drop

**Evidence.**
- `crm-phone/src/renderer/sip-service.ts:393–427` — `setupSession()` only reacts to `SessionState.Terminated`. SIP.js emits `Terminated` when either side sends BYE/CANCEL or when the dialog-level session-timer fires.
- If the customer's network drops mid-call, the operator's softphone stays in `Established`. The media tracks go silent (RTP stops), but there is no local RTP-timeout watchdog. Operator hears silence indefinitely until they click Hangup.
- Backend side: Asterisk will eventually detect RTP timeout (PJSIP `rtp_timeout` setting — not in our inventory; default 30s-60s) and send BYE. Then softphone transitions to Terminated. Call lifecycle finishes correctly but with a 30–60s dead-air window.
- No `call-ended` emit before that: `_callState` stays `connected`, so the UI doesn't prompt the operator to hang up.

**Verdict.** STILL PRESENT — not a correctness bug; a UX gap. Call DOES end via Asterisk RTP timeout; CRM's CallSession DOES get a correct `endAt` via `Hangup` AMI event.

**Severity.** **P1** — operator productivity hit; calls appear to hang.

**Fix scope.** Add a local RTP watchdog in `sip-service.ts`: check `pc.getStats()` every 5s while `_callState === "connected"`. If `inbound-rtp.packetsReceived` hasn't increased for 15s, emit `error` event with "Call lost media" and call `hangup()`. Also surface Asterisk's hangup cause (payload.causeTxt) in the UI.

**Regression test.** Hard — needs integration harness. Manual: make a call, pull network cable on the customer-simulator side, assert the operator's softphone auto-hangs within 20s.

---

## Check 4 — S4 — Ringback logic

**Evidence.** `crm-phone/src/renderer/ringback.ts` — 425Hz sine, 1s-on/4s-off cadence (European standard). Started at `SessionState.Establishing` for **outbound** only (`sip-service.ts:402–405`). Stopped at `Established`, `Terminated`, and in `unregister()` (`sip-service.ts:115,408,417`).

Three stop sites cover the three transition paths. No leaked oscillator / AudioContext seen. Comment at `ringback.ts:8–17` correctly explains why local synthesis is preferred over early-media (double-audio with some carriers).

**Verdict.** OK.

**Fix scope.** None.

**Regression test.** Existing manual play is sufficient.

---

## Check 5 — S5 — Auto-updater during call

**Evidence.** `crm-phone/src/main/auto-updater.ts`:
- `:24–33` — feed: `https://crm28.asg.ge/downloads/phone`, provider: `generic`.
- `:35–37` — `autoUpdater.autoDownload = true; autoDownloadInstallOnAppQuit = true; allowDowngrade = false`.
- `:64–68` — download progress events broadcast to renderer via IPC.
- `:70–86` — on `update-downloaded`, `dialog.showMessageBox` asks Restart/Later.
- `:117–122` — initial check 5 seconds after app start.
- **Nothing checks call state before downloading.** If an update is released while operator is on a 30-min call, the download happens in the background. Bandwidth contention can degrade SIP media. On completion, the dialog steals focus.

**Verdict.** STILL PRESENT.

**Severity.** **P2** — low-probability (releases happen during off-hours), but when it hits it hits during a live call.

**Fix scope.** Import the call state (via a ref from `SipManager` in main), gate `autoUpdater.checkForUpdates()` and the download-progress handler on `callState === "idle"`. Defer the install dialog until after the next hangup — simplest: check in `download-progress` handler and `autoUpdater.downloadUpdate()` only when idle. Or subscribe to an IPC `call-state-changed` and kick off download on next idle.

**Regression test.** Mock `autoUpdater.checkForUpdates()`, assert it is not invoked when `callState !== "idle"`.

---

## Check 6 — S6 — Switch-user mismatch when bridge is down

**Evidence.**
- `frontend/crm-frontend/src/hooks/useDesktopPhone.ts:32–46` — `fetchStatus()` does `fetch(BRIDGE_URL/status, {signal: AbortSignal.timeout(2000)})`. On any error (timeout, ECONNREFUSED), catches and calls `setStatus(null)`.
- `:56–63` — `appDetected = !!status?.running`. If `status` is null, `appDetected` is false.
- `:59–63` — `mismatch = !!(currentUserId && appUser && appUser.id !== currentUserId)`. If `appUser` is null (because `status` is null), `mismatch` is false.
- `frontend/crm-frontend/src/app/app/phone-mismatch-banner.tsx:21` — `if (!appDetected || !mismatch || !appUser) return null;` → banner hides when bridge is down.
- Poll interval is 60s (`:7`). After startup, up to 60s can pass before the hook notices the bridge is down.

**Scenario.** Operator B sits at Operator A's workstation. Softphone is still logged in as A (as designed for switch flow). Bridge process crashed earlier. B logs into the CRM web UI. `fetchStatus()` returns null. `mismatch` is false → banner never shows. B handles calls all day, and every outbound call is SIP-registered as A's extension → calls attributed to A in CRM stats.

**Verdict.** STILL PRESENT. **P1** — wrong-agent-attribution corrupts call-center statistics and performance evaluations.

**Fix scope.**
1. Differentiate bridge-unreachable from no-mismatch. When `fetchStatus()` fails, show a separate informational banner "Phone app not running — calls from this browser will not be tracked correctly. Open the phone app or install it."
2. Render the "open phone app" banner persistently for any user who has a `telephonyExtension` in CRM but `appDetected === false`.
3. (Longer-term) Cross-check backend: on `agent_connect` AMI event, if the extension's CRM user differs from the currently-logged-in web user, emit a server-side warning surfaced via the `agent:{userId}` room.

**Regression test.** Simulate bridge down (mock `fetch` to throw) + CRM user !== last-known phone user → assert a warning is rendered. Add Playwright scenario.

---

## Check 7 — T1 — AMI ingest secret sync

**Evidence.**
- `ami-bridge/src/config.ts:38` — `ingestSecret: required("TELEPHONY_INGEST_SECRET")`. `required()` (`:6–13`) calls `process.exit(1)` if missing — **fails closed at bridge startup**.
- `ami-bridge/src/crm-poster.ts:46` — header: `"x-telephony-secret": this.opts.ingestSecret`. Set on every POST.
- Backend guard `backend/crm-backend/src/telephony/guards/telephony-ingest.guard.ts:15–19` — if `process.env.TELEPHONY_INGEST_SECRET` is unset, throws `ForbiddenException`. Backend also fails closed on missing env (though logs the error rather than exiting the process).
- Guard uses `timingSafeEqual`. Phase1-telephony-stats Check 1 already flagged a minor concern: if `Buffer.from(header)` and `Buffer.from(secret)` differ in length, `timingSafeEqual` throws, but it's caught and re-thrown as `ForbiddenException` — non-constant-time disclosure of length mismatch. Cosmetic P2.

**Verdict.** OK (with minor length-timing nit already tracked).

**Fix scope.** For length-timing: compare `header.length === secret.length` first (constant return). Or pad both to max length. Low priority.

**Regression test.** Already in `phase1-security.md`.

---

## Check 8 — T2 — Three stacked `crm_ami` sessions

**Evidence.**
- `ASTERISK_INVENTORY.md §4 (:93–104)` — 3 concurrent `crm_ami` entries from 127.0.0.1: `~45 days`, `~2 days`, `~15 minutes`. `Allow multiple login: Yes` in `manager.conf`.
- `ami-bridge/src/ami-client.ts:267–280` — `cleanup()` calls `socket.removeAllListeners(); socket.destroy(); socket = null`. `destroy()` sends FIN on the TCP socket.
- `:42–44` — `connect()` starts by calling `cleanup()`.
- `:82–89` — on `close`, reconnect is scheduled (`scheduleReconnect`).

Bridge-side cleanup looks correct. Three stacked sessions are therefore **not** from in-process leak. Most likely causes:
1. **Multiple bridge processes.** PM2 may have been restarted/spawned multiple times without killing old ones. `pm2 list` on the VM will show one process per `crm_ami` login. Each process holds its own socket.
2. **Asterisk's TCP half-close hysteresis.** When bridge `socket.destroy()` is called without a graceful `Action: Logoff`, Asterisk's AMI handler on the other side can keep the session in `manager show connected` until TCP keepalive + idle-timeout fires. Our bridge sends `Logoff` only in `disconnect()` (`:93–111`), which runs only on SIGINT/SIGTERM — not on unexpected socket errors. So any crash path leaves a zombie session on the Asterisk side for minutes/hours.

Either way, the 45-day session is suspicious — that's older than any bridge uptime would realistically be given PM2 + GitHub-Actions redeploys. Almost certainly a **separate process** (perhaps from a previous Railway deployment before the VM migration in April 2026).

**Verdict.** STILL PRESENT. **P1** — if multiple processes are both relaying, CRM receives duplicate ingests. CallEvent dedup (by idempotency key) handles call_start/call_end/call_answer (content-addressed keys), but transfer/hold_start/hold_end use `Date.now()` in the key → duplicates pass dedup → every transfer/hold appears 2–3x in CallEvent.

**Fix scope.**
1. SSH to VM, run `pm2 list | grep ami-bridge`. If >1 process, `pm2 delete` the older ones.
2. On Asterisk side, run `asterisk -rx "manager show connected"` and note IPs of any stale connections. SIGKILL old bridge processes and verify `manager show connected` drops to one after 60s.
3. Bridge: add graceful `Logoff` in the socket `close` handler (currently only in `disconnect()`); send before reconnecting.
4. Bridge: add `AMI_CLIENT_ID` env (e.g. `crm_ami_prod`) distinct from a second process so concurrent conns are at least distinguishable.
5. FreePBX: set `Allow multiple login: No` on `crm_ami` so accidental second bridge is rejected loud.

**Regression test.** After rollout, scheduled check (every 5 min in bridge-monitor) that queries `manager show connected` via a new AMI `Command`, asserts exactly 1 `crm_ami` session. Alert otherwise.

---

## Check 9 — S7 / #15 — Bridge buffer limits

**Evidence.**
- `ami-bridge/src/event-buffer.ts:6` — `MAX_QUEUE_LIMIT = 5000` constant.
- `:38–42` — when `queue.length > maxQueueSize`, evicts the oldest excess via `slice(evicted)` and logs `warn` "Queue overflow: evicted N oldest event(s)".
- `:46–49` — size-based trigger (`maxSize` from env, default 20) + `start()` timer (3000ms) both call `flush()`.
- `:61–76` — `flush()` splices queue, calls `onFlush` (poster.post). On failure, re-queues via `queue.unshift(...batch)`. Flush has a `flushing` guard to prevent concurrent flushes.
- `ami-bridge/src/main.ts:77–92` — `STALE_INGEST_THRESHOLD_MINS = 5`. Every 60s, status is logged; if `minutesSinceSuccess >= 5`, an `ALERT` line is logged.

**Verdict.** OK — matches the partial-fix description in finding #15.

**Caveats.**
- Alert is log-only; no external notification. Requires dashboard/alerting to notice.
- Oldest-evict is still **silent data loss** at the single log line. If CRM goes down for 15 minutes at ~50 events/min, 750 events are lost before the 5000 cap is hit — logs contain only the `evicted N` count, not the events themselves.
- `minutesSinceSuccess` is rounded; "0 min" could mean 29 seconds.

**Fix scope (nice-to-have).** Persist evicted events to a local SQLite circular log on disk before eviction; allow manual replay once CRM is back.

**Regression test.** Kill backend for 10 minutes at 1 event/second → bridge buffer hits 600 → confirm no eviction log. Restart backend → confirm all 600 get posted. Repeat at 10 events/sec → confirm eviction logs appear after 500s.

---

## Check 10 — S8 — Orphan events

**Evidence.**
- `backend/crm-backend/src/telephony/services/telephony-ingestion.service.ts:47–73`:
  ```
  const existing = await this.prisma.callEvent.findUnique({ where: { idempotencyKey } });
  if (existing) return false;

  const linkedId = event.linkedId ?? (event.payload as any).linkedId;
  const session = linkedId ? await this.prisma.callSession.findUnique({ where: { linkedId } }) : null;

  await this.prisma.callEvent.create({
    data: {
      callSessionId: session?.id ?? null,
      ...
    },
  });

  await this.dispatch(...);
  return true;
  ```

- **Every ingested event IS saved**, even if no session matches. Dispatch-level handlers (`handleCallAnswer`, `handleCallEnd`, etc.) early-return when `existingSession` is null.
- `handleCallStart` (`:148`) upserts the `CallSession`, so call_start is never orphaned.
- Orphans happen when non-start events arrive for a `linkedId` whose `call_start` was lost (bridge buffer evicted, or the call started before bridge was running). These accumulate as `CallEvent` rows with `callSessionId: null`.

**Verdict.** **BENIGN** (not dropped), but **bloat**. `CallEvent` has no cleanup cron (per finding #41). 100k orphans/year is plausible at 5 events per abandoned-call-start scenario.

**Severity.** P2.

**Fix scope.**
1. Add cleanup cron to delete `CallEvent` WHERE `callSessionId IS NULL AND ts < now() - INTERVAL '7 days'` (retain a week for debug).
2. OR periodically back-fill: for each orphaned `CallEvent`, try to find a CallSession by `uniqueId` (not just `linkedId`) and attach.
3. Add a metric: `orphan_call_event_count` on the bridge-monitor dashboard.

**Regression test.** Generate a call_end for a linkedId that has no CallSession → assert a CallEvent row is created with `callSessionId: null`. Then create a retroactive CallSession with that linkedId → assert a subsequent backfill job associates the orphan.

---

## Check 11 — AMI event mapping coverage + idempotency keys

**Evidence.**
- `ami-bridge/src/event-mapper.ts:29–42` — `AMI_EVENTS_OF_INTEREST`:
  ```
  Newchannel, Hangup, QueueCallerJoin, QueueCallerLeave, AgentConnect,
  BlindTransfer, AttendedTransfer, MusicOnHoldStart, MusicOnHoldStop,
  VarSet, MixMonitor, Cdr
  ```
- Notably **missing** (listed in `INVENTORY.md §1.5` but not in the set):
  - `dialend` — would mark outbound ring-to-answer latency
  - `bridgeenter` — would mark the exact moment audio path is established (before ConnectedLineUpdate)
  - `newexten` — low priority
  - `queuememberstatus` / `queuememberpause` — affect agent live-state display

- **Idempotency key patterns** (by event type):
  - `call_start` (`:118`): `${linkedId}-call_start` — content-addressed. OK.
  - `call_end` (`:142`): `${linkedId}-call_end` — OK.
  - `call_answer` (`:234`): `${linkedId}-call_answer` — OK.
  - `queue_enter` (`:182`): `${linkedId}-queue_enter-${evt.Uniqueid}` — includes uniqueId. OK for re-entry scenarios.
  - `queue_leave` (`:199`): `${linkedId}-queue_leave-${evt.Uniqueid}` — OK.
  - `agent_connect` (`:221`): `${linkedId}-agent_connect-${extension || evt.Uniqueid}` — OK.
  - `recording_ready` (`:161`): `${linkedId}-recording_ready` — OK.
  - **`transfer` (`:261`): `${linkedId}-transfer-${Date.now()}`** — NOT content-addressed.
  - **`hold_start` / `hold_end` (`:280`): `${linkedId}-${type}-${Date.now()}`** — NOT content-addressed.

- With `Date.now()` in the key, any replay (from buffer re-queue after flush failure, or bridge restart, or the duplicate `crm_ami` session from Check 8) creates **new keys** → event-level dedup in `telephony-ingestion.service.ts:47–53` does not catch these → duplicates land in `CallEvent` → downstream stats counting holds/transfers double-count.

**Verdict.** STILL PRESENT. **P1** — transfer counts in manager stats will be inflated proportionally to bridge-restart frequency. `phase1-telephony-stats` check 6 rated this P2; re-raising to P1 given Check 8's evidence that bridge restarts are happening (3 stacked sessions).

**Fix scope.**
1. Transfer key: `${linkedId}-transfer-${evt.Uniqueid}-${targetExtension ?? 'unknown'}`.
2. Hold keys: `${linkedId}-${type}-${evt.Uniqueid}-${holdCounter}` where holdCounter is incremented per call in the CallState. Or: use the Asterisk event's `Uniqueid` + the monotonic `SequenceNumber` field (if present) — AMI Hold events have sequence metadata.
3. Add mappings for `dialend` and `bridgeenter` if statistics need them (Phase1-telephony-stats will decide).

**Regression test.** Unit test: feed the same `BlindTransfer` AMI event twice through `EventMapper` → assert same `idempotencyKey` both times.

---

## Check 12 — Bridge health endpoint

**Evidence.** `ami-bridge/src/health-server.ts`:
- `:23–46` — `GET /health` returns `200` when `stats.ami.connected`, else `503`. Body has `service`, `status`, `uptime`, `timestamp`, plus full `stats` (AMI state, buffer size, poster counters, lastSuccessAt, minutesSinceSuccess).
- `:48` — **`server.listen(port, "0.0.0.0")`** — binds all interfaces, not 127.0.0.1. Port 3100 default.
- `Access-Control-Allow-Origin: *` on the response.

**Verdict.** Works. Security nit: binding to `0.0.0.0` exposes the health endpoint (which reveals bridge status, call counts, and TELEPHONY_INGEST_SECRET usage patterns) to any machine that can reach port 3100 on the VM. OK for now because VM firewall blocks 3100 from the public Internet, but any lateral-move foothold inside 192.168.65.0/24 can read it. Defense-in-depth: bind to 127.0.0.1 and front with Nginx if we need external access.

**Use sites.** Grep confirms it's used by the bridge-monitor dashboard and PM2 health-check scripts. See `docs/BRIDGE_MONITOR.md`.

**Severity.** **P2.**

**Fix scope.** `server.listen(port, "127.0.0.1", ...)`. If dashboard is on a different host, add Nginx reverse proxy with auth.

**Regression test.** `curl -v http://192.168.65.110:3100/health` from another host on the subnet → should return connection refused after fix.

---

## Check 13 — Softphone version + auto-update feed

**Evidence.**
- `crm-phone/package.json:3` — `"version": "1.8.2"`.
- `crm-phone/src/main/auto-updater.ts:30–33` — feed URL `https://crm28.asg.ge/downloads/phone`, provider `generic`.
- `:37` — `allowDowngrade = false`.

`electron-updater` with provider=`generic` expects `latest.yml` + installer at that URL. Consistent with VM Nginx serving `/downloads/phone` (standard `electron-builder` output).

**Verdict.** OK.

**Severity.** info.

**Fix scope.** None; but before Monday launch, verify `https://crm28.asg.ge/downloads/phone/latest.yml` is reachable and points at 1.8.2 (or whatever the pinned release is) to avoid day-1 update storm.

---

## Check 14 — Softphone local bridge security

**Evidence.** `crm-phone/src/main/local-server.ts`:
- `:117` — `server.listen(PORT, "127.0.0.1", ...)` — localhost-only bind. ✓ Only local processes reach it.
- `:16–30` — CORS origin check allows `undefined` (non-browser), `crm28.asg.ge`, `localhost`, `127.0.0.1`. Any local port on any of those origins passes. **A malicious web app running on `http://localhost:anything` on the operator's machine passes CORS**. Browsers in 2026 mostly enforce CORS as expected, so cross-site requests from `evil.com` don't work — except if Origin header is stripped (curl, non-browser), which passes (`!origin → cb(null, true)`).
- `:34–52` — `GET /status` leaks session info (user id, name, email-fallback, extension). No auth. **`curl http://127.0.0.1:19876/status` from any local process reveals the operator's email + extension**. Minor disclosure on a shared machine.
- `:54–80` — `POST /switch-user` accepts any `handshakeToken`. Handshake tokens are minted by backend `/auth/device-token` which requires a valid JWT — an attacker who already has JWT access can switch the phone to their session. This is by design (the switch flow). **Not authenticating the bridge request itself** means any local process can *attempt* to switch, but only succeeds if it has a backend-issued handshake token. Low risk.
- `:82–109` — `POST /dial` sanitizes to phone-format, requires session, fires IPC to renderer. **Renderer does NOT auto-dial** (`crm-phone/src/renderer/App.tsx:14–16`: "operator must press the Call button"). Verified safe against unauthorized toll dialing.
- `:111–115` — `POST /logout` destroys session with no auth. A malicious local process could force-logout the operator (nuisance DoS), but not hijack.

**Verdict.** PARTIAL — 127.0.0.1 bind is good, lack of per-request auth on `/switch-user`, `/dial`, `/logout`, `/status` is a defense-in-depth gap but not exploitable for toll fraud or credential theft given the guardrails (handshake-token requirement, no auto-dial).

**Severity.** **P2.**

**Fix scope.**
1. Add a one-time token (written to `%APPDATA%\crm28-phone\bridge-token` on softphone start, 0600 perms) that the CRM web UI reads via a first-party narrow path (tricky — browsers can't read files). Alternative: require an `X-Bridge-Secret` header whose value is set to a per-session random token that the Electron app injects into `document.cookie` for `crm28.asg.ge` via `session.cookies.set()`. CRM frontend reads it and sends in bridge requests.
2. Remove email from `/status` response — just `{loggedIn, userId, extension, sipRegistered}` is enough for the mismatch check.
3. Add rate limit on `/logout` to mitigate nuisance.

**Regression test.** Integration test that sends `/dial` with `Origin: http://evil.localhost:8000` → assert CORS rejects. Unit test that asserts `/status` response shape excludes email.

---

## P0 / P1 punchlist (for the launch-blocker review)

**P0 (must fix before Monday):**

- **P0-1 — SIP password on softphone** (Check 1).
  - Stop logging `data.telephonyExtension` at `crm-phone/src/main/index.ts:188`.
  - Stop persisting `sipPassword` in electron-store (`crm-phone/src/main/session-store.ts`).
  - Adopt the narrow `/v1/telephony/sip-credentials` endpoint proposed in `phase1-security.md:118–121`; softphone fetches sipPassword fresh per session, keeps in RAM only.

- **P0-2 — SIP re-register on drop** (Check 2).
  - Add backoff-retry on Registerer `Unregistered` state in `crm-phone/src/renderer/sip-service.ts`.
  - Listen on transport state; re-register on reconnect.
  - Surface sustained-offline as a Windows toast notification.
  - Launch-day risk: every network blip silently offlines an operator.

**P1:**

- **P1-1 — Switch-user mismatch when bridge down** (Check 6).
  - Differentiate bridge-unreachable from no-mismatch; show a persistent "phone app not running" banner to users with a telephonyExtension.

- **P1-2 — Mid-call dead-air** (Check 3).
  - Local RTP watchdog, auto-hangup after 15s of no inbound packets.

- **P1-3 — 3 stacked `crm_ami` sessions** (Check 8).
  - SSH to VM, identify extra bridge processes, delete.
  - Add graceful `Logoff` in socket `close` handler.
  - Flip `Allow multiple login: No` on `crm_ami` in FreePBX.

- **P1-4 — `Date.now()` in idempotency keys for transfer/hold** (Check 11).
  - Rewrite key to content-addressed tuple. Unit test.

- **P1-5 — Telephony gateway JWT `sub` vs `id`** (prior finding #19, already called out in `phase1-telephony-stats.md` check 5).
  - `backend/crm-backend/src/telephony/realtime/telephony.gateway.ts:266,275` reads `payload.id`; JWT signs `sub`. Result: web UI's call-center dashboard silently loses all `/telephony` namespace events (call:ringing, screen:pop, call:report-trigger). Confirmed in this audit; cross-referenced.
  - Fix: `payload.sub ?? payload.id`. One-liner.

**P2:**

- Auto-updater gating on call state (Check 5).
- Orphan `CallEvent` cleanup cron (Check 10).
- Bridge health endpoint bind to 127.0.0.1 (Check 12).
- Bridge `/status` email disclosure (Check 14).
- Missing AMI event maps: dialend / bridgeenter (Check 11, if stats needs them).

---

## Cross-references to other Phase-1 reports

- `phase1-security.md` Check 5 — SIP password on backend side (P0, cited above).
- `phase1-security.md` Check 4 — device-token / exchange-token partial fix.
- `phase1-telephony-stats.md` Check 1 — TELEPHONY_INGEST_SECRET length-timing (P2).
- `phase1-telephony-stats.md` Check 2 — CallEvent dedup vs CallSession update order.
- `phase1-telephony-stats.md` Check 5 — Gateway `payload.id` / `sub` mismatch (confirmed here).
- `phase1-telephony-stats.md` Check 6 — bridge idempotency-key `Date.now()` pattern (this report re-rates to P1).
- `ASTERISK_INVENTORY.md §4` — stacked `crm_ami` sessions, origin analysis.
- `KNOWN_FINDINGS_CARRIED_FORWARD.md` — findings #13 (P0), #15 (P2, partial), #19 (P2, confirmed P0-grade impact on telephony).
- `THREAT_MODEL.md §4` — all S1–S9 covered in checks 1–6; S7 in check 9; S8 in check 10.

---

## Appendix — File inventory touched

### Softphone (`crm-phone/`)
- `src/main/index.ts` (355 lines) — Electron main; auth login + restore; log sink writes to `%APPDATA%\crm28-phone\crm-phone-debug.log`
- `src/main/sip-manager.ts` (321 lines) — older main-process SIP stack (not used at runtime; renderer's is active)
- `src/main/session-store.ts` (43 lines) — electron-store with hardcoded encryption key `crm-phone-v1`
- `src/main/local-server.ts` (130 lines) — Express bridge on 127.0.0.1:19876
- `src/main/auto-updater.ts` (132 lines) — electron-updater feed
- `src/renderer/sip-service.ts` (431 lines) — **active** SIP stack; runs in renderer process
- `src/renderer/ringback.ts` (97 lines) — 425Hz tone, 1s/4s cadence, WebAudio
- `src/renderer/hooks/useAuth.ts` (107 lines) — triggers `sipService.register()` at 3 sites only
- `src/renderer/hooks/usePhone.ts` (60 lines) — state bridge
- `src/renderer/App.tsx` (93 lines) — dial requests prefill only, no auto-dial
- `src/renderer/pages/PhonePage.tsx` — SIP status dot + label
- `package.json:3` — version 1.8.2

### AMI Bridge (`ami-bridge/`)
- `src/main.ts` (136 lines) — wires AMI → mapper → buffer → poster; health server; 60s status loop with 5-min stale alert
- `src/ami-client.ts` (282 lines) — AMI TCP, login, reconnect, ping; `cleanup()` destroys socket before reconnect
- `src/event-mapper.ts` (337 lines) — AMI→CRM event mapping; transfer/hold keys use `Date.now()`
- `src/event-buffer.ts` (77 lines) — 5000-cap circular buffer with oldest-evict
- `src/crm-poster.ts` (103 lines) — POST w/ `x-telephony-secret` header, retries
- `src/health-server.ts` (53 lines) — binds 0.0.0.0 :3100
- `src/config.ts` (66 lines) — env with required()/fails-closed

### Backend ingestion
- `backend/crm-backend/src/telephony/guards/telephony-ingest.guard.ts` (43 lines) — `timingSafeEqual` on header
- `backend/crm-backend/src/telephony/services/telephony-ingestion.service.ts:47–73` — event-level dedup + orphan-save
- `backend/crm-backend/src/telephony/realtime/telephony.gateway.ts:266,275` — `payload.id` mismatch confirmed
- `backend/crm-backend/src/auth/auth.service.ts:17,36,90,116` — JWT signed with `sub`

### Frontend
- `frontend/crm-frontend/src/hooks/useDesktopPhone.ts` (102 lines) — polls bridge /status; mismatch hides when bridge down
- `frontend/crm-frontend/src/app/app/phone-mismatch-banner.tsx` (38 lines) — returns null when `!appDetected`
- `frontend/crm-frontend/src/app/app/call-center/call-report-trigger.tsx:33` — uses `/telephony` namespace (broken by JWT `sub`/`id` mismatch)
