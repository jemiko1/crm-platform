/**
 * End-to-end regression for the telephony ingest endpoint.
 *
 * Covers the Phase-2 audit scenarios that the unit-level specs in
 * src/telephony/services/telephony-ingestion.service.spec.ts cannot, because
 * the unit specs mock Prisma. This suite hits the real HTTP route
 * (`POST /v1/telephony/events`), runs through the full NestJS stack
 * (TelephonyIngestGuard → controller → service → Prisma → PostgreSQL), and
 * asserts persisted state.
 *
 * Scenarios:
 *  1. Happy path — full inbound lifecycle creates exactly one CallSession
 *     with one CallMetrics row and the expected event count.
 *  2. Duplicate idempotencyKey — posting the same event twice is a no-op
 *     on the second post (CallEvent unique constraint).
 *  3. M7 replayed `call_end` — a second terminal event with the same
 *     linkedId but a distinct idempotencyKey MUST NOT overwrite the first
 *     call's terminal fields. Silent corruption of finalised records here
 *     was the audit's single most-expensive stats bug.
 *  4. Ingest-secret enforcement — requests without or with a wrong
 *     `x-telephony-secret` header must be rejected with 401, even though
 *     the controller is `@SkipThrottle()` and `noAuth: true`.
 *
 * Requires `backend/crm-backend/.env.test` with DATABASE_URL pointing at
 * a scratch Postgres + TELEPHONY_INGEST_SECRET set.
 *
 * Run:
 *   pnpm test:e2e -- --testPathPattern=telephony-ingest
 */
import request from "supertest";
import {
  createTestApp,
  closeTestApp,
  resetDatabase,
  TestContext,
} from "./helpers/test-utils";

const INGEST_PATH = "/v1/telephony/events";

// Use the same secret the guard expects. If the test env vars haven't loaded
// (jest runs dotenv in globalSetup only), default to the dev fixture secret
// so the suite still runs in sensible-local configs.
const SECRET = process.env.TELEPHONY_INGEST_SECRET ?? "test-telephony-secret";

/** Build a single event with sensible defaults + overrides. */
function event(
  eventType: string,
  idempotencyKey: string,
  linkedId: string,
  extra: Record<string, unknown> = {},
) {
  return {
    eventType,
    timestamp: new Date().toISOString(),
    idempotencyKey,
    linkedId,
    uniqueId: linkedId,
    payload: {
      uniqueId: linkedId,
      linkedId,
      ...extra,
    },
  };
}

