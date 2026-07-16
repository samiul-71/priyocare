import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bdPhone,
  staffLoginSchema,
  caregiverLoginSchema,
} from "../lib/shared/auth-schemas.ts";

test("bdPhone accepts and normalises the common formats to +880…", () => {
  for (const input of ["01712345678", "+8801712345678", "8801712345678", "1712345678"]) {
    const result = bdPhone.safeParse(input);
    assert.equal(result.success, true, `expected ${input} to be valid`);
    assert.equal(result.data, "+8801712345678");
  }
});

test("bdPhone rejects junk and wrong operator digits", () => {
  for (const bad of ["12345", "0171234567", "0121234567", "abcmyphone", ""]) {
    assert.equal(bdPhone.safeParse(bad).success, false, `expected ${bad} to be invalid`);
  }
});

test("caregiver login requires a 4–6 digit PIN", () => {
  assert.equal(caregiverLoginSchema.safeParse({ phone: "01712345678", pin: "4821" }).success, true);
  assert.equal(caregiverLoginSchema.safeParse({ phone: "01712345678", pin: "12" }).success, false);
  assert.equal(caregiverLoginSchema.safeParse({ phone: "01712345678", pin: "notdigits" }).success, false);
});

test("staff login normalises email and enforces password length", () => {
  const ok = staffLoginSchema.safeParse({ email: "OPS@Priyo.com", password: "longenough" });
  assert.equal(ok.success, true);
  assert.equal(ok.success && ok.data.email, "ops@priyo.com");
  assert.equal(staffLoginSchema.safeParse({ email: "ops@priyo.com", password: "short" }).success, false);
});
