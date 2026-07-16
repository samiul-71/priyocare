import { test } from "node:test";
import assert from "node:assert/strict";
import { distanceMetres, isGeofenceMismatch, GEOFENCE_RADIUS_M } from "../lib/shared/geo.ts";
import {
  dedupeEvents,
  makeEvent,
  orderForReplay,
  newEventUuid,
} from "../lib/shared/caregiver-events.ts";
import {
  careLogSchema,
  checkInSchema,
  syncBatchSchema,
} from "../lib/shared/caregiver-schemas.ts";

/* ------------------------------------------ AC-1: geofence advisory, invisible */

// Two real Dhaka points: Dhanmondi 27 and Gulshan 1, ~5km apart.
const DHANMONDI = { lat: 23.7509, lng: 90.3735 };
const GULSHAN = { lat: 23.7806, lng: 90.4144 };

test("haversine measures a real Dhaka distance sanely", () => {
  const d = distanceMetres(DHANMONDI, GULSHAN);
  assert.ok(d > 4_500 && d < 6_000, `expected ~5km, got ${Math.round(d)}m`);
  assert.equal(Math.round(distanceMetres(DHANMONDI, DHANMONDI)), 0);
});

test("distance is symmetric", () => {
  assert.equal(
    Math.round(distanceMetres(DHANMONDI, GULSHAN)),
    Math.round(distanceMetres(GULSHAN, DHANMONDI)),
  );
});

test("a 2km-away check-in is a mismatch — an OPS fact, not a caregiver signal (S-1)", () => {
  assert.equal(isGeofenceMismatch(DHANMONDI, GULSHAN), true);
});

test("a check-in at the doorstep is not a mismatch, and the radius is 500m", () => {
  assert.equal(GEOFENCE_RADIUS_M, 500);
  // ~100m north — well inside.
  const nearby = { lat: DHANMONDI.lat + 0.0009, lng: DHANMONDI.lng };
  assert.ok(distanceMetres(nearby, DHANMONDI) < 150);
  assert.equal(isGeofenceMismatch(nearby, DHANMONDI), false);
});

test("the geofence boundary is exclusive — exactly at the radius is not a mismatch", () => {
  // ~450m and ~550m north of the same point.
  const inside = { lat: DHANMONDI.lat + 0.004, lng: DHANMONDI.lng };
  const outside = { lat: DHANMONDI.lat + 0.005, lng: DHANMONDI.lng };
  assert.equal(isGeofenceMismatch(inside, DHANMONDI), false);
  assert.equal(isGeofenceMismatch(outside, DHANMONDI), true);
});

/* ----------------------------------------- AC-2: timestamps + idempotency */

test("an event carries the DEVICE time it was captured at (§7)", () => {
  const captured = new Date("2026-07-17T09:00:00.000Z");
  const event = makeEvent("check_in", 1, {}, captured);
  // Synced hours later — the record must still say 09:00.
  assert.equal(event.occurredAt, "2026-07-17T09:00:00.000Z");
});

test("every event gets a distinct uuid — the idempotency key (AC-2.2)", () => {
  const a = makeEvent("task_tick", 1);
  const b = makeEvent("task_tick", 1);
  assert.notEqual(a.eventUuid, b.eventUuid);
  assert.match(newEventUuid(), /^[0-9a-f-]{36}$/);
});

test("a batch holding the same event twice collapses to one, keeping the first (S-3)", () => {
  const event = makeEvent("check_in", 1, { location: DHANMONDI });
  const resent = { ...event, payload: { location: GULSHAN } }; // same uuid, later copy
  const deduped = dedupeEvents([event, resent]);
  assert.equal(deduped.length, 1);
  assert.deepEqual(deduped[0].payload, { location: DHANMONDI });
});

test("replay is ordered by device time, so check-out never lands before check-in (S-2)", () => {
  const checkIn = makeEvent("check_in", 1, {}, new Date("2026-07-17T09:00:00Z"));
  const tick = makeEvent("task_tick", 1, {}, new Date("2026-07-17T10:30:00Z"));
  const checkOut = makeEvent("check_out", 1, {}, new Date("2026-07-17T12:00:00Z"));

  // Arrive in the wrong order, as a radio would deliver them.
  const ordered = orderForReplay([checkOut, tick, checkIn]);
  assert.deepEqual(ordered.map((e) => e.type), ["check_in", "task_tick", "check_out"]);
});