describe("Telephony Ingest (e2e)", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(ctx);
  });

  beforeEach(async () => {
    await resetDatabase(ctx.prisma);
  });

  // Returns a supertest Test (thenable + chainable with .expect()).
  // Do NOT mark async — that would wrap in a Promise and break the chain.
  function postEvents(events: unknown[], secret: string = SECRET) {
    return request(ctx.app.getHttpServer())
      .post(INGEST_PATH)
      .set("x-telephony-secret", secret)
      .send({ events });
  }

  // ---------------------------------------------------------------------------
  // 1. Auth
  // ---------------------------------------------------------------------------

  describe("TelephonyIngestGuard", () => {
    it("rejects requests with no x-telephony-secret header (401)", async () => {
      await request(ctx.app.getHttpServer())
        .post(INGEST_PATH)
        .send({
          events: [event("call_start", "auth-test-001", "linked-auth-001")],
        })
        .expect(401);
    });

    it("rejects requests with a wrong secret (401)", async () => {
      await postEvents(
        [event("call_start", "auth-test-002", "linked-auth-002")],
        "definitely-not-the-right-secret",
      ).expect(401);
    });

    it("accepts requests with the correct secret", async () => {
      const res = await postEvents([
        event("call_start", "auth-test-003", "linked-auth-003", {
          channel: "SIP/trunk-0001",
          callerIdNum: "555123456",
          context: "inbound",
        }),
      ]);
      // 201 is the default @Post() success code in NestJS.
      expect([200, 201]).toContain(res.status);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Happy path
  // ---------------------------------------------------------------------------

  describe("full inbound lifecycle", () => {
    const linkedId = "linked-e2e-happy-001";

    it("creates one CallSession with one CallMetrics row", async () => {
      const lifecycle = [
        event("call_start", "happy-001-start", linkedId, {
          channel: "SIP/trunk-0001",
          callerIdNum: "555123456",
          callerIdName: "E2E Test",
          context: "inbound",
        }),
        event("queue_enter", "happy-001-qenter", linkedId, {
          queue: "support",
          position: 1,
        }),
        event("agent_connect", "happy-001-aconnect", linkedId, {
          extension: "101",
          holdTime: 10,
          queue: "support",
        }),
        event("call_answer", "happy-001-answer", linkedId, {
          channel: "SIP/101-0002",
        }),
        event("call_end", "happy-001-end", linkedId, {
          cause: "16",
          causeTxt: "NORMAL_CLEARING",
        }),
      ];

      await postEvents(lifecycle);

      const sessions = await ctx.prisma.callSession.findMany({
        where: { linkedId },
      });
      expect(sessions).toHaveLength(1);

      const events = await ctx.prisma.callEvent.findMany({
        where: { callSessionId: sessions[0].id },
      });
      // All 5 events should have been persisted.
      expect(events.length).toBe(5);

      // CallMetrics is populated synchronously at call_end. Exactly one row.
      const metrics = await ctx.prisma.callMetrics.findMany({
        where: { callSessionId: sessions[0].id },
      });
      expect(metrics.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Duplicate idempotencyKey
  // ---------------------------------------------------------------------------

  describe("idempotency", () => {
    it("reposting an event with the same idempotencyKey is a no-op", async () => {
      const linkedId = "linked-e2e-dupe-001";
      const e = event("call_start", "dupe-001-start", linkedId, {
        channel: "SIP/trunk-0001",
        callerIdNum: "555000000",
        context: "inbound",
      });

      await postEvents([e]);
      // Same event, same idempotencyKey — this must be skipped, not duplicated.
      const second = await postEvents([e]);
      expect([200, 201]).toContain(second.status);

      const rows = await ctx.prisma.callEvent.findMany({
        where: { idempotencyKey: "dupe-001-start" },
      });
      expect(rows).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. M7 — replayed call_end field-level merge
  // ---------------------------------------------------------------------------

  describe("M7: replayed call_end", () => {
    const linkedId = "linked-e2e-m7-001";

    beforeEach(async () => {
      // Set up a finalised call session via the happy path.
      await postEvents([
        event("call_start", "m7-001-start", linkedId, {
          channel: "SIP/trunk-0001",
          callerIdNum: "555222333",
          context: "inbound",
        }),
        event("call_answer", "m7-001-answer", linkedId, {
          channel: "SIP/101-0002",
        }),
        event("call_end", "m7-001-end", linkedId, {
          cause: "16",
          causeTxt: "NORMAL_CLEARING",
        }),
      ]);
    });

    it("first call_end sets terminal fields + finalizedAt", async () => {
      const session = await ctx.prisma.callSession.findFirstOrThrow({
        where: { linkedId },
      });
      // Schema terminal fields: endAt, disposition, hangupCause, finalizedAt.
      expect(session.endAt).toBeTruthy();
      expect(session.finalizedAt).toBeTruthy();
      expect(session.disposition).toBeTruthy();
      expect(session.hangupCause).toBe("16");
    });

    it("replayed call_end with different idempotencyKey does NOT overwrite terminal fields", async () => {
      // Snapshot terminal state after the first finalisation.
      const before = await ctx.prisma.callSession.findFirstOrThrow({
        where: { linkedId },
      });
      const beforeEndAt = before.endAt;
      const beforeFinalizedAt = before.finalizedAt;
      const beforeDisposition = before.disposition;
      const beforeHangupCause = before.hangupCause;

      // Replay the SAME linkedId's terminal event with a different
      // idempotencyKey (simulates bridge buffer replay after reconnect).
      await postEvents([
        event("call_end", "m7-001-end-REPLAY", linkedId, {
          // Deliberately DIFFERENT cause — if the merge rule is broken, the
          // session's hangupCause would be overwritten to '487' and the
          // test would fail.
          cause: "487",
          causeTxt: "ORIGINATOR_CANCEL",
        }),
      ]);

      const after = await ctx.prisma.callSession.findFirstOrThrow({
        where: { linkedId },
      });

      // Terminal timestamps must NOT change.
      expect(after.endAt?.toISOString()).toEqual(beforeEndAt?.toISOString());
      expect(after.finalizedAt?.toISOString()).toEqual(
        beforeFinalizedAt?.toISOString(),
      );
      // Disposition must NOT flip.
      expect(after.disposition).toEqual(beforeDisposition);
      // hangupCause must NOT be overwritten (this is the M7 invariant).
      expect(after.hangupCause).toEqual(beforeHangupCause);

      // Replay should still have persisted the CallEvent (audit trail) but
      // MUST NOT have produced a second CallMetrics row.
      const allEvents = await ctx.prisma.callEvent.findMany({
        where: { callSessionId: after.id },
      });
      const metrics = await ctx.prisma.callMetrics.findMany({
        where: { callSessionId: after.id },
      });

      // Two call_end rows in the event log is expected (idempotency-key
      // difference). Exactly 1 CallMetrics is the critical invariant.
      const callEnds = allEvents.filter((e) => e.eventType === "call_end");
      expect(callEnds.length).toBe(2);
      expect(metrics.length).toBe(1);
    });

    it("replayed call_end with SAME idempotencyKey is a no-op (dedup fires first)", async () => {
      // The happy-path already posted "m7-001-end". Repost verbatim.
      await postEvents([
        event("call_end", "m7-001-end", linkedId, {
          cause: "16",
          causeTxt: "NORMAL_CLEARING",
        }),
      ]);

      // One CallEvent with that idempotencyKey — the repost was deduped
      // at the CallEvent layer before even reaching the M7 merge branch.
      const rows = await ctx.prisma.callEvent.findMany({
        where: { idempotencyKey: "m7-001-end" },
      });
      expect(rows).toHaveLength(1);
    });
  });
});
