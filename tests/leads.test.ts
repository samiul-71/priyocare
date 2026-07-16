import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DORMANCY_DAYS,
  countOverdue,
  daysSilent,
  initialNextActionAt,
  isOverdue,
  shouldGoDormant,
  sortForKanban,
  stageChangeActivity,
  validateStageChange,
} from "../lib/shared/leads.ts";
import { createLeadSchema, updateLeadSchema } from "../lib/shared/lead-schemas.ts";
import { formatLeadCode } from "../lib/shared/booking-code.ts";

const NOW = new Date("2026-07-17T10:00:00Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

/* ---------------------------------------------- AC-1: leads never go silent */

test("a lead whose next action has passed is overdue (AC-1.1)", () => {
  assert.equal(isOverdue({ stage: "contacted", nextActionAt: days(-1) }, NOW), true);
  assert.equal(isOverdue({ stage: "contacted", nextActionAt: days(1) }, NOW), false);
  // Exactly due counts as overdue — the follow-up was for "by now".
  assert.equal(isOverdue({ stage: "contacted", nextActionAt: NOW }, NOW), true);
});

test("a lead with no follow-up date is not overdue, and a closed one never is", () => {
  assert.equal(isOverdue({ stage: "new", nextActionAt: null }, NOW), false);
  // Pinning closed leads would train Ops to ignore the marker entirely.
  assert.equal(isOverdue({ stage: "won", nextActionAt: days(-30) }, NOW), false);
  assert.equal(isOverdue({ stage: "lost", nextActionAt: days(-30) }, NOW), false);
});

test("overdue leads pin to the top of a column (AC-1.1)", () => {
  const sorted = sortForKanban(
    [
      { id: 1, stage: "contacted", nextActionAt: days(3) }, // future
      { id: 2, stage: "contacted", nextActionAt: null }, // undated
      { id: 3, stage: "contacted", nextActionAt: days(-5) }, // overdue, older
      { id: 4, stage: "contacted", nextActionAt: days(-1) }, // overdue, newer
    ],
    NOW,
  );
  // Both overdue first (oldest due date first), then dated, then undated last.
  assert.deepEqual(sorted.map((l) => l.id), [3, 4, 1, 2]);
});

test("sortForKanban does not mutate its input", () => {
  const input = [
    { id: 1, stage: "new" as const, nextActionAt: days(3) },
    { id: 2, stage: "new" as const, nextActionAt: days(-1) },
  ];
  sortForKanban(input, NOW);
  assert.deepEqual(input.map((l) => l.id), [1, 2]);
});

test("countOverdue counts only live overdue leads", () => {
  const leads = [
    { id: 1, stage: "new" as const, nextActionAt: days(-1) },
    { id: 2, stage: "won" as const, nextActionAt: days(-9) },
    { id: 3, stage: "negotiating" as const, nextActionAt: days(2) },
  ];
  assert.equal(countOverdue(leads, NOW), 1);
});

test("a new enquiry is given a follow-up date, so it cannot rest at 'new'", () => {
  const next = initialNextActionAt(NOW);
  assert.ok(next.getTime() > NOW.getTime());
  // Silent for a day → surfaces as overdue rather than sitting unnoticed.
  assert.equal(isOverdue({ stage: "new", nextActionAt: next }, days(2)), true);
});

/* ------------------------------------------------------ §12.1: 30d dormancy */

test("a live lead silent for 30 days goes dormant (§12.1)", () => {
  assert.equal(
    shouldGoDormant({ stage: "contacted", lastActivityAt: days(-DORMANCY_DAYS) }, NOW),
    true,
  );
  assert.equal(shouldGoDormant({ stage: "contacted", lastActivityAt: days(-29) }, NOW), false);
});

test("closed and already-dormant leads are not swept again", () => {
  assert.equal(shouldGoDormant({ stage: "won", lastActivityAt: days(-90) }, NOW), false);
  assert.equal(shouldGoDormant({ stage: "lost", lastActivityAt: days(-90) }, NOW), false);
  assert.equal(shouldGoDormant({ stage: "dormant", lastActivityAt: days(-90) }, NOW), false);
});

test("daysSilent reports whole days since the last contact", () => {
  assert.equal(daysSilent(days(-12), NOW), 12);
  assert.equal(daysSilent(NOW, NOW), 0);
});

/* --------------------------------------------- AC-3: stage changes are logged */

test("a stage change always produces an activity (AC-3.1)", () => {
  const activity = stageChangeActivity({ from: "new", to: "contacted" });
  assert.equal(activity.type, "note");
  assert.match(activity.summary, /New/);
  assert.match(activity.summary, /Contacted/);
});

test("the lost reason is carried into the logged activity", () => {
  const activity = stageChangeActivity({ from: "negotiating", to: "lost", lostReason: "went abroad" });
  assert.match(activity.summary, /went abroad/);
});

/* ------------------------------------------------- stage transition guarding */

test("Ops may skip stages — the board must not fight how they work", () => {
  assert.deepEqual(validateStageChange({ from: "new", to: "negotiating" }), { ok: true });
  assert.deepEqual(validateStageChange({ from: "new", to: "won" }), { ok: true });
});

test("a closed lead cannot be reopened — that would rewrite history", () => {
  const result = validateStageChange({ from: "won", to: "negotiating" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "reopen_closed");
});

test("marking a lead lost requires a reason (Flow C)", () => {
  const blank = validateStageChange({ from: "qualified", to: "lost", lostReason: "   " });
  assert.equal(blank.ok, false);
  assert.equal(blank.ok === false && blank.code, "lost_reason_required");
  assert.deepEqual(validateStageChange({ from: "qualified", to: "lost", lostReason: "price" }), {
    ok: true,
  });
});

test("moving a lead to the stage it is already in is rejected", () => {
  const result = validateStageChange({ from: "contacted", to: "contacted" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.code, "same_stage");
});

/* --------------------------------------------------------------- validation */

test("an enquiry needs only a name and a phone, and normalises the phone", () => {
  const parsed = createLeadSchema.safeParse({
    serviceId: 8,
    contactName: "Rahim",
    contactPhone: "01712345678",
    documents: [],
  });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.contactPhone, "+8801712345678");
});

test("an enquiry rejects a bad phone and an empty name", () => {
  assert.equal(
    createLeadSchema.safeParse({ serviceId: 8, contactName: "R", contactPhone: "123" }).success,
    false,
  );
  assert.equal(
    createLeadSchema.safeParse({ serviceId: 8, contactName: "  ", contactPhone: "01712345678" })
      .success,
    false,
  );
});

test("a caller-supplied document URL is not accepted — only a storage key (§11)", () => {
  const parsed = createLeadSchema.safeParse({
    serviceId: 8,
    contactName: "Rahim",
    contactPhone: "01712345678",
    documents: [{ url: "https://evil.example/report.pdf", filename: "r.pdf" }],
  });
  assert.equal(parsed.success, false);
});

test("an empty patch is rejected rather than writing a no-op activity", () => {
  assert.equal(updateLeadSchema.safeParse({}).success, false);
  assert.equal(updateLeadSchema.safeParse({ stage: "contacted" }).success, true);
});

test("a patch cannot invent a stage outside the pipeline", () => {
  assert.equal(updateLeadSchema.safeParse({ stage: "archived" }).success, false);
});

/* ------------------------------------------------- AC-2: leads are not bookings */

test("nothing in the lead schema can carry booking machinery (AC-2.1)", () => {
  const parsed = createLeadSchema.safeParse({
    serviceId: 8,
    contactName: "Rahim",
    contactPhone: "01712345678",
    // A caller trying to smuggle booking fields through the enquiry form:
    slotId: 3,
    caregiverId: 9,
    zoneId: 1,
    priceBdt: 5000,
  });
  assert.equal(parsed.success, true);
  // Zod strips unknown keys — no slot, dispatch, or price can ride in on a lead.
  assert.deepEqual(Object.keys(parsed.data ?? {}).sort(), [
    "contactName",
    "contactPhone",
    "documents",
    "serviceId",
  ]);
});

test("lead codes are LD-prefixed, distinct from booking codes", () => {
  assert.equal(formatLeadCode(42, new Date("2026-07-17T10:00:00")), "LD-260717-0042");
});
