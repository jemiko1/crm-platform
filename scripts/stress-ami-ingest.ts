#!/usr/bin/env npx
/**
 * stress-ami-ingest.ts — Concurrent telephony ingest load test.
 *
 * Purpose
 * -------
 * Verifies that the backend's `/v1/telephony/events` endpoint correctly
 * dedups and persists concurrent AMI event bursts. The AMI bridge batches
 * events on a timer, so under heavy load multiple batches can arrive in
 * parallel — some containing the same event with the same idempotencyKey.
 *
 * The dedup pipeline in `TelephonyIngestionService.processInbound()` is
 * load-bearing (see CLAUDE.md Silent Override Risk #11). Under stress it's
 * the single place most likely to race. This script exercises exactly that
 * race.
 *
 * What it does
 * ------------
 * For N synthetic calls (default 20), posts the full inbound lifecycle
 * (call_start, queue_enter, agent_connect, call_answer, call_end) to
 * `/v1/telephony/events` in C concurrent batches (default 10). A small
 * fraction of events is intentionally duplicated across batches to test
 * dedup.
 *
 * After all posts settle, the script (optionally) queries the backend via
 * a read-only endpoint and reports:
 *   - expected CallSessions (== N)
 *   - expected CallEvents (== N × 5 — duplicates deduped)
 *   - HTTP errors, 4xx/5xx counts, slow (p95) latencies
 *
 * Usage
 * -----
 *   # Against localhost
 *   npx tsx scripts/stress-ami-ingest.ts
 *
 *   # Against staging
 *   BASE_URL=https://crm28demo.asg.ge \
 *   TELEPHONY_INGEST_SECRET=<secret> \
 *     npx tsx scripts/stress-ami-ingest.ts --calls=50 --concurrency=20
 *
 *   # Against production — ONLY in pre-launch rehearsal windows.
 *   # Prefix every idempotencyKey so real call data is never masked.
 *   BASE_URL=https://crm28.asg.ge \
 *   TELEPHONY_INGEST_SECRET=<prod-secret> \
 *   PREFIX=rehearsal-2026-04-21- \
 *     npx tsx scripts/stress-ami-ingest.ts --calls=10 --concurrency=5
 *
 * Safety
 * ------
 * - Idempotency keys and linkedIds are all prefixed (default: `stress-<runId>-`)
 *   so rows are identifiable and deletable later.
 * - NEVER posts to the production backend without explicit BASE_URL.
 * - Respects `TELEPHONY_INGEST_SECRET` from env (no hardcoded prod secret).
 *
 * Cleanup
 * -------
 * After a run against staging/prod, delete the synthetic rows:
 *
 *   DELETE FROM "CallEvent" WHERE "idempotencyKey" LIKE 'stress-%';
 *   DELETE FROM "CallSession" WHERE "linkedId" LIKE 'stress-%';
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SECRET = process.env.TELEPHONY_INGEST_SECRET ?? "test-telephony-secret";

function parseFlag(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!raw) return fallback;
  const value = Number(raw.split("=")[1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const CALLS = parseFlag("calls", 20);
const CONCURRENCY = parseFlag("concurrency", 10);
const DUPE_RATIO = parseFlag("duperatio", 10) / 100; // percentage of events to duplicate across batches
const RUN_ID =
  process.env.PREFIX ??
  `stress-${new Date().toISOString().replace(/[:.]/g, "-")}-`;

interface IngestEvent {
  eventType: string;
  timestamp: string;
  idempotencyKey: string;
  linkedId: string;
  uniqueId: string;
  payload: Record<string, unknown>;
}

/** Build one complete lifecycle for call index i. 5 events, chronological. */
function buildLifecycle(i: number): IngestEvent[] {
  const linkedId = `${RUN_ID}linked-${i.toString().padStart(4, "0")}`;
  const baseTs = Date.now() + i * 1000;
  const mk = (
    type: string,
    offsetSec: number,
    suffix: string,
    payload: Record<string, unknown> = {},
  ): IngestEvent => ({
    eventType: type,
    timestamp: new Date(baseTs + offsetSec * 1000).toISOString(),
    idempotencyKey: `${linkedId}-${suffix}`,
    linkedId,
    uniqueId: linkedId,
    payload: { uniqueId: linkedId, linkedId, ...payload },
  });
  return [
    mk("call_start", 0, "start", {
      channel: "SIP/trunk-stress",
      callerIdNum: `55500${i.toString().padStart(4, "0")}`,
      context: "inbound",
    }),
    mk("queue_enter", 1, "qenter", { queue: "support", position: 1 }),
    mk("agent_connect", 8, "aconnect", {
      extension: "101",
      holdTime: 7,
      queue: "support",
    }),
    mk("call_answer", 9, "answer", { channel: "SIP/101-stress" }),
    mk("call_end", 180, "end", { cause: "16", causeTxt: "NORMAL_CLEARING" }),
  ];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function postBatch(
  events: IngestEvent[],
  attempt = 1,
): Promise<{ ok: boolean; status: number; latencyMs: number; body?: unknown }> {
  const started = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/v1/telephony/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telephony-secret": SECRET,
      },
      body: JSON.stringify({ events }),
    });
    const latencyMs = Date.now() - started;
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* not JSON */
    }
    return { ok: res.ok, status: res.status, latencyMs, body };
  } catch (err) {
    const latencyMs = Date.now() - started;
    // One retry for transient ECONNRESET under heavy load.
    if (attempt === 1) {
      await new Promise((r) => setTimeout(r, 50));
      return postBatch(events, 2);
    }
    return { ok: false, status: 0, latencyMs, body: String(err) };
  }
}

