import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingStepIndex,
  sampleStepIndex,
  isReportReady,
  isSampleRejected,
  isTerminalCancelled,
  BOOKING_STEPS,
  SAMPLE_STEPS,
} from "../lib/shared/tracking.ts";
import {
  buildSignedReportPath,
  verifyReportAccess,
  REPORT_LINK_TTL_MS,
} from "../lib/server/reports/signed-url.ts";

test("booking status maps to the right customer step", () => {
  assert.equal(bookingStepIndex("confirmed"), 0);
  assert.equal(bookingStepIndex("dispatched"), 1);
  assert.equal(bookingStepIndex("en_route"), 1);
  assert.equal(bookingStepIndex("arrived"), 2);
  assert.equal(bookingStepIndex("completed"), 4);
  assert.equal(bookingStepIndex("pending"), -1);
  assert.equal(isTerminalCancelled("cancelled"), true);
  assert.equal(isTerminalCancelled("no_show"), true);
});

test("every step carries an icon and a label (colour-independent)", () => {
  for (const s of [...BOOKING_STEPS, ...SAMPLE_STEPS]) {
    assert.ok(s.glyph.length > 0, `${s.key} needs a glyph`);
    assert.ok(s.label.length > 0, `${s.key} needs a label`);
  }
});

test("sample status maps to steps and detects report-ready / rejection", () => {
  assert.equal(sampleStepIndex("collected"), 0);
  assert.equal(sampleStepIndex("report_ready"), 4);
  assert.equal(isReportReady("report_ready"), true);
  assert.equal(isReportReady("processing"), false);
  assert.equal(isSampleRejected("rejected"), true);
  assert.equal(sampleStepIndex("rejected"), -1);
});

test("signed report link works within the window and dies after 15 min (AC 1.1)", () => {
  const secret = "report-secret";
  const now = 1_000_000_000_000;
  const path = buildSignedReportPath(42, secret, now);
  const url = new URL(`https://x${path}`);
  const exp = Number(url.searchParams.get("exp"));
  const token = url.searchParams.get("token")!;

  assert.equal(exp, now + REPORT_LINK_TTL_MS);
  // valid at issue time and just before expiry
  assert.deepEqual(verifyReportAccess(42, exp, token, secret, now), { ok: true });
  assert.deepEqual(verifyReportAccess(42, exp, token, secret, exp - 1), { ok: true });
  // expired one minute past the window (16 min later)
  assert.deepEqual(verifyReportAccess(42, exp, token, secret, exp + 60_000), {
    ok: false,
    reason: "expired",
  });
});

test("signed report link rejects tampering and wrong secret", () => {
  const secret = "report-secret";
  const now = 1_000_000_000_000;
  const path = buildSignedReportPath(42, secret, now);
  const url = new URL(`https://x${path}`);
  const exp = Number(url.searchParams.get("exp"));
  const token = url.searchParams.get("token")!;

  assert.equal(verifyReportAccess(42, exp, token.slice(0, -2) + "00", secret, now).ok, false);
  assert.equal(verifyReportAccess(42, exp, token, "wrong-secret", now).ok, false);
  // a token for sample 42 must not unlock sample 43
  assert.equal(verifyReportAccess(43, exp, token, secret, now).ok, false);
});
