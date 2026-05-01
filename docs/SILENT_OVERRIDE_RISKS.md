# Silent Override Risks — Full Narratives

> **CLAUDE.md** holds the one-line index of every risk. This file holds the PR-history rationale and field symptoms for each one. Read on demand — not on every session start.
>
> **Index numbers below match CLAUDE.md.** Update both when adding a new risk.

---

## 0. ⛔ Core MySQL is READ-ONLY

The core database at `192.168.65.97:3306` must NEVER be written to. All queries must be non-locking SELECTs. Use `SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` on every connection. Never use `FOR UPDATE`, `LOCK IN SHARE MODE`, or any write statement. This database serves multiple critical production applications.

## 1. JWT secret fallback

`JWT_SECRET` is required, app crashes if missing. Ensure no hardcoded default exists anywhere.

## 2. Telephony ingest secret sync

`TELEPHONY_INGEST_SECRET` must match between VM backend env and AMI Bridge env (both on same VM). Changing one without the other silently breaks telephony ingestion.

## 2b. Core webhook secret sync

`CRM_WEBHOOK_SECRET` on the bridge must match `CORE_WEBHOOK_SECRET` on VM backend. Changing one without the other silently breaks core sync.

## 3. Hardcoded cookie names

All gateways (telephony + messenger) use `COOKIE_NAME` env var for cookie extraction. Frontend and backend must agree.

## 4. Prisma enum migration behavior

PostgreSQL CANNOT use a new enum value in the same transaction that adds it. If migration fails with "unsafe use of new value", either use fresh DB or apply `ALTER TYPE` manually outside transaction, then `npx prisma migrate resolve --applied <name>`. Always check existing data before enum changes.

## 5. AMI Bridge buffer risks under load

AMI event relay runs on same VM as CRM backend under PM2. High call volume can cause event buffering/loss if the bridge falls behind.

## 6. Rate limiter vs webhook conflict

Global ThrottlerGuard (60 req/60s per IP) applies to most routes. Webhooks, health, and telephony ingestion have `@SkipThrottle()`. New webhook endpoints MUST add `@SkipThrottle()` or external services will get 429'd.

## 7. Unwired HealthModule

`/health` endpoint exists with DB + memory checks. Verify it's imported in `app.module.ts` and actually responding.

## 8. Dual RBAC systems

Legacy `RolesModule` exists alongside Position-based RBAC (`RoleGroups → Permissions`). Both are imported in `app.module.ts`. Position RBAC is authoritative. Legacy module is technical debt — do not build new features on it.

## 9. Seed script ordering dependencies

`seed:all` orchestrates 8 scripts in dependency order (permissions first). Running individual seeds out of order can cause foreign key violations. `seed-permissions.ts` is canonical for production; never run `seed-rbac.ts` in production.

## 10. Frontend API rewrite localhost default

`next.config.ts` rewrites `/auth/*`, `/v1/*`, `/public/*` to backend. Falls back to `http://localhost:3000` which is correct on VM (co-located). On Railway staging, `API_BACKEND_URL` must be set explicitly.

## 11. Message deduplication race condition

`clientchats-core.service.ts processInbound()` pipeline order is load-bearing: dedup → upsert → save → match → emit. Changing this order can cause duplicate messages or lost customer name data (`isBetterName()` guard).

## 12. JWT claim access — always `payload.sub`, never `payload.id` (PR #250)

The telephony Socket.IO gateway and all downstream services standardized on `sub`. Old code accessing `payload.id` will silently fail auth. JWT contract integration tests enforce this.

## 13. SIP password NOT on disk (PR #249, v1.9.0 softphone)

`sipPassword` must never be persisted to the Electron `session-store` file. `crm-phone/src/main/session-store.ts::stripPassword()` enforces this; old on-disk sessions are migrated on read. If you add a new field to `AppLoginResponse` that contains sensitive data, follow the same pattern or it will hit disk.

## 14. Reduced bridge `/status` payload (PR #253)

