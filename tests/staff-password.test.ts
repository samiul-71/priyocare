import { test } from "node:test";
import assert from "node:assert/strict";
import {
  changePasswordSchema,
  newStaffPasswordSchema,
  staffLoginSchema,
} from "../lib/shared/auth-schemas.ts";
import { generatePassword } from "../lib/server/auth/password.ts";

/*
 * Staff passwords (§10.1). Until now they were set once by db:create-staff and
 * never changed — no forced first change, no rotation, no reset. A caregiver had
 * a forced change and two reset routes; the people who can read every patient's
 * address and every caregiver's file had none of it.
 */

test("a chosen staff password needs 12 characters — length is the defence", () => {
  assert.equal(newStaffPasswordSchema.safeParse("correct-horse").success, true);
  assert.equal(newStaffPasswordSchema.safeParse("short").success, false);
  assert.equal(newStaffPasswordSchema.safeParse("elevenchars").success, false); // 11
  assert.equal(newStaffPasswordSchema.safeParse("twelvechars!").success, true); // 12
});

test("no composition rules — a passphrase of ordinary words passes", () => {
  // "One uppercase, one symbol" reliably produces Password1! and a sticky note.
  for (const pw of [
    "the quick brown fox jumps",
    "amaderbarikachhemosjid",
    "konokichuivulbenanaki",
  ]) {
    assert.equal(newStaffPasswordSchema.safeParse(pw).success, true, pw);
  }
});

test("the passwords everyone tries first are refused — even padded to length", () => {
  for (const pw of [
    "password1234",
    "Password1234",
    "priyocare2026",
    "letmein123456",
    "changeme12345",
    "welcome123456",
  ]) {
    assert.equal(newStaffPasswordSchema.safeParse(pw).success, false, pw);
  }
});

test("the obvious-password check is case-insensitive and matches substrings", () => {
  // Someone will try exactly this.
  assert.equal(newStaffPasswordSchema.safeParse("MyPriyoCarePass").success, false);
  assert.equal(newStaffPasswordSchema.safeParse("xxPASSWORDxxxx").success, false);
});

test("login keeps the old 8-char floor — existing passwords must still work", () => {
  // Raising the login floor would lock out accounts created before the rule,
  // and the login screen must not hint at the rules anyway.
  const parsed = staffLoginSchema.safeParse({
    email: "ops@priyocare.test",
    password: "eightchr",
  });
  assert.equal(parsed.success, true);
});

test("the new password must differ from the current one", () => {
  const same = changePasswordSchema.safeParse({
    currentPassword: "correct-horse-battery",
    newPassword: "correct-horse-battery",
  });
  assert.equal(same.success, false);
  assert.match(String(same.error?.issues[0]?.message), /different/);
});

test("the current password is required — it proves the session is yours", () => {
  assert.equal(
    changePasswordSchema.safeParse({ newPassword: "correct-horse-battery" }).success,
    false,
  );
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: "", newPassword: "correct-horse-battery" })
      .success,
    false,
  );
});

test("a weak new password is refused even with the right current one", () => {
  assert.equal(
    changePasswordSchema.safeParse({ currentPassword: "whatever-it-was", newPassword: "short" })
      .success,
    false,
  );
});

/* ------------------------------------------------ the handover credential */

test("a generated handover password is long and passes the chosen-password bar", () => {
  for (let i = 0; i < 30; i++) {
    const pw = generatePassword();
    assert.equal(pw.length, 16);
    assert.equal(newStaffPasswordSchema.safeParse(pw).success, true, pw);
  }
});

test("handover passwords omit characters that are ambiguous down a phone line", () => {
  // It gets read out loud: i/l/1 and o/0 are how a reset becomes a support call.
  const sample = Array.from({ length: 60 }, () => generatePassword()).join("");
  for (const ch of ["i", "l", "o", "0", "1"]) {
    assert.ok(!sample.includes(ch), `handover alphabet must not contain "${ch}"`);
  }
});

test("handover passwords are not repeating", () => {
  const all = new Set(Array.from({ length: 100 }, () => generatePassword()));
  assert.equal(all.size, 100);
});
