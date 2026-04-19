// Regression test for the AMI event-mapper idempotency keys.
//
// Before the P1-8 fix, transfer and hold events used `Date.now()` in their
// idempotencyKey, so every bridge restart and every retry produced a fresh
// key and the backend's CallEvent.idempotencyKey uniqueness guard missed
// them. With multiple concurrent crm_ami sessions on the PBX (observed: 3
// stacked), this inflated transfer counts and hold seconds by Nx.
//
// These tests verify the new keys are deterministic: identical for the same
// underlying AMI event across calls (simulating bridge restart), and
// distinct for genuinely different events.
//
// Run with: npx tsx --test tests/event-mapper.test.ts

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { EventMapper, CrmEvent } from "../src/event-mapper";
import type { AmiEvent } from "../src/ami-client";

function makeTransferEvent(over: Partial<AmiEvent> = {}): AmiEvent {
  return {
    Event: "BlindTransfer",
    Linkedid: "1713551234.100",
    Uniqueid: "1713551234.100",
    TransferTargetChannel: "PJSIP/201-00000042",
    TransferExten: "201",
    Extension: "201",
    Timestamp: "1713551240.123456",
    ...over,
  } as AmiEvent;
}

function makeHoldEvent(
  type: "MusicOnHoldStart" | "MusicOnHoldStop",
  over: Partial<AmiEvent> = {},
): AmiEvent {
  return {
    Event: type,
    Linkedid: "1713551234.100",
    Uniqueid: "1713551234.101",
    Timestamp: "1713551250.654321",
    Class: "default",
    ...over,
  } as AmiEvent;
}

// Helper: answer the call so hold events are emitted (the mapper filters
// hold events pre-answer to avoid queue music noise).
function primeAnsweredCall(mapper: EventMapper, linkedId: string) {
  mapper.map({
    Event: "Newchannel",
    Linkedid: linkedId,
    Uniqueid: linkedId,
    Channel: "PJSIP/trunk-00000001",
    CallerIDNum: "555123",
  } as AmiEvent);
  mapper.map({
    Event: "AgentConnect",
    Linkedid: linkedId,
    Uniqueid: "1713551234.201",
    Interface: "PJSIP/201",
  } as AmiEvent);
}

// ── Transfer idempotency ───────────────────────────────────

test("transfer: identical AMI event → identical idempotencyKey across two mapper instances (simulates bridge restart)", () => {
  const event = makeTransferEvent();

  const mapperA = new EventMapper();
  const [crmEventA] = mapperA.map(event) as CrmEvent[];

  const mapperB = new EventMapper();
  const [crmEventB] = mapperB.map(event) as CrmEvent[];

  assert.equal(crmEventA.eventType, "transfer");
  assert.equal(crmEventB.eventType, "transfer");
  assert.equal(
    crmEventA.idempotencyKey,
    crmEventB.idempotencyKey,
    "transfer idempotencyKey must be stable across mapper instances",
  );
  // Verify composite shape
  assert.match(
    crmEventA.idempotencyKey,
    /^transfer:1713551234\.100:1713551234\.100:PJSIP\/201-00000042$/,
  );
});

test("transfer: different target channel → different idempotencyKey", () => {
  const mapper = new EventMapper();
  const event1 = makeTransferEvent({
    TransferTargetChannel: "PJSIP/201-00000042",
  });
  const event2 = makeTransferEvent({
    TransferTargetChannel: "PJSIP/303-00000055",
  });

  const [out1] = mapper.map(event1) as CrmEvent[];
  const [out2] = mapper.map(event2) as CrmEvent[];

  assert.notEqual(out1.idempotencyKey, out2.idempotencyKey);
});

test("transfer: different originating uniqueid → different idempotencyKey", () => {
  const mapper = new EventMapper();
  const event1 = makeTransferEvent({ Uniqueid: "1713551234.100" });
  const event2 = makeTransferEvent({ Uniqueid: "1713551299.999" });

  const [out1] = mapper.map(event1) as CrmEvent[];
  const [out2] = mapper.map(event2) as CrmEvent[];

  assert.notEqual(out1.idempotencyKey, out2.idempotencyKey);
});

