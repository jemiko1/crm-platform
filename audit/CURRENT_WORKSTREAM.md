# Current workstream — session handoff brief

> **Purpose:** a single-page, continuously-updated brief so any new session (human or AI) can catch up on what we're doing, what decisions have been made, and what's next — without reading the entire prior conversation.
>
> **Update cadence:** every PR that ships should update the relevant section (usually "Recent PRs shipped"). The "Deferred" and "Open questions" sections are updated when scope changes.
>
> **Last updated:** 2026-04-21 (after PR #278 merged)

---

## Snapshot

- **Project:** CRM28 (Georgian property-management CRM, crm28.asg.ge).
- **Current phase:** Post-Monday-launch feature work. Call-center + client-chats module hardening based on audit + founder's priorities.
- **Founder is alone** testing the system — requires automated harnesses for multi-role scenarios where possible.
- **Production state:** stable. 50-operator launch happened. Live traffic. Most deploys happen during business hours; keep PRs small + additive where possible.

---

## Workflow (enforced — read before shipping)

For every PR:
1. Build the change
2. `pnpm typecheck` on backend + frontend — zero errors. If you see errors in `agent-presence.service.ts` / `telephony-live.service.ts` about `sipRegistered`/`sipLastSeenAt`, the Prisma client is stale — run `npx prisma generate` (these fields DO exist in the schema).
3. Run affected unit tests — all pass
4. **Update docs in the SAME branch** — any doc whose scope your change touches:
   - `CLAUDE.md` — Silent Override Risks, business rules, module boundaries
   - `API_ROUTE_MAP.md` — endpoint, request/response, guard, socket event changes
   - `DATABASE_SCHEMA.md` — schema (models, columns, enums, seeds, migrations)
   - `FRONTEND_ROUTE_MAP.md` — pages added, routes moved, major components
   - `DEVELOPMENT_GUIDELINES.md` — coding pattern changes (rare)
   - `docs/TELEPHONY_INTEGRATION.md` — softphone, Asterisk, AMI behavior
   - `docs/AMI_BRIDGE.md` — AMI bridge (separate process) changes
   - `docs/CORE_INTEGRATION.md` — core MySQL sync bridge changes
   - `docs/TESTING.md` — new test tooling or manual test plan
   - `docs/LOCAL_DEVELOPMENT.md` — new local dev requirements
   - `docs/BRIDGE_MONITOR.md` — bridge monitor changes
   - `docs/DESIGN_SYSTEM.md` — design-token changes
   - `audit/CURRENT_WORKSTREAM.md` (this file) — **ALWAYS**, under "Recent PRs shipped"
5. Run **code-reviewer** agent against the branch (per user's enforced rule)
6. Run **db-reviewer** if migrations or schema changes
7. Address findings
8. Push + open PR — mention doc updates in PR body
9. On user's "merged" signal: update this doc's "Recent PRs shipped" table to mark as merged

---

## Recent PRs shipped (chronological, most recent first)

| PR | Title | State | Key outcome |
|---|---|---|---|
| (next) | `fix(telephony): call-logs Cache-Control no-store + visible fetch errors` | 🔨 open, pending review | Root cause of field report "call logs missing in admin + operator views": Express's default `etag: weak` was re-hashing the `/v1/telephony/calls` response; browser's first load hit the endpoint before calls existed, cached the empty body, and every reload after that returned `304 Not Modified` with the stale empty body. Fix: `@Header('Cache-Control', 'no-store')` on all live list endpoints in `TelephonyCallsController` + `MissedCallsController`. Also: `CallLogsPage` now renders a red error banner on fetch failure instead of the old silent `catch {}` that blanked the table. New Silent Override Risk #23 documents the ETag trap. |
| #285 | `fix(softphone): v1.10.2 — DND visibility + layout fixes + design mockups` | ✅ merged 2026-04-21 | Added dlog/derr helpers writing to both devtools console AND main-process log file. Defensive preload checks. Visible `dndError` banner in footer. Break modal shrunk for min-size windows. PhonePage middle region now scrolls so footer stays pinned during calls. Shipped design mockups HTML with 4 directions (Focus / Glass / Command / Warm) — user picked Glass. |
| (next-next) | `feat(softphone): v1.11.0 — Glass UI polish` | 🔨 planned | Full refactor of softphone CSS to match the "Glass" direction: dark slate + cyan/purple radial glows, backdrop-blur cards, pill-shaped status chips, gradient call button. |
| #284 | `fix(softphone): v1.10.1 — auto-updater retry crash (pnpm hoist + override)` | ✅ merged 2026-04-21 | Hotfix for `Update error: (0, builder_util_runtime_1.retry) is not a function`. Root cause: pnpm let `builder-util-runtime@9.2.4` (from electron-builder) hoist over `electron-updater@6.8.3`'s required `9.5.1`. Fix: `.npmrc` with `shamefully-hoist=true` + `pnpm.overrides` pinning `builder-util-runtime: 9.5.1`. Silent Override Risk #22 documents all four load-bearing levers. |
| #283 | `feat(softphone): v1.10.0 — Break modal + DND toggle + installer` | ✅ merged 2026-04-21 | Electron softphone v1.10.0. Break button in footer → backend POST → SIP unregister → fullscreen countdown modal with Resume. DND toggle in status bar flips AMI `QueuePause` without touching SIP. Cold-start restoration: on app launch queries `/breaks/my-current` + `/dnd/my-state` to sync both states. 6 new IPC channels + 2 new hooks (`useBreak`, `useDnd`). Code-reviewer findings addressed pre-push: cold-start race (W1), repeat-click logout (W2), error log leakage (W3), DND a11y (I2). Uploaded to VM + GitHub release published. **Known bug**: auto-update crashes on retry, fixed by follow-up v1.10.1. |
| #282 | `feat(ui): Break + DND manager UI — Breaks tab + live socket events` | ✅ merged 2026-04-21 | New `/app/call-center/breaks` page with live-on-break list (1s ticker) + paginated history with system-ended vs operator-ended chips. `operator:break:started/:ended` socket events emitted from `OperatorBreakService` → `TelephonyGateway` → `dashboard` + `agent:<id>` rooms. Callback pattern mirrors `AgentPresenceService.onStaleFlipped`. i18n en + ka keys added; date/duration formatters now respect `language` (ka-GE + `სთ/წთ/წმ` units). 25 unit tests (7 new callback tests + 1 race-guard no-emit). Reviewer findings addressed pre-push: socket URL `WS_BASE` blocker, 2× i18n criticals (hardcoded `en-GB` + `h/m/s` suffixes), `call_center.manage` doc drift. |
| #281 | `feat(telephony): DND feature backend — service + controller + logout hook` | ✅ merged 2026-04-21 | `OperatorDndService` wraps AMI `QueuePause` (no Queue field → all queues). No DB column. Three operator-own endpoints at `/v1/telephony/dnd/*`. Auto-disable on logout via best-effort cookie/JWT verify. 12 unit tests. |
| #280 | `feat(telephony): Break feature backend — model + service + controller + cron + tests` | ✅ merged 2026-04-21 | New `OperatorBreakSession` model + migration + partial unique index. `OperatorBreakService` with start/end/history/auto-close. Cron every 30 min closes breaks at `COMPANY_WORK_END_HOUR` (default 19) + 12h hard cap. 18 unit tests. |
| #279 | `docs: session-continuity brief + sync stale docs after PRs #275-#278` | ✅ merged 2026-04-21 | New `audit/CURRENT_WORKSTREAM.md`. Strengthened CLAUDE.md workflow — docs updated in same PR; code-reviewer before push. |
| #278 | `feat(telephony): non-working-hours missed calls + reason filter` | ✅ merged 2026-04-21 | Queue 40 (non-working-hours queue) now correctly tags MissedCall with `reason=OUT_OF_HOURS`. New "After Hours" filter chip in missed calls UI. Added `isAfterHoursQueue` stickiness on sync. Silent Override Risk #18 added to CLAUDE.md. |
| #277 | `test(clientchats): automated scenario runner for multi-role flows` | ✅ merged 2026-04-21 | `scripts/clientchats-scenario-runner.ts` — 5 scenarios, ~10-12 min full run. Validates PRs #275 + #276 fixes. Code-reviewer caught 4 criticals + 2 cascading bugs pre-push. |
| #276 | `feat(clientchats): silence-after-first-reply escalation + admin config UI` | ✅ merged 2026-04-21 | Q1 decision B. After operator sends first reply, each new customer message starts a silence clock. 2 new admin-panel threshold fields. Stale-guarded `updateMany` in `$transaction` closes reply-during-scan race. Dedup scoped to current operator. |
| #275 | `fix(clientchats): P0 analytics correctness — A1/A2/A3 + AUTO_UNASSIGN rename` | ✅ merged 2026-04-21 | **A1** — `[Chat started]` widget placeholder no longer inflates first-response time. **A2** — manager `assignConversation` stamps `joinedAt`. **A3** — `approveReopen` clears `firstResponseAt + joinedAt`. Plus event rename `AUTO_REASSIGN` → `AUTO_UNASSIGN`. |
| #274 | `feat(clientchats): surface WhatsApp webhook freshness in admin panel` | ✅ merged 2026-04-20 | Admin panel shows last-inbound timestamp + "stale" warning. Prevents invisible webhook URL drift (root cause of the April 2-20 WhatsApp outage). |
| #273 | `fix(telephony): call recording SCP hangs on Windows (504 timeout)` | ✅ merged 2026-04-20 | `/dev/null` in scp args silently hung Windows OpenSSH. Removed the option. Recording playback restored. |
| #272 | `docs(audit): Phase 3 live-rehearsal runbook` | ✅ merged 2026-04-20 | 3-loop rehearsal plan for Sunday night / Monday morning. |
| #271 | `test(telephony): Phase 2 ingest regressions + concurrent stress tool` | ✅ merged 2026-04-20 | M7 replay regression test + `scripts/stress-ami-ingest.ts`. |
| #270 | `docs(audit): Monday-morning admin cheat-sheet (tactical ref)` | ✅ merged 2026-04-20 | `audit/MONDAY_ADMIN_CHEATSHEET.md` — symptom→fix table + emergency SQL. |
| #269 | `docs: sync all docs with telephony audit (PRs #249-#268)` | ✅ merged 2026-04-20 | 9 docs updated to reflect audit-era architecture. |
| #268 | `fix(scripts): make monday-morning-preflight portable across Windows SSH` | ✅ merged 2026-04-20 | 18-step preflight now actually runs on Git Bash for Windows. |
| #267 | `chore(deploy): seed system lists on every deploy` | ✅ merged 2026-04-19 | `seed-system-lists.ts` now runs in `.github/workflows/deploy-vm.yml`. |
| #249-#266 | Audit-era PRs (security, stats, RBAC, softphone v1.9.0) | ✅ all merged 2026-04-18/19 | See `audit/PHASE1_SUMMARY.md` for full breakdown. |

---

## In-flight work

| Branch | What | State |
|---|---|---|
| *(none currently in flight)* | — | — |

---

## Upcoming PRs (planned, ordered)

1. **Break feature backend** — `OperatorBreakSession` model + service + controller + cron + tests. Emits Socket.IO events for manager live monitor.
2. **DND feature backend** — `/v1/telephony/dnd/*` endpoints. Uses AMI `QueuePause` action to skip operator in queue without unregistering. Auto-off on logout.
3. **Break + DND manager UI** — new "Breaks" tab in `/app/call-center/` + badges on live monitor (on-break yellow, DND blue). Depends on backend PRs merged.
4. **Softphone v1.10.0** — Break button + DND toggle + countdown modal + disabled-state UX. Electron installer rebuild. Depends on backend PRs merged.
5. **Permission refactor** — 30+ → 13 permissions (`softphone.use`, `softphone.outbound_external`, `call_center.queue_handle`, `missed_calls.handle`, `call_logs.own`, `call_logs.department_tree`, `call_recordings`, `call_center.manage`, `telephony.admin`, `client_chats.access`, `client_chats.view_tree`, `client_chats.manage`, `client_chats.admin`). Includes migration to convert existing RoleGroup assignments + backend guard updates + frontend permission-check updates.
6. **Queue reconfig 804→30 + tracked queues setting** — small update to preflight script + backend CDR filter + admin SystemSetting for tracked queue list.

---

## Business decisions (made — for reference)

### Telephony / Call center

- **Break feature:** operator-only, unregisters softphone, no manager force-end, no max duration per session, auto-close at 19:00 (configurable via env `COMPANY_WORK_END_HOUR`), hard cap 12h since startedAt. No break types (V1). "Correct logging + manager dashboard" is the control mechanism.
- **DND feature:** separate from Break. Operator-toggled. Keeps softphone registered but blocked from queue dispatch (via AMI `QueuePause`). Direct extension-to-extension calls still ring. Auto-off on logout.
- **Break button during active call:** disabled (user must end call first).
- **Direct calls during Break:** softphone is unregistered → caller sees "unreachable" (not voicemail).
- **Outbound during DND:** logs normally, no special tagging.
- **Queue numbering:** Queue 30 = main work-hours queue. Queue 40 = non-working-hours queue (holiday IVR + after-hours). Other queues (800-804, default, etc.) are for projects/testing — excluded from CRM analytics via the tracked-queues setting (see upcoming PR #6).
- **Non-working-hours missed calls:** tagged `OUT_OF_HOURS`, appear in the centralized missed-calls tab for all operators to work. Already implemented in PR #278.

### Client-chats

- **Silence-after-first-reply escalation:** Q1 decision B. Measure from customer's latest IN to operator's next OUT. Same warn/unassign structure as first-response. All thresholds configurable in admin panel. Implemented in PR #276.
- **Operator pause:** per-conversation only. No full operator pause. (Q3 decision A.)
- **Reopened conversation routing:** goes back to queue, not original operator. (Q4 decision C.)
- **Queue operating hours:** deferred to the work-hours system (see Deferred #1). For now, 24/7 whenever someone's on today's schedule.
- **Customer message flood:** no backend rate limit. Match Bitrix24: save all messages, UI coalesces visually. Deferred.
- **Auto-reassign on escalation:** event renamed `AUTO_UNASSIGN` (option A). Returns conversation to queue for manual pickup — no round-robin auto-assignment.
- **Permissions enforcement:** fine-grained permissions currently defined but not enforced. Will be enforced as part of the permission refactor PR (#5 upcoming).
- **ClientChatQueueSchedule:** kept empty intentionally. Manual queue management for now.

### Permission model (TARGET after refactor — not yet shipped)

> ⚠ The current production permissions are NOT this set yet. The permission-refactor PR is upcoming item #5 in "Upcoming PRs". Today the codebase uses the pre-refactor names (e.g. `missed_calls.access` + `missed_calls.manage` separately, fine-grained `client_chats.reply/.change_status/.send_media/...`). Do NOT use the names below in new backend guards until the refactor ships.

Target model after refactor (13 permissions):

| Permission | Grants |
|---|---|
| `softphone.use` | Register softphone, receive calls, dial internal extensions |
| `softphone.outbound_external` | Dial external (PSTN) numbers |
| `call_center.queue_handle` | Auto-join queue 30 (work-hours queue) |
| `missed_calls.handle` | See + act on centralized missed calls (team-based, not scoped). Will merge current `.access` + `.manage`. |
| `call_logs.own` | See own call logs (metadata only) |
| `call_logs.department_tree` | See dept + sub-dept logs (metadata only) |
| `call_recordings` | Playback/download recordings for whatever logs you can see |
| `call_center.manage` | Live monitor, stats, analytics, assignment |
| `telephony.admin` | Extension CRUD, queue config |
| `client_chats.access` | Operator bundle (reply, media, templates, canned, status, link). Will merge 7+ current perms. |
| `client_chats.view_tree` | See dept + sub-dept conversations |
| `client_chats.manage` | Queue/SLA/assign/pause/reopen/analytics |
| `client_chats.admin` | Channel tokens, delete conversations |

**`call_recordings` is capability, `call_logs.*` is scope** — both required to play audio. See `audit/MONDAY_ADMIN_CHEATSHEET.md` for role mappings (which also currently documents the TODAY permissions, not post-refactor).

**Current production permission names** (for writing guards today):
`missed_calls.access`, `missed_calls.manage`, `client_chats.menu`, `client_chats.reply`, `client_chats.change_status`, `client_chats.link_client`, `client_chats.send_media`, `client_chats.send_template`, `client_chats.use_canned`, `client_chats.manage`, `client_chats.view_analytics`, `client_chats.manage_canned`, `client_chats.delete`, `client_chats_config.access`, `call_logs.own`, `call_logs.department`, `call_logs.department_tree`, `call_recordings.own`, `call_recordings.department`, `call_recordings.department_tree`, `call_center.menu`, `call_center.live`, `call_center.statistics`, `call_center.quality`, `call_center.reports`, `softphone.handshake`, `telephony.call`, `telephony.menu`, `telephony.manage`. See `backend/crm-backend/prisma/seed-permissions.ts` for the canonical list.

---

## Deferred work (with triggers)

1. **Work hours / check-in-out / break-types / WTR system.** Deferred per user. Current break feature is a targeted subset. Revisit when user returns with check-in/out design. Standard business hours for now: 10:00-19:00 every day.
2. **Extension / queue / operator management model.** How extensions are provisioned (CRM vs Asterisk source-of-truth), static vs dynamic queue membership, lifecycle events (hire → extension → queue; dismissal → cleanup). Founder needs picture before committing. Revisit after permission refactor + queue reconfig PRs.
3. **Analytics caching / materialized views.** Current scale (100-200 chats/day) doesn't need it. Revisit at ~1k/day. Monitor via slow-query alert if a dashboard load ever > 2s.
4. **Bitrix24-style message flood coalescing.** Not seen in production. Defer until actual flood happens.
5. **Playwright browser tests.** Deferred per user — 200MB+ browser install two days before launch was too much surface. Revisit week of April 27+ for the 5-6 flows that matter (login → click-to-call, manager live monitor, softphone mismatch banner).
6. **`[SIP-R] re-register` log noise suppression.** Cosmetic only (guard in PR #254 made it harmless). Do while touching softphone for other reasons.
7. **CI wiring for e2e tests.** The new `test/telephony-ingest.e2e-spec.ts` (PR #271) runs manually. Add to `.github/workflows/ci.yml` as a separate job with Postgres service container when time permits.

---

## Open questions (need user input when work resumes)

*(none currently — all business decisions needed for upcoming PRs are resolved)*

---

## Follow-ups / tech debt (not blocking)

1. ~~24 pre-existing TypeScript errors~~ — **RESOLVED.** The errors were stale Prisma client artifacts. Running `npx prisma generate` produces a clean typecheck on both master and feature branches. No code issue. (Verified during break-feature-backend PR.)
2. **`frontend-followup-P1-6.md`** — Chat bubble should render a red "failed to deliver" badge below messages where `deliveryStatus !== 'SENT'`. Added as TODO in `clientchats-core.service.ts:585`. Medium priority.
3. **Frontend `AUTO_REASSIGN` string leftover.** PR #275 renamed the backend event type to `AUTO_UNASSIGN`, and PR #276 extended the manager-dashboard ladder to cover both, but the socket payload STILL uses `escalation:reassign` as the event name (per comment in `escalation.service.ts:229`). Safe as-is, but inconsistent with type rename. Rename when touching the socket layer for other reasons.
4. **Frontend hardening for scenario runner failures.** If the scenario runner's `finally` in scenario 4 fails to restore SLA config (backend mid-deploy), the warning is logged but the DB has the test thresholds baked in. Manual check required post-run. Minor — don't run scenario 4 during deploy windows.

---

## Known production facts (verified during audit)

| Fact | Where | Verified |
|---|---|---|
| Queue 30 = main work-hours queue | Asterisk config | 2026-04-21 |
| Queue 40 = non-working-hours queue | Asterisk config | 2026-04-21 |
| Queue 40 `isAfterHoursQueue=true` in DB | Set by PR #278 migration | 2026-04-21 |
| VM `.env` has `AFTER_HOURS_QUEUES=40,nowork` | VM backend env | 2026-04-21 |
| SIP trunk `1055267e1-Active-NoWorkAlamex` registered with 89.150.1.11 | preflight step 9 | 2026-04-20 |
| PM2 processes on VM: `crm-backend`, `crm-frontend`, `ami-bridge`, `core-sync-bridge`, `crm-monitor` | `pm2 status` | 2026-04-21 |
| Production RoleGroup codes: `ADMINISTRATOR`, `CALL_CENTER`, `CALL_CENTER_MANAGER`, `IT_TESTING`, `READ_ONLY` | DB + CLAUDE.md | 2026-04-21 |

---

## Links

- `CLAUDE.md` — project context + workflow rules + module boundaries
- `audit/MONDAY_ADMIN_CHEATSHEET.md` — tactical reference (symptom→fix, emergency SQL)
- `audit/MONDAY_ADMIN_UI_SETUP.md` — RoleGroup permission setup walkthrough
- `audit/PHASE3_REHEARSAL_RUNBOOK.md` — live-call rehearsal plan
- `audit/ROLLBACK.md` — roll-back steps for audit PRs
- `audit/STATS_STANDARDS.md` — M3/M5/M7 decisions
- `docs/TELEPHONY_INTEGRATION.md` — softphone + Asterisk + AMI bridge architecture
- `docs/TESTING.md` — test suites + scenario runner + stress tool + preflight
- `scripts/monday-morning-preflight.sh` — 18-check production readiness
- `scripts/stress-ami-ingest.ts` — concurrent AMI ingest load test
- `scripts/clientchats-scenario-runner.ts` — multi-role chat scenarios
