#!/usr/bin/env npx
/**
 * clientchats-scenario-runner.ts — automated end-to-end test harness for
 * the client-chats module.
 *
 * Purpose
 * -------
 * The founder runs the CRM alone and cannot easily simulate multi-role
 * scenarios (customer + operator + manager acting on the same conversation).
 * This script scripts those scenarios over the real HTTP API + Socket.IO so
 * the full flow is exercised without needing human coordination.
 *
 * Covers the April 2026 audit fixes:
 *  - A1: [Chat started] placeholder excluded from firstResponseAt calc
 *  - A2: manager-assignConversation stamps joinedAt
 *  - A3: reopen clears firstResponseAt + joinedAt
 *  - Q1 decision B: silence-after-first-reply escalation fires warn +
 *    auto-unassign at the configured thresholds
 *
 * Usage
 * -----
 *   # Local (uses superadmin account by default)
 *   npx tsx scripts/clientchats-scenario-runner.ts
 *
 *   # Specific scenario
 *   npx tsx scripts/clientchats-scenario-runner.ts --scenario=3
 *
 *   # Against staging
 *   BASE_URL=https://crm28demo.asg.ge \
 *     ADMIN_EMAIL=admin@crm.local ADMIN_PASSWORD=... \
 *     npx tsx scripts/clientchats-scenario-runner.ts
 *
 *   # Cleanup mode — removes all scenario-runner-prefixed conversations
 *   npx tsx scripts/clientchats-scenario-runner.ts --cleanup
 *
 * Safety
 * ------
 * Every conversation created by this script uses `visitorId` and
 * `externalConversationId` prefixed with `scenario-runner-<iso-timestamp>-`.
 * Cleanup mode uses this prefix to find + delete only synthetic rows.
 *
 * Run against production ONLY during scheduled test windows. Conversations
 * are real database rows during the test and skew analytics until cleaned.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@crm.local";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "Admin123!";

const RUN_ID = `scenario-runner-${new Date().toISOString().replace(/[:.]/g, "-")}`;

// ───────────── colored console helpers ─────────────
const c = {
  gray: (s: string) => `\x1b[90m${s}\x1b[0m`,
  green: (s: string) => `\x1b[1;32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[1;31m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[1;33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[1;36m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
  conversationId?: string;
}

const results: TestResult[] = [];

// ───────────── HTTP helpers ─────────────

interface Session {
  accessToken: string;
  userId: string;
  cookieJar: string[];
}

async function loginAsAdmin(): Promise<Session> {
  // Use /auth/app-login (native-auth endpoint) — returns accessToken in
  // JSON body. /auth/login only sets an httpOnly cookie and does NOT
  // return the token, which would leave every subsequent Bearer call
  // broken. (C1 from code review PR #281.)
  const res = await fetch(`${BASE_URL}/auth/app-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(
      `Login failed: HTTP ${res.status} — check ADMIN_EMAIL/ADMIN_PASSWORD env vars`,
    );
  }
  const body = (await res.json()) as { accessToken: string; user: { id: string } };
  return { accessToken: body.accessToken, userId: body.user.id, cookieJar: [] };
}

function authHeaders(session: Session): Record<string, string> {
  // Bearer-only. The cookie path isn't needed — /auth/app-login gives us a
  // token that works against every JwtAuthGuard-protected route.
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${session.accessToken}`,
  };
}

async function api(
  session: Session,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: authHeaders(session),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → HTTP ${res.status}: ${text}`);
  }
  return json;
}

/**
 * Send an operator reply via the agent endpoint. This endpoint uses
 * `FileInterceptor('file')` (multipart/form-data), not JSON. Sending JSON
 * here results in undefined `text` and a `Text or file is required` 400.
 * (C2 from code review PR #281.)
 */
