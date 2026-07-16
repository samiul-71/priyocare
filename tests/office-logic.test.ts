import { test } from "node:test";
import assert from "node:assert/strict";
import { rankEligibleCaregivers, type CaregiverForDispatch } from "../lib/shared/dispatch.ts";
import { evaluateActivation, lowRatingSuspendThreshold } from "../lib/shared/onboarding.ts";
import { formatBookingCode, formatLeadCode } from "../lib/shared/booking-code.ts";
import { ratingTriggersComplaint, isSeriousTag } from "../lib/shared/complaints.ts";

const base: Omit<CaregiverForDispatch, "id"> = {
  verificationStatus: "approved",
  skill: "nurse",
  zones: ["Mirpur"],
  ratingAvg: 4.5,
  busyWindows: [],
  servedPatientBefore: false,
};
const criteria = { requiredSkill: "nurse", zone: "Mirpur", windowStart: 100, windowEnd: 200 };

test("dispatch excludes unapproved, wrong-skill, wrong-zone, and time-conflicting caregivers", () => {
  const caregivers: CaregiverForDispatch[] = [
    { ...base, id: 1 }, // eligible
    { ...base, id: 2, verificationStatus: "pending" }, // 4-of-5 steps → not approved (AC 2.1)
    { ...base, id: 3, skill: "phlebotomist" }, // wrong skill
    { ...base, id: 4, zones: ["Uttara"] }, // wrong zone
    { ...base, id: 5, busyWindows: [{ start: 150, end: 250 }] }, // overlaps requested slot
  ];
  const result = rankEligibleCaregivers(caregivers, criteria).map((c) => c.id);
  assert.deepEqual(result, [1]);
});

test("dispatch sorts by served-before then rating", () => {
  const caregivers: CaregiverForDispatch[] = [
    { ...base, id: 1, ratingAvg: 4.9, servedPatientBefore: false },
    { ...base, id: 2, ratingAvg: 4.0, servedPatientBefore: true }, // continuity wins
    { ...base, id: 3, ratingAvg: 4.7, servedPatientBefore: false },
  ];
  assert.deepEqual(rankEligibleCaregivers(caregivers, criteria).map((c) => c.id), [2, 1, 3]);
});

test("activation gate: 4 of 5 steps cannot activate (AC 2.1)", () => {
  const r = evaluateActivation({
    skill: "nurse",
    completedSteps: ["nid", "photo", "police_clearance", "skill_cert"],
    payoutNumber: "01700000000",
    bnmcRegNo: "BNMC-123",
  });
  assert.equal(r.canActivate, false);
  assert.ok(r.missing.includes("interview"));
});

test("activation gate: all steps but no payout number cannot activate (AC 2.2)", () => {
  const r = evaluateActivation({
    skill: "attendant",
    completedSteps: ["nid", "photo", "police_clearance", "skill_cert", "interview"],
    payoutNumber: null,
  });
  assert.equal(r.canActivate, false);
  assert.deepEqual(r.missing, ["bkash_payout_number"]);
});

test("activation gate: babysitter needs the two extra steps, nurse needs BNMC", () => {
  const babysitter = evaluateActivation({
    skill: "babysitter",
    completedSteps: ["nid", "photo", "police_clearance", "skill_cert", "interview"],
    payoutNumber: "01700000000",
  });
  assert.equal(babysitter.canActivate, false);
  assert.ok(babysitter.missing.includes("references"));
  assert.ok(babysitter.missing.includes("safeguarding"));

  const nurseNoBnmc = evaluateActivation({
    skill: "nurse",
    completedSteps: ["nid", "photo", "police_clearance", "skill_cert", "interview"],
    payoutNumber: "01700000000",
    bnmcRegNo: null,
  });
  assert.ok(nurseNoBnmc.missing.includes("bnmc_reg_no"));

  const fullyEligible = evaluateActivation({
    skill: "attendant",
    completedSteps: ["nid", "photo", "police_clearance", "skill_cert", "interview"],
    payoutNumber: "01700000000",
  });
  assert.equal(fullyEligible.canActivate, true);
});

test("babysitter auto-suspends at 2 low ratings, others at 3", () => {
  assert.equal(lowRatingSuspendThreshold("babysitter"), 2);
  assert.equal(lowRatingSuspendThreshold("nurse"), 3);
});

test("booking/lead codes format as PC-/LD-YYMMDD-NNNN", () => {
  const d = new Date(2026, 6, 15); // 15 Jul 2026 (month is 0-indexed)
  assert.equal(formatBookingCode(42, d), "PC-260715-0042");
  assert.equal(formatLeadCode(7, d), "LD-260715-0007");
});

test("complaint rules: 1-2★ auto-create, serious tags detected", () => {
  assert.equal(ratingTriggersComplaint(1), true);
  assert.equal(ratingTriggersComplaint(2), true);
  assert.equal(ratingTriggersComplaint(3), false);
  assert.equal(ratingTriggersComplaint(4), false);
  assert.equal(isSeriousTag("theft"), true);
  assert.equal(isSeriousTag("late"), false);
});
