import { test } from "node:test";
import assert from "node:assert/strict";
import { signResetToken, verifyResetToken } from "../lib/server/auth/password-reset.ts";
import { signPageSession, verifyPageSession } from "../lib/server/auth/page-session.ts";
import { forgotPasswordSchema, resetPasswordSchema } from "../lib/shared/auth-schemas.ts";
import { findEnvProblems } from "../lib/server/env.ts";

// `getSecret()` reads this lazily at call time, so setting it here — after the
// hoisted imports but before any test runs — is enough (as in tokens.test.ts).
process.env.JWT_SECRET = "test-secret-of-at-least-thirty-two-characters!!";

/*
 * Staff self-service forgot-password (§10.1). The token is the whole authority —
 * signed, short-lived, and single-use via its `pca` binding (that half is
 * covered live, against Postgres). These lock the pure parts: the token wall,
 * the request/reset schemas, and the boot check that a half-configured email
 * provider fails loudly.
 */

test("a reset token round-trips its staffId and pca", async () => {
  const token = await signResetToken({ staffId: 42, pca: 1_700_000_000_000 });
  const claims = await verifyResetToken(token);
  assert.equal(claims?.staffId, 42);
  assert.equal(claims?.pca, 1_700_000_000_000);
});

test("a tampered or empty token verifies to null", async () => {
  const token = await signResetToken({ staffId: 1, pca: 0 });
  assert.equal(await verifyResetToken(token + "x"), null);
  assert.equal(await verifyResetToken(undefined), null);
  assert.equal(await verifyResetToken(""), null);
});

test("a token signed under a different secret is rejected", async () => {
  const token = await signResetToken({ staffId: 1, pca: 0 });
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "a-completely-different-secret-thirty-two-chars";
  assert.equal(await verifyResetToken(token), null);
  process.env.JWT_SECRET = original;
});

test("the audience wall holds: a page session is not a reset token, and vice versa", async () => {
  // A stolen session cookie must not double as a reset link, and a reset link
  // must not be replayable as a session (§10.2 rule 1).
  const session = await signPageSession({ sub: "5", st: "staff", role: "admin" });
  assert.equal(await verifyResetToken(session), null);

  const reset = await signResetToken({ staffId: 5, pca: 0 });
  assert.equal(await verifyPageSession(reset), null);
});

test("forgotPasswordSchema lowercases and requires a real email", () => {
  assert.equal(forgotPasswordSchema.safeParse({ email: "Ops@X.CO" }).data?.email, "ops@x.co");
  assert.equal(forgotPasswordSchema.safeParse({ email: "not-an-email" }).success, false);
});

test("resetPasswordSchema needs a token and a password that meets the full bar", () => {
  assert.equal(resetPasswordSchema.safeParse({ token: "t", newPassword: "correct-horse-1" }).success, true);
  assert.equal(resetPasswordSchema.safeParse({ token: "", newPassword: "correct-horse-1" }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ token: "t", newPassword: "short" }).success, false);
  assert.equal(resetPasswordSchema.safeParse({ token: "t", newPassword: "passwordpassword" }).success, false); // obvious
});

test("EMAIL_PROVIDER_CONFIGURED=1 makes the SMTP credentials mandatory at boot", () => {
  const base = { JWT_SECRET: "x".repeat(32) };
  const problems = findEnvProblems({ ...base, EMAIL_PROVIDER_CONFIGURED: "1" }, false);
  const vars = problems.map((p) => p.variable);
  for (const v of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
    assert.ok(vars.includes(v), `expected ${v} to be flagged missing`);
  }
});

test("with the flag off, missing SMTP vars are not a boot problem", () => {
  const problems = findEnvProblems({ JWT_SECRET: "x".repeat(32) }, false);
  assert.equal(problems.length, 0);
});

test("with the flag on and all SMTP vars present, boot is clean", () => {
  const problems = findEnvProblems(
    {
      JWT_SECRET: "x".repeat(32),
      EMAIL_PROVIDER_CONFIGURED: "1",
      SMTP_HOST: "sandbox.smtp.mailtrap.io",
      SMTP_USER: "u",
      SMTP_PASS: "p",
      SMTP_FROM: "PriyoCare <no-reply@priyocare.app>",
      SMTP_PORT: "2525",
    },
    false,
  );
  assert.equal(problems.length, 0);
});

test("a non-numeric SMTP_PORT is caught", () => {
  const problems = findEnvProblems(
    {
      JWT_SECRET: "x".repeat(32),
      EMAIL_PROVIDER_CONFIGURED: "1",
      SMTP_HOST: "h",
      SMTP_USER: "u",
      SMTP_PASS: "p",
      SMTP_FROM: "f",
      SMTP_PORT: "twenty-five",
    },
    false,
  );
  assert.ok(problems.some((p) => p.variable === "SMTP_PORT"));
});