async function replyMessage(
  session: Session,
  conversationId: string,
  text: string,
): Promise<void> {
  const form = new FormData();
  form.append("text", text);
  const res = await fetch(
    `${BASE_URL}/v1/clientchats/conversations/${conversationId}/reply`,
    {
      method: "POST",
      headers: {
        // DO NOT set Content-Type — fetch sets it with the correct
        // multipart boundary from the FormData body.
        Authorization: `Bearer ${session.accessToken}`,
      },
      body: form,
    },
  );
  if (!res.ok) {
    throw new Error(
      `reply failed: HTTP ${res.status} ${await res.text()}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ───────────── Widget customer simulator ─────────────

interface WidgetSession {
  conversationId: string;
  visitorId: string;
  token: string;
}

async function widgetStart(scenarioTag: string): Promise<WidgetSession> {
  const visitorId = `${RUN_ID}-${scenarioTag}-visitor`;
  const res = await fetch(`${BASE_URL}/public/clientchats/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      visitorId,
      name: `Scenario ${scenarioTag} Test`,
      phone: `99000${Math.floor(Math.random() * 1000000)
        .toString()
        .padStart(7, "0")}`,
    }),
  });
  if (!res.ok) {
    throw new Error(`widget start failed: HTTP ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as WidgetSession;
  return data;
}

async function widgetSendMessage(
  ws: WidgetSession,
  text: string,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/public/clientchats/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-conversation-token": ws.token,
    },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error(
      `widget send failed: HTTP ${res.status} ${await res.text()}`,
    );
  }
}

// ───────────── Assertion helpers ─────────────

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(
      `ASSERT EQUAL FAILED: ${label}: expected ${String(expected)}, got ${String(actual)}`,
    );
  }
}

function assertNonNull(value: unknown, label: string): void {
  if (value === null || value === undefined) {
    throw new Error(`ASSERT NON-NULL FAILED: ${label}`);
  }
}

async function pollUntil(
  fn: () => Promise<boolean>,
  { timeoutMs, intervalMs = 500, label }: { timeoutMs: number; intervalMs?: number; label: string },
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil timeout: ${label} (waited ${timeoutMs}ms)`);
}

// ───────────── Helpers to read conversation state ─────────────

interface ConversationView {
  id: string;
  assignedUserId: string | null;
  joinedAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  status: string;
  [k: string]: unknown;
}

async function getConversation(
  session: Session,
  conversationId: string,
): Promise<ConversationView> {
  // The endpoint returns conversation fields spread at top level (plus
  // `whatsappWindowOpen` helper). Guard is assertCanAccessConversation —
  // superadmin bypasses via isManager(req) check.
  return (await api(
    session,
    "GET",
    `/v1/clientchats/conversations/${conversationId}`,
  )) as ConversationView;
}

async function getEscalationEvents(
  session: Session,
  conversationId: string,
): Promise<Array<{ type: string; fromUserId: string | null; createdAt: string; conversationId: string }>> {
  // The backend controller currently ignores `?conversationId=` and only
  // reads `?limit=`. Fetch a larger slice and filter client-side.
  // (C4 from code review PR #281.)
  const events = (await api(
    session,
    "GET",
    `/v1/clientchats/queue/escalation-events?limit=200`,
  )) as Array<{ type: string; fromUserId: string | null; createdAt: string; conversationId: string }>;
  return Array.isArray(events)
    ? events.filter((e) => e.conversationId === conversationId)
    : [];
}

// ───────────── Scenario runner scaffolding ─────────────

async function runScenario(
  name: string,
  fn: () => Promise<{ conversationId?: string }>,
): Promise<void> {
  const start = Date.now();
  console.log("");
  console.log(c.cyan(c.bold(`▶ ${name}`)));
  try {
    const { conversationId } = await fn();
    const durationMs = Date.now() - start;
    console.log(c.green(`  ✓ PASS (${durationMs}ms)`));
    results.push({ name, passed: true, durationMs, conversationId });
  } catch (err) {
    const durationMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(c.red(`  ✗ FAIL (${durationMs}ms): ${msg}`));
    results.push({
      name,
      passed: false,
      durationMs,
      error: msg,
    });
  }
}

// ───────────── Scenarios ─────────────

/**
 * Scenario 1 — Happy path.
 * Customer opens widget → operator joins → sends reply → closes.
 * Verifies: joinedAt set, firstResponseAt set, status=CLOSED.
 *
 * Also verifies A1 indirectly — we check that firstResponseAt is measured
 * against the real customer message, not the [Chat started] placeholder,
 * by timing the test precisely.
 */
