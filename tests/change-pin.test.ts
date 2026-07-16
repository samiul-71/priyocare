import { test } from "node:test";
import assert from "node:assert/strict";
import { changePinSchema, newPinSchema } from "../lib/shared/auth-schemas.ts";

/*
 * First-login PIN change (§12.2). The gap this closes: the initial PIN is read
 * out by Ops, so for a moment someone else knows her credential — and an Ops
 * user signing in AS a caregiver would quietly hollow out everything downstream
 * that assumes a check-in means she was there.
 */

test("a chosen PIN must be 4-6 digits", () => {
  assert.equal(newPinSchema.safeParse("4829").success, true);
  assert.equal(newPinSchema.safeParse("482913").success, true);
  assert.equal(newPinSchema.safeParse("482").success, false);
  assert.equal(newPinSchema.safeParse("4829137").success, false);
  assert.equal(newPinSchema.safeParse("48a9").success, false);
  assert.equal(newPinSchema.safeParse("").success, false);
});

// Only the first-guess PINs are refused. Rejecting more just teaches people to
// write the thing on the phone case.
test("a repeated-digit PIN is refused", () => {
  for (const pin of ["0000", "1111", "999999", "7777"]) {
    assert.equal(newPinSchema.safeParse(pin).success, false, pin);
  }
});

test("a sequential run is refused, in both directions", () => {
  for (const pin of ["1234", "123456", "4321", "654321", "6789"]) {
    assert.equal(newPinSchema.safeParse(pin).success, false, pin);
  }
});

test("a PIN that merely contains a run is fine — the rule is narrow on purpose", () => {
  for (const pin of ["1235", "9123", "1243", "2846"]) {
    assert.equal(newPinSchema.safeParse(pin).success, true, pin);
  }
});

test("the new PIN must differ from the current one", () => {
  const same = changePinSchema.safeParse({ currentPin: "4829", newPin: "4829" });
  assert.equal(same.success, false);
  assert.match(String(same.error?.issues[0]?.message), /different/);

  assert.equal(
    changePinSchema.safeParse({ currentPin: "4829", newPin: "7361" }).success,
    true,
  );
});

test("the current PIN is required — it is what proves the session is hers", () => {
  assert.equal(changePinSchema.safeParse({ newPin: "7361" }).success, false);
  assert.equal(changePinSchema.safeParse({ currentPin: "", newPin: "7361" }).success, false);
});

test("a weak new PIN is refused even with a correct current PIN", () => {
  assert.equal(
    changePinSchema.safeParse({ currentPin: "482913", newPin: "1234" }).success,
    false,
  );
});

test("an Ops-issued PIN is still accepted as the CURRENT one", () => {
  // generatePin() is random and may legitimately produce 111111 or 123456. The
  // strength rule applies to what she CHOOSES, not to what she must type in to
  // prove identity — or a caregiver could be locked out by bad luck.
  assert.equal(
    changePinSchema.safeParse({ currentPin: "111111", newPin: "7361" }).success,
    true,
  );
  assert.equal(
    changePinSchema.safeParse({ currentPin: "123456", newPin: "7361" }).success,
    true,
  );
});