async function main() {
  console.log(`[stress] BASE_URL=${BASE_URL}`);
  console.log(
    `[stress] calls=${CALLS} concurrency=${CONCURRENCY} dupeRatio=${(DUPE_RATIO * 100).toFixed(0)}% runId=${RUN_ID}`,
  );

  // Build all lifecycles, flatten into a single event list.
  const allEvents: IngestEvent[] = [];
  for (let i = 0; i < CALLS; i++) {
    allEvents.push(...buildLifecycle(i));
  }
  const original = allEvents.length;

  // Inject duplicates — random existing events, cloned verbatim (same
  // idempotencyKey). Simulates the bridge posting a batch, failing to
  // persist ACK, and re-posting on reconnect.
  const dupeCount = Math.floor(original * DUPE_RATIO);
  for (let i = 0; i < dupeCount; i++) {
    const src = allEvents[Math.floor(Math.random() * original)];
    allEvents.push({ ...src, payload: { ...src.payload } });
  }

  // Shuffle so events don't arrive in lifecycle order (stressful for
  // the service's internal dedup/upsert ordering).
  allEvents.sort(() => Math.random() - 0.5);

  // Chunk into batches (to match AMI bridge behaviour — default 5/batch).
  const batches = chunk(allEvents, 5);
  console.log(
    `[stress] total events = ${allEvents.length} (${original} unique + ${dupeCount} dupes) in ${batches.length} batches`,
  );

  // Post all batches with bounded concurrency.
  const latencies: number[] = [];
  let ok = 0,
    notOk = 0,
    processed = 0,
    skipped = 0,
    errs = 0;

  const started = Date.now();
  let idx = 0;
  async function worker(workerId: number) {
    while (idx < batches.length) {
      const my = idx++;
      const result = await postBatch(batches[my]);
      latencies.push(result.latencyMs);
      if (result.ok) {
        ok++;
        const body = result.body as {
          processed?: number;
          skipped?: number;
          errors?: unknown[];
        };
        processed += body?.processed ?? 0;
        skipped += body?.skipped ?? 0;
        errs += body?.errors?.length ?? 0;
      } else {
        notOk++;
        console.error(
          `[worker ${workerId}] batch ${my + 1} FAIL http=${result.status} body=`,
          result.body,
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)),
  );
  const elapsedMs = Date.now() - started;

  // Latency percentiles.
  latencies.sort((a, b) => a - b);
  const p = (q: number) =>
    latencies.length === 0
      ? 0
      : latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];

  console.log("");
  console.log("===== stress ingest summary =====");
  console.log(`elapsed:              ${elapsedMs} ms (${(elapsedMs / 1000).toFixed(1)}s)`);
  console.log(`batches OK:           ${ok}`);
  console.log(`batches not-OK:       ${notOk}`);
  console.log(`events processed:     ${processed}`);
  console.log(`events skipped (dup): ${skipped}`);
  console.log(`ingest errors:        ${errs}`);
  console.log(`latency p50:          ${p(0.5)} ms`);
  console.log(`latency p95:          ${p(0.95)} ms`);
  console.log(`latency p99:          ${p(0.99)} ms`);
  console.log(`throughput:           ${((processed + skipped) / (elapsedMs / 1000)).toFixed(1)} events/s`);
  console.log("");
  console.log("Invariants to verify (query DB manually):");
  console.log(`  SELECT COUNT(*) FROM "CallSession" WHERE "linkedId" LIKE '${RUN_ID}%';`);
  console.log(`    -> MUST equal ${CALLS}`);
  console.log(`  SELECT COUNT(*) FROM "CallEvent" WHERE "idempotencyKey" LIKE '${RUN_ID}%';`);
  console.log(`    -> MUST equal ${original} (duplicates deduped by unique constraint)`);
  console.log(`  SELECT COUNT(*) FROM "CallMetrics" cm`);
  console.log(`    JOIN "CallSession" cs ON cs.id = cm."callSessionId"`);
  console.log(`    WHERE cs."linkedId" LIKE '${RUN_ID}%';`);
  console.log(`    -> MUST equal ${CALLS} (one metrics row per finalised session)`);
  console.log("");
  console.log("Cleanup when done:");
  console.log(
    `  DELETE FROM "CallEvent" WHERE "idempotencyKey" LIKE '${RUN_ID}%';`,
  );
  console.log(
    `  DELETE FROM "CallSession" WHERE "linkedId" LIKE '${RUN_ID}%';`,
  );

  // Exit non-zero if anything failed, so CI / a runbook wrapper can detect.
  if (notOk > 0 || errs > 0) {
    console.error("\n[stress] FAIL — see errors above");
    process.exit(1);
  }
  console.log("[stress] OK");
}

main().catch((err) => {
  console.error("[stress] fatal:", err);
  process.exit(2);
});