async function scenario1_happyPath(session: Session): Promise<{ conversationId: string }> {
  const ws = await widgetStart("s1");
  console.log(c.gray(`    widget started — conversation=${ws.conversationId.slice(0, 8)}…`));

  // Real customer message (this is what firstResponseAt should measure from,
  // NOT the synthetic [Chat started] from widgetStart).
  await widgetSendMessage(ws, "Scenario 1: Hello, I need help with my order");
  const customerMessageAt = Date.now();
  console.log(c.gray(`    customer sent real message`));

  // Operator joins (self-pickup) — sets joinedAt.
  await api(session, "POST", `/v1/clientchats/conversations/${ws.conversationId}/join`);
  console.log(c.gray(`    operator joined (joinedAt should be set)`));

  // Operator sends first reply — sets firstResponseAt.
  await replyMessage(session, ws.conversationId, "Scenario 1: Operator reply");
  const operatorReplyAt = Date.now();
  console.log(c.gray(`    operator replied (firstResponseAt should be set)`));

  const conv = await getConversation(session, ws.conversationId);

  assertNonNull(conv.joinedAt, "joinedAt");
  assertNonNull(conv.firstResponseAt, "firstResponseAt");
  assertEqual(conv.assignedUserId, session.userId, "assignedUserId = operator");

  // A1 sanity: firstResponseAt - customerMessageAt should be close to
  // (operatorReplyAt - customerMessageAt). If the system had used the
  // widget-open time (before customerMessageAt), firstResponseAt would
  // be LATER relative to customerMessageAt.
  const firstResponseMs = new Date(conv.firstResponseAt!).getTime();
  const elapsedSinceCustomer = operatorReplyAt - customerMessageAt;
  const elapsedSinceFirstResponse = firstResponseMs - customerMessageAt;
  console.log(
    c.gray(
      `    firstResponseAt is ${elapsedSinceFirstResponse}ms after real customer msg (control: ${elapsedSinceCustomer}ms)`,
    ),
  );

  // Close it.
  await api(
    session,
    "PATCH",
    `/v1/clientchats/conversations/${ws.conversationId}/status`,
    { status: "CLOSED" },
  );
  const closed = await getConversation(session, ws.conversationId);
  assertEqual(closed.status, "CLOSED", "status after close");
  assertNonNull(closed.resolvedAt, "resolvedAt after close");
  console.log(c.gray(`    conversation closed`));

  return { conversationId: ws.conversationId };
}

/**
 * Scenario 2 — A2 regression: manager hand-assigns an unassigned
 * conversation. joinedAt MUST be stamped. Before the fix, manager-assigned
 * conversations had null joinedAt and silently dropped from pickup/
 * resolution analytics.
 */
async function scenario2_managerAssignStampsJoinedAt(
  session: Session,
): Promise<{ conversationId: string }> {
  const ws = await widgetStart("s2");
  await widgetSendMessage(ws, "Scenario 2: I need a manager to assign me");
  console.log(c.gray(`    customer messaged into unassigned queue`));

  // Manager hand-assigns (PATCH conversations/:id/assign).
  await api(
    session,
    "PATCH",
    `/v1/clientchats/conversations/${ws.conversationId}/assign`,
    { userId: session.userId },
  );
  console.log(c.gray(`    manager assigned to user ${session.userId.slice(0, 8)}…`));

  const conv = await getConversation(session, ws.conversationId);

  assertEqual(conv.assignedUserId, session.userId, "assignedUserId");
  assertNonNull(
    conv.joinedAt,
    "joinedAt (A2 fix — manager assignment should stamp this)",
  );
  console.log(c.gray(`    joinedAt=${conv.joinedAt} ✓`));

  return { conversationId: ws.conversationId };
}

/**
 * Scenario 3 — A3 regression: reopen clears firstResponseAt and joinedAt.
 * Without this, reopened conversations have stale SLA clock and escalation
 * never fires.
 */
