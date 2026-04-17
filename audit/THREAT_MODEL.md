# CRM28 — Calls & Client Chats Threat Model

**Phase 0 deliverable.** What can realistically go wrong on Monday morning in front of real Operators, real Managers, real residents, and real money-per-minute SIP trunks — per surface, with an owner. Built against `INVENTORY.md` and `KNOWN_FINDINGS_CARRIED_FORWARD.md`.

Severity: **P0 blocker** = do not launch; **P1 must-fix** = launch would bleed trust; **P2 should-fix** = launch acceptable with mitigation logged; **P3 = deferred**.

Owners below are capability handles; Phase 1 will bind them to concrete agent runs.

---

## 1. Auth / sessions

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| A1 | Operator leaves laptop unattended and JWT cookie is read by a colleague / intruder. Sliding-window refresh keeps session alive for 30 days. | Session theft; calls placed as operator; chat transcripts leak. | P2 | security-scanner, rbac |
| A2 | Brute-force password spray against `/auth/login` — 60/min/IP global + 5/email/5min local throttle. Attacker uses multiple emails or IPs. | Account takeover. | **P0** (finding #1) | security-scanner |
| A3 | `JWT_SECRET` missing or default on VM → app either crashes (correct) or runs with weak secret (prior risk). | Every JWT forgeable. | P0 | security-scanner, deployer |
| A4 | `COOKIE_SECURE=false` in prod by mistake; auth cookie sent over HTTP. | Credential interception. | **P0** (finding #6) | security-scanner |
| A5 | `/auth/device-token` and `/auth/exchange-token` replay. No permission gates, TTL unclear. | Softphone user-switch bypass; issue tokens for other users. | P1 (finding #7) | security-scanner, rbac |
| A6 | Login-throttle state lost on backend restart → attacker resumes spray after any deploy. | Brute force window reopens. | P1 (finding #2) | rbac, deployer |
| A7 | Sliding-window refresh issues a new cookie on every `/auth/me` past 50% of lifetime. If response bodies or logs include the cookie, it leaks. | Token exfiltration via logs. | P2 | security-scanner |

## 2. RBAC / authorization

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| R1 | RoleGroup assignments for operator/manager positions are wrong at seed time — operators lack `call_logs.own` or `missed_calls.access`; managers lack `call_center.live/.statistics`. | Operators can't see their own work; managers can't monitor. **Launch-blocking UX failure.** | **P0** (INVENTORY.md §3.5) | rbac |
| R2 | `PositionPermissionGuard` returns `true` when no `@RequirePermission()` set. Handlers lacking the decorator are public-to-any-JWT. | Any authenticated user hits inventory / employees / work-orders / roles / messenger mutations. | P1 (finding #8, #9) | rbac, security-scanner |
| R3 | Operator fetches another operator's conversation by ID via `GET /v1/clientchats/conversations/:id`. | Data leak between operators. **Monday scenario: operator sees a colleague's chat with a resident.** | **P1** (finding #28, INVENTORY.md §2.8) | rbac |
| R4 | Manager views stats filtered by someone else's department-tree scope. Data-scope bug in `TelephonyCallsService.findAll()`. | Wrong numbers shown; shift decisions taken on bad data. | **P0** if real (manager correctness directly requested). | stats-correctness, rbac |
| R5 | Superadmin in `managers` + `queue` + `agent:{self}` rooms receives duplicate chat events → UI double-counts unread. | Bad UX, could mask real missed messages. | P2 (finding #37) | realtime, frontend-ops |
| R6 | `telephony-extensions.controller.ts` POST/PATCH/DELETE accept any logged-in user. | Attacker creates/changes extension with stolen credentials; potentially attaches to a trunk. | P1 (finding #14) | rbac, telephony-backend |
| R7 | Dual RBAC systems: some older controllers use legacy `RolesModule` check. A role revoke in RoleGroups doesn't remove access through legacy Role. | Stale grants retain access. | P2 (finding #10) | rbac |

## 3. Telephony backend (ingestion, sync, crons, stats)

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| T1 | `TELEPHONY_INGEST_SECRET` drifts between backend `.env` and AMI bridge `.env` on the VM. AMI bridge POSTs rejected, events silently lost. | Calls made but never recorded → manager dashboards under-count. | **P0** (CLAUDE.md §silent-overrides) | deployer |
| T2 | Three concurrent `crm_ami` AMI sessions on Asterisk (observed). If two bridge instances run, doubled ingest events → CallSession rows duplicated or CallEvent idempotency saves one but still processes twice. | Duplicated metrics; duplicated agent-status updates. | **P1** (Asterisk §10) | asterisk, telephony-backend, deployer |
| T3 | AMI bridge reconnect backoff: exponential, no jitter. If CRM backend restarts with N bridges, thundering herd. | Flap → missed events. | P2 (finding #15) | telephony-backend |
| T4 | `TelephonyStatsService` 6 methods do unbounded `findMany`. A month query on 50 operators → thousands of rows into memory. Backend OOM-spikes; request times out. | Manager dashboards hang or 500. | **P1** (finding #12, #47) | stats-correctness, performance |
| T5 | CDR import cron runs every 5 min without overlap guard. Slow CDR DB → concurrent imports → duplicate events. | Duplicated CallSession rows, wrong stats. | P1 (finding #18) | telephony-backend |
| T6 | Asterisk sync CLI commands can fail mid-sync; `syncing` flag unblocks next cycle. Partial queue state persists. | Live monitor shows wrong queue members. | P2 | telephony-backend |
| T7 | `TelephonyStateManager` in-memory: restart drops all active-call state. Clients reconnect but anything mid-call is lost from manager UI. | Brief dashboard amnesia (<30s). | P2 (finding #33) | realtime |
| T8 | `TelephonyGateway` reads `payload.id` from JWT; tokens carry `sub`. Socket connection fails silently. | Screen pops + call events don't reach operator UI. | **P1** (finding #19) | realtime, telephony-backend |
| T9 | Quality pipeline crash → reviews stuck in PROCESSING. Recovery resets after 10 min. | 10-min delay on AI reviews; acceptable. | P3 (finding #17, already fixed) | telephony-backend |
| T10 | Missed-call claim race: two operators click simultaneously. Atomic `updateMany` protects DB; UI may still show ambiguous state. | Confusion, not data corruption. | P2 | telephony-backend |
| T11 | `CallEvent.idempotencyKey` collision if AMI bridge re-emits with same key after restart. `ON CONFLICT` should discard duplicate; validate. | Double-processing if conflict handling is wrong. | P1 | telephony-backend |
| T12 | CDR-derived events (`cdr:start:*`) and live AMI events (`ami:*`) may both land on the same CallSession. If merge logic is wrong → disposition flips. | Wrong disposition on dashboards. | P1 | telephony-backend, stats-correctness |

## 4. Softphone + AMI bridge (operator's entire working surface)

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| S1 | `TelephonyExtension.sipPassword` in plaintext in DB and in `/auth/app-login` response. | SIP credential theft — attacker makes calls on live trunks that cost money per minute. | **P0** (finding #13) | security-scanner, telephony-backend |
| S2 | Operator's softphone loses WSS to Asterisk (network blip). SIP registration expires at 300s. | Operator appears online in CRM but can't receive calls. | **P0** if no warning surfaced | telephony-softphone, realtime |
| S3 | Mid-call network drop. Call Session state in backend: still "answered" until hangup event. Frontend shows operator still on call. | Wrong live-monitor view. | P1 | realtime, telephony-softphone |
| S4 | Ringback tone logic (`renderer/ringback.ts`) plays wrong tone or keeps playing after answer. | Operator confused, customer hears nothing. | P2 | telephony-softphone |
| S5 | Softphone auto-updater downloads during a call. `electron-updater` installs on quit, but update prompt could steal focus. | Operator misses call while accepting update. | P2 | telephony-softphone |
| S6 | Softphone logs in as operator A, operator B uses same workstation, forgets to switch. Web UI shows B, phone is still A. Bridge-polling banner warns, but if bridge is down, warning hides. | Calls attributed to wrong agent. | **P1** | telephony-softphone |
| S7 | AMI bridge buffer fills because CRM backend is down for 10+ min. Oldest-evict at 5000 events → older events lost permanently. | Incomplete call records. | P1 (finding #15, partial fix) | telephony-backend |
| S8 | Bridge ignores `ami:hangup` where linkedid has no matching callSession → orphan events accumulate. | Ingest noise; call end not applied to session. | P2 | telephony-backend |
| S9 | Operator's softphone reboots mid-shift; SIP re-registers after 30–60s; CRM thinks agent is offline during that gap. | Queue 804 skips agent → calls go to voicemail / timeout. | P1 | telephony-softphone, realtime |

## 5. Asterisk / FreePBX (production trunk)

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| AS1 | Only 1 of 16 extensions registered at launch — ASG hasn't pushed softphones to the other 15 operators. | All calls go to Keti. Overload. | **P0** (ASTERISK §1) | asterisk, launch-coord |
| AS2 | Queue 802 has `ringinuse=no` — busy agent double-rings. Queue 804 is `yes`. Operator receives call during wrap-up. | Call dropped / confused. | P2 (ASTERISK §3) | asterisk |
| AS3 | FreePBX "Apply Config" via GUI silently overwrites CLI changes to `manager_custom.conf` / queues. | Our `crm_ami` user disappears or is reverted → bridge auth fails. | **P0** (CLAUDE.md §critical-asterisk-rule) | asterisk |
| AS4 | Recording disk at 69% of 39GB, no rotation. Week of high volume fills disk. | Recordings silently stop being written. | P1 | asterisk |
| AS5 | Trunk `1055267e1-Active-NoWorkAlamex` de-registers (provider issue). | No inbound or outbound calls. | P0 dependency outside our control; monitoring required | asterisk, preflight |
| AS6 | Sangoma `sangomacrm.agi` AGI fires on every hangup. AGI host unreachable → hangup path slows. | Per-call latency spike. | P3 (ASTERISK §8) | asterisk |
| AS7 | All operators register from behind the same NAT. Asterisk sees identical `contact` IP for multiple endpoints. | Call routing confusion. | P2 | asterisk |
| AS8 | SIP transport UDP-only, unencrypted. Remote extension (work-from-home) exposes media on public Internet. | Wiretap on the wire. | P2 if no remote ops; P0 if yes | asterisk |

## 6. Client-chats ingestion + pipeline

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| C1 | Meta resends webhook (network blip) → both deliveries reach `processInbound`. Dedup check passes on both before first saves. Fixed via `externalMessageId @unique` + P2002 catch. Verify on live cycles. | Duplicate message in UI and DB. | P1 → Fixed; reverify (finding #20) | chat-backend |
| C2 | Viber webhook arrives with non-UTF8 payload or missing `message` field. Adapter throws → 500 → Viber retries same delivery → loops. `ClientChatWebhookFailure` captures it. | Channel hot loop; failure table grows. | P1 | chat-backend |
| C3 | Signature verification guard rejects a real Meta webhook because backend restart drops rawBody middleware ordering. | Drop of inbound customer messages. | P1 (finding #29, #31) | chat-backend |
| C4 | WhatsApp 24h window lapses → operator tries to send text, Cloud API 400s. UI shows "sent" but message not delivered. | Missed reply. | P1 | chat-backend, frontend-ops |
| C5 | Webhook replay attack: attacker captures old signed payload and resends. Timing windows unknown. | Replay inserts fake messages. | P1 | security-scanner, chat-backend |
| C6 | Escalation cron loop throws on one conversation → remaining stale conversations skipped for that tick. | Delayed escalation warnings. | P2 (finding #23) | chat-backend |
| C7 | `EscalationService.checkEscalations` returns 10k stale conversations (if ever). 10k per-conversation queries/min. | Backend thrash. | P1 (finding #24) | chat-backend, performance |
| C8 | Operator closes conversation during inbound message. Core service path: CLOSED → rewrite externalConversationId + create new thread. If race with simultaneous inbound → two new threads, message assigned to wrong one. | Customer message lands in orphan thread. | P1 (finding #26) | chat-backend |
| C9 | `isBetterName()` accidentally removed or inverted in a PR. Customer display names overwritten with generic fallbacks across the board. | Long-term data corruption. | P2 (finding #21) | chat-backend, code-review |
| C10 | Attachment upload from operator exceeds 10MB limit → multipart fails silently, message lost but UI shows "sent". | Missed reply / wrong UX. | P1 | chat-backend, frontend-ops |
| C11 | Queue-schedule mid-day change doesn't re-fan sockets; operator removed from queue still receives queue events until they refresh. | Wrong assignment. | P2 (finding #25, #34) | chat-backend, realtime |
| C12 | Inbound pipeline order violated by a future PR (e.g. moving autoMatch before saveMessage). FK errors; customer names corrupted. | Silent-until-prod regression. | P1 (finding #27) | chat-backend |

## 7. Realtime / sockets

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| RT1 | Backend restarts during shift. All three gateways lose in-memory state. Clients reconnect but `state:snapshot` only covers telephony. | Dashboards briefly wrong. | P2 (finding #32, #33) | realtime |
| RT2 | WebSocket origin mismatch: `CORS_ORIGINS` missing on backend, browser fails to connect. | No realtime; polling fallback only for chats, nothing for telephony. | P1 (finding #5) | realtime, deployer |
| RT3 | Cookie name mismatch between frontend and backend — socket auth fails. | No realtime; user sees dashboard but no updates. | P1 (CLAUDE.md §silent-overrides) | realtime, deployer |
| RT4 | Floods during AMI storms: every AMI event emits `queue:updated` to all dashboard clients. With 50 operators + 20 managers, message rate saturates browser. | UI freezes; dropped events. | P1 (finding #35) | realtime, performance |
| RT5 | Messenger typing spam (no throttle) — malicious user floods conversation room. | DoS on one conversation. | P2 (finding #38) | realtime |
| RT6 | Client chats dual-emission to `managers` + `queue` / `agent:*` rooms → clients deduplicate on message ID; if frontend dedupe is broken, duplicates. | UX. | P2 (finding #37) | realtime, frontend-ops |

## 8. Recordings / transcripts (evidence in disputes)

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| E1 | Recording path mismatch: `RECORDING_BASE_PATH` on Windows VM doesn't match Asterisk's Linux `/var/spool/asterisk/monitor`. Fetch via SSH required. | "Request Recording" button → 404 or SSH failure. | P1 | telephony-backend, asterisk |
| E2 | SCP fetch fails on retry (network); no exponential backoff. | Recording permanently unavailable. | P2 | telephony-backend |
| E3 | Recording permission scope: `call_recordings.own` vs `.department_tree` vs `.all`. Operator listens to a colleague's call because scope is over-granted. | Privacy breach. | **P1** | rbac, telephony-backend |
| E4 | HTTP Range `/audio` endpoint doesn't set `Content-Length` on 200 → HTML `<audio>` can't show duration. Deprecated method still in codebase. | Bad UX; not a data problem. | P3 | frontend-ops, telephony-backend |
| E5 | Recording filename parsing: `q-804-995599224774-YYYYMMDD-HHMMSS-{linkedid}.{uniqueid}.wav`. If recording arrives with different queue or missing linkedid, parser fails, recording orphaned. | Missing association to CallSession. | P2 | telephony-backend |
| E6 | Recording lifecycle: Asterisk writes file as call starts. If call is < 1s (misdial), `.wav` may be empty. Frontend plays 0-byte file → silence. | Cosmetic. | P3 | frontend-ops |
| E7 | AI transcription via OpenAI Whisper: network error mid-transcribe → review marked FAILED, no retry. Transcript missing for the call. | No evidence for disputes. | P2 | telephony-backend |

## 9. Statistics correctness (manager dashboards)

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| M1 | Total Calls shown = count of CallSession rows. Doubled by T2 (duplicate ingest) or T5 (CDR overlap) = 5–10% inflation. Manager hires more agents, or praises wrong operator. | "Silent 5–10% error" the brief warns about. | **P0** | stats-correctness |
| M2 | Answered count uses `disposition === 'ANSWERED'`. CDR mapping recently fixed (commit fb9ee38) — `NORMAL_CLEARING` no longer auto-maps to ANSWERED. Verify no regression. | Wrong answer rate. | **P0** | stats-correctness |
| M3 | SLA %: `CallMetrics.isSlaMet` computed at call end. If CallMetrics row is missing (FK error during ingest), metric excluded from denominator → SLA % looks higher than reality. | Manager thinks service level is fine. | **P0** | stats-correctness |
| M4 | Avg answer time includes abandoned calls as 0 if not handled carefully — dilutes average. | Understates speed. | P1 | stats-correctness |
| M5 | Agent-breakdown table uses `CallSession.assignedUserId`. For transferred calls, assignedUserId is last owner — earlier operator's contribution invisible. | Unfair agent stats. | **P0** | stats-correctness |
| M6 | Date filtering: `from`/`to` passed as ISO strings. Timezone drift between browser (Tbilisi UTC+4) and backend (UTC?) → a call at 23:50 shows on wrong day. | Daily stats off. | P1 | stats-correctness, frontend-ops |
| M7 | Missed-call count: operator claims and resolves; dashboard counts RESOLVED or not? Unclear semantic. | Wrong missed-call metric. | P1 | stats-correctness |
| M8 | Callback completion rate: if `recordOutboundAttempt` misses the match window (48h) → callback shows "not attempted" even though operator did call. | Under-credits operators. | P1 | stats-correctness, telephony-backend |
| M9 | Live monitor polls every 10s (`REFRESH_INTERVAL_MS`). Between polls, up to 10s of stale state. Manager sees wrong "longest wait". | Cosmetic, but can be jarring. | P2 | realtime, frontend-ops |
| M10 | Chat analytics: `avgFirstResponseMinutes` computed from `firstResponseAt`. If operator replies within seconds but first-response timer didn't set (pipeline bug), metric is null. | Silent exclusion. | P1 | stats-correctness, chat-backend |

## 10. Frontend UX / operator workflow

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| F1 | Modal stack + URL history out of sync after rapid navigation → blank page or wrong modal. | Fragility per CLAUDE.md. | P2 | frontend-ops |
| F2 | `conversation-header.tsx` renders modals inline without `createPortal` — z-index fight with other modals. | Modal behind another modal; operator can't dismiss. | P2 (finding #55) | frontend-ops |
| F3 | ~37 raw `fetch()` calls; at least one in `reply-box.tsx` handles multipart. 401 on that call does not redirect to login. | Operator sees stuck loading state. | P1 (finding #4) | frontend-ops |
| F4 | Inactivity alert in client chats fires at 10 min after operator's last reply. Operator is actively typing but hasn't hit Send → alert fires. | Bad UX. | P2 | frontend-ops |
| F5 | Socket + polling fallback duplicate messages if dedup logic (`prev.some(m => m.id === data.message.id)`) fails on edge case (message ID missing). | Double-display. | P2 | frontend-ops, realtime |
| F6 | Frontend date formatting not locale-aware — Georgian manager sees English month names. | Cosmetic / trust issue. | P3 (finding #57) | frontend-ops |

## 11. Operational / deployment

| # | Scenario | Impact | Severity | Owner |
|---|---|---|---|---|
| O1 | Master merge during Monday morning auto-deploys via GitHub Actions. Deploy shell includes stopping backend → Windows file locks → native modules rebuilt (bcrypt) → fail. Service down until manual intervention. | Call center goes dark. | **P0** (CLAUDE.md §auto-deploy). Freeze deploys for Monday. | deployer |
| O2 | Postgres 17 on VM restarts (patch / system update). Connection pool times out; calls ingestion fails silently. | Ingest gap. | P1 | deployer |
| O3 | `API_BACKEND_URL` missing in frontend prod env → `next.config.ts` crashes on startup (correct behavior). Deploy dashboard says green but app not serving. | Launch silence. | P0 (finding #62) | deployer |
| O4 | `CLIENTCHATS_WEBHOOK_BASE_URL` wrong → Telegram/Viber webhook registration points to old staging host. | Inbound Telegram/Viber messages not delivered. | P1 | deployer |
| O5 | `TELEPHONY_INGEST_SECRET` rotated on backend but AMI bridge not restarted. | Ingest silently 401s → all call data lost. | **P0** (T1) | deployer |
| O6 | Operations dashboard at `/admin/monitor/` is password-protected; password in an env var. If unset or weak, attacker reaches internal monitoring. | Info leak. | P2 | deployer |

---

## Coverage-by-owner matrix (for Phase 1 agent assignment)

| Owner | Findings / scenarios covered |
|---|---|
| **security-scanner** | A2, A3, A4, A5, A7, R2, R6, C5, O6, #1, #2, #3, #4, #7, #8, #9, #13, #14 |
| **rbac** | R1, R2, R3, R4, R6, R7, S6, E3, #6 (data-scope audit), #10 |
| **telephony-backend** | T1, T2, T3, T4, T5, T6, T8, T9, T10, T11, T12, S1, S7, S8, E1, E2, E5, E7, M8, #12, #14, #15, #17, #18 |
| **telephony-softphone** | S2, S3, S4, S5, S6, S9 |
| **asterisk** | AS1–AS8, T2, E1 |
| **chat-backend** | C1–C12, R3, #20, #21, #23, #24, #25, #26, #27, #28, M10 |
| **realtime** | S2, S9, T7, T8, RT1–RT6, M9, #19, #32–#38 |
| **stats-correctness** | R4, T4, M1–M10 |
| **frontend-ops** | F1–F6, M6, M9, C4, C10, E6, #4, #51–#57 |
| **performance** | T4, C7, RT4, #12, #24, #43, #47 |
| **deployer** | T1, O1–O6, #6, #59–#63 |
| **launch-coord** | AS1 (operator registration push), live-shift scheduling, pre-flight script |
| **code-review** | cross-cutting PR reviews before any fix merges |

---

## Acceptance gate for Phase 1

Phase 1 agents produce, per scenario above:
1. **STILL PRESENT / FIXED / NOT APPLICABLE / PARTIAL** verdict
2. File / line reference
3. Reproducible test path (automated test file where possible; else manual repro steps)
4. Severity confirmation or adjustment

Anything verdict **STILL PRESENT @ P0 or P1** enters Phase 4 for fix + regression test. P2 items are prioritized against time budget. P3 goes to `audit/OUT_OF_SCOPE_FINDINGS.md` unless it becomes load-bearing.
