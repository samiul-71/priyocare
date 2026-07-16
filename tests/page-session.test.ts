import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sessionTtlSeconds,
  signPageSession,
  verifyPageSession,
} from "../lib/server/auth/page-session.ts";
import { signAccessToken, verifyAccessToken } from "../lib/server/auth/tokens.ts";

// Same lazily-read secret as tokens.test.ts — set before any signing call.
process.env.JWT_SECRET = "test-secret-of-at-least-thirty-two-characters!!";

test("a page session round-trips its claims", async () => {
  const token = await signPageSession({ sub: "42", st: "staff", role: "ops" });
  const claims = await verifyPageSession(token);
  assert.equal(claims?.sub, "42");
  assert.equal(claims?.st, "staff");
  assert.equal(claims?.role, "ops");
});

test("a caregiver page session carries no role claim", async () => {
  const token = await signPageSession({ sub: "9", st: "caregiver" });
  const claims = await verifyPageSession(token);
  assert.equal(claims?.st, "caregiver");
  assert.equal(claims?.role, undefined);
});

test("a missing cookie value verifies as null rather than throwing", async () => {
  assert.equal(await verifyPageSession(undefined), null);
  assert.equal(await verifyPageSession(""), null);
});

test("a tampered page session is rejected", async () => {
  const token = await signPageSession({ sub: "1", st: "staff", role: "admin" });
  assert.equal(await verifyPageSession(token.slice(0, -3) + "xyz"), null);
});

test("an expired page session is rejected", async () => {
  const token = await signPageSession({ sub: "1", st: "staff" }, -10);
  assert.equal(await verifyPageSession(token), null);
});

test("a page session signed with a different secret is rejected", async () => {
  const token = await signPageSession({ sub: "1", st: "staff", role: "admin" });
  const original = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "a-completely-different-secret-thirty-two-chars";
  const claims = await verifyPageSession(token);
  process.env.JWT_SECRET = original;
  assert.equal(claims, null);
});

/*
 * The audience split is the load-bearing part: same secret, different audience,
 * so neither token is ever usable in the other's seam. If these two ever pass
 * each other's verifier, a stolen 30-day page cookie becomes a 30-day API
 * credential.
 */
test("a page session cannot be replayed as an API access token", async () => {
  const cookie = await signPageSession({ sub: "42", st: "staff", role: "admin" });
  assert.equal(await verifyAccessToken(cookie), null);
});

test("an API access token cannot be used as a page session", async () => {
  const access = await signAccessToken({ sub: "42", st: "staff", role: "admin" });
  assert.equal(await verifyPageSession(access), null);
});

/*
 * Session lifetime tracks the REFRESH token (sessions.ts), never the 15-minute
 * access token. The caregiver's 30 days is what upholds §10.1 / Flow A: an
 * expired access token must never surface a login screen.
 */
test("session lifetime follows privilege, and outlives the access token", async () => {
  assert.equal(sessionTtlSeconds("staff"), 7 * 86_400);
  assert.equal(sessionTtlSeconds("caregiver"), 30 * 86_400);
  assert.equal(sessionTtlSeconds("customer"), 30 * 86_400);
  assert.ok(sessionTtlSeconds("caregiver") > 15 * 60);
});