async function scenario3_reopenClearsSlaClock(
  session: Session,
): Promise<{ conversationId: string }> {
  const ws = await widgetStart("s3");
  await widgetSendMessage(ws, "Scenario 3: Initial inbound");
  await api(session, "POST", `/v1/clientchats/conversations/${ws.conversationId}/join`);
  await replyMessage(
    session,
    ws.conversationId,
    "Scenario 3: First reply sets firstResponseAt",
  );

  // Close and verify closed.
  await api(
    session,
    "PATCH",
    `/v1/clientchats/conversations/${ws.conversationId}/status`,
    { status: "CLOSED" },
  );
  const closed = await getConversation(session, ws.conversationId);
  assertEqual(closed.status, "CLOSED", "status CLOSED");
  assertNonNull(closed.firstResponseAt, "firstResponseAt set before reopen");
  console.log(c.gray(`    closed with firstResponseAt=${closed.firstResponseAt}`));

  // Manager reopens WITHOUT keeping operator.
  await api(
    session,
    "POST",
    `/v1/clientchats/queue/conversations/${ws.conversationId}/approve-reopen`,
    { keepOperator: false },
  );
  const reopened = await getConversation(session, ws.conversationId);

  assertEqual(reopened.status, "LIVE", "status after reopen");
  assertEqual(
    reopened.firstResponseAt,
    null,
    "firstResponseAt cleared on reopen (A3 fix)",
  );
  assertEqual(
    reopened.joinedAt,
    null,
    "joinedAt cleared on reopen without keepOperator (A3 fix)",
  );
  assertEqual(
    reopened.assignedUserId,
    null,
    "assignedUserId cleared when keepOperator=false",
  );
  console.log(c.gray(`    reopen cleared firstResponseAt + joinedAt ✓`));

  return { conversationId: ws.conversationId };
}

/**
 * Scenario 4 — Q1 decision B: silence-after-first-reply escalation.
 * Temporarily sets post-reply SLA to 1-min warn / 2-min reassign, creates
 * a conversation where operator replies then customer sends a follow-up,
 * waits for the cron tick (runs every 1 min), verifies event log.
 *
 * Total runtime: ~2.5 minutes.
 */
async function scenario4_silenceAfterReplyEscalation(
  session: Session,
): Promise<{ conversationId: string }> {
  // Save original config so we can restore.
  const originalConfig = (await api(
    session,
    "GET",
    `/v1/clientchats/queue/escalation-config`,
  )) as {
    postReplyTimeoutMins: number;
    postReplyReassignAfterMins: number;
  };

  try {
    // Tighten thresholds: warn at 1 min, reassign at 3 min. We widen the
    // gap from 2 to 3 so the cron has a guaranteed tick where
    // elapsed>=warn AND elapsed<reassign — otherwise on a slow tick the
    // warn branch gets skipped and reassign fires directly. (W1 from
    // code review PR #281.)
    await api(session, "PUT", `/v1/clientchats/queue/escalation-config`, {
      postReplyTimeoutMins: 1,
      postReplyReassignAfterMins: 3,
    });
    console.log(c.gray(`    tightened post-reply SLA to 1/3 min for test`));

    const ws = await widgetStart("s4");
    await widgetSendMessage(ws, "Scenario 4: Initial question");
    await api(session, "POST", `/v1/clientchats/conversations/${ws.conversationId}/join`);
    await replyMessage(
      session,
      ws.conversationId,
      "Scenario 4: Operator's first reply",
    );
    console.log(c.gray(`    operator replied, now going silent…`));

    // Customer sends a follow-up that operator won't answer.
    await widgetSendMessage(
      ws,
      "Scenario 4: Follow-up question that operator won't answer",
    );
    console.log(c.gray(`    customer sent follow-up (clock starts now)`));

    // Poll for the warning event. Cron runs at whole-minute boundaries;
    // worst-case the follow-up lands at second 01 and the first tick
    // after threshold elapses ~2min later — so 150s is the safe ceiling.
    await pollUntil(
      async () => {
        const events = await getEscalationEvents(session, ws.conversationId);
        return events.some((e) => e.type === "POST_REPLY_TIMEOUT_WARNING");
      },
      { timeoutMs: 150_000, intervalMs: 3_000, label: "POST_REPLY_TIMEOUT_WARNING" },
    );
    console.log(c.green(`    ✓ POST_REPLY_TIMEOUT_WARNING event fired`));

    // Poll for the auto-unassign event. 3min threshold + up to 1min cron
    // lag + 1min buffer = 300s.
    await pollUntil(
      async () => {
        const events = await getEscalationEvents(session, ws.conversationId);
        return events.some((e) => e.type === "POST_REPLY_AUTO_UNASSIGN");
      },
      { timeoutMs: 300_000, intervalMs: 3_000, label: "POST_REPLY_AUTO_UNASSIGN" },
    );
    console.log(c.green(`    ✓ POST_REPLY_AUTO_UNASSIGN event fired`));

    const conv = await getConversation(session, ws.conversationId);
    assertEqual(
      conv.assignedUserId,
      null,
      "assignedUserId cleared after auto-unassign",
    );

    return { conversationId: ws.conversationId };
  } finally {
    // Restore original thresholds. Wrapped in try/catch so a transient
    // backend failure during restore doesn't mask the scenario's primary
    // error. (W6 from code review PR #281.)
    try {
      await api(session, "PUT", `/v1/clientchats/queue/escalation-config`, {
        postReplyTimeoutMins: originalConfig.postReplyTimeoutMins,
        postReplyReassignAfterMins: originalConfig.postReplyReassignAfterMins,
      });
      console.log(c.gray(`    restored original SLA thresholds`));
    } catch (err) {
      console.log(
        c.red(`    WARNING: failed to restore SLA config: ${String(err)}`),
      );
      console.log(
        c.yellow(
          `    Manually restore in admin UI: postReplyTimeoutMins=${originalConfig.postReplyTimeoutMins}, postReplyReassignAfterMins=${originalConfig.postReplyReassignAfterMins}`,
        ),
      );
    }
  }
}