test("replay order is deterministic when two events share a millisecond", () => {
  const at = new Date("2026-07-17T10:00:00Z");
  const a = makeEvent("task_tick", 1, {}, at);
  const b = makeEvent("task_tick", 1, {}, at);
  const once = orderForReplay([a, b]).map((e) => e.eventUuid);
  const again = orderForReplay([b, a]).map((e) => e.eventUuid);
  assert.deepEqual(once, again);
});

test("orderForReplay does not mutate its input", () => {
  const early = makeEvent("check_in", 1, {}, new Date("2026-07-17T09:00:00Z"));
  const late = makeEvent("check_out", 1, {}, new Date("2026-07-17T12:00:00Z"));
  const input = [late, early];
  orderForReplay(input);
  assert.equal(input[0].type, "check_out");
});

/* -------------------------------------------------------------- validation */

test("a check-in validates with GPS", () => {
  const event = makeEvent("check_in", 7, {});
  const parsed = checkInSchema.safeParse({
    eventUuid: event.eventUuid,
    bookingId: 7,
    occurredAt: event.occurredAt,
    location: { lat: 23.7509, lng: 90.3735, accuracyM: 12 },
  });
  assert.equal(parsed.success, true);
});

test("a check-in validates WITHOUT GPS — no fix must never block the work", () => {
  const event = makeEvent("check_in", 7, {});
  const parsed = checkInSchema.safeParse({
    eventUuid: event.eventUuid,
    bookingId: 7,
    occurredAt: event.occurredAt,
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.location, undefined);
});

test("a check-in without a uuid is rejected — idempotency is not optional", () => {
  const parsed = checkInSchema.safeParse({
    bookingId: 7,
    occurredAt: new Date().toISOString(),
  });
  assert.equal(parsed.success, false);
});

test("impossible coordinates are rejected", () => {
  const event = makeEvent("check_in", 7, {});
  const parsed = checkInSchema.safeParse({
    eventUuid: event.eventUuid,
    bookingId: 7,
    occurredAt: event.occurredAt,
    location: { lat: 200, lng: 90 },
  });
  assert.equal(parsed.success, false);
});

test("a care log keeps the device's logged_at", () => {
  const event = makeEvent("care_log", 3, {}, new Date("2026-07-17T17:00:00Z"));
  const parsed = careLogSchema.safeParse({
    eventUuid: event.eventUuid,
    occurredAt: event.occurredAt,
    tasksCompleted: ["Vitals"],
    notes: "Patient stable",
    mood: "good",
    vitals: { pulse: 72, bpSystolic: 120, bpDiastolic: 80 },
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.occurredAt.toISOString(), "2026-07-17T17:00:00.000Z");
});

test("clinically impossible vitals are rejected", () => {
  const event = makeEvent("care_log", 3, {});
  const parsed = careLogSchema.safeParse({
    eventUuid: event.eventUuid,
    occurredAt: event.occurredAt,
    vitals: { pulse: 9000 },
  });
  assert.equal(parsed.success, false);
});

test("a whole offline shift validates as one batch (S-2)", () => {
  const shift = [
    makeEvent("check_in", 1, {}, new Date("2026-07-17T09:00:00Z")),
    makeEvent("task_tick", 1, { tasks: ["Vitals"] }, new Date("2026-07-17T09:30:00Z")),
    makeEvent("care_log", 1, { notes: "ok" }, new Date("2026-07-17T11:00:00Z")),
    makeEvent("check_out", 1, {}, new Date("2026-07-17T11:30:00Z")),
  ];
  const parsed = syncBatchSchema.safeParse({ events: shift });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.events.length, 4);
});

test("an empty batch is rejected, and an absurd one is capped", () => {
  assert.equal(syncBatchSchema.safeParse({ events: [] }).success, false);
  const flood = Array.from({ length: 201 }, () => makeEvent("task_tick", 1));
  assert.equal(syncBatchSchema.safeParse({ events: flood }).success, false);
});

test("an unknown event type cannot be smuggled into a batch", () => {
  const event = { ...makeEvent("check_in", 1), type: "delete_everything" };
  assert.equal(syncBatchSchema.safeParse({ events: [event] }).success, false);
});
