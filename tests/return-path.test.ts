import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath } from "../lib/shared/return-path.ts";

test("a path under the actor's own prefix survives", () => {
  assert.equal(safeReturnPath("/office/bookings/12/assign", "/office"), "/office/bookings/12/assign");
  assert.equal(safeReturnPath("/office", "/office"), "/office");
  assert.equal(safeReturnPath("/caregiver/today", "/caregiver"), "/caregiver/today");
});

test("nothing is returned when there is no candidate", () => {
  assert.equal(safeReturnPath(undefined, "/office"), null);
  assert.equal(safeReturnPath(null, "/office"), null);
  assert.equal(safeReturnPath("", "/office"), null);
});

// The open-redirect cases: ?next= is attacker-controlled, so a login screen
// that honours it blindly will happily hand a phished staff member to evil.com.
test("absolute and protocol-relative URLs are rejected", () => {
  assert.equal(safeReturnPath("https://evil.com/office", "/office"), null);
  assert.equal(safeReturnPath("http://evil.com", "/office"), null);
  assert.equal(safeReturnPath("//evil.com/office", "/office"), null);
  assert.equal(safeReturnPath("/\\evil.com", "/office"), null);
  assert.equal(safeReturnPath("javascript:alert(1)", "/office"), null);
});

test("a prefix match must land on a segment boundary", () => {
  assert.equal(safeReturnPath("/office.evil.com", "/office"), null);
  assert.equal(safeReturnPath("/officeXYZ", "/office"), null);
  assert.equal(safeReturnPath("/office-admin", "/office"), null);
});

test("one actor's return path cannot point into another's panel", () => {
  assert.equal(safeReturnPath("/caregiver/today", "/office"), null);
  assert.equal(safeReturnPath("/office/alerts", "/caregiver"), null);
  assert.equal(safeReturnPath("/book/nursing/select", "/office"), null);
});

test("control characters and absurd lengths are rejected", () => {
  assert.equal(safeReturnPath("/office/x\r\nSet-Cookie: a=b", "/office"), null);
  assert.equal(safeReturnPath("/office/x\nfoo", "/office"), null);
  assert.equal(safeReturnPath(`/office/${"a".repeat(600)}`, "/office"), null);
});
