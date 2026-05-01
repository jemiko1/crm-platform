# Current workstream — session handoff brief

> **Purpose:** a single-page, continuously-updated brief so any new session (human or AI) can catch up on what we're doing, what decisions have been made, and what's next — without reading the entire prior conversation.
>
> **Update cadence:** every PR that ships should update the relevant section (usually "Recent PRs shipped"). The "Deferred" and "Open questions" sections are updated when scope changes.
>
> **Last updated:** 2026-05-01 (Claude-context lean-out merged as PR #332; new `/cleanup` slash command for opt-in branch+stash audit in flight)

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
| (next) | `feat(claude): /cleanup command for opt-in branch + stash audit` | 🔨 open, pending review | **Standalone follow-up to PR #332.** Adds a single new slash command `/cleanup` (`.claude/commands/cleanup.md`) for on-demand audit of (a) local branches whose PR is confirmed merged on GitHub, (b) git stashes, (c) local branches with no PR ever (informational). Explicitly NOT auto-invoked — Jemiko runs many parallel Claude Code sessions in this repo, so any auto-cleanup in `/sync` or `/done` could delete a branch another session is working from. The command is fully manual, presents each block with confirmation prompts, never touches current branch / master / worktree-attached branches / remote refs, drops stashes only with per-item or named-batch confirmation, and uses `git branch -d` (not `-D`) so squash-merged branches require explicit force-confirmation. Cheatsheet `docs/CLAUDE_CODE_CHEATSHEET.md` updated to list `/cleanup` in the slash-command table. |
| #332 | `chore(claude): lean-out CLAUDE.md context + dead-config cleanup + auto-mode memory rule` | ✅ merged 2026-05-01 | **Token-efficiency PR.** Cuts CLAUDE.md from 53,736 → 23,798 bytes (~5,900 tokens off every session). **(1)** Moved 33 Silent Override Risk PR-history narratives to new `docs/SILENT_OVERRIDE_RISKS.md`; CLAUDE.md keeps a one-line index — every protection still trips, just leaner. **(2)** Moved Cron Jobs table to `docs/CRON_JOBS.md` and Env vars + Remote Access + VM infra to `docs/ENVIRONMENT.md`; pointers from CLAUDE.md. **(3)** Trimmed Module Boundaries Notes column for non-fragile modules. **(4)** Moved 4 historical `*.md` files (`CURSOR_KNOWLEDGE_DUMP`, `CI_AUDIT`, `ENVIRONMENT_AUDIT`, `LAUNCH_READINESS`) into `docs/historical/`. **(5)** Deleted dead config: `.claude/launch.json` (VS Code, never used) and `.claude/agents/sync-monitor.md` (no frontmatter, never visible in agent picker, overlapped `/bridge`) — both tracked, both deleted via `git rm`. Also removed empty `.mcp.json` and `.cursor/` directory from disk (both were untracked, so they don't appear in this PR's diff but they're gone). **(6)** Removed PostToolUse `agent` hooks that auto-spawned db-reviewer + security-scanner on every Edit/Write only to answer "not applicable" 99% of the time — saves 1.6K-30K tokens per task. The lint-format command hook stays. db-reviewer/security-scanner now invoked manually when relevant per the new auto-mode memory rule. **(7)** New user-level memory `feedback_auto_mode.md` — Claude auto-decides fast vs careful mode based on task content (sacred-area keywords, scope signals); no trigger word required. **(8)** New `docs/CLAUDE_CODE_CHEATSHEET.md` — one-page operating manual for Jemiko. **(9)** Deleted obsolete `project_vm_migration_planned.md` memory file (superseded by `project_vm_migration.md`). All sacred rules preserved: master protection hook stays, full Silent Override Risk index stays in CLAUDE.md, lint-format hook stays. Reviewed by `code-reviewer`. |
| (next) | `fix(telephony): empty recordings + download endpoint (telephony-softphone-bug-fixes)` | 🔨 open, pending review | **Three-part fix on branch `feature/telephony-softphone-bug-fixes`.** (1) **Empty recording bug**: Asterisk fires `MixMonitorStop` for every channel that rings (even unanswered legs), producing 44-byte WAV files with only the RIFF header. Ingestion service now skips `recording_ready` events where `durationSeconds === 0`, and upgrades an existing recording if a longer one arrives for the same session later. Three specific recording rows patched in production DB to point to valid `q-30-` queue recordings (18:34 call → 294KB, 18:39 call → 204KB, 18:33 call → 31KB); valid files SCP'd to `C:\recordings\2026\04\29\`. (2) **Null-level department_tree subordinate bug**: `buildUserFilter()` in `data-scope.ts` used plain `lte` which excludes null-level rows in SQL (NULL <= N = NULL). Fixed with OR clause. `telephony-calls.service.ts` same fix. (3) **Download endpoint**: new `GET /v1/telephony/recordings/:id/download` with `Content-Disposition: attachment` so operators can save recordings. Frontend download icon added to `recording-cell.tsx`. i18n keys added to both locales. 663/663 tests pass; backend+frontend typecheck clean. |
| (next) | `fix(telephony): department_tree scope silently empty when position.level is null (DataScopeService ?? 999 fix)` | 🔨 open, pending review | **Bug:** Anano (call center manager) saw only her own call logs. Two-part root cause: (1) CALL_CENTER_MANAGER role group was missing `call_logs.department_tree` permission — admin must add it via `/admin/role-groups`. (2) Code bug: `DataScopeService.resolve()` defaulted null `position.level` to `0`, making the Prisma filter `position: { level: { lte: 0 } }` return zero employees (latent, would surface the moment the permission was added). Fix: one-line change in `data-scope.ts` (`?? 0` → `?? 999`) + new `data-scope.spec.ts` (8 tests, regression guard for the null-level case) + 2 new `findAll`-scope tests in calls service spec. Affects `department_tree` and `department` scopes in call logs AND recordings (both use `userLevel`). |
| (next) | `feat(telephony): SSO handoff — operators sign in once via web, softphone auto-signs-in via native Allow/Deny dialog (v1.13.0)` | 🔨 open, pending review | **Track C of the 3-PR SSO upgrade plan** (Tracks A=#319 cleanup, A2=#320 threshold-removal, B=#324 auto-rebind all merged; this is the final piece). Operators no longer type credentials into the softphone. After web login, `phone-mismatch-banner.tsx` gets a new `not-logged-in` branch (when bridge is reachable but no operator signed in) showing "Sign in to softphone as [name]". Click → existing `/auth/device-token` (auth-required, `softphone.handshake` gated) mints 30s token → POST to bridge `/switch-user` (already handles "no current session" path) → **native Electron Allow/Deny dialog** with new "Sign in to softphone" wording (for first-time path) vs the existing "user switch" wording (for paired-to-different-user path) → on Allow, bridge redeems via `/auth/exchange-token`, persists session, rotates bridge token, fires `onSessionChanged`. Renderer registers SIP via existing `useAuth`. Also fixed: `connectTelephonySocket` is now wired into the `onSessionChanged` callback in `index.ts:707` so the new operator's softphone joins the backend Socket.IO `agent:${userId}` room and starts receiving `extension:changed` events from PR #324 (was a latent gap — user-switch worked but didn't connect the live event channel). **ZERO new backend endpoints** — the existing handshake-token mechanism is exactly the right primitive. The native dialog is the security boundary (PR #292 audit B9 — Electron sandboxes renderer from main, so a browser XSS cannot programmatically click Allow). New CLAUDE.md Silent Override Risk #32 documents the handoff flow + the strict "do NOT remove the dialog / add skip-dialog flag / add remember-approval option" guardrails. Frontend: 1 new state in `useDesktopPhone.ts`, 1 new banner branch in `phone-mismatch-banner.tsx` (permission-gated by `softphone.handshake`). Softphone: dialog wording updated in `local-server.ts` to differentiate first-time sign-in vs user-switch. Backend typecheck + lint clean, frontend typecheck + production build clean, softphone all builds clean. Reviewed by `code-reviewer`. Softphone stays at 1.13.0 (second feature in the same release). |
| #324 | `feat(telephony): auto-rebind softphone on admin-driven extension change (v1.13.0)` | ✅ merged 2026-04-30 | **Track B of the 3-PR SSO upgrade plan** (Tracks A=#319 cleanup + #320 threshold-removal merged; B=this PR; C=SSO handoff up next). When admin re-links / unlinks / edits / deletes an operator's `TelephonyExtension`, the operator's softphone now picks up the change automatically — no restart, no re-login. Backend gateway gains a public `notifyExtensionChanged(userId, reason)` method; emits `extension:changed` over `/telephony` Socket.IO to the per-user `agent:${userId}` room. Wired in `ExtensionLinkService.link()` / `unlink()` (covers admin actions + employee dismiss/hard-delete chain) and `TelephonyExtensionsController.update()` / `remove()`. Softphone main process adds a persistent `socket.io-client` connection (new `telephony-socket.ts`, JWT in `Authorization` header), connects on login + session-restore, disconnects on logout. Forwards events to renderer via new IPC `EXTENSION_CHANGED`. Renderer's new `useExtensionRebind` hook (App.tsx) handles the rebind: **soft-defers if `sipService.callState !== "idle"`** — listens for state-change to idle, then runs `unregister → 750ms gap → /auth/me refresh → fetch fresh sipPassword → register`. **STRICT INVARIANT: never drops an active call to apply a config change** (memory: feedback_never_terminate_active_call). New IPC `SESSION_REFRESH` exposes runtime `/auth/me` re-fetch as a callable action — reused in PR 3 for SSO handoff. New Silent Override Risk #31 documents the auto-rebind contract + the strict no-drop-call rule. New unit tests in `extension-link.service.spec.ts` verify the gateway emit on link/unlink. Softphone version 1.12.1→1.13.0. Reviewed by `code-reviewer`. |
| #320 | `fix(telephony): remove 50% sanity threshold from asterisk-sync cleanup` | ✅ merged 2026-04-30 | Follow-up to #319. The 50% mass-delete threshold blocked admin's normal workflow (wipe all FreePBX extensions + recreate in bulk). Removed entirely. Cleanup now runs unconditionally when stale rows exist, gated only by the existing "skip cleanup if AMI fetch failed" early-return. Updated Risk #30 to reflect the simpler design + added "Do NOT add a mass-delete threshold back" guidance. Threshold-bail unit test replaced with a "trust mass-delete" test (4 of 5 rows). Reviewed by `code-reviewer`. |
| #319 | `fix(telephony): asterisk-sync hard-deletes CRM extensions removed from FreePBX` | ✅ merged 2026-04-30 | **Closes the "ghost extensions" gap.** Before this fix, the asterisk-sync cron at `asterisk-sync.service.ts:syncExtensions()` was strictly additive — it created/updated CRM `TelephonyExtension` rows from FreePBX endpoints but never removed CRM rows whose extension had disappeared from FreePBX. Result: admin deletes ext 200 in FreePBX GUI, CRM admin Telephony Extensions page still shows 200 forever, can offer to link an operator to a non-existent extension. **Fix:** new cleanup pass after the add/update loop hard-deletes any CRM row whose `extension` is not in the live FreePBX endpoint set. Hard-delete is correct because every history table (`CallSession.assignedExtension`, `CallLeg.extension`, `OperatorBreakSession.extension`) stores the extension as a string snapshot, not a FK — stats and reports attribute through `assignedUserId`, so deleting the TelephonyExtension row preserves zero history loss. Resurrection is automatic: if FreePBX recreates the same number, the existing add/update branch produces a fresh CRM row on the next sync. New Silent Override Risk #30 added. 4 new unit tests. Backend-only; no schema change, no UI change, no softphone version bump. Reviewed by `code-reviewer`. _(Originally shipped with a 50% mass-delete sanity threshold; threshold removed in follow-up PR — see entry above.)_ |
| #308 | `feat(softphone): v1.12.1 — pin FreePBX cert by SPKI hash` | ✅ merged 2026-04-28 | **Permanent fix for the 2026-04-28 outage.** New `crm-phone/src/main/pbx-cert-pin.ts` registers an Electron `setCertificateVerifyProc` that trusts only one SPKI SHA-256 hash (`M29AQslp5wqLwEeH+qT9tYanHwDxvuRk9n/5q5pQyw8=`) at `pbx.asg.ge` / `5.10.34.153`; everything else (CRM web app, GitHub auto-updater, OpenAI quality reviews) goes through Chromium's default verifier unchanged. **This is materially different from PR #292's bypass** (which trusted any cert at any host) — see new Silent Override Risk #29 + `docs/SOFTPHONE_CERT_PINNING.md` rotation procedure. Pinned cert is FreePBX's `/etc/asterisk/keys/integration/certificate.pem`, valid until 2036-02-28 → ~10 years of zero ops cost. Pinning the SPKI rather than the full cert means cert re-issuance using the same key (FreePBX "renew" without rotating keypair) keeps softphones working with no rebuild — only an actual keypair rotation requires a softphone release. **Replaces** the public-CA-via-acme.sh DNS-01 approach that PR #307 documented (asg.ge has no DNS API + PBX network blocks LE HTTP-01 = manual renewal every ~60 days, exactly the burden we're eliminating). PR #307 closed in favor of this PR; the still-useful `docs/FREEPBX_EXTENSION_GUIDE.md` (canonical extension settings — "Enable WebRTC defaults: No" is counterintuitive but correct) is folded in here. Version bump 1.12.0→1.12.1. Reviewed by `code-reviewer` + `security-scanner` — both approved as standard cert-pinning pattern. |
| #304 | `feat(softphone): v1.12.0 — Staff directory tab + DND in Settings + UI refine` | ✅ merged 2026-04-27 | Four UI changes per founder review of mariam.malichava@asg.ge's softphone: **(1)** Extension number merged into the status pill (was a separate row above the dialpad) — pill now reads `● Ext 214 · Available` / `· Offline` / `· In Call`. **(2)** Title bar now shows `CRM28 — 214 — mariam.malichava@asg.ge` so operators can verify correct sign-in at a glance. **(3)** DND moved from the footer tab into Settings under a new "Availability" section; the red "DND Active" badge still appears next to the status pill so the active state stays visible without opening Settings. **(4)** New "Staff" footer tab replaces DND — exposes a directory of all active employees with extension + personal phone, search by name/phone/ext, grouping by department, and a Favorites sub-tab with star pin/unpin (favorites persist locally via `electron-store`, no backend sync). Backend: new `GET /v1/telephony/directory` endpoint protected by `softphone.handshake` permission (overrides the class-level `call_center.menu` so non-softphone users granted call-center menu access don't get every employee's email + personal phone). Bug fixes during the build: SettingsPage scroll wheel was eaten by the Electron drag region — fix is `flex: 1 1 0` + `minHeight: 0` + `tabIndex={-1}` on the content scroller. Dev override: `getCrmBaseUrl()` now reads `process.env.CRM_BASE_URL` on every call (was: stored-only after first install) so `CRM_BASE_URL=http://localhost:3001 pnpm start` actually points the softphone at a non-default backend; production builds never set this env var. Version bump 1.11.1→1.12.0. |
| #298 | `feat(telephony): queue-member MariaDB sync (replaces AMI queue-sync from #296)` | ✅ merged 2026-04-27 | **Field-reported bug:** admin clicked "Apply Config" in FreePBX GUI → CRM-added queue members vanished. Root cause: PRs #296-#297 used AMI `QueueAdd`/`QueueRemove`, which affect runtime only; Apply Config regenerates `queues.conf` from MariaDB `queues_details` and wipes runtime members. **Fix:** `ExtensionLinkService` now writes directly to `queues_details` via a narrow SSH helper `/usr/local/sbin/crm-queue-member` (INSERT IGNORE / exact-match DELETE + `fwconsole reload`). CRM-added rows now appear in the FreePBX GUI Queues page and survive Apply Config. Admin-customized rows (different penalty) are invisible to CRM and survive unlink — admin always wins. FreePBX REST/GraphQL API is read-only for queue members (verified live against v15.0.3.7 `api` module); MariaDB is the only programmatic write path. New `PbxQueueMemberClient` (child_process→ssh). Kill-switch `TELEPHONY_AUTO_QUEUE_SYNC` preserved (now disables SSH path instead of AMI). Silent Override Risk #28 added. 14 new unit tests; 632/632 pass. Full doc sweep: `TELEPHONY_EXTENSION_MANAGEMENT.md` rewritten, `CLAUDE.md` module-boundary + env-vars updated. |
| #297 | `feat(employees): auto-unlink telephony extension on dismissal / hard-delete` | ✅ merged 2026-04-24 | `EmployeesService.dismiss()` / `hardDelete()` now call `ExtensionLinkService.unlink()` before their transactions — emits queue-remove + returns extension to pool. Logs-and-swallows PBX failures (HR dismissal never blocked). Call-site ordering test guards the pre-transaction invariant. 632/632. |
| #296 | `feat(telephony): extension link/unlink with AMI queue sync + kill-switch` | ✅ merged 2026-04-24 | **(Superseded by queue-member-mariadb-sync PR above)** Shipped `ExtensionLinkService` with AMI QueueAdd/QueueRemove, link/unlink/resync-queues endpoints, `TELEPHONY_AUTO_QUEUE_SYNC` kill-switch, race-guarded `updateMany`, admin UI rewrite (pool-centric, Link/Unlink/Resync actions), pre-deploy snapshot script, tag `pre-link-feature-20260424`. Worked correctly but AMI path couldn't coexist with admin's FreePBX GUI workflow — see supersession PR. |
| #295 | `feat(telephony): admin page for Position→Queue rules` | ✅ merged 2026-04-24 | Matrix UI at `/app/admin/position-queue-rules`. Positions × queues checkboxes, idempotent upsert/deleteMany toggles, i18n en+ka. Rules take effect on next link/unlink (not retroactive — deliberate). |
| #294 | `feat(telephony): extension pool model — foundation` | ✅ merged 2026-04-24 | Schema: `TelephonyExtension.crmUserId` nullable, FK `onDelete: SetNull`, new `PositionQueueRule` join table (Position × TelephonyQueue). Callsite fixes for nullable `crmUserId` across state-manager / presence / live / ingestion / calls / sync. Regression test excludes pool rows from live roster. Removed hardcoded "Call Center Operator" check. |
| #293 | `fix(telephony): outbound call attribution + softphone identity banner (v1.11.1)` | ✅ merged 2026-04-23 | Two fixes from field report after PR #290 merge: **(1)** Outbound calls were invisible to operators in Call Logs — only superadmin saw them. Root cause: Asterisk's `AgentConnect` AMI event only fires for queue-answered calls; outbound never goes through a queue → `handleAgentConnect` never runs → `CallSession.assignedUserId` stays NULL forever → `call_logs.own` scope filters them out. Fix in `telephony-ingestion.service.ts::handleCallStart`: for OUT direction, look up `TelephonyExtension` by `callerNumber` (originating operator extension), set `assignedUserId`/`assignedExtension`, create AGENT `CallLeg`. `handleCallAnswer` patches that leg's `answerAt` (scoped to direction=OUT, userId=assignedUserId to avoid cross-pollinating multi-leg sessions). `handleAgentConnect` closes any stale outbound-created leg before inserting a different-agent leg — prevents `touched` double-count on transfers. Backfilled 41 historical OUT calls on production. Silent Override Risk #27 added. **(2)** Softphone title bar now shows `CRM28 · Ext 214 · user@asg.ge` after SIP registration so operators can verify correct login. Version bump 1.11.0→1.11.1. |
| #290 | `feat(softphone): v1.11.0 — Glass UI polish + SIP collision guard + phone lookup fix` | ✅ merged 2026-04-22 | Merged. |
| (next) | `fix(telephony): normalize phone lookup in history + guard short-digit inputs` | 🔨 open, pending review | Two bugs in `TelephonyCallsService`. (1) `getExtensionHistory` did exact-match client lookup (`primaryPhone IN [...]`), so CDR `995555123456` never matched client stored as `0555123456`. Now normalizes via `PhoneResolverService.localDigits()` and uses the same `contains` query the popup uses. (2) `lookupPhone('214')` ran a 3-digit `contains` query against client phones → false-positive matches (`214` matched any phone containing "214"). Now inputs <7 digits only query `TelephonyExtension` by exact `extension` and return either `{ employee }` or empty result. Added `employee` field to `CallerLookupResult`. 4 new unit tests; 609/609 pass. |
| (prev) | `fix(telephony): call-logs Cache-Control no-store + visible fetch errors` | 🔨 open, pending review | Root cause of field report "call logs missing in admin + operator views": Express's default `etag: weak` was re-hashing the `/v1/telephony/calls` response; browser's first load hit the endpoint before calls existed, cached the empty body, and every reload after that returned `304 Not Modified` with the stale empty body. Fix: `@Header('Cache-Control', 'no-store')` on all live list endpoints in `TelephonyCallsController` + `MissedCallsController`. Also: `CallLogsPage` now renders a red error banner on fetch failure instead of the old silent `catch {}` that blanked the table. New Silent Override Risk #23 documents the ETag trap. |
| #285 | `fix(softphone): v1.10.2 — DND visibility + layout fixes + design mockups` | ✅ merged 2026-04-21 | Added dlog/derr helpers writing to both devtools console AND main-process log file. Defensive preload checks. Visible `dndError` banner in footer. Break modal shrunk for min-size windows. PhonePage middle region now scrolls so footer stays pinned during calls. Shipped design mockups HTML with 4 directions (Focus / Glass / Command / Warm) — user picked Glass. |
| (next-this-release) | `feat(softphone): v1.11.0 — Glass UI polish + SIP collision guard + dev-icon fix` | 🔨 open, building installer | Shipped the full Glass-UI redesign (pill chips, radial glow background, compact caller card, redesigned history with per-direction color, footer/header shadows, clear DND indicator, voice wave during connected call, timer gated to `connected`, disabled "Create Report" until connected, dialpad backspace no-layout-shift, Windows-native single close-button that minimizes to taskbar). Plus **Fix #3 / collision guard**: `SipService.handleIncoming()` now responds `486 Busy Here` to any incoming INVITE while `currentSession` is active — field symptom was a queue call hijacking the operator's outbound mid-dial. Silent Override Risk #24 documents it. Dev-mode taskbar-icon workaround (`tools/rcedit-x64.exe`, `tools/create-dev-shortcut.ps1`, `postinstall` script re-stamping `electron.exe` after every `pnpm install`) so pinning in dev no longer shows the Electron atom. |
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
2. ~~**Extension / queue / operator management model.**~~ **Resolved April 2026 in PRs #294-#297 + queue-member-mariadb-sync.** Pool model with nullable `crmUserId` + `PositionQueueRule` + admin UI + MariaDB write path. FreePBX is source of truth; CRM owns the employee↔extension mapping. See `docs/TELEPHONY_EXTENSION_MANAGEMENT.md` for the full picture. **Still deferred:** tightening SSH-to-PBX from `root` to a dedicated `crm-sync` user with narrow sudoers (principle of least privilege).
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
