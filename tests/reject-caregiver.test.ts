import { test } from "node:test";
import assert from "node:assert/strict";
import { rejectCaregiverSchema, suspendSchema } from "../lib/shared/office-schemas.ts";

/*
 * Rejecting an application (§12.2).
 *
 * `rejected` existed in the enum and NOTHING set it — a failed police check had
 * no recorded outcome, so the application sat at `pending` forever,
 * indistinguishable from one nobody had reviewed. Suspension had the mirror
 * bug: the endpoint demanded a reason, parsed it, and threw it away.
 */

test("a rejection requires a reason — it ends someone's chance of work", () => {
  assert.equal(
    rejectCaregiverSchema.safeParse({ reason: "police clearance could not be verified" }).success,
    true,
  );
  assert.equal(rejectCaregiverSchema.safeParse({}).success, false);
  assert.equal(rejectCaregiverSchema.safeParse({ reason: "" }).success, false);
});

test("whitespace is not a reason", () => {
  // "   " would satisfy a naive min(1) and tell nobody anything.
  assert.equal(rejectCaregiverSchema.safeParse({ reason: "   " }).success, false);
});

test("the rejection message says a reason is required, not just 'too small'", () => {
  const parsed = rejectCaregiverSchema.safeParse({ reason: "" });
  assert.equal(parsed.success, false);
  assert.match(String(parsed.error?.issues[0]?.message), /reason is required/i);
});

test("a rejection reason is bounded — it is a note, not an essay", () => {
  assert.equal(rejectCaregiverSchema.safeParse({ reason: "x".repeat(500) }).success, true);
  assert.equal(rejectCaregiverSchema.safeParse({ reason: "x".repeat(501) }).success, false);
});

test("nothing else can ride in on a rejection", () => {
  const parsed = rejectCaregiverSchema.safeParse({
    reason: "references did not check out",
    // A caller must not be able to set the status or the actor directly.
    verificationStatus: "approved",
    statusChangedBy: 99,
  });
  assert.equal(parsed.success, true);
  assert.deepEqual(Object.keys(parsed.data ?? {}), ["reason"]);
});

/* ------------------------------------------------------------- suspension */

test("suspension still requires its reason — which is now actually recorded", () => {
  assert.equal(suspendSchema.safeParse({ reason: "serious complaint upheld" }).success, true);
  assert.equal(suspendSchema.safeParse({ reason: "" }).success, false);
  assert.equal(suspendSchema.safeParse({}).success, false);
});

test("a suspension may carry a serious tag, and it must be a known one", () => {
  assert.equal(
    suspendSchema.safeParse({ reason: "safeguarding concern", seriousTag: "not-a-real-tag" })
      .success,
    false,
  );
  // The tag stays optional: most suspensions are an ordinary judgement call.
  assert.equal(suspendSchema.safeParse({ reason: "repeated lateness" }).success, true);
});
