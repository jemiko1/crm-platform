# Phase 1 — RBAC verification

**Scope.** Seven RBAC checks (A–G) against `master` (commit range through `33de993`). All findings read-only; no source edits.

**Method.** Each check cites file:line from current master. Where a repro would require a running stack (not up at verification time), the repro is expressed as a curl/jest stub that can be pasted verbatim once `docker start crm-prod-db` + backend are up.

---

## Summary (verdicts)

| # | Check | Severity | Verdict | Evidence (file:line) | Test path |
|---|---|---|---|---|---|
| A | RoleGroup permission gap for Operator / Manager positions | **P0** | **STILL PRESENT** | `backend/crm-backend/prisma/seed-rbac.ts:125-148` | `prisma/__tests__/seed-rbac.spec.ts` (new) |
| B | `GET /v1/clientchats/conversations/:id` has no data-scope filter | **P1** | **STILL PRESENT** | `clientchats-agent.controller.ts:75-86`, `clientchats-core.service.ts:828-874` | `clientchats/__tests__/conversation-access.spec.ts` (new) |
| C | Data-scope filter on calls + recording-access parity | **P1** | **PARTIAL** (calls scoped; recordings unscoped) | `telephony-calls.service.ts:44-65`, `telephony-recording.controller.ts:22-54` | `telephony/__tests__/recording-scope.spec.ts` (new) |
| D | Handlers lacking `@RequirePermission` | **P1** | **PARTIAL (in-scope clean, out-of-scope gaps remain)** | See §D matrix | `__tests__/permission-decorators.spec.ts` (static scan) |
| E | SIP password leak on auth + extensions endpoints | **P0** | **STILL PRESENT** | `auth.service.ts:47-55,101-109`, `auth.controller.ts:278-286`, `telephony-extensions.controller.ts:146-197` | `auth/__tests__/sip-password.spec.ts` (new) |
| F | Superadmin duplicate socket delivery (managers + queue + agent) | **P2** | **STILL PRESENT (partial)** | `clientchats-event.service.ts:46-59`, `clientchats.gateway.ts:64-79` | `clientchats/__tests__/event-fanout.spec.ts` (new) |
| G | Frontend route permission guards on call-center / client-chats pages | **P2** | **FIXED** for in-scope pages | `call-center/layout.tsx:46,99`, `client-chats/page.tsx:111-113`, `client-chats/analytics/page.tsx:380-382` | Playwright smoke (out of scope, not a blocker) |

---

## A. R1 — RoleGroup permission gap

### Evidence

1. **Two parallel seed scripts coexist.** `seed-all.ts:10-19` runs both `seed-permissions.ts` (catalog) and `seed-rbac.ts` (catalog + RoleGroups + Positions) in the same order.

2. **`seed-permissions.ts` catalog is complete and correct** (lines 174–203): it defines all the call-center / client-chats / missed-calls keys needed for Monday:
   - `call_center.menu / reports / live / quality / statistics`
   - `call_logs.own / department / department_tree / all`
   - `call_recordings.own / department / department_tree / all`
   - `missed_calls.access / missed_calls.manage`
   - `client_chats.menu / reply / assign / change_status / link_client / send_media / send_template / use_canned / manage_canned / view_analytics / manage / delete`
   - `telephony.call / manage / menu`

   It also (lines 245–269) DELETES the legacy hyphenated `work-orders.*` and `role-groups.*` permission rows on every run.

3. **`seed-rbac.ts` RoleGroup assignments are stuck in the pre-commit-64b52ea world** (lines 114–171). Looking at the two positions we care about:

   **MANAGEMENT RoleGroup** (seed-rbac.ts:121–137) — assigned to Position `MANAGER` (line 194–199):
   ```ts
   permissions: [
     'buildings.details_read', 'buildings.update',
     'clients.details_read', 'clients.update',
     'incidents.details_read', 'incidents.update', 'incidents.assign',
     'work-orders.read', 'work-orders.update', 'work-orders.assign',   // HYPHENATED — dead keys
     'inventory.read',
     'employees.read',
     'reports.read', 'reports.export',
     'admin.access',
     'departments.read',
     'client_chats.menu',
   ]
   ```
   Missing for managers on Monday: `call_center.menu`, `call_center.live`, `call_center.quality`, `call_center.statistics`, `call_center.reports`, `call_logs.department_tree` (or any `call_logs.*`), `call_recordings.department_tree`, `missed_calls.access`, `missed_calls.manage`, `client_chats.manage`, `client_chats.reply`, `client_chats.assign`, `client_chats.change_status`, `client_chats.link_client`, `client_chats.send_media`, `client_chats.view_analytics`, `telephony.call`, `telephony.menu`.

   **CALL_CENTER RoleGroup** (seed-rbac.ts:138–149) — assigned to Position `CALL_CENTER` (line 200–206):
   ```ts
   permissions: [
     'buildings.details_read',
     'clients.details_read',
     'incidents.details_read', 'incidents.create', 'incidents.update',
     'work-orders.read',       // HYPHENATED — dead key
     'client_chats.menu',
   ]
   ```
   Missing for operators on Monday: `call_center.menu`, `call_center.reports`, `call_logs.own`, `call_recordings.own`, `missed_calls.access`, `missed_calls.manage`, `client_chats.reply`, `client_chats.assign`, `client_chats.change_status`, `client_chats.link_client`, `client_chats.send_media`, `client_chats.use_canned`, `telephony.call`, `telephony.menu`.