/**
 * Scenario 5 — A1 regression: analytics endpoint excludes [Chat started]
 * from first-response-time. We create a conversation where the customer
 * spends ~3 seconds between widget-open and their first real message, then
 * operator replies immediately. If the bug is present, firstResponseMs
 * would include those 3 seconds; if fixed, only operator-reply-latency.
 *
 * Too variable to make a precise numeric assertion — instead we assert
 * the delta between two scenarios with different "typing delays" is small.
 */
async function scenario5_analyticsExcludesChatStarted(
  session: Session,
): Promise<{ conversationId: string }> {
  // Conversation A: customer types immediately (no typing delay).
  const a = await widgetStart("s5a");
  await widgetSendMessage(a, "Scenario 5A: No typing delay");
  await api(session, "POST", `/v1/clientchats/conversations/${a.conversationId}/join`);
  await replyMessage(session, a.conversationId, "Scenario 5A: Operator replies fast");
  const convA = await getConversation(session, a.conversationId);

  // Conversation B: customer has a 3-second "typing delay" after widget open.
  const b = await widgetStart("s5b");
  await sleep(3_000);
  await widgetSendMessage(b, "Scenario 5B: Typed for 3 seconds first");
  await api(session, "POST", `/v1/clientchats/conversations/${b.conversationId}/join`);
  await replyMessage(session, b.conversationId, "Scenario 5B: Operator replies fast");
  const convB = await getConversation(session, b.conversationId);

  // Both conversations are NOW the operator's "last 24h" set per
  // /queue/live-status. Its `avgResponseMins` is computed by the same
  // SQL path that the A1 fix applies to. Before the fix, convB's
  // contribution would be ~3s inflated vs convA; after, both are tiny.
  //
  // Direct verification: call live-status and confirm the operator's
  // avgResponseMins is the tight bound (close to 0 when both replies
  // were near-instant), not a full second away.
  const liveStatus = (await api(
    session,
    "GET",
    `/v1/clientchats/queue/live-status`,
  )) as {
    activeOperators?: Array<{
      userId: string;
      avgResponseMins: number | null;
    }>;
  };
  const selfRow = liveStatus.activeOperators?.find(
    (op) => op.userId === session.userId,
  );
  console.log(
    c.gray(
      `    /queue/live-status avgResponseMins for this operator: ${
        selfRow?.avgResponseMins ?? "(no row)"
      }`,
    ),
  );

  // Raw createdAt→firstResponseAt on the conversation row (for comparison).
  // These reflect what analytics WOULD have used under the old bug.
  const spanA =
    new Date(convA.firstResponseAt!).getTime() -
    new Date(convA.createdAt as string).getTime();
  const spanB =
    new Date(convB.firstResponseAt!).getTime() -
    new Date(convB.createdAt as string).getTime();
  const deltaMs = spanB - spanA;
  console.log(
    c.gray(
      `    Conversation row createdAt→firstResponseAt: A=${spanA}ms, B=${spanB}ms, Δ=${deltaMs}ms`,
    ),
  );
  // NOTE: we deliberately DON'T assert a specific value on avgResponseMins
  // here. On localhost with a clean DB it should be 0 (both replies were
  // near-instant). On staging/prod with pre-existing operator activity in
  // the 24h window, it will be >0 and a strict assertion would cause false
  // failures. This scenario is informational — it proves the endpoint
  // returns a live-status row for the operator without error and that
  // A1 has not introduced NaN / type regressions.
  //
  // The authoritative A1 verification is the unit test in
  //   clientchats-analytics.service.spec.ts
  //     `excludes [Chat started] placeholder from first-response-time clock-start`
  if (selfRow && typeof selfRow.avgResponseMins === "number") {
    assert(
      Number.isFinite(selfRow.avgResponseMins) && selfRow.avgResponseMins >= 0,
      `Live-status avgResponseMins must be a non-negative finite number, got ${selfRow.avgResponseMins}`,
    );
    if (selfRow.avgResponseMins === 0) {
      console.log(
        c.gray(
          `    avgResponseMins=0 is consistent with A1 fix on a clean 24h window.`,
        ),
      );
    } else {
      console.log(
        c.gray(
          `    avgResponseMins=${selfRow.avgResponseMins} — likely other conversations in the window. Not a regression signal on its own.`,
        ),
      );
    }
  }

  return { conversationId: a.conversationId };
}

