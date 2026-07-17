import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNextOwner } from "../lib/server/leads/assignment.ts";
import type { OwnerCandidate } from "../lib/server/leads/assignment.ts";

/*
 * Lead owner rotation (§9, Flow C's "+ owner"). Ops decision, 2026-07-17:
 * round-robin BY SERVICE.
 *
 * Not by zone — that was asked for first, and leads have no zone. Zones are
 * hyper-local delivery areas for sending a caregiver to a house; the three
 * lead-archetype services (health insurance, medical tourism, mental-health
 * counselling) never involve a house, and medical tourism is about leaving the
 * country entirely. The service is the real specialism.
 *
 * The rotation is derived from "who has not had one for longest" rather than a
 * stored pointer, so these tests are about ORDERING, which is the part that can
 * actually be wrong.
 */

const at = (iso: string) => new Date(iso);

test("the least recently assigned staff member gets the lead", () => {
  const pool: OwnerCandidate[] = [
    { staffId: 1, lastAssignedAt: at("2026-07-17T10:00:00Z") },
    { staffId: 2, lastAssignedAt: at("2026-07-15T10:00:00Z") }, // longest wait
    { staffId: 3, lastAssignedAt: at("2026-07-16T10:00:00Z") },
  ];
  assert.equal(pickNextOwner(pool), 2);
});

test("someone who has never been assigned goes first", () => {
  // The whole point of null-first: a new joiner starts working immediately
  // instead of waiting for everyone else's timestamps to age past theirs.
  const pool: OwnerCandidate[] = [
    { staffId: 1, lastAssignedAt: at("2020-01-01T00:00:00Z") }, // ancient, but assigned
    { staffId: 2, lastAssignedAt: null }, // never
  ];
  assert.equal(pickNextOwner(pool), 2);
});

test("null beats even a 1970 timestamp", () => {
  // Guards the `-Infinity` in the sort. A plain `?? 0` would make "never
  // assigned" tie with the epoch, and a clock-skewed row would then outrank a
  // real new joiner.
  const pool: OwnerCandidate[] = [
    { staffId: 1, lastAssignedAt: at("1970-01-01T00:00:00Z") },
    { staffId: 2, lastAssignedAt: null },
  ];
  assert.equal(pickNextOwner(pool), 2);
});

test("ties break by id, so the rotation is deterministic", () => {
  // Two people who have never been assigned sort equal on time. Without the id
  // tie-break the winner would depend on row order — an unpredictable rota and
  // a flaky test.
  const pool: OwnerCandidate[] = [
    { staffId: 7, lastAssignedAt: null },
    { staffId: 3, lastAssignedAt: null },
    { staffId: 5, lastAssignedAt: null },
  ];
  assert.equal(pickNextOwner(pool), 3);
});

test("the same tie breaks the same way regardless of input order", () => {
  const same = at("2026-07-17T10:00:00Z");
  const a: OwnerCandidate[] = [
    { staffId: 9, lastAssignedAt: same },
    { staffId: 4, lastAssignedAt: same },
  ];
  const b: OwnerCandidate[] = [...a].reverse();
  assert.equal(pickNextOwner(a), pickNextOwner(b));
  assert.equal(pickNextOwner(a), 4);
});

test("nobody mapped to the service is Unassigned, not an error", () => {
  // Null is a real answer. An enquiry must never be dropped for want of a rota:
  // it lands Unassigned with a follow-up date, which is how the board behaved
  // before assignment existed at all.
  assert.equal(pickNextOwner([]), null);
});

test("a single mapped staff member always gets the lead", () => {
  const pool: OwnerCandidate[] = [{ staffId: 1, lastAssignedAt: at("2026-07-17T10:00:00Z") }];
  assert.equal(pickNextOwner(pool), 1);
});

test("the pool actually rotates over successive leads", () => {
  // The real behaviour Ops asked for, simulated: assign, stamp the winner as
  // most-recent, repeat. Three staff must come out 1, 2, 3, then back to 1 —
  // not the same person three times.
  const pool: OwnerCandidate[] = [
    { staffId: 1, lastAssignedAt: null },
    { staffId: 2, lastAssignedAt: null },
    { staffId: 3, lastAssignedAt: null },
  ];

  const order: number[] = [];
  for (let i = 0; i < 4; i++) {
    const winner = pickNextOwner(pool)!;
    order.push(winner);
    // Each lead is a second later, mirroring created_at moving forward.
    pool.find((c) => c.staffId === winner)!.lastAssignedAt = at(
      `2026-07-17T10:00:0${i}Z`,
    );
  }

  assert.deepEqual(order, [1, 2, 3, 1]);
});

test("the input is not mutated — the caller's pool is theirs", () => {
  const pool: OwnerCandidate[] = [
    { staffId: 2, lastAssignedAt: null },
    { staffId: 1, lastAssignedAt: null },
  ];
  pickNextOwner(pool);
  assert.deepEqual(
    pool.map((c) => c.staffId),
    [2, 1],
    "pickNextOwner sorted the caller's array in place",
  );
});