The local softphone bridge on `127.0.0.1:19876/status` returns only `{ id }` (user UUID). Any local process can poll this endpoint; leaking name/email/extension would expose operator identity to untrusted PCs. If extending the bridge, preserve this boundary.

## 15. `timestampevents=yes` lives in `/etc/asterisk/manager.conf`, NOT `manager_custom.conf` (PR #263)

FreePBX 15/16 does not support overriding the `[general]` section via `_custom.conf`. This is an exception to the FreePBX/CLI-vs-GUI rule (Critical Rule: Asterisk/FreePBX in CLAUDE.md). A FreePBX "Apply Config" click from the web GUI WILL silently wipe it. If AMI event timestamps disappear from stats, check this setting first.

## 16. Stats — missing CallMetrics ≠ silent drop (PR #255)

Any change to the stats-ingestion or stats-read path must preserve the `reason: "unknown"` behavior for CallSessions without CallMetrics. Silently dropping them masks ingest bugs. See `audit/STATS_STANDARDS.md` (M3 decision).

## 17. Replayed `call_end` events merge, don't overwrite (PR #255)

Telephony ingestion applies field-level merge on duplicate terminal events. Only null/missing fields are overwritten. Changing this to a full-replace can corrupt finalized call records when the AMI bridge buffers/replays events. See `audit/STATS_STANDARDS.md` (M7 decision).

## 18. `TelephonyQueue.isAfterHoursQueue` is sticky — env var only bootstraps, DB is authoritative (PR #278)

`asterisk-sync.service.ts` writes `isAfterHoursQueue` ONLY on CREATE (using the `AFTER_HOURS_QUEUES` env var list). On subsequent UPDATE ticks (every 5 min) it leaves the flag untouched so admin/DB changes persist. Consequence: **changing `AFTER_HOURS_QUEUES` env var has NO effect on queue rows that already exist**. To toggle an existing queue, update the DB directly (or use a future admin UI). `MissedCallReason.OUT_OF_HOURS` classification depends on this flag; silent drift here = OUT_OF_HOURS calls mis-tagged as NO_ANSWER.

## 19. Operator break auto-close depends on `COMPANY_WORK_END_HOUR` env (break-feature-backend PR)

`OperatorBreakService.autoCloseStaleBreaks` cron runs every 30 min and closes active break sessions whose `startedAt` is before today's `COMPANY_WORK_END_HOUR` (env, default 19). A 12-hour hard cap catches any break that escapes that window. If the env var is misconfigured (invalid value falls back to 19 silently) OR the server's local clock is off, breaks will either auto-close at the wrong time or not at all. Verify via the "Breaks" manager tab after a full-day cycle.

## 20. Operator DND state is NOT persisted — lives in Asterisk + in-memory cache (dnd-feature-backend PR)

`OperatorDndService.enable/disable` send AMI `QueuePause` (no `Queue` field → applies to all queues the extension is a member of). `TelephonyStateManager` updates `agent.presence = 'PAUSED'` from AMI events. There is NO DB column. Consequences:
- (a) if AMI is unreachable at enable/disable time, the caller gets an error and state is unchanged — no silent drift.
- (b) If someone uses `asterisk -rx "queue pause"` directly, state manager picks it up via AMI event; CRM sees it too.
- (c) On backend restart, state rehydrates from Asterisk via the startup AMI queue-status query (see `TelephonyStateManager.hydrateFromDb`).
- (d) Auto-disable on logout is best-effort in `auth.controller.logout` — any failure (expired JWT, AMI down) is swallowed so cookie-clear always succeeds.

## 21. Softphone Break: backend POST runs BEFORE SIP unregister (order is load-bearing) (softphone v1.10.0)