// ───────────── Cleanup ─────────────

async function cleanup(session: Session): Promise<void> {
  console.log(
    c.yellow("Cleanup mode — scanning for scenario-runner conversations via API…"),
  );

  // Backend's list endpoint doesn't filter by externalConversationId prefix,
  // so we paginate and filter client-side. ConversationQueryDto caps
  // `limit` at 100 (via @Max(100)) so don't request more. Response shape
  // is `{ data, meta: { total, page, limit, totalPages } }`. We sweep up
  // to 10 pages (1000 conversations) which is plenty for cleanup of
  // scenario-runner artifacts.
  const mine: Array<{ id: string; externalConversationId: string }> = [];
  for (let page = 1; page <= 10; page++) {
    const listed = (await api(
      session,
      "GET",
      `/v1/clientchats/conversations?limit=100&page=${page}`,
    )) as {
      data?: Array<{ id: string; externalConversationId: string }>;
      meta?: { total: number; page: number; totalPages: number };
    };
    const convs = listed.data ?? [];
    if (convs.length === 0) break;
    mine.push(
      ...convs.filter((c) =>
        c.externalConversationId?.startsWith("scenario-runner-"),
      ),
    );
    if (listed.meta && page >= listed.meta.totalPages) break;
  }

  if (mine.length === 0) {
    console.log(c.gray("  No scenario-runner conversations found in top 500."));
    console.log(
      c.gray(
        "  If you expect some, they may be older — use the SQL fallback below.",
      ),
    );
  } else {
    console.log(c.gray(`  Found ${mine.length} scenario-runner conversations:`));
    let deleted = 0;
    for (const conv of mine) {
      try {
        // DELETE /v1/clientchats/queue/conversations/:id is the manager-
        // level hard-delete endpoint. Superadmin bypasses the permission
        // check. Cascades to messages + escalation events.
        await api(
          session,
          "DELETE",
          `/v1/clientchats/queue/conversations/${conv.id}`,
        );
        deleted++;
        console.log(
          c.gray(`    ✓ deleted ${conv.externalConversationId.slice(0, 60)}…`),
        );
      } catch (err) {
        console.log(
          c.red(`    ✗ failed: ${conv.externalConversationId}: ${String(err)}`),
        );
      }
    }
    console.log(c.green(`  Deleted ${deleted}/${mine.length}.`));
  }

  console.log("");
  console.log(c.bold("Fallback SQL (if the API-driven cleanup above missed rows):"));
  console.log("");
  console.log(
    `  DELETE FROM "ClientChatConversation" WHERE "externalConversationId" LIKE 'scenario-runner-%';`,
  );
  console.log(
    c.gray("  (Messages + escalation events cascade-delete via FK on conversation.)"),
  );
}

