# Phase 1 — Realtime / socket verification

Working directory: `C:\CRM-Platform`. Read-only. Master at commit `33de993`. All file references verified; gateways, services, and frontend hooks read against the live tree.

Sibling Phase 1 reports used as cross-reference only (not re-verified): `phase1-rbac.md`, `phase1-security.md`, `phase1-chats.md`, `phase1-telephony-stats.md`.

---

## Summary table

| # | Check | Finding refs | Severity | Verdict | Evidence (file:line) |
|---|---|---|---|---|---|
| 1 | In-memory state lost on restart (3 gateways) | #32, #33, RT1 | P2 | STILL PRESENT, partially mitigated for telephony via DB hydrate | `telephony-state.manager.ts:52-74,288-338`; `messenger.gateway.ts:35`; `clientchats.gateway.ts` (no presence map) |
| 2 | CORS / cookie drift across three gateways | #5, RT2, RT3 | P2 | STILL PRESENT — clientchats reads raw env with wrong dev default; cookie name is consistent | `clientchats.gateway.ts:18-22` vs `telephony.gateway.ts:29`, `messenger.gateway.ts:24`, `cors.ts:1-14` |
| 3 | AMI broadcast flood (queue:updated + agent:status on every event) | #35, RT4 | **P1** | STILL PRESENT — no throttle, no diffing, fires on EVERY AMI event | `telephony.gateway.ts:116-176` |
| 4 | Messenger typing throttle | #38, RT5 | P2 | STILL PRESENT — no server-side throttle | `messenger.gateway.ts:165-176` |
| 5 | Client chats duplicate delivery to superadmin | #37, RT6 | P2 | STILL PRESENT at server; mitigated by frontend dedup on message ID | `clientchats-event.service.ts:14-59`; `conversation-panel.tsx:163-166` |
| 6 | Messenger dual-room duplicate delivery | #36 | P2 | STILL PRESENT at server; mitigated by frontend dedup on message ID | `messenger.gateway.ts:134-149`; `message-list.tsx:122-124` |
| 7 | Client reconnect behaviour (missed events) | — | P2 (chats OK, telephony OK, messenger weak) | PARTIAL — chats has 5s/15s poll fallback; telephony has `state:snapshot`; messenger has NO replay and NO polling | `useClientChatSocket.ts:14-53`, `conversation-panel.tsx:87-91`; `telephony.gateway.ts:76-80`; `messenger-context.tsx:165-210` |
| 8 | Room membership lifecycle (queue changes mid-day) | #34 | P2 | STILL PRESENT — room membership fixed at connect; queue-schedule mutators do not emit and do not re-fan sockets | `clientchats.gateway.ts:75-79`; `queue-schedule.service.ts:32-48` (no `events.emitQueueUpdated` call) |
| 9 | Electron softphone socket auth | — | — | NOT APPLICABLE — softphone does not connect to any CRM gateway; only SIP WSS to Asterisk | `crm-phone/src/renderer/sip-service.ts`, `crm-phone/src/main/index.ts` |
| 10 | Socket.IO vs raw WS, namespaces, transports | — | info | FIXED — all three are Socket.IO with distinct namespaces; `websocket` primary + `polling` fallback | see gateway decorators |
| 11 | Event payload shapes (screen:pop etc.) | — | P2 | FIXED — payloads include fields the frontend expects; frontend telephony listeners are limited to `call:report-trigger` (no live-monitor socket consumer exists) | `telephony.gateway.ts:191-204`, `250-256`; `call-report-trigger.tsx:43-46`; `call-center/live/page.tsx:27,112-116` |
| — | **JWT `sub` vs `id` cross-reference** (cited from `phase1-security.md` check #2, finding #19) | #19, T8, S9 (partial) | **Elevated to P0 for Monday** | STILL PRESENT — see §12 below | `telephony.gateway.ts:259-282`; `messenger.gateway.ts:290-320`; `auth.service.ts:17-18,36-37,90-91,116-117`; `jwt.strategy.ts:22-30` |

---

## Check 1 — In-memory state lost on restart

**Evidence.**

`TelephonyStateManager` (`backend/crm-backend/src/telephony/realtime/telephony-state.manager.ts`) holds three Maps (lines 52–54):
```ts
private readonly activeCalls = new Map<string, ActiveCall>();
private readonly agents = new Map<string, AgentState>();
private readonly extensionToUser = new Map<string, string>();
```
Unlike the messenger, **telephony DOES hydrate from DB on boot** — `onModuleInit()` (line 62) calls `hydrateFromDb()` (line 288). It reads active `TelephonyExtension` rows and `CallSession` rows with `endAt: null` and `startAt >= now()-60 min` (lines 290–315), so agents + in-flight calls persist across a restart.

`MessengerGateway` (`backend/crm-backend/src/messenger/messenger.gateway.ts:35`):
```ts
private onlineUsers = new Map<string, Set<string>>();
```
No DB persistence. On restart, every online user is initially "offline"; the next `connect` event pushes them back in. Because presence is derived from live sockets, clients that reconnect automatically re-populate the map. **Actual data loss scope: ephemeral presence list only** — no durable state is lost. Broadcasts that fired during the restart (`user:online`, `message:read`) are missed; see §7.

`ClientChatsGateway` keeps **no presence/state map at all**. Rooms are rebuilt per connection (lines 64–79). Conversations, messages, queue schedule all live in Postgres. Restart cost: brief reconnection flap; no state is dropped.

**Room membership cross-cutting.** For telephony, the `connectedUsers` Map (`telephony.gateway.ts:40`) is also in-memory but only tracks socket IDs; same pattern as messenger.

**Verdict.** STILL PRESENT, P2. Telephony mitigates via `state:snapshot` + DB hydrate; chats has no state to lose; messenger has a cosmetic presence gap during reconnect storms.

**Fix scope.** Low priority. Messenger could persist presence via Redis if multi-instance deployment is ever considered. For now, single-instance PM2 means a restart flaps presence for ~1–2 s, nothing more.

**Regression test.** `telephony-state.manager.spec.ts` already covers hydrate pathway (out of scope to re-verify). Add a small test asserting that `hydrateFromDb()` populates `extensionToUser` map size from a mocked Prisma response.

---

## Check 2 — CORS / cookie drift across three gateways

**Evidence.**

`backend/crm-backend/src/cors.ts:1-14` — canonical dev fallback `[3002, 4002]`.

Three gateways:
- `telephony.gateway.ts:29` → `origin: getCorsOrigins()` — correct.
- `messenger.gateway.ts:24` → `origin: getCorsOrigins()` — correct.
- `clientchats.gateway.ts:18-22` → `origin: (process.env.CORS_ORIGINS || 'http://localhost:3001').split(',').map((o) => o.trim())` — **reads raw env with wrong dev default (3001, but frontend dev is 4002)**.

In prod, `CORS_ORIGINS` is set (VM / Railway staging), so the wrong default is inert. In dev, if a developer forgets to set it, clientchats socket rejects the `Origin: http://localhost:4002` header for that namespace only — the other two gateways work because `getCorsOrigins()` lists 4002 in its fallback.

**Cookie name.** All three gateways + frontend all read `process.env.COOKIE_NAME ?? 'access_token'`:
- `telephony.gateway.ts:272`
- `messenger.gateway.ts:299`
- `clientchats.gateway.ts:128`
- `jwt.strategy.ts:6`
- Frontend `src/proxy.ts:4` (per `phase1-security.md` check 8)

Consistent. No drift.

**Verdict.** STILL PRESENT at P2 (CORS only). Cookie name: FIXED.

**Fix scope.** `clientchats.gateway.ts:18-22` → `origin: getCorsOrigins()`. One-line diff; phase1-security already flagged.

**Regression test.** `clientchats.gateway.spec.ts` — instantiate with `CORS_ORIGINS` unset and assert `cors.origin` includes `'http://localhost:4002'`.

---

## Check 3 — RT4 / #35 — AMI broadcast flood

**Evidence.** `backend/crm-backend/src/telephony/realtime/telephony.gateway.ts:116-176`.

`broadcastAmiEvent` is called from `onModuleInit` — the gateway subscribes to `amiClient.on('ami:event', ...)` at line 52. Every raw AMI event (newchannel, hangup, dialend, bridgeenter, queuecallerjoin, agentconnect, blindtransfer, attendedtransfer, musiconholdstart, musiconholdstop, queuememberstatus, queuememberpause, varset, newexten — per `INVENTORY.md §1.5`) passes through.

After the per-event switch (lines 119–163), **every** invocation unconditionally emits (lines 165–175):

```ts
this.server.to('dashboard').emit('queue:updated', {
  queues: this.stateManager.getQueueSnapshots(),
  timestamp: new Date().toISOString(),
});

for (const agent of this.stateManager.getAgentStates()) {
  this.server.to(`agent:${agent.userId}`).emit('agent:status', {
    ...agent,
    timestamp: new Date().toISOString(),
  });
}
```

No throttle, no debounce, no diff. Rooms:
- `dashboard` — every connected socket is in this room (`handleConnection:73`), so one `queue:updated` emit → N recipients.
- `agent:{userId}` — one room per user, typically 1 socket per user. The loop iterates over ALL agents known to the state manager (not just connected ones), so 16 emits per AMI event (16 extensions on the PBX per `ASTERISK_INVENTORY.md`).

**Volume estimate.** A single queue-pickup generates this sequence per `event-mapper.ts` in the AMI bridge:
1. `newchannel` (linkedid = uniqueid, customer side)
2. `newchannel` (agent leg)
3. `queuecallerjoin`
4. `dialend` (ringing stops)
5. `agentconnect`
6. `bridgeenter`
7. eventually `hangup` x2
8. `queuememberpause` may fire around the wrap-up period

That's ~8 AMI events per call. On a 10-call-per-minute burst (realistic for the 16-operator queue 804 during morning rush), that is ~80 AMI events/min → **80 `queue:updated` emits to 70 dashboard subscribers = 5,600 Socket.IO messages/min** + **80 × 16 = 1,280 `agent:status` messages/min**. Combined ~6,880 msg/min (115 msg/sec) steady-state, plus spikes on answer storms. With the JSON payload of `queues` array plus agent objects, this hits ~400 KB/s of outbound WebSocket traffic per manager dashboard at peak.

Even if the manager dashboard isn't currently consuming these events (see §11 — no frontend listener exists for `queue:updated` / `agent:status` — `call-center/live/page.tsx` uses 10 s HTTP polling instead), the server still serializes and ships the payloads. When someone finally wires a live monitor, the flood is real.

**Verdict.** STILL PRESENT. **Elevate to P1** given the live-monitor rewrite Monday will almost certainly subscribe to these events.

**Fix scope.**
- Debounce `queue:updated` by 500 ms — coalesce consecutive AMI events into a single emit.
- Diff `agent:status` — only emit for agents whose state changed since last emit.
- Bound the `agent:status` loop to agents with non-OFFLINE presence (skip the 10 extensions that are offline on Monday per `ASTERISK_INVENTORY.md`).
- Consider a room-based filter: only clients in `dashboard` + the specific `agent:{userId}` that changed receive updates.

**Regression test.** `telephony.gateway.spec.ts` — fire 10 `ami:event` callbacks within 100 ms and assert `server.to('dashboard').emit` is called ≤ 2× (debounced).

---

## Check 4 — RT5 / #38 — Messenger typing throttle

**Evidence.** `backend/crm-backend/src/messenger/messenger.gateway.ts:165-176`:

```ts
@SubscribeMessage('typing')
async handleTyping(
  @ConnectedSocket() client: AuthenticatedSocket,
  @MessageBody() data: { conversationId: string; isTyping: boolean },
) {
  if (!client.employeeId) return;
  const event = data.isTyping ? 'typing:start' : 'typing:stop';
  client
    .to(`conversation:${data.conversationId}`)
    .emit(event, { employeeId: client.employeeId });
}
```

Zero throttle. A malicious authenticated user (operator or manager — anyone with a messenger socket) can flood `emit('typing', ...)` as fast as Socket.IO will carry them. Server fan-out is to every socket in `conversation:{id}` room. With a 2-participant DM this is 1 recipient; with a group conversation it is N-1. No rate limit at either end.

**DoS scope.** Per-conversation DoS: target one conversation by flooding typing events — each recipient's message-list re-render is cheap but N * eventsPerSecond frames hammer the browser event loop. At 1,000 typing:start/sec, a 20-participant group chat becomes unusable.

**Exploitability.** Any authenticated user. No permission is needed — `handleTyping` does not verify conversation membership (any JWT holder can emit `typing` to any `conversationId` they know). The `client.to(...)` scoping does not verify the sender is in the conversation. Attacker can spray typing events at arbitrary conversation IDs they glean from their browser devtools.

**Verdict.** STILL PRESENT. P2 (upgrade to P1 if operators report UI freezes Monday).

**Fix scope.** Server-side rate limit: 1 emit / 500 ms per (socketId, conversationId). Also verify sender is a participant before fanning out.

**Regression test.** `messenger.gateway.spec.ts` — fire 20 `typing` events in 100 ms and assert `server.to(...).emit` is called ≤ 1x.

---

## Check 5 — RT6 / #37 — Client chats duplicate delivery to superadmin

**Evidence.** `backend/crm-backend/src/clientchats/services/clientchats-event.service.ts:46-59`:

```ts
emitNewMessage(conversationId, message, assignedUserId?) {
  if (!this.server) return;
  const payload = { conversationId, message };
  this.server.to('managers').emit('message:new', payload);
  if (assignedUserId) {
    this.server.to(`agent:${assignedUserId}`).emit('message:new', payload);
  } else {
    this.server.to('queue').emit('message:new', payload);
  }
}
```

A superadmin is in the `managers` room (`clientchats.gateway.ts:69`), in `agent:{self}` (line 65), and (if in today's schedule) in `queue` (line 77). If the conversation is assigned to that superadmin, they receive `message:new` **twice** (managers + agent:self). If unassigned and they're in queue, also twice (managers + queue). Socket.IO does not dedupe across rooms.

The same duplication applies to `emitConversationNew` (lines 14–23) and `emitConversationUpdated` (lines 25–44) — all three fan out to `managers` plus one of `agent:*` / `queue` plus (on reassign) the previous agent. A superadmin in queue + managers + `agent:prev` could receive the `conversation:updated` event **three times** on reassign.

**Frontend mitigation.** `conversation-panel.tsx:161-167`:
```ts
const handleNewMessage = (data: { conversationId: string; message: any }) => {
  if (data.conversationId !== conversationId) return;
  setMessages((prev) => {
    if (prev.some((m) => m.id === data.message.id)) return prev;
    return [...prev, data.message];
  });
  fetchConversation();
};
```

Dedup by `message.id` confirmed. Requires `data.message.id` to be present — verified in `clientchats-core.service.ts` emit payloads. If a future refactor emits a partial message without `id` (e.g. optimistic stub), dedup silently fails.

`fetchConversation()` (line 167) is called on every `message:new` — duplicate delivery means duplicate HTTP refetch. On a superadmin with 3× delivery, that's 3 GETs to `/v1/clientchats/conversations/:id` per message. Low cost but compounds with the escalation cron's unbounded findMany (see `phase1-chats.md`).

**Verdict.** STILL PRESENT at server (finding #37 confirmed). Client-side dedup mitigates UI corruption; server-side cost is the duplicated fetch and the duplicated WebSocket payload.

**Fix scope.** Change fan-out to be disjoint:
- If assigned: emit to `agent:{assignedUserId}` only; `managers` receives via a separate lightweight `conversation:updated` (no message body).
- If unassigned: emit to `queue` only.
- For managers who want full visibility, have them join `agent:*` via an explicit subscribe rather than the `managers` room.

Pragmatic alternative: dedup at the emit layer — build a `Set<socketId>` from the union of target rooms and emit once per socket.

**Regression test.** `clientchats-event.service.spec.ts` — mock a superadmin socket in `managers` + `agent:self` + `queue`; call `emitNewMessage(..., superadminId)`; assert target socket receives exactly 1 emit.

---

## Check 6 — #36 — Messenger dual-room duplicate delivery

**Evidence.** `backend/crm-backend/src/messenger/messenger.gateway.ts:134-149`:

```ts
this.server
  .to(`conversation:${data.conversationId}`)
  .emit('message:new', message);

// Also notify ALL participants via their personal rooms
const participantIds = await this.messengerService.getConversationParticipantIds(
  data.conversationId,
);
for (const pid of participantIds) {
  this.server.to(`employee:${pid}`).emit('message:new', message);
  this.server.to(`employee:${pid}`).emit('conversation:updated', { ... });
}
```

A user is simultaneously in `conversation:{id}` (joined via `conversation:join` event, line 104) and `employee:{pid}` (joined at connect, line 75). If they have the conversation open, both rooms fire → double `message:new`. If they don't, only `employee:{pid}` fires → single `message:new`.

**Frontend mitigation.** `message-list.tsx:122-124`:
```ts
setMessages((prev) => {
  if (prev.some((m) => m.id === msg.id)) return prev;
  ...
});
```
Dedup confirmed by `msg.id`.

Additionally `message-item.tsx:103` dedupes reactions, so the pattern is consistent.

**Verdict.** STILL PRESENT at server; mitigated by frontend dedup. Same caveat as #37: dedup fails if `id` missing.

**Fix scope.** Lower priority than #37 because the intent of the dual-emission is that `conversation:{id}` delivers to the active chat window and `employee:{pid}` drives the message bubble / dropdown. Consolidate: emit to `employee:{pid}` only, and have `MessageList` subscribe to the broadcast via `messenger-context.tsx:207` (the `broadcastMessage` pattern).

**Regression test.** `messenger.gateway.spec.ts` — mock a socket in both rooms; call `handleSendMessage`; assert exactly 1 `message:new` is received by that socket.

---

## Check 7 — Client reconnect behaviour

**Evidence — Client Chats.**

`useClientChatSocket.ts:14-53`:
- Socket.IO client with `reconnection: true`, `reconnectionDelay: 1000`, `reconnectionDelayMax: 30000`, `reconnectionAttempts: Infinity`.
- No server-side replay: on reconnect, the backend does not resend missed events.

`conversation-panel.tsx:87-91`:
```ts
const pollInterval = isConnected ? 15000 : 5000;
useEffect(() => {
  const interval = setInterval(fetchMessages, pollInterval);
  return () => clearInterval(interval);
}, [fetchMessages, pollInterval]);
```

Fallback polling catches any messages missed during disconnect (5 s while disconnected, 15 s while connected). Good belt-and-braces. Downside: 15 s latency even when the socket is healthy but the wrong message-arrived event was missed for any reason.

**Evidence — Telephony.**

`telephony.gateway.ts:76-80` — `state:snapshot` is emitted on every `handleConnection`:
```ts
client.emit('state:snapshot', {
  calls: this.stateManager.getActiveCalls(),
  agents: this.stateManager.getAgentStates(),
  queues: this.stateManager.getQueueSnapshots(),
});
```

This includes all currently-active calls (from `TelephonyStateManager.activeCalls` map). The map is kept fresh by AMI events AND hydrated from DB on boot (line 62). So a reconnecting client gets a consistent snapshot even if the backend restarted mid-shift.

Weakness: **`call:report-trigger` events fired while the client was disconnected are lost**. `reportTriggerSent` dedup (lines 41, 214–216) is on the server side — it records that "we tried to emit for this linkedId in the last 60s" and never retries. If operator's socket was dead at the moment the call was answered, the call report modal never opens. The operator would have to go to `/app/call-center/reports` and look for their "my-drafts" (which won't exist because nothing was started).

**Evidence — Messenger.**

`messenger-context.tsx:165-210` — no polling fallback, no server replay.

The connect handler (lines 180–195) does:
- Re-emits `conversation:join` for each active chat in `activeChatsRef.current` (re-joins rooms).
- Re-queries `online:check` to rebuild the online users set.

Missed events during the dead window: `message:new`, `message:edited`, `message:deleted`, `message:reaction`, `conversation:updated`, `user:online`, `user:offline`. None are replayed. A user reconnecting will not see messages that arrived during the gap until they manually navigate to the conversation — which triggers `message-list.tsx:141-145` to GET the conversation from HTTP, which DOES catch up. The gap is the dropdown / bubble previews, not the conversation itself.

**Verdict.** PARTIAL.
- Client Chats: FIXED (polling fallback + connect-time room rejoin).
- Telephony: FIXED (state:snapshot + DB hydrate) — except for `call:report-trigger` which has no replay.
- Messenger: PARTIAL — active conversation catches up via HTTP GET on nav; dropdown/bubble previews silently drift until a new message arrives.

**Fix scope.**
- **Telephony** (P2): on reconnect, also scan for CallSessions assigned to this user in the last 5 min with no CallReport drafted; re-emit `call:report-trigger` for each.
- **Messenger** (P3): on reconnect, fetch `/v1/messenger/conversations` to refresh the dropdown list.

**Regression test.** `telephony.gateway.spec.ts` — connect a socket, emit 2 `ami:event` that generate `call:ringing`, disconnect, reconnect, assert `state:snapshot` contains both calls.

---

## Check 8 — Room membership lifecycle

**Evidence — queue-schedule mid-session.** `clientchats.gateway.ts:75-79`:
```ts
const queuePool = await this.queueSchedule.getActiveOperatorsToday();
if (queuePool.includes(userId)) {
  client.join('queue');
}
```

Membership decided at connect only. `queue-schedule.service.ts:32-48` (`setDaySchedule`) and similar `setDailyOverride` mutators do NOT call `ClientChatsEventService.emitQueueUpdated` AND do not iterate connected sockets to add/remove them from the `queue` room. Confirmed by grep:
```
backend/crm-backend/src/clientchats/clientchats.gateway.ts:41:    this.events.setServer(server);
backend/crm-backend/src/clientchats/services/clientchats-event.service.ts:9:  setServer(server: Server) {
backend/crm-backend/src/clientchats/services/clientchats-event.service.ts:71:  emitQueueUpdated(data: unknown) {
```
`emitQueueUpdated` is defined but never called from the schedule service.

**Impact.** A manager removes an operator from today's schedule at 11:00. The operator's socket remains in the `queue` room until the browser tab is closed and reopened. They continue to receive `conversation:new` for unassigned inbound chats — i.e. they're still in the rotation from the socket's perspective, even though `getActiveOperatorsToday()` now excludes them.

**handleDisconnect cleanup.** `clientchats.gateway.ts:120-125` — logs only, no explicit leaves. Socket.IO auto-cleans rooms on disconnect, so this is correct.

`telephony.gateway.ts:88-96` — updates `connectedUsers` Map but does not explicitly leave rooms (Socket.IO handles it).

`messenger.gateway.ts:81-93` — updates `onlineUsers` Map, emits `user:offline` if last socket; rooms auto-cleaned.

**Verdict.** STILL PRESENT at P2 (finding #34 confirmed). Compounds with #25 — `setDaySchedule` does neither the event emit nor the room-membership update.

**Fix scope.** In `QueueScheduleService.setDaySchedule` (and `setDailyOverride`, `addQueueOverride`):
1. Compute the new active pool.
2. Compute the diff (added / removed userIds vs previous pool).
3. For each added userId: find all their `agent:{userId}` sockets via `io.in(\`agent:${userId}\`).fetchSockets()` and call `socket.join('queue')`.
4. For each removed: same, `socket.leave('queue')`.
5. Call `events.emitQueueUpdated(...)` to notify managers.

**Regression test.** `queue-schedule.service.spec.ts` — mock IO server; set schedule removing a user; assert their connected sockets are removed from `queue` room.

---

## Check 9 — Electron softphone socket auth

**Evidence.** Grep for Socket.IO client in softphone:
```
C:\CRM-Platform\crm-phone\src\renderer\sip-service.ts   (WebSocket-only, that's SIP.js WSS to Asterisk)
C:\CRM-Platform\crm-phone\src\main\index.ts             (no socket.io, only HTTP calls to /v1/telephony/lookup, /history at lines 210, 224)
C:\CRM-Platform\crm-phone\src\renderer\ringtone.ts      (audio only)
```

No `socket.io-client` import anywhere in `crm-phone/`. The Electron app:
1. Talks SIP WSS directly to Asterisk (`wss://{sipServer}:8089/ws`).
2. Calls CRM REST endpoints via HTTP for lookup + history (bearer token in `Authorization` header per `app-login` response).
3. Exposes a local Express bridge at `127.0.0.1:19876` for the browser-side `useDesktopPhone` hook (`frontend/crm-frontend/src/hooks/useDesktopPhone.ts`).

**Implication.** The telephony gateway JWT `sub` vs `id` bug (finding #19) does NOT affect the softphone itself — SIP registration is independent, and the softphone's REST lookups use HTTP auth which reads `sub` correctly via `jwt.strategy.ts:22-30`.

The bug affects:
- The **browser-side** call-report modal trigger (`CallReportTriggerListener` → `io('/telephony')`) — see §12.
- Any **future live monitor** that consumes `queue:updated` / `screen:pop`.

**Verdict.** NOT APPLICABLE to softphone. Informational.

---

## Check 10 — Socket.IO vs raw WS, namespaces, transports

All three gateways are NestJS `@WebSocketGateway` which is Socket.IO. Namespaces:
- `/telephony` (`telephony.gateway.ts:27`)
- `/messenger` (`messenger.gateway.ts:22`)
- `/ws/clientchats` (`clientchats.gateway.ts:17`) — note the `/ws/` prefix, unusual but consistent with frontend `useClientChatSocket.ts:18` (`io('${url}/ws/clientchats')`).

Frontend clients all configure `transports: ['websocket', 'polling']` (explicit in `useClientChatSocket.ts:20`, `messenger-context.tsx:170`, `call-report-trigger.tsx:35`). Socket.IO upgrades WebSocket → falls back to long-polling if blocked. Good for corporate proxies.

Nginx on VM must proxy all three namespaces with `Upgrade: websocket` headers. Out of scope to verify config here; tracked under `vm-configs/`.

**Verdict.** FIXED / info. No raw WS anywhere.

---

## Check 11 — Event payload shapes

**screen:pop** (`telephony.gateway.ts:195-200`):
```ts
this.server.to('dashboard').emit('screen:pop', {
  linkedId, callerNumber, lookup, timestamp,
});
```
`lookup` is the result of `TelephonyCallsService.lookupPhone(callerNumber)` — shape documented in `INVENTORY.md §1.2`.

**Frontend consumption.** Grep for `screen:pop` in frontend:
- `call-center/page.tsx` references the name in prose/labels, not as a socket listener.
- `call-report-trigger.tsx` only listens to `call:report-trigger`.

**No one currently subscribes to `screen:pop`**. Either a planned feature that was never wired, or a dead event. Same story for `queue:updated` and `agent:status` — backend emits them constantly (see §3), frontend uses 10 s HTTP polling on `/app/call-center/live` instead (`call-center/live/page.tsx:27,112-116`).

**call:report-trigger** (`telephony.gateway.ts:250-256`):
```ts
this.server.to(`agent:${call.assignedUserId}`).emit('call:report-trigger', {
  callSessionId, direction, callerNumber, calleeNumber, callerClient,
});
```
Consumed at `call-report-trigger.tsx:43-46`. Payload shape matches: `CallReportModal` expects `{ callSessionId, direction, callerNumber, calleeNumber, callerClient }`. Correct.

But — this event is blocked by the `sub`/`id` bug (see §12). Frontend socket is set up with `withCredentials: true` (line 34), so cookies ride, JWT is verified, payload has `sub` not `id`, gateway's `authenticateSocket` returns null, `client.disconnect()`. No listener is ever wired.

**Verdict.** FIXED for payload shapes that ARE consumed; dead events (`queue:updated`, `agent:status`, `screen:pop`) are a waste of bandwidth but not a correctness bug.

---

## Check 12 — JWT `sub` vs `id` cross-reference

**Authoritative finding:** `phase1-security.md` check #2 (P1). Here we elevate severity for the realtime layer specifically.

**Issue.** All three JWT issue paths in `auth.service.ts` put `sub: user.id` on the payload (lines 17–18, 36–37, 90–91, 116–117). `JwtStrategy.validate` (`jwt.strategy.ts:22-30`) correctly maps `payload.sub → req.user.id` for HTTP. But the gateways bypass Passport entirely and call `jwtService.verify()` directly, reading the wrong field.

**Per gateway:**

1. `telephony.gateway.ts:259-282` — reads `payload?.id` at lines 266 and 275. `payload.id` is always `undefined` (JWT issues `sub` only). Both branches fall through. `authenticateSocket` returns `null`. `handleConnection` calls `client.disconnect()` (line 63). **Every telephony socket disconnects silently.**

2. `messenger.gateway.ts:290-320` — returns the raw JWT payload object. Caller reads `user.id` at line 52 (`client.userId = user.id`) — also `undefined`. Line 54 calls `this.messengerService.getEmployeeIdByUserId(undefined)` which returns null, triggering the disconnect at line 58. **Every messenger socket disconnects silently.**

3. `clientchats.gateway.ts:45-85` — correctly reads `payload.sub` (line 54) and uses it at line 55. **This is the only working gateway.**

**Monday impact elevation.**

- Live telephony monitor (`/app/call-center/live`): currently polls HTTP every 10 s, so no live UX loss. **BUT** `CallReportTriggerListener` is the operator's only prompt to open the call-report modal after answering a call. If the socket is dead, the operator must manually open `/app/call-center/reports` → "My Drafts" → create. They will forget. **Every call goes un-reported Monday morning.**
- Messenger: operators and managers rely on messenger for intra-team coordination during shift. If the socket is dead, typing indicators, presence, new-message notifications, bubble-chat previews all go dark. The only visible signal is the unread count which is computed by the sliding-window `/v1/messenger/conversations` refresh — but there is no such refresh cron on the frontend. Users won't notice messages arrived until they manually refresh the page.
- Telephony "screen pop" for inbound calls: not wired to anything in the frontend currently (see §11). Null Monday impact.
- Softphone REST calls: unaffected (HTTP uses Passport).

**Why this is P0 for Monday, not P1:**
- Operators cannot self-diagnose a dead socket. There's no "connection lost" banner in either the call-center pages or the messenger bubble. The failure is invisible.
- Call reporting is a direct line-of-business requirement; unfiled reports mean managers can't audit shift performance.
- Messenger is how operators coordinate during busy shifts; dark messenger = tickets get dropped.

**Verdict.** STILL PRESENT (from `phase1-security.md` check 2). Severity elevation for Monday: **P0**.

**Fix scope** (two-line diff):

`telephony.gateway.ts:259-282` →
```ts
if (authHeader?.startsWith('Bearer ')) {
  const payload = this.jwtService.verify(authHeader.slice(7));
  if (payload?.sub) return { id: payload.sub, email: payload.email };
}
...
if (token) {
  const payload = this.jwtService.verify(token);
  if (payload?.sub) return { id: payload.sub, email: payload.email };
}
```

`messenger.gateway.ts:290-320` — same pattern: return `{ id: payload.sub, email: payload.email }` rather than the raw payload.

**Regression test.** In addition to what `phase1-security.md` proposes, add a telephony smoke that:
1. Creates a JWT with `{ sub: 'user-1' }`.
2. Connects a Socket.IO client with that token in cookie.
3. Asserts connection stays open and `state:snapshot` arrives.

Same for messenger gateway.

---

## P0 / P1 list for Monday

### P0 (launch blockers)

1. **JWT `sub` vs `id` mismatch in telephony + messenger gateways** — cross-ref `phase1-security.md` check #2, finding #19. Severity elevated from P1 → P0 for Monday because:
   - Operators will not see `call:report-trigger` → every call goes un-reported.
   - Messenger goes dark — operator coordination breaks.
   - Telephony live-monitor migration (if it happens) is blocked.
   - Fix is a two-line diff per gateway.

### P1 (must-fix)

2. **AMI broadcast flood** (§3, finding #35). 115 msg/sec steady-state on a 10 call/min shift. No debounce, no diff. Blocking for any Monday live-monitor rewrite; bandwidth / browser CPU cost regardless.

3. **Queue-schedule mid-session membership stale** (§8, findings #25 + #34 combined). Manager removes operator from schedule; operator continues receiving new unassigned chats until they manually refresh their browser. Compounds because `emitQueueUpdated` is dead code — the managers' queue UI also doesn't update.

### P2 (should-fix, time permitting)

4. **Clientchats gateway CORS drift** (§2, finding #5). Prod unaffected; dev-only annoyance. Trivial fix.

5. **Messenger typing DoS** (§4, finding #38). P2 today; upgrade to P1 if Monday surfaces UI freezes.

6. **Duplicate delivery to superadmin** (§5 + §6, findings #36 + #37). Server-side redundancy; client dedup holds. Fix as part of fan-out rework.

7. **Telephony call-report-trigger replay on reconnect** (§7). Operator reconnecting misses a report prompt if the reconnect window overlapped a call answer.

### P3 / info

- Messenger presence in-memory (§1, finding #32) — only matters under multi-instance horizontal scale.
- Dead events `screen:pop`, `queue:updated`, `agent:status` (§11) — wasted bytes; no correctness impact.
- Socket.IO namespace + transport config (§10) — already correct.

---

## Appendix — Files read

Backend:
- `backend/crm-backend/src/telephony/realtime/telephony.gateway.ts`
- `backend/crm-backend/src/telephony/realtime/telephony-state.manager.ts`
- `backend/crm-backend/src/messenger/messenger.gateway.ts`
- `backend/crm-backend/src/clientchats/clientchats.gateway.ts`
- `backend/crm-backend/src/clientchats/services/clientchats-event.service.ts`
- `backend/crm-backend/src/clientchats/services/queue-schedule.service.ts`
- `backend/crm-backend/src/cors.ts`
- `backend/crm-backend/src/auth/auth.service.ts`
- `backend/crm-backend/src/auth/jwt.strategy.ts`

Frontend:
- `frontend/crm-frontend/src/app/app/client-chats/hooks/useClientChatSocket.ts`
- `frontend/crm-frontend/src/app/app/client-chats/components/conversation-panel.tsx`
- `frontend/crm-frontend/src/app/app/messenger/messenger-context.tsx`
- `frontend/crm-frontend/src/app/app/messenger/message-list.tsx`
- `frontend/crm-frontend/src/app/app/messenger/message-item.tsx`
- `frontend/crm-frontend/src/app/app/call-center/call-report-trigger.tsx`
- `frontend/crm-frontend/src/app/app/call-center/live/page.tsx`

Softphone:
- `crm-phone/src/main/index.ts`
- `crm-phone/src/renderer/sip-service.ts`
- `crm-phone/src/renderer/ringtone.ts` (confirmed no socket.io)

Audit sources:
- `audit/INVENTORY.md` (§1.2, §2.3, §3.7, §4)
- `audit/THREAT_MODEL.md` (§7 RT1–RT6)
- `audit/KNOWN_FINDINGS_CARRIED_FORWARD.md` (#19, #32–#38)
- `audit/phase1-rbac.md` + `audit/phase1-security.md` (cross-reference only)