`useBreak.start()` in `crm-phone/src/renderer/hooks/useBreak.ts` calls `POST /v1/telephony/breaks/start` first and only invokes `sipService.unregister()` on success. If you reverse the order, the operator's SIP tears down optimistically and a backend rejection (400 "on an active call" / "already on break") leaves them offline while CRM says they're still working — confusing manager live-monitor. `useBreak.end()` mirrors the same ordering (backend first, then `sipService.register()`). The `inFlight` ref in both hooks prevents double-click races. The break modal replaces the entire `PhonePage` when `breakState.active` is non-null, so there's no way to dial / answer during break — but if you change that, also check `sipService.registered` in App.tsx's cold-start effect still forcibly unregisters on restore-into-active-break.

## 22. Softphone pnpm layout: four levers are load-bearing together (softphone v1.10.1 hotfix)

To produce a working installer, the softphone build depends on ALL of these being in sync:
- `crm-phone/.npmrc` → `shamefully-hoist=true`. Without it `electron-builder` bundles an incomplete asar (transitive deps missing entirely).
- `crm-phone/package.json` → `pnpm.overrides` pins `builder-util-runtime: 9.5.1` + `fs-extra`, `js-yaml`, `semver`, `lazy-val` (shared between `electron-builder@24` and `electron-updater@6.8`). Without it, pnpm lets two versions coexist and `electron-builder` packages the wrong one — auto-update crashes with `(0, builder_util_runtime_1.retry) is not a function`.
- `crm-phone/package.json` → `"packageManager": "pnpm@X.Y.Z"`. Corepack / CI refuses wrong-manager installs. Without it, an accidental `npm install` silently ignores `pnpm.overrides` (it's a pnpm-only field) and reintroduces the bug.
- **No `crm-phone/package-lock.json` committed.** A stale npm lockfile overrides the override. The lockfile was removed in v1.10.1 — don't commit it back. `crm-phone/pnpm-lock.yaml` is the canonical lockfile.

Verify after any dep bump: `npx asar list release/win-unpacked/resources/app.asar | grep builder-util-runtime` (list should be non-empty) AND `npx asar extract release/win-unpacked/resources/app.asar /tmp/out && cat /tmp/out/node_modules/builder-util-runtime/out/retry.js` (file should exist and export `retry`). If either check fails, one of the four levers drifted.

## 23. Express's default ETag silently stale-caches live-data endpoints (telephony-calls-cache-fix PR)

Express (NestJS's underlying HTTP adapter) ships with `etag: "weak"` enabled by default. It adds an `ETag` header on every JSON response. The browser caches the body keyed by ETag; on the next identical request it sends `If-None-Match`, Express re-hashes the CURRENT body, and if the hash matches, Express returns `304 Not Modified` with 0 bytes and the browser reuses the cached body. This is catastrophic for **paginated live-data endpoints that can return empty early** — e.g. `/v1/telephony/calls`, `/v1/telephony/missed-calls`, stats endpoints.

Field symptom (April 2026): operator saw an empty Call Logs table for hours because her first page load hit the endpoint before any calls existed, the browser cached the empty `{data:[], meta:{total:0}}` body, and every reload returned 304 → stale empty render, even as the DB filled up.

Fix in that PR: added `@Header('Cache-Control', 'no-store')` on every live list endpoint in `TelephonyCallsController` and `MissedCallsController`. **Any new live-data list endpoint MUST add `@Header('Cache-Control', 'no-store')`** — if you forget, the bug won't appear in dev (where fresh data keeps the ETag moving) but will reproduce in production for any user whose first page load hits an empty window.

Corollary: the Call Logs frontend now also shows a visible red banner on fetch errors instead of silently blanking the table — so future stale-cache / permission failures are diagnosable from the UI alone.

## 24. Softphone rejects incoming INVITE while a call is in progress (softphone v1.11.0)

`SipService.handleIncoming()` in `crm-phone/src/renderer/sip-service.ts` checks `this.currentSession && this._callState !== "idle"` and responds with `486 Busy Here` to any colliding INVITE. Without this guard, a queue-routed call arriving while the operator's own outbound was still dialing would overwrite `currentSession`, orphan the outbound `Inviter` (no `.cancel()` sent — Asterisk's side dangles), and surface as a new ringing popup — silently hijacking the user's dial attempt. Field symptom before the fix: operator initiates outbound, a queue call arrives mid-dial, outbound vanishes without a trace in the softphone UI. If you ever add call-waiting, gate it behind an explicit setting and keep this reject path as the default.

## 25. Phone lookup: both paths must share `PhoneResolverService.localDigits()` normalization; short inputs must never `contains`-query client phones (telephony-phone-lookup fix PR)

Two separate code paths match phone numbers against `Client.primaryPhone`/`secondaryPhone`: (a) `TelephonyCallsService.lookupPhone()` (per-call popup) and (b) `TelephonyCallsService.getExtensionHistory()` (operator's 3-day history list). CDR rows store numbers in whatever form Asterisk received them (typically `995555123456`), while clients in the DB may be stored as `0555123456`, `555123456`, or `+995 555 12 34 56`.

If both paths don't run inputs through `PhoneResolverService.localDigits()` (strip non-digits, keep last 9) and then use `{ contains: local }` against both phone columns, the two UIs will silently disagree — popup finds the client, history does not (or vice versa).

Equally important: if `localDigits()` returns fewer than 7 digits (extensions, garbage), DO NOT run `contains` against client phones — `214` would match any client phone containing the substring "214". For short inputs, only match `TelephonyExtension.extension` exactly; return an empty `CallerLookupResult` otherwise.

Tests: `telephony-calls.service.spec.ts` covers the 3-digit-extension, 3-digit-unknown, 995-prefix, and CDR-995-vs-stored-local-format cases.

## 26. FreePBX queue members are `Local/<ext>@from-queue/n`, NOT `PJSIP/<ext>` (dnd-ami-interface-format PR)

AMI `QueuePause` matches the `Interface` field verbatim against the queue member records Asterisk has on file. With FreePBX's standard agent config, every member is registered as a `Local` channel (the `/n` suffix tells Asterisk not to re-process dialplan when the Local channel answers). Sending `Interface: PJSIP/200` returns `Message: Interface not found` even though extension 200 clearly exists as a PJSIP endpoint. Verified via `QueueStatus` AMI action on production: every member across queues 30/800/801/802/803/804 reports location `Local/<ext>@from-queue/n`. If we ever move to a hosted SIP trunk setup where queues pool PJSIP endpoints directly, either make this a per-queue env var or a DB column — don't hardcode the other format.

Corollary: **`asterisk-manager` rejects `sendAction()` promises with two different shapes** — `new Error('AMI not connected')` from our own wrapper when no TCP connection exists, OR a plain parsed event object like `{ response: 'error', message: 'Interface not found', actionid: '...' }` when Asterisk returned `Response: Error`. Never `String(err)` — a plain object becomes `"[object Object]"` and any error-translation regex silently never matches. Always read `err.message` as a property first, fall back to Error/String only if that's empty. (A first code-reviewer pass on this fix shipped the `String(err)` bug; tests only mocked with `new Error()` which hid it. The prod-shape test in `operator-dnd.service.spec.ts` guards against regressing.)

## 27. Outbound calls need attribution at `call_start` — no AgentConnect fires for OUT direction (outbound-attribution fix PR)

Asterisk's `AgentConnect` AMI event fires only when a queue member answers a queued call; outbound calls never pass through a queue, so `handleAgentConnect` never runs for OUT direction. Without explicit fallback, `CallSession.assignedUserId` stays NULL forever for every outbound call, and operators with `call_logs.own` scope (which filters by `assignedUserId`) never see their own outbound calls — only superadmin's `call_logs.all` scope surfaces them.

Fix: `handleCallStart` in `telephony-ingestion.service.ts` looks up `TelephonyExtension` by `callerNumber` (= the originating operator's extension on outbound) when `direction === OUT`, sets `assignedUserId`/`assignedExtension`, and inserts an AGENT `CallLeg`. `handleCallAnswer` patches that leg's `answerAt` when CDR import later synthesizes `call_answer`.

Two load-bearing invariants:
- (a) the call_start-created AGENT leg MUST be closed (`endAt` set) when `handleAgentConnect` inserts a different-agent leg for the same session — otherwise transfers cause `touched`-stat double-counting across operators.
- (b) The `call_answer` AGENT-leg patch MUST be scoped to `direction=OUT, userId=assignedUserId` — without that filter, an unrelated inbound AgentConnect leg still unanswered on a multi-leg session can get accidentally patched.

If you ever rewrite this, re-read `audit/STATS_STANDARDS.md` M5.

## 28. Queue membership is written to FreePBX MariaDB `queues_details`, NOT AMI (queue-member-mariadb-sync PR, supersedes #296's AMI approach)

`ExtensionLinkService` emits queue add/remove by SSHing to the PBX and running `/usr/local/sbin/crm-queue-member <verb> <queue> <ext>`, which writes to the `queues_details` MariaDB table and runs `fwconsole reload`. **Do NOT switch this back to AMI `QueueAdd`/`QueueRemove`** — AMI only affects runtime queue state; any admin "Apply Config" click in the FreePBX GUI regenerates `queues.conf` from MariaDB and silently wipes the runtime members.

Field symptom when we had the AMI path: admin configured Position-Queue rules, linked an operator, then changed a queue's strategy in FreePBX GUI → Apply Config → the CRM-added member vanished from runtime (while CRM still showed them as linked). The MariaDB path makes CRM a first-class writer alongside the GUI — changes survive Apply Config and appear in the FreePBX Queues page.

FreePBX's REST/GraphQL API is read-only for queue members (verified against v15.0.3.7 api module + v15.0.21 queues module — zero write endpoints in `/var/www/html/admin/modules/queues/Api/Rest/Queues.php`); MariaDB is the only programmatic write path available.

Corollary: CRM matches its own rows via exact-string `data='Local/EXT@from-queue/n,0'` on DELETE — if admin hand-adds the same extension with a non-zero penalty in the GUI, that row is invisible to CRM and survives unlink. This is deliberate: admin customizations always win.

## 29. Softphone trusts the FreePBX self-signed cert via SPKI pinning, not a public CA (softphone v1.12.1, `crm-phone/src/main/pbx-cert-pin.ts`)

On 2026-04-28 every operator went offline simultaneously: softphone v1.10.x had a `setCertificateVerifyProc` blanket bypass trusting any cert, PR #292 (security audit) removed it correctly, but the PBX was still serving its FreePBX-default self-signed cert. v1.11.x rejected it with `ERR_CERT_AUTHORITY_INVALID` and WSS handshakes failed across the board.

The fix is **certificate pinning** — `installPbxCertPin()` registers an Electron `setCertificateVerifyProc` that trusts ONLY one specific Subject-Public-Key-Info SHA-256 hash (`M29AQslp5wqLwEeH+qT9tYanHwDxvuRk9n/5q5pQyw8=`) and ONLY at hosts in `PBX_HOSTS = ['pbx.asg.ge', '5.10.34.153']`; everything else (CRM web app, GitHub auto-updater, OpenAI quality reviews) goes through Chromium's default verifier unchanged. **This is materially different from PR #292's bypass**, which trusted any cert at any host.

The pinned cert is FreePBX's `/etc/asterisk/keys/integration/certificate.pem`, valid until 2036-02-28. Pinning the SPKI rather than the full cert means re-issuing the same RSA keypair (e.g. if FreePBX regenerates the cert with a new validity range) keeps softphones working with no rebuild — only an actual keypair rotation requires a softphone release.

**Do NOT replace this with a public-CA cert (Let's Encrypt / ZeroSSL):** asg.ge has no DNS API, the PBX network blocks LE HTTP-01, and DNS-01 manual renewal every ~60 days is exactly the operational burden we're trying to avoid.

**Do NOT add a `setCertificateVerifyProc` callback that returns `0` for any non-pinned host** — that re-introduces the original audit blocker (B2).

Rotation procedure: see `docs/SOFTPHONE_CERT_PINNING.md`. The pin lives only on `electronSession.defaultSession`; if a future feature creates a partitioned session, call `installPbxCertPin` again on it.

## 30. `asterisk-sync` cleanup hard-deletes CRM extensions removed from FreePBX (telephony-sync-cleanup-stale-extensions PR + remove-threshold follow-up)

When extensions disappear from FreePBX (admin deletes via GUI, Bulk Handler, or fwconsole), the next `syncExtensions` tick hard-deletes the matching `TelephonyExtension` rows in CRM — no thresholds, no soft-delete tombstones, no batch limits. We trust what FreePBX reports.

This is correct and safe because every history table — `CallSession.assignedExtension`, `CallLeg.extension`, `OperatorBreakSession.extension` — stores the extension as a string snapshot, not a foreign key. Stats and call logs attribute through `assignedUserId` (the durable User identity), so deleting the TelephonyExtension row destroys zero history. If the extension is later recreated in FreePBX with the same number, the existing add/update branch produces a fresh CRM row and admin re-links the operator.

**Single safety guard:** cleanup only runs after a successful AMI fetch — if `fetchEndpointsViaCli()` threw, the early return at the top of `syncExtensions` skips cleanup entirely, so a transient AMI outage cannot nuke the table.

**No mass-delete threshold:** the original PR shipped a 50% bail-out; removed in the follow-up because admin's normal workflow includes wiping all extensions and recreating them in bulk, and the threshold blocked that legitimate flow. The defensive `isActive: true` filter on the `findMany` cleanup query prevents future soft-disabled rows from being hard-deleted (today no code path sets `isActive=false`, but if a "temporarily hide extension without losing config" feature is added later, those rows are protected).

**Do NOT add a soft-delete (`deletedAt`) column** — the schema has no FK pressure that requires it, and a soft-delete tombstone introduces a new "stale row" class that needs its own cleanup.

**Do NOT add a mass-delete threshold back** — admin trust beats false-positive friction.

## 31. Softphone auto-rebinds on admin-driven extension change — soft-defers if on an active call (NEVER drops the call) (softphone v1.13.0, telephony-extension-auto-rebind PR)

When admin re-links / unlinks / edits / deletes an operator's `TelephonyExtension`, the backend's `TelephonyGateway.notifyExtensionChanged(userId, reason)` emits an `extension:changed` event over the `/telephony` Socket.IO namespace to the affected operator's `agent:${userId}` room. The softphone's main process (new `telephony-socket.ts`) holds a persistent socket.io-client connection (JWT in `Authorization` header) and forwards the event to the renderer via IPC `EXTENSION_CHANGED`. The renderer's new `useExtensionRebind` hook handles it:
- if `sipService.callState === "idle"` → run the rebind immediately (unregister → 750ms gap → `/auth/me` refresh → fetch fresh sipPassword → register);
- if non-idle → set `pending = true`, attach a state-change listener, fire the rebind only when the call ends.

The 750ms gap matches the existing `useAuth` pattern so Asterisk fully processes the expires-0 REGISTER before the new one arrives.

**Strict invariant — never drop a call to apply a config change.** Stats-correctness, security, even cert rotations are NEVER acceptable reasons to terminate an in-progress call.

Backend emit points: `ExtensionLinkService.link()` / `unlink()` (covers admin-link, admin-unlink, employee-dismiss, employee-hard-delete via the existing chain), `TelephonyExtensionsController.update()` (admin-edit — fired even for cosmetic changes; rebind is no-op if creds unchanged), `TelephonyExtensionsController.remove()` (admin-delete). The new IPC channel `SESSION_REFRESH` exposes `/auth/me` re-fetch as a callable action — used by this rebind flow and reused by PR 3's SSO handoff.

**Do NOT skip the rebind to avoid the brief SIP red-dot transition** — the cost of a stale extension binding is much higher than 1-2 seconds of indicator flicker.

**Do NOT add a `force=true` parameter that bypasses soft-defer** — there is no business case where dropping an active call is correct.

## 32. SSO handoff: operators sign in once via web; softphone signs in silently with native Allow/Deny dialog as the security boundary (softphone v1.13.0, telephony-softphone-sso-handoff PR)

Operators no longer type credentials into the softphone. After they log into the CRM web app (email + password → JWT cookie), the `phone-mismatch-banner.tsx` component shows a "Sign in to softphone as [name]" button when the bridge is reachable but no session is active (new `not-logged-in` state in `useDesktopPhone.ts`). On click: web calls existing `POST /auth/device-token` (auth-required, `softphone.handshake` permission gated) → 30s opaque random token → POSTs to bridge `/switch-user` (yes, the same endpoint as user-switch — it already handles "no current session" by triggering the dialog) → softphone main process pops a **native Electron Allow/Deny dialog** with text "CRM Web is requesting to sign in to softphone as [name]. Allow?" → on Allow, bridge calls `/auth/exchange-token` to redeem the token, persists the session, rotates the bridge token, fires `onSessionChanged` → renderer's `useAuth` registers SIP and `connectTelephonySocket` opens the backend Socket.IO connection.

**The native Electron dialog is the only meaningful security boundary** — a browser XSS on `crm28.asg.ge` could mint a token and POST to the bridge, but cannot programmatically click Allow in the softphone main window (Electron sandboxes the renderer from main; native dialogs require a real keystroke or click in the softphone window).

**Existing protections preserved:** origin allowlist on bridge, single-use 30s tokens, JWT auth on token mint, permission gate (`softphone.handshake`) on the banner.

**The same flow handles user-switch** — when a different operator logs into the same web browser, the banner detects mismatch and offers "Switch Phone to My Account" (existing UX). One backend code path, two banner states.

**Backend: ZERO new endpoints** — the existing `/auth/device-token` + `/auth/exchange-token` mechanism is exactly the right primitive (any user with `softphone.handshake` permission can mint a handoff token tied to themselves; the bridge POST + native dialog are the redemption path).

**Do NOT remove the native dialog confirmation** — it's the only thing standing between a browser XSS and a hijacked softphone. PR #292 audit blocker B9 made this explicit; never weaken it.

**Do NOT auto-click Allow with a "skip dialog" config flag** — even for power users; even for "internal-only" deployments. The cost of one click per session is negligible; the security property is non-negotiable.

**Do NOT add a "remember this approval for N hours" option** — token-bearer privileges should require the per-attempt human signal.

## 33. `DataScopeService` null `position.level` silently empties `department_tree` scope (telephony-call-logs-dept-tree-fix PR)

`DataScopeService.resolve()` in `src/common/utils/data-scope.ts` reads `employee.position.level ?? 0`. If a position was created via the admin UI without setting an explicit level (which is the normal path — `Position.level` is `Int?`), `userLevel` becomes `0`. Every caller that uses this value as a Prisma filter (`position: { level: { lte: scope.userLevel } }` in `telephony-calls.service.ts`, `assignedLevel <= scope.userLevel` in `recording-access.service.ts`, `buildUserFilter()` in `call-reports.service.ts`) would match zero employees.

Field symptom: a manager with `call_logs.department_tree` permission sees an empty call logs table rather than their department tree.

**Fixed: `?? 0` → `?? 999`** — null level means "unrestricted within tree" (999 > every real level value; max in seed is 100). The fix is in `data-scope.ts` only; all consumers are correct.

**Compounding issue in production:** the CALL_CENTER_MANAGER role group was also missing `call_logs.department_tree` permission (not a code bug — it was never assigned via the admin UI). The code bug would have surfaced the moment the permission was added. Both must be addressed together: (1) admin adds `call_logs.department_tree` + `call_recordings.department_tree` to the role group at `/admin/role-groups`; (2) the `?? 999` fix prevents the new permission from silently producing an empty result for any manager whose position lacks an explicit level.

**Do NOT change this back to `?? 0`** — defaulting low is the wrong failure mode for a missing level; it hides data from managers rather than over-exposing it, which appears as a permission bug that is extremely hard to diagnose.