4. **`work-orders.*` hyphenated permissions don't even exist.** `seed-permissions.ts:261–268` explicitly deletes them on every seed run. So the `work-orders.read` / `work-orders.update` / `work-orders.assign` entries in `seed-rbac.ts` map to `undefined` in `permissionMap`, and the filter at `seed-rbac.ts:284-287` silently drops them:
   ```ts
   const permissionIds = rg.permissions
     .map(p => permissionMap.get(p))
     .filter((id): id is string => id !== undefined);
   ```
   Net effect: if `seed-rbac.ts` runs AFTER `seed-permissions.ts` (it does, per `seed-all.ts:10-19`), CALL_CENTER RoleGroup ends up with only **5 real permissions** (buildings.details_read, clients.details_read, incidents.details_read, incidents.create, incidents.update, client_chats.menu — actually 6 — work-orders.read silently dropped). MANAGEMENT loses all four `work-orders.*` entries; keeps 10.

5. **Commit 64b52ea** (the one the brief flags) only modified `seed-permissions.ts` (the catalog) and the frontend + controllers. It did NOT update `seed-rbac.ts` RoleGroup memberships. The commit description even lists the missing assignments under "Recommended role-group assignments" — they are advice, not code.

6. **Destructive re-assign on every seed.** `seed-rbac.ts:278-295` calls `deleteMany({ where: { roleGroupId } })` BEFORE `createMany(...)` for each RoleGroup. That means every production re-seed wipes out whatever the admin UI added to these RoleGroups and re-applies this wrong list. Even if Jemiko manually adds the right permissions through the admin UI, the next `seed:all` or VM deploy (which only runs `seed-permissions.ts` per finding #63 — confirmed) would preserve admin-added perms; but any manual re-run of `seed:all` would blow them away.

7. **VM deploy behavior** (per `KNOWN_FINDINGS_CARRIED_FORWARD.md:#63` and CLAUDE.md Quick Start):  deploy runs `seed-permissions.ts` only — not `seed-rbac.ts`. So the catalog gets refreshed on every deploy; RoleGroup memberships are frozen at whatever was last run. If Monday starts from a fresh DB (or if `seed-rbac.ts` has ever been run in prod), CALL_CENTER and MANAGEMENT RoleGroups are wrong and will stay wrong until seed-rbac.ts is fixed OR admin manually grants via UI.

### Does the Monday rollout work out of the box?

**No.** With the current seed, a user with `Position = MANAGER` can log into the frontend but:
- Left sidebar: no Call Center menu item (no `call_center.menu`)
- URL `/app/call-center`: `PermissionGuard` fallback renders "Insufficient Permissions" (per `call-center/layout.tsx:46`)
- URL `/v1/telephony/calls`: 403 Forbidden (`@RequirePermission('call_center.menu')` at controller class level; see `telephony-calls.controller.ts:14`)
- URL `/v1/telephony/missed-calls`: 403 (no `missed_calls.access`)
- Client Chats sidebar: shows (has `client_chats.menu`), but no manager controls (no `client_chats.manage`), cannot reply (no `client_chats.reply`), cannot link client (no `client_chats.link_client`)

A user with `Position = CALL_CENTER` is worse:
- Same Call Center sidebar blank (no `call_center.menu`)
- `/app/call-center` → Insufficient Permissions
- `/v1/telephony/calls` → 403
- `/v1/telephony/missed-calls` → 403
- Client Chats: sees the inbox list but `POST /v1/clientchats/conversations/:id/reply` → actually, reply requires only `client_chats.menu` today (see `clientchats-agent.controller.ts:122`) so replies work, but that's a separate bug (see §D). Cannot join conversation since that too requires only `client_chats.menu` at the controller level, so it works — but they cannot use canned responses (`client_chats.use_canned` missing).

### Verdict

**STILL PRESENT — P0 launch blocker.**

### Fix scope

Update `seed-rbac.ts:125-148` to use the underscore-scoped keys that `seed-permissions.ts` defines. Minimum for Monday, matching the commit-64b52ea recommendation plus what the controllers actually enforce:

```ts
// MANAGEMENT (for Position MANAGER)
permissions: [
  // existing CRM access
  'buildings.details_read', 'buildings.update',
  'clients.details_read', 'clients.update',
  'incidents.details_read', 'incidents.update', 'incidents.assign',
  'work_orders.read', 'work_orders.update', 'work_orders.assign',   // note underscore
  'inventory.read',
  'employees.read',
  'reports.view', 'reports.export',                                 // seed-permissions uses 'view' not 'read'
  'admin.access',
  'departments.read',
  // call-center — manager tier
  'call_center.menu', 'call_center.reports', 'call_center.live',
  'call_center.quality', 'call_center.statistics',
  'call_logs.department_tree', 'call_recordings.department_tree',
  'missed_calls.access', 'missed_calls.manage',
  // client-chats — manager tier
  'client_chats.menu', 'client_chats.reply', 'client_chats.assign',
  'client_chats.change_status', 'client_chats.link_client',
  'client_chats.send_media', 'client_chats.send_template',
  'client_chats.use_canned', 'client_chats.manage_canned',
  'client_chats.view_analytics', 'client_chats.manage', 'client_chats.delete',
  // telephony (make / receive calls)
  'telephony.call', 'telephony.menu',
],

// CALL_CENTER (for Position CALL_CENTER)
permissions: [
  'buildings.details_read',
  'clients.details_read',
  'incidents.details_read', 'incidents.create', 'incidents.update',
  'work_orders.read',
  // call-center — operator tier
  'call_center.menu', 'call_center.reports',
  'call_logs.own', 'call_recordings.own',
  'missed_calls.access', 'missed_calls.manage',
  // client-chats — operator tier
  'client_chats.menu', 'client_chats.reply', 'client_chats.change_status',
  'client_chats.link_client', 'client_chats.send_media',
  'client_chats.send_template', 'client_chats.use_canned',
  // telephony (make / receive calls)
  'telephony.call', 'telephony.menu',
],
```

Also rename the `reports.read` key in `seed-permissions.ts:99` or update `seed-rbac.ts` to use `reports.view` — they disagree today.

Also fix the `work-orders.*` → `work_orders.*` rename in `seed-rbac.ts:130, 157, 168` (Field Technician + Warehouse also affected).

Add `seed-rbac.ts` to the VM deploy `start:deploy` script, OR migrate the Operator/Manager wiring into `seed-permissions.ts` as an idempotent append-only backfill (do not delete admin-added perms).

### Regression test (path + name)

`backend/crm-backend/prisma/__tests__/seed-rbac.spec.ts::roleGroup CALL_CENTER has operator-tier call-center and client-chats perms` and `... MANAGEMENT has manager-tier perms`. Query the seeded DB via PrismaService, assert `.some(p => p.permission.resource === 'call_center' && p.permission.action === 'menu')` etc. for both RoleGroups.

---

## B. R3 — Operator can fetch any conversation by ID

### Evidence

1. **Controller handler** `backend/crm-backend/src/clientchats/controllers/clientchats-agent.controller.ts:75-86`:
   ```ts
   @Get('conversations/:id')
   @RequirePermission('client_chats.menu')
   @Doc({...})
   getConversation(@Param('id') id: string) {
     return this.core.getConversation(id);
   }
   ```
   No `@Req() req` — no userId is even passed down.

2. **Service** `backend/crm-backend/src/clientchats/services/clientchats-core.service.ts:828-874`:
   ```ts
   async getConversation(id: string) {
     const conversation = await this.prisma.clientChatConversation.findUnique({
       where: { id },
       include: {...},
     });
     if (!conversation) throw new NotFoundException('Conversation not found');
     ...
     return { ...conversation, whatsappWindowOpen };
   }
   ```
   The query filters purely by `id` — no `assignedUserId` constraint, no membership check, no manager-gate.

3. **Compare to `listConversations`** (`clientchats-agent.controller.ts:60-73`): the list endpoint correctly imposes `assignedUserIdOrUnassigned = req.user.id` (operator in today's queue) or `assignedUserId = req.user.id` (operator outside the queue). That scoping is missing from the single-read endpoint.

4. **Also missing** from the single-read path: `getMessages` (`controller:101-111`), `getConversationHistory` (`controller:240-250`). Both require only `client_chats.menu` and call into service methods that filter only by `conversationId`, no user check. So an operator who knows (or guesses) a conversation UUID can pull all messages and the archive chain for any colleague's chat.

5. **Reply, assign, status-change, link-client** all similarly lack ownership / membership checks. A logged-in operator with `client_chats.menu` can `POST /v1/clientchats/conversations/:peerConversationId/reply` and literally type into another operator's customer conversation. No test exists; no guard exists.

### Reproduction (once local stack is up)

```bash
# as operator A (logged in → access_token cookie A)
curl -s --cookie "access_token=<A>" \
  http://localhost:3000/v1/clientchats/conversations
# pick operator-B's conversation id from response `data[]` (or: manager lists all, note an id)

# as operator A, fetch B's conversation
curl -s --cookie "access_token=<A>" \
  http://localhost:3000/v1/clientchats/conversations/<B-conv-id>
# expected 403, actual: 200 + full conversation body incl. customer phone, participant history
```

### Verdict

**STILL PRESENT — P1.**

### Fix scope

Option 1 (minimal, in service): add `userId` + `isSuperAdmin` + `isManager` parameters to `ClientChatsCoreService.getConversation / getMessages / getConversationHistory`. After the `findUnique`, reject if `!isSuperAdmin && !isManager && conversation.assignedUserId !== userId`. Also need to allow operators in today's queue pool to read unassigned conversations they may want to claim — so the check becomes:
```ts
if (!isSuperAdmin && !isManager) {
  const inQueue = await this.assignment.isInTodayQueue(userId);
  if (conversation.assignedUserId && conversation.assignedUserId !== userId) {
    throw new ForbiddenException();
  }
  if (!conversation.assignedUserId && !inQueue) {
    throw new ForbiddenException();
  }
}
```
This mirrors the list-endpoint logic at `clientchats-agent.controller.ts:60-73`.

Apply same guard to `getMessages`, `getConversationHistory`, `reply`, `assign`, `changeStatus`, `requestReopen`, `linkClient`, `unlinkClient`, `sendWhatsAppTemplate`.

### Regression test (path + name)

`backend/crm-backend/src/clientchats/__tests__/conversation-access.spec.ts::operator cannot fetch another operator's conversation by id` and `::operator can fetch unassigned conversation if in today's queue`. Mock `assignment.isInTodayQueue`, mock `prisma.clientChatConversation.findUnique`, assert `ForbiddenException`.

---

## C. R4 — Operator / Manager data-scope filters for calls + recordings

### Evidence

1. **Calls endpoint IS scoped.** `backend/crm-backend/src/telephony/services/telephony-calls.service.ts:44-65`:
   ```ts
   const scope = await this.dataScope.resolve(userId, 'call_logs', isSuperAdmin);
   if (scope.scope === 'own') {
     where.assignedUserId = userId;
   } else if (scope.scope === 'department' && scope.departmentId) {
     where.assignedUser = {
       employee: {
         departmentId: scope.departmentId,
         position: { level: { lte: scope.userLevel } },
       },
     };
   } else if (scope.scope === 'department_tree' && scope.departmentIds.length > 0) {
     where.assignedUser = {
       employee: {
         departmentId: { in: scope.departmentIds },
         position: { level: { lte: scope.userLevel } },
       },
     };
   }
   ```
   This filter is correct. Column is `CallSession.assignedUserId`, matches DataScope's `'own'` branch. Note: the service does NOT use `DataScopeService.buildUserFilter()` because that helper assumes a `operatorUserId` column (see `data-scope.ts:145-174`) — CallSession uses `assignedUserId`. Instead it builds the filter inline. Correct per the commit message and per the code.

2. **Data-scope service works as intended.** `backend/crm-backend/src/common/utils/data-scope.ts:25-120`:
   - superadmin bypass → scope='all'
   - no employee / no position → scope='own' but with departmentIds=[] (effectively access denied downstream since own returns `operatorUserId: userId` which matches nothing for call sessions)
   - scope priority: all > department_tree > department > own — first hit wins
   - the `.own` check at lines 91–103 correctly requires the user to have at least `call_logs.own` or they fall through to an empty-result filter

3. **department_tree recursion.** `data-scope.ts:125-138` walks active child departments. Correct (recursive), uses `isActive: true` filter. No cycle detection, but department hierarchy is not user-editable to a degree that would allow cycles. P3 concern only.

4. **Recording access is NOT scoped.** `backend/crm-backend/src/telephony/controllers/telephony-recording.controller.ts:22-23` and `24`:
   ```ts
   @UseGuards(JwtAuthGuard, PositionPermissionGuard)
   @RequirePermission('call_center.menu')
   export class TelephonyRecordingController {
   ```
   All four recording endpoints (`GET :id`, `POST :id/fetch`, `GET :id/audio`) inherit this class-level decorator. They require `call_center.menu` but NOT any of `call_recordings.own / department / department_tree / all`. The underlying `RecordingAccessService.getRecordingById / getRecordingFileInfo / fetchFromAsterisk` (all methods in `recording-access.service.ts`) take a `recordingId` and look it up by ID only — no userId param, no scope filter.

   Net effect: any user with `call_center.menu` can stream any recording by recording UUID, regardless of which operator handled that call. This defeats E3 (recording privacy scope) from THREAT_MODEL.md.

5. **Seed catalog defines the scoped recording permissions** (`seed-permissions.ts:184-187`) but NO controller checks them. `Grep -r "call_recordings" backend/crm-backend/src` returns only the seed catalog — zero enforcement.

6. **`recordingUrl` in call-logs response** — `telephony-calls.service.ts:159-165` returns `/v1/telephony/recordings/<id>/audio` links for the *scoped* call sessions. So if an operator is scope='own', they can only SEE their own recordings in the list, and their link-clicks reach a URL that gates only on `call_center.menu`. An attacker who knows any recording UUID (e.g. via admin shoulder-surf, or via a separate information leak) can still stream it.

### Verdict

- Calls filter: **FIXED** for calls.
- Recording access: **STILL PRESENT** — no scope enforcement on recording endpoints. P1.
- Overall: **PARTIAL.**

### Fix scope

Add a scope check to `TelephonyRecordingController`. Because the controller uses class-level `@RequirePermission('call_center.menu')`, the simplest fix is to resolve the caller's `call_recordings` scope inside each handler and reject if the recording's underlying CallSession.assignedUserId doesn't fall within the caller's scope:

```ts
// pseudocode in service
async assertCanAccess(recordingId: string, userId: string, isSuperAdmin?: boolean) {
  const scope = await this.dataScope.resolve(userId, 'call_recordings', isSuperAdmin);
  if (scope.scope === 'all') return;

  const rec = await this.prisma.recording.findUnique({
    where: { id: recordingId },
    select: { callSession: { select: { assignedUserId: true, assignedUser: { select: { employee: { select: { departmentId: true, position: { select: { level: true } } } } } } } } },
  });
  if (!rec?.callSession) throw new NotFoundException('Recording not found');
  const a = rec.callSession;
  if (scope.scope === 'own' && a.assignedUserId !== userId) throw new ForbiddenException();
  if (scope.scope === 'department' && a.assignedUser?.employee?.departmentId !== scope.departmentId) throw new ForbiddenException();
  if (scope.scope === 'department_tree' && !scope.departmentIds.includes(a.assignedUser?.employee?.departmentId ?? '')) throw new ForbiddenException();
}
```

Call it from `getRecording`, `fetchRecording`, `streamAudio` (at the top of each handler).

Also add the four `call_recordings.*` permissions to the MANAGEMENT / CALL_CENTER RoleGroup (see §A).

### Regression test (path + name)

`backend/crm-backend/src/telephony/__tests__/recording-scope.spec.ts::operator with call_recordings.own cannot stream another agent's recording` and `::manager with call_recordings.department_tree can stream subordinate department recording but not peer department`.

---

## D. R2 / #8 — Handlers without `@RequirePermission`

### Evidence

Static counts on master:

- 193 occurrences of `@RequirePermission` across 26 files (grep)
- 42 occurrences of `@UseGuards(... JwtAuthGuard` across 38 files

Focus on in-scope controllers:

| Controller | JwtAuthGuard at class | @RequirePermission coverage |
|---|---|---|
| `telephony/controllers/telephony-calls.controller.ts` | yes (line 13) | class-level `@RequirePermission('call_center.menu')` at line 14 → covers all 4 handlers. OK. |
| `telephony/controllers/telephony-actions.controller.ts` | class-level (line 20) BUT **no class-level `@RequirePermission`**. Each handler has its own guard decoration. All 7 handlers declare `@UseGuards(PositionPermissionGuard) @RequirePermission('telephony.call')`. OK. |
| `telephony/controllers/telephony-live.controller.ts` | yes | class-level `@RequirePermission('call_center.live')`. OK. |
| `telephony/controllers/telephony-quality.controller.ts` | yes | class-level `@RequirePermission('call_center.quality')`; two methods additionally override with `'telephony.manage'`. OK. |
| `telephony/controllers/telephony-stats.controller.ts` | yes | class-level `@RequirePermission('call_center.statistics')`. OK. |
| `telephony/controllers/telephony-recording.controller.ts` | yes | class-level `@RequirePermission('call_center.menu')`. Recording-scope gap — see §C. |
| `telephony/controllers/missed-calls.controller.ts` | class-level (line 20) with `JwtAuthGuard` only; no class-level `@RequirePermission`. All 5 handlers declare their own `@UseGuards(PositionPermissionGuard) @RequirePermission('missed_calls.access' | '.manage')`. OK. |
| `telephony/controllers/telephony-extensions.controller.ts` | class-level `JwtAuthGuard` only (line 42). **Each handler DOES now have `@UseGuards(PositionPermissionGuard) @RequirePermission('telephony.manage')`** (lines 51–52, 63–64, 75–76, 108–109, 137–138, 177–178, 200–201). Finding #14 is **FIXED** at least at the decorator layer. sipPassword still leaks in responses — see §E. |
| `telephony/controllers/telephony-ingestion.controller.ts` | `TelephonyIngestGuard` only (by design, shared-secret). Not JWT. OK. |
| `clientchats/controllers/clientchats-agent.controller.ts` | yes (line 38). All 19 handlers have `@RequirePermission('client_chats.menu')`. Problem is they all use the SAME permission — there's no finer-grained enforcement of e.g. `client_chats.reply` on the reply handler, `client_chats.assign` on assign, etc. Technically "decorated", but under-scoped. P2 but worth fixing. |
| `clientchats/controllers/clientchats-manager.controller.ts` | yes | each handler decorated. OK. |
| `clientchats/controllers/clientchats-admin.controller.ts` | yes | each handler decorated. OK. |
| `auth/auth.controller.ts` | partial — `login`, `app-login`, `logout`, `exchange-token` have NO `@UseGuards(JwtAuthGuard)` (public by design). `device-token` and `me` have `@UseGuards(JwtAuthGuard)` but **no `@RequirePermission`**. See #7 — P1. |
| `messenger/messenger.controller.ts` | class-level `JwtAuthGuard` only; **no class-level `@RequirePermission`**. Per `@RequirePermission` count (1) and overall controller content, messenger mutations (create-group, add-participant, send, mark-read, typing, mute, delete) are effectively JWT-only. Not a Monday blocker for Call Center / Client Chats but in-scope for operators (they use messenger). Flag as P2 for later. |

Static summary of RBAC decorator discipline:

- In-scope (Calls, Client Chats, Telephony control plane) → all HTTP handlers are covered by `@RequirePermission` at class or method level. No JWT-only orphans.
- Finding #14 (extensions controller without permissions): **FIXED** as of master.
- Finding #7 (device-token / exchange-token without permissions): **STILL PRESENT.** `device-token` endpoint lets any logged-in user mint a short-lived handshake token for their own userId (`auth.service.ts:58-67` only calls `createDeviceToken(userId)` with the caller's own id). Low risk but no permission decorator. `exchange-token` is intentionally public (unauthenticated) — it takes the handshake token in the body. A replay-attack window exists (30s TTL per `auth.service.ts:60`, single-use via the `consumed` flag at line 80-81) — mitigated but still sensitive because exchange mints a full-access JWT for any user.
- Client Chats agent controller: all 19 handlers gated only by `client_chats.menu`. Under-scoped. Operator can reply, assign, link client, send media even if the respective finer permissions (`client_chats.reply`, `.assign`, `.link_client`, `.send_media`) are revoked. Not a Monday launch blocker per se (Operator RoleGroup will just grant `client_chats.menu` per the seed-rbac fix) but wrong.

### Verdict

- In-scope RBAC decorator coverage: **FIXED** (no JWT-only handlers in telephony or client-chats).
- `auth/device-token` permission gap: **STILL PRESENT** (P1 — finding #7).
- Agent-controller under-scoping: **STILL PRESENT** (P2).
- Messenger controller effectively JWT-only: **STILL PRESENT** (P2 — out-of-tight-scope).

### Fix scope

- Add `@RequirePermission('telephony.menu')` to `auth/auth.controller.ts::createDeviceToken` to restrict handshake generation to users meant to use the softphone switch.
- Replace `@RequirePermission('client_chats.menu')` with specific finer keys on the client-chats agent controller: `reply` → `client_chats.reply`, `assign` → `client_chats.assign`, etc.
- Messenger: add per-handler `@RequirePermission('messenger.send')` / `.create_group` / `.manage_groups`. Also need new `messenger.send` permission in seed-permissions.

### Regression test (path + name)

`backend/crm-backend/src/__tests__/permission-decorators.spec.ts` — static reflection test that walks every controller class, looks up each `@UseGuards` and `@RequirePermission` metadata via `Reflector`, and asserts:
1. every handler with `JwtAuthGuard` also has either a method-level OR class-level `@RequirePermission`;
2. specific handler:permission pairs for well-known dangerous ops (originate, reply, assign, extensions.create, etc.).

---

## E. R6 — Telephony extension plaintext password

### Evidence

1. **DB schema**: `TelephonyExtension.sipPassword` stored as plaintext String (per INVENTORY.md §1.9, confirmed by `telephony-extensions.controller.ts:26-27,32-35` DTOs).

2. **`/auth/app-login`** (`auth.service.ts:33-56`):
   ```ts
   return {
     accessToken,
     user: {...},
     telephonyExtension: ext
       ? {
           extension: ext.extension,
           displayName: ext.displayName,
           sipPassword: ext.sipPassword,    // ← plaintext
           sipServer: ext.sipServer,
         }
       : null,
   };
   ```

3. **`/auth/exchange-token`** (`auth.service.ts:69-110`): same payload shape, includes `sipPassword` in plaintext (line 105).

4. **`/auth/me`** (`auth.controller.ts:248-287`):
   ```ts
   const ext = await this.prisma.telephonyExtension.findUnique({
     where: { crmUserId: userId },
   });
   return {
     user: {
       ...
       telephonyExtension: ext
         ? {
             extension: ext.extension,
             displayName: ext.displayName,
             sipServer: ext.sipServer,
             sipPassword: ext.sipPassword,  // ← plaintext, every /me call
           }
         : null,
     },
   };
   ```

5. **`/v1/telephony/extensions`** (list, create, update) — `telephony-extensions.controller.ts`:
   - `list` handler (lines 111–134) uses `select` and does NOT include `sipPassword`. **GOOD** — list is clean.
   - `users-with-config` (lines 82–105) also excludes `sipPassword`. **GOOD.**
   - `upsert` (POST, lines 146–174) returns the full row via `prisma.telephonyExtension.update / create` — by default Prisma returns all scalar fields including `sipPassword`. **LEAKS.**
   - `update` (PATCH, lines 187–197) returns the full row — **LEAKS.**

So the four paths that leak `sipPassword` today are: `/auth/app-login`, `/auth/exchange-token`, `/auth/me`, and `/v1/telephony/extensions` POST + PATCH responses. The list and users-with-config endpoints are already clean.

### Verdict

**STILL PRESENT — P0.**

Rationalization note: the softphone (sip.js renderer) genuinely needs the SIP password at boot to register with Asterisk. So removing the password entirely from `app-login` would break the softphone. But `/auth/me` and the HTTP controller responses have no such justification — the browser CRM does not need the SIP password to function. Only the softphone does.

### Fix scope

Three stackable layers:

1. **Remove the password from every response EXCEPT `/auth/app-login` and `/auth/exchange-token`.** The Electron softphone is the only legitimate consumer. Web `/auth/me` should return only `{extension, displayName, sipServer}`. POST / PATCH `/v1/telephony/extensions` should return everything *except* sipPassword. (2-line DTO fix at both call sites.)

2. **Column-level encryption** (medium-term): encrypt `sipPassword` at rest with an env-var-held key (`TELEPHONY_EXT_PASSWORD_KEY`). Decrypt only inside `AuthService.appLogin` and `AuthService.exchangeDeviceToken`. This protects against DB dump exfiltration.

3. **Short-lived SIP credential token** (long-term): instead of returning the Asterisk SIP password, issue a short-lived token that sip.js can use to register; have Asterisk's PJSIP verify the token against a stored secret shared between CRM and Asterisk. Changes Asterisk PJSIP endpoint auth type and is out of scope for Monday.

For Monday, Layer 1 is the minimum. It protects every caller who is not using the softphone.

### Regression test (path + name)

`backend/crm-backend/src/auth/__tests__/sip-password.spec.ts::/auth/me response does not include sipPassword` and `::/v1/telephony/extensions POST response does not include sipPassword` and `::/auth/app-login response DOES include sipPassword (intentional)` (guardrails both ways).

---

## F. R5 — Duplicate socket delivery to superadmin

### Evidence

1. **Gateway room-joining** at connect, `clientchats.gateway.ts:63-79`:
   ```ts
   (client as any).userId = userId;
   client.join('agents');
   client.join(`agent:${userId}`);

   const isManager = await this.checkManagerPermission(userId);
   if (isManager) {
     client.join('managers');
     ...
   }

   const queuePool = await this.queueSchedule.getActiveOperatorsToday();
   if (queuePool.includes(userId)) {
     client.join('queue');
   }
   ```
   So a user who is (a) superadmin/manager AND (b) in today's queue pool ends up in `agents` + `agent:{id}` + `managers` + `queue` simultaneously.

2. **Fan-out** at `clientchats-event.service.ts:46-59`:
   ```ts
   emitNewMessage(conversationId, message, assignedUserId?) {
     ...
     this.server.to('managers').emit('message:new', payload);
     if (assignedUserId) {
       this.server.to(`agent:${assignedUserId}`).emit('message:new', payload);
     } else {
       this.server.to('queue').emit('message:new', payload);
     }
   }
   ```
   Consider a superadmin in today's queue receiving a new message on an UNASSIGNED conversation: they're in both `managers` (emit) and `queue` (emit) → **two copies of the same event**.

3. **Same pattern** at `emitConversationNew` (lines 14–23): emits to `managers` + ( `agent:{assignedId}` OR `queue` ). A superadmin who is assigned to the conversation AND is also a manager gets emits on `managers` AND `agent:{self}` → two copies.

4. **`emitConversationUpdated`** (lines 25–44) — same duplication on assignment change plus potentially a third emit to `agent:{previous}` if reassigned. If `previousAssignedUserId === currentUser` AND currentUser is also a manager, three emits.

5. **No server-side dedup.** Frontend must dedup by message.id in local state. Per INVENTORY.md §4.2 and finding #37, there IS client-side dedup via `prev.some(m => m.id === data.message.id)` but only inside ConversationPanel — not in the sidebar unread-count / notification pipeline. Double-counting is likely on the unread badge.

### Verdict

**STILL PRESENT — P2.** Frontend dedup in ConversationPanel blunts UX impact for open chats; unread-count badge double-count is plausible and should be tested once the stack is up.

### Fix scope

Two options:

1. **Room-exclusive membership.** If user is manager, don't join `queue` even if in today's pool — managers watch everything via `managers` room. At the gateway (`clientchats.gateway.ts:75-79`):
   ```ts
   if (!isManager && queuePool.includes(userId)) {
     client.join('queue');
   }
   ```
   Similarly skip `agent:{userId}` for managers (they see everything through `managers`):
   ```ts
   if (!isManager) client.join(`agent:${userId}`);
   ```
   This is the cleanest change.

2. **Dedup at emit time** using `exceptSocketIds`. More invasive — requires tracking which socket belongs to which user and which rooms.

Option 1 is better.

### Regression test (path + name)

`backend/crm-backend/src/clientchats/__tests__/event-fanout.spec.ts::superadmin in queue does not receive duplicate message:new on new unassigned conversation`. Spin up a fake Server, connect one superadmin socket and one operator socket, fire `emitNewMessage`, assert superadmin count = 1.

---

## G. Frontend route permission guards on call-center / client-chats pages

### Evidence

1. **Call Center layout** `frontend/crm-frontend/src/app/app/call-center/layout.tsx:46,99`:
   ```tsx
   <PermissionGuard permission="call_center.menu">
     ...
     {canAccessCurrentTab ? children : (<InsufficientPermissionsCard />)}
   </PermissionGuard>
   ```
   Every call-center route inherits this layout — so `/app/call-center`, `.../logs`, `.../missed`, `.../live`, `.../reports`, `.../quality`, `.../statistics`, `.../agents`, `.../callbacks` all gate on `call_center.menu` at the outer layer AND on the specific per-tab permission at the inner layer (per the `TABS` array and `canAccessCurrentTab` check at lines 40–43).

2. **Client Chats main inbox** `frontend/crm-frontend/src/app/app/client-chats/page.tsx:111-113`:
   ```tsx
   return (
     <PermissionGuard permission="client_chats.menu">
       ...
     </PermissionGuard>
   );
   ```

3. **Client Chats analytics** `frontend/crm-frontend/src/app/app/client-chats/analytics/page.tsx:380-382`:
   ```tsx
   <PermissionGuard permission="client_chats_config.access">
     ...
   </PermissionGuard>
   ```

4. **Sub-components** check permissions additionally. `conversation-header.tsx:29,212` gates delete via `client_chats.delete`, manager-view toggle via `client_chats.manage`.

5. **Reports page** (`call-center/reports/page.tsx:100`) has its own double-check: `if (!permLoading && !hasPermission("call_center.reports"))` returns a placeholder. Belt + suspenders pattern — redundant with layout but defensively correct.

### Verdict

**FIXED** for in-scope pages. All nine call-center pages inherit `PermissionGuard permission="call_center.menu"` via layout.tsx, with per-tab secondary gating via `canAccessCurrentTab`. Both client-chats pages have their own `PermissionGuard`.

### Fix scope

None in scope. One observation: the analytics page uses `client_chats_config.access` which is an admin-tier permission. If the brief intent is "managers see analytics", they need `client_chats_config.access` assigned in their RoleGroup. Today managers will not reach analytics unless this is seeded. (Touches §A fix list — not added there because the brief lists analytics as manager-only without specifying; confirm with Jemiko whether managers should have it.)

### Regression test (path + name)

Not proposed as a Monday gate. A Playwright smoke that logs in as operator / manager and hits each URL asserting 200 vs "Insufficient Permissions" banner would be the canonical test; defer to Phase 4.

---

## P0 / P1 items requiring Phase 4 fix

1. **P0 — §A: RoleGroup permission gap.** `seed-rbac.ts:125-148` assigns hyphenated, dead permission strings to MANAGEMENT and CALL_CENTER RoleGroups. Operators and Managers will be locked out of call-center and most of client-chats on Monday unless `seed-rbac.ts` is fixed AND the VM deploy runs it (currently it only runs `seed-permissions.ts`). Highest priority.

2. **P0 — §E: sipPassword plaintext leak.** `/auth/me` and `POST / PATCH /v1/telephony/extensions` return the raw SIP password on every call to every logged-in user who queries their own profile. Fix = DTO redaction everywhere except `/auth/app-login` + `/auth/exchange-token` (where the softphone needs it).

3. **P1 — §B: operator reads any conversation by id.** `GET /v1/clientchats/conversations/:id` has no data-scope filter — any authenticated operator can fetch any conversation and its messages and history chain. Fix in service.

4. **P1 — §C: recording endpoints not scoped.** `/v1/telephony/recordings/:id/audio` and siblings require only `call_center.menu`. An operator can listen to a colleague's recording if they know the UUID. Add `call_recordings` scope check.

5. **P1 — §D (finding #7): `/auth/device-token` lacks `@RequirePermission`.** Any logged-in user can mint a handshake token for their own userId and exchange it for a JWT. Low concrete risk (only lets them do what they could already do — log in); remediation is a one-line decorator so worth doing.

---

## Notes / observations outside scope

- `seed-rbac.ts:262-295` uses a destructive `deleteMany → createMany` re-seed. If it's ever re-run in production, it wipes admin-UI-added permissions on those RoleGroups. Consider switching to an idempotent "upsert missing" loop or moving Position/RoleGroup assignments into `seed-permissions.ts`.
- `PositionPermissionGuard` at `position-permission.guard.ts:62-86` does a fresh DB query per request (`employee.findUnique` with deep `include`). No caching. Every authenticated request = 2 DB roundtrips minimum (user + employee+position+roleGroup+permissions). At 50 operators + 20 managers hitting the UI actively, this is ~1000 extra DB queries/minute, each doing a join-heavy read. Consider memoizing user→permissions for 30s with an LRU cache. Out of RBAC scope — flag for performance phase.
- `role_groups.read` / `role-groups.read` cleanup: `seed-permissions.ts:267-268` explicitly deprecates the hyphenated `role-groups.*` but no `role_groups.*` (underscore) replacement exists in the catalog. Check whether role-group admin endpoints still require a permission that no longer exists. Likely finding for security-scanner.
- `data-scope.ts:125-138` has a recursive `collectDescendantDepartments` with no depth limit and no cycle detection. If Departments ever form a cycle (should be impossible via FK but a bad `update` could do it), stack overflow. Out of scope but worth a comment.
- Messenger controller lacks per-handler permissions. Not strictly RBAC-for-Monday, but operators do use messenger, so file separately if Phase 4 has time.
- Agent-controller under-scoping: all 19 `/v1/clientchats/*` endpoints share `client_chats.menu`. Revoking `client_chats.reply` from a RoleGroup does nothing today because no handler enforces it. The seed-permissions catalog defines these finer keys but no controller consumes them.