test("transfer: key no longer contains Date.now() (no digits string > 10 chars trailing)", () => {
  const mapper = new EventMapper();
  const [out] = mapper.map(makeTransferEvent()) as CrmEvent[];

  // Date.now() returns a 13-digit millis timestamp. Before the fix, the
  // key ended with `-<13 digits>`. Now it should not.
  assert.ok(
    !/-\d{13}$/.test(out.idempotencyKey),
    `key still ends with Date.now()-like suffix: ${out.idempotencyKey}`,
  );
});

test("transfer: falls back to TransferExten / Extension when TransferTargetChannel is missing", () => {
  const mapper = new EventMapper();
  const event = makeTransferEvent({
    TransferTargetChannel: "",
    TransferExten: "500",
  });
  const [out] = mapper.map(event) as CrmEvent[];

  assert.match(out.idempotencyKey, /^transfer:.*:500$/);
});

// ── Hold idempotency ───────────────────────────────────────

test("hold_start: identical AMI event → identical idempotencyKey across two mapper instances (simulates bridge restart)", () => {
  const event = makeHoldEvent("MusicOnHoldStart");

  const mapperA = new EventMapper();
  primeAnsweredCall(mapperA, event.Linkedid);
  const outA = mapperA.map(event) as CrmEvent[];

  const mapperB = new EventMapper();
  primeAnsweredCall(mapperB, event.Linkedid);
  const outB = mapperB.map(event) as CrmEvent[];

  assert.equal(outA.length, 1, "hold_start should emit one CrmEvent");
  assert.equal(outA[0].eventType, "hold_start");
  assert.equal(
    outA[0].idempotencyKey,
    outB[0].idempotencyKey,
    "hold_start idempotencyKey must be stable across mapper instances",
  );
  assert.match(
    outA[0].idempotencyKey,
    /^hold:hold_start:1713551234\.101:1713551250\.654321$/,
  );
});

test("hold_start vs hold_end on same channel → different idempotencyKey", () => {
  const mapper = new EventMapper();
  primeAnsweredCall(mapper, "1713551234.100");

  const [startOut] = mapper.map(
    makeHoldEvent("MusicOnHoldStart", {
      Timestamp: "1713551250.000000",
    }),
  ) as CrmEvent[];
  const [endOut] = mapper.map(
    makeHoldEvent("MusicOnHoldStop", {
      Timestamp: "1713551280.000000",
    }),
  ) as CrmEvent[];

  assert.notEqual(startOut.idempotencyKey, endOut.idempotencyKey);
  assert.match(startOut.idempotencyKey, /^hold:hold_start:/);
  assert.match(endOut.idempotencyKey, /^hold:hold_end:/);
});

test("hold: two hold cycles on same channel → different idempotencyKey (Timestamp distinguishes them)", () => {
  const mapper = new EventMapper();
  primeAnsweredCall(mapper, "1713551234.100");

  const [hold1] = mapper.map(
    makeHoldEvent("MusicOnHoldStart", {
      Timestamp: "1713551250.000000",
    }),
  ) as CrmEvent[];
  const [hold2] = mapper.map(
    makeHoldEvent("MusicOnHoldStart", {
      Timestamp: "1713551300.000000",
    }),
  ) as CrmEvent[];

  assert.notEqual(
    hold1.idempotencyKey,
    hold2.idempotencyKey,
    "two distinct hold-start events on the same channel must produce distinct keys",
  );
});

test("hold: falls back to Linkedid when Timestamp is absent (manager.conf without timestampevents)", () => {
  const mapper = new EventMapper();
  primeAnsweredCall(mapper, "1713551234.100");

  const [out] = mapper.map(
    makeHoldEvent("MusicOnHoldStart", { Timestamp: "" }),
  ) as CrmEvent[];

  // Key still built, uses Linkedid as the `ts` slot to keep it deterministic.
  assert.match(
    out.idempotencyKey,
    /^hold:hold_start:1713551234\.101:1713551234\.100$/,
  );
});

test("hold: key no longer contains Date.now()", () => {
  const mapper = new EventMapper();
  primeAnsweredCall(mapper, "1713551234.100");
  const [out] = mapper.map(
    makeHoldEvent("MusicOnHoldStart"),
  ) as CrmEvent[];

  assert.ok(
    !/-\d{13}$/.test(out.idempotencyKey),
    `hold key still looks like Date.now(): ${out.idempotencyKey}`,
  );
});