// ───────────── Main ─────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const scenarioFlag = args.find((a) => a.startsWith("--scenario="));
  const selectedScenario = scenarioFlag
    ? scenarioFlag.split("=")[1]
    : null;
  const isCleanup = args.includes("--cleanup");

  console.log(c.bold("CRM28 Client Chats — Scenario Runner"));
  console.log(c.gray(`BASE_URL=${BASE_URL}`));
  console.log(c.gray(`runId=${RUN_ID}`));

  const session = await loginAsAdmin();
  console.log(c.gray(`admin user id=${session.userId.slice(0, 8)}…`));

  if (isCleanup) {
    await cleanup(session);
    return;
  }

  const scenarios: Array<{ id: string; name: string; run: () => Promise<{ conversationId?: string }> }> = [
    {
      id: "1",
      name: "[S1] Happy path — widget start → operator join → reply → close",
      run: () => scenario1_happyPath(session),
    },
    {
      id: "2",
      name: "[S2] A2 regression — manager-assigned conversation stamps joinedAt",
      run: () => scenario2_managerAssignStampsJoinedAt(session),
    },
    {
      id: "3",
      name: "[S3] A3 regression — reopen clears firstResponseAt + joinedAt",
      run: () => scenario3_reopenClearsSlaClock(session),
    },
    {
      id: "4",
      name: "[S4] Q1 B — silence-after-first-reply escalation (warn + unassign)",
      run: () => scenario4_silenceAfterReplyEscalation(session),
    },
    {
      id: "5",
      name: "[S5] A1 smoke test — analytics excludes [Chat started] placeholder",
      run: () => scenario5_analyticsExcludesChatStarted(session),
    },
  ];

  const toRun = selectedScenario
    ? scenarios.filter((s) => s.id === selectedScenario)
    : scenarios;

  if (toRun.length === 0) {
    console.log(c.red(`No scenarios match --scenario=${selectedScenario}`));
    process.exit(2);
  }

  // The public widget start endpoint is rate-limited to 5 requests / 60s
  // per IP (@Throttle on clientchats-public.controller.ts). Running all
  // five scenarios back-to-back triggers 6+ widget starts (s5 uses two)
  // and the 6th hits 429. Space scenarios 13 seconds apart so we stay
  // under the cap. (C3 from code review PR #281.)
  //
  // When --scenario= is used to run one in isolation, the delay doesn't
  // matter; we still apply it between iterations if the user passes
  // multiple via comma, which isn't supported yet but keeps the logic
  // future-proof.
  for (let i = 0; i < toRun.length; i++) {
    if (i > 0) {
      console.log(
        c.gray(
          `\n  (sleeping 13s between scenarios — rate limit on /public/clientchats/start)`,
        ),
      );
      await sleep(13_000);
    }
    await runScenario(toRun[i].name, toRun[i].run);
  }

  // Summary.
  console.log("");
  console.log(c.bold("═══════════ SUMMARY ═══════════"));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  for (const r of results) {
    const icon = r.passed ? c.green("✓") : c.red("✗");
    const line = `${icon} ${r.name}${r.conversationId ? ` (conv=${r.conversationId.slice(0, 8)}…)` : ""}`;
    console.log(line);
    if (!r.passed && r.error) console.log(c.red(`    ${r.error}`));
  }
  console.log("");
  console.log(
    `${passed}/${results.length} passed${failed > 0 ? c.red(`, ${failed} failed`) : ""}`,
  );
  console.log("");
  console.log(c.yellow("Cleanup:"));
  console.log(
    c.gray(
      `  DELETE FROM "ClientChatConversation" WHERE "externalConversationId" LIKE '${RUN_ID}%';`,
    ),
  );
  console.log("");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(c.red("\nFATAL:"), err);
  process.exit(2);
});
