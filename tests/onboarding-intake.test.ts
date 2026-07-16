import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createCaregiverSchema,
  updateCaregiverSchema,
} from "../lib/shared/office-schemas.ts";
import { generatePin } from "../lib/server/auth/password.ts";
import { evaluateActivation, requiredStepsFor, REQUIRED_STEPS } from "../lib/shared/onboarding.ts";

/*
 * Intake validation and the PIN. The activation GATE itself is covered in
 * office-logic.test.ts; what matters here is that intake cannot smuggle
 * anything past it, and that the generated credential is sound.
 */

const VALID = {
  fullName: "Shirin Akter",
  phone: "01711111111",
  skill: "attendant",
  nidFrontRef: "file/nid-front-001",
  nidBackRef: "file/nid-back-001",
  photoRef: "file/photo-001",
  policeClearanceRef: "file/police-001",
};

test("a valid application parses and normalises the phone", () => {
  const parsed = createCaregiverSchema.safeParse(VALID);
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.phone, "+8801711111111");
});

test("intake cannot set verification_status or a PIN (AC 2.2)", () => {
  const parsed = createCaregiverSchema.safeParse({
    ...VALID,
    // The whole point of the gate: an application must not be able to approve
    // itself or arrive with a credential attached.
    verificationStatus: "approved",
    pinHash: "$argon2id$whatever",
    pin: "123456",
  });
  assert.equal(parsed.success, true);
  const keys = Object.keys(parsed.data ?? {});
  assert.ok(!keys.includes("verificationStatus"));
  assert.ok(!keys.includes("pinHash"));
  assert.ok(!keys.includes("pin"));
});

test("every document reference is required — no blank file", () => {
  for (const field of ["nidFrontRef", "nidBackRef", "photoRef", "policeClearanceRef"]) {
    const parsed = createCaregiverSchema.safeParse({ ...VALID, [field]: "" });
    assert.equal(parsed.success, false, `${field} should be required`);
  }
});

test("an unknown skill is rejected", () => {
  assert.equal(createCaregiverSchema.safeParse({ ...VALID, skill: "surgeon" }).success, false);
});

test("a bad payout number is rejected rather than stored unusable", () => {
  assert.equal(
    createCaregiverSchema.safeParse({ ...VALID, bkashPayoutNumber: "12345" }).success,
    false,
  );
  assert.equal(
    updateCaregiverSchema.safeParse({ bkashPayoutNumber: "not-a-phone" }).success,
    false,
  );
});

test("an empty file update is rejected", () => {
  assert.equal(updateCaregiverSchema.safeParse({}).success, false);
  assert.equal(updateCaregiverSchema.safeParse({ bkashPayoutNumber: "01711111111" }).success, true);
});

/* ------------------------------------------------------------------- PIN */

test("a generated PIN is 6 digits and within the login schema's range", () => {
  for (let i = 0; i < 50; i++) {
    assert.match(generatePin(), /^\d{6}$/);
  }
});

test("generated PINs are not obviously repeating", () => {
  // Not an entropy proof — a smoke test that this is not a constant, which is
  // the failure a broken CSPRNG call would actually produce.
  const pins = new Set(Array.from({ length: 100 }, () => generatePin()));
  assert.ok(pins.size > 90, `expected ~100 distinct PINs, got ${pins.size}`);
});

/* --------------------------------------- the gate intake feeds (§12.2) */

test("a fresh application is never activatable — it is missing everything", () => {
  const result = evaluateActivation({
    skill: "attendant",
    completedSteps: [],
    payoutNumber: null,
  });
  assert.equal(result.canActivate, false);
  // All five steps plus the payout number.
  assert.equal(result.missing.length, REQUIRED_STEPS.length + 1);
});

test("a complete file with no payout number still cannot activate", () => {
  const result = evaluateActivation({
    skill: "attendant",
    completedSteps: [...REQUIRED_STEPS],
    payoutNumber: null,
  });
  assert.equal(result.canActivate, false);
  assert.deepEqual(result.missing, ["bkash_payout_number"]);
});

test("a nurse without BNMC cannot activate however complete the rest is", () => {
  const result = evaluateActivation({
    skill: "nurse",
    completedSteps: [...REQUIRED_STEPS],
    payoutNumber: "+8801711111111",
    bnmcRegNo: null,
  });
  assert.equal(result.canActivate, false);
  assert.ok(result.missing.includes("bnmc_reg_no"));
});

test("a babysitter needs seven steps — the extra two are not optional (§12.2)", () => {
  assert.equal(requiredStepsFor("babysitter").length, 7);
  const asIfAttendant = evaluateActivation({
    skill: "babysitter",
    completedSteps: [...REQUIRED_STEPS], // the five a non-babysitter needs
    payoutNumber: "+8801711111111",
  });
  assert.equal(asIfAttendant.canActivate, false);
  assert.deepEqual(asIfAttendant.missing, ["references", "safeguarding"]);
});

test("a fully complete file activates", () => {
  const result = evaluateActivation({
    skill: "attendant",
    completedSteps: [...REQUIRED_STEPS],
    payoutNumber: "+8801711111111",
  });
  assert.deepEqual(result, { canActivate: true, missing: [] });
});
